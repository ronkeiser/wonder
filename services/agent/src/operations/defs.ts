/**
 * Definition Operations
 *
 * DefinitionManager handles conversation and agent definitions with drizzle-orm.
 * On initialize(), copies definitions from RESOURCES into DO SQLite.
 * Provides type-safe accessors for agent loop operations.
 */

import { createLogger, type Logger } from '@wonder/logs';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';

import { agentDef, conversationMeta, personaDef, toolDefs } from '../schema';
import migrations from '../schema/migrations';
import type { AgentDb } from './db';

// Types inferred from schema
export type ConversationMetaRow = typeof conversationMeta.$inferSelect;
export type AgentDefRow = typeof agentDef.$inferSelect;
export type PersonaDefRow = typeof personaDef.$inferSelect;
export type ToolDefRow = typeof toolDefs.$inferSelect;

/**
 * DefinitionManager provides access to conversation and agent definitions stored in DO SQLite.
 *
 * Lazy initialization: call initializeConversation() on first entry point with conversation ID.
 */
export class DefinitionManager {
  private readonly db: AgentDb;
  private readonly env: Env;
  private readonly logger: Logger;

  constructor(db: AgentDb, ctx: DurableObjectState, env: Env) {
    this.db = db;
    this.env = env;
    this.logger = createLogger(ctx, env.LOGS, {
      service: env.SERVICE,
      environment: env.ENVIRONMENT,
    });
  }

  /**
   * Initialize definitions for a conversation.
   *
   * - Runs migrations (idempotent)
   * - Checks if already populated (DO wake-up)
   * - If not, fetches from RESOURCES and inserts
   */
  async initializeConversation(conversationId: string): Promise<void> {
    try {
      // Run migrations (idempotent - creates tables if not exist)
      migrate(this.db, migrations);
      this.logger.info({
        eventType: 'defs.migrations.complete',
        message: 'DO SQLite migrations applied',
        traceId: conversationId,
      });

      // Check if already populated (DO wake-up case)
      const existing = this.db
        .select({ id: conversationMeta.id })
        .from(conversationMeta)
        .limit(1)
        .all();
      if (existing.length > 0) {
        this.logger.info({
          eventType: 'defs.already_populated',
          message: 'DO SQLite already populated (wake-up)',
          traceId: conversationId,
        });
        return;
      }

      // Fetch from RESOURCES and insert
      await this.fetchAndInsert(conversationId);

      this.logger.info({
        eventType: 'defs.populated',
        message: 'DO SQLite populated from RESOURCES',
        traceId: conversationId,
      });
    } catch (error) {
      this.logger.error({
        eventType: 'defs.initialize.failed',
        message: 'Failed to initialize DefinitionManager',
        traceId: conversationId,
        metadata: {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Fetch definitions from RESOURCES service and insert into DO SQLite.
   */
  private async fetchAndInsert(conversationId: string): Promise<void> {
    // 1. Fetch conversation
    const conversationsResource = this.env.RESOURCES.conversations();
    const { conversation } = await conversationsResource.get(conversationId);

    // Find the agent participant
    const agentParticipant = conversation.participants.find(
      (p: { type: string }): p is { type: 'agent'; agentId: string } => p.type === 'agent',
    );
    if (!agentParticipant) {
      throw new Error('Conversation has no agent participant');
    }

    // 2. Fetch agent
    const agentsResource = this.env.RESOURCES.agents();
    const { agent } = await agentsResource.get(agentParticipant.agentId);

    // 3. Fetch persona (if referenced)
    let persona: PersonaDefRow | null = null;
    if (agent.personaId) {
      const personasResource = this.env.RESOURCES.personas();
      const { persona: fetchedPersona } = await personasResource.get(
        agent.personaId,
        agent.personaVersion ?? undefined,
      );
      persona = {
        id: fetchedPersona.id,
        version: fetchedPersona.version,
        name: fetchedPersona.name,
        systemPrompt: fetchedPersona.systemPrompt,
        modelProfileId: fetchedPersona.modelProfileId,
        contextAssemblyWorkflowDefId: fetchedPersona.contextAssemblyWorkflowDefId,
        memoryExtractionWorkflowDefId: fetchedPersona.memoryExtractionWorkflowDefId,
        recentTurnsLimit: fetchedPersona.recentTurnsLimit,
        toolIds: fetchedPersona.toolIds,
        constraints: fetchedPersona.constraints,
      };
    }

    // 4. Fetch tools (if persona has toolIds)
    let tools: ToolDefRow[] = [];
    if (persona && persona.toolIds.length > 0) {
      const toolsResource = this.env.RESOURCES.tools();
      const { tools: fetchedTools } = await toolsResource.getByIds(persona.toolIds);
      tools = fetchedTools.map(
        (t: {
          id: string;
          name: string;
          description: string;
          inputSchema: object;
          targetType: 'task' | 'workflow' | 'agent';
          targetId: string;
          async: boolean;
          invocationMode: 'delegate' | 'loop_in' | null;
          inputMapping: Record<string, string> | null;
        }) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          targetType: t.targetType,
          targetId: t.targetId,
          async: t.async,
          invocationMode: t.invocationMode,
          inputMapping: t.inputMapping,
        }),
      );
    }

    // 5. Insert conversation metadata
    this.db
      .insert(conversationMeta)
      .values({
        id: conversation.id,
        agentId: agentParticipant.agentId,
        participants: conversation.participants,
        status: conversation.status,
        createdAt: new Date(conversation.createdAt),
        updatedAt: new Date(conversation.updatedAt),
      })
      .run();

    // 6. Insert agent definition
    this.db
      .insert(agentDef)
      .values({
        id: agent.id,
        name: agent.name,
        projectIds: agent.projectIds,
        personaId: agent.personaId,
        personaVersion: agent.personaVersion,
      })
      .run();

    // 7. Insert persona definition (if exists)
    if (persona) {
      this.db.insert(personaDef).values(persona).run();
    }

    // 8. Insert tool definitions
    for (const tool of tools) {
      this.db.insert(toolDefs).values(tool).run();
    }

    this.logger.info({
      eventType: 'defs.fetch_complete',
      message: 'Fetched and inserted definitions',
      traceId: conversationId,
      metadata: {
        agentId: agent.id,
        personaId: persona?.id,
        toolCount: tools.length,
      },
    });
  }

  // ============================================================================
  // Accessors
  // ============================================================================

  /**
   * Get the conversation metadata.
   */
  getConversation(): ConversationMetaRow {
    const result = this.db.select().from(conversationMeta).limit(1).all();
    if (result.length === 0) {
      throw new Error('Conversation not found - not initialized');
    }
    return result[0];
  }

  /**
   * Get the agent definition.
   */
  getAgent(): AgentDefRow {
    const result = this.db.select().from(agentDef).limit(1).all();
    if (result.length === 0) {
      throw new Error('Agent not found - not initialized');
    }
    return result[0];
  }

  /**
   * Get the persona definition.
   */
  getPersona(): PersonaDefRow | null {
    const result = this.db.select().from(personaDef).limit(1).all();
    return result[0] ?? null;
  }

  /**
   * Get all tool definitions.
   */
  getTools(): ToolDefRow[] {
    return this.db.select().from(toolDefs).all();
  }

  /**
   * Get a specific tool by ID.
   */
  getTool(toolId: string): ToolDefRow | null {
    const result = this.db
      .select()
      .from(toolDefs)
      .where(eq(toolDefs.id, toolId))
      .limit(1)
      .all();
    return result[0] ?? null;
  }

  /**
   * Get the agent ID for this conversation.
   */
  getAgentId(): string {
    return this.getConversation().agentId;
  }

  /**
   * Get the model profile ID for this conversation's persona.
   */
  getModelProfileId(): string {
    const persona = this.getPersona();
    if (!persona) {
      throw new Error('No persona configured for this agent');
    }
    return persona.modelProfileId;
  }

  /**
   * Get the context assembly workflow definition ID.
   */
  getContextAssemblyWorkflowDefId(): string {
    const persona = this.getPersona();
    if (!persona) {
      throw new Error('No persona configured for this agent');
    }
    return persona.contextAssemblyWorkflowDefId;
  }

  /**
   * Get the memory extraction workflow definition ID.
   */
  getMemoryExtractionWorkflowDefId(): string {
    const persona = this.getPersona();
    if (!persona) {
      throw new Error('No persona configured for this agent');
    }
    return persona.memoryExtractionWorkflowDefId;
  }

  /**
   * Get the max moves per turn constraint.
   */
  getMaxMovesPerTurn(): number | undefined {
    const persona = this.getPersona();
    return persona?.constraints?.maxMovesPerTurn;
  }

  /**
   * Get the recent turns limit.
   */
  getRecentTurnsLimit(): number {
    const persona = this.getPersona();
    return persona?.recentTurnsLimit ?? 20;
  }
}
