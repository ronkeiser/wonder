/**
 * Definition Operations
 *
 * DefinitionManager handles workflow definitions with drizzle-orm.
 * On initialize(), copies definitions from RESOURCES into DO SQLite.
 * Provides type-safe accessors for routing decisions.
 */

import { createLogger, type Logger } from '@wonder/logs';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';

import { nodes, transitions, workflowDefs, workflowRuns } from '../schema';
import migrations from '../schema/migrations';
import type { CoordinatorDb } from './db';

// Types inferred from schema
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowDefRow = typeof workflowDefs.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type TransitionRow = typeof transitions.$inferSelect;

/**
 * DefinitionManager provides access to workflow definitions stored in DO SQLite.
 *
 * On first initialize():
 * 1. Runs migrations (creates tables)
 * 2. Checks if already populated (DO wake-up case)
 * 3. If not, fetches from RESOURCES and inserts all tables
 */
export class DefinitionManager {
  private readonly db: CoordinatorDb;
  private readonly env: Env;
  private readonly logger: Logger;
  private initialized = false;

  constructor(db: CoordinatorDb, ctx: DurableObjectState, env: Env) {
    this.db = db;
    this.env = env;
    this.logger = createLogger(ctx, env.LOGS, {
      service: env.SERVICE,
      environment: env.ENVIRONMENT,
    });
  }

  /**
   * Initialize definitions for a workflow run.
   *
   * - Runs migrations (idempotent)
   * - Checks if already populated (DO wake-up)
   * - If not, fetches from RESOURCES and inserts
   * - Updates workflow run status to 'running'
   */
  async initialize(workflowRunId: string): Promise<void> {
    try {
      // Run migrations (idempotent - creates tables if not exist)
      migrate(this.db, migrations);
      this.logger.info({
        eventType: 'defs.migrations.complete',
        message: 'DO SQLite migrations applied',
        traceId: workflowRunId,
      });

      // Check if already populated (DO wake-up case)
      const existing = this.db.select({ id: workflowRuns.id }).from(workflowRuns).limit(1).all();
      if (existing.length > 0) {
        this.logger.info({
          eventType: 'defs.already_populated',
          message: 'DO SQLite already populated (wake-up)',
          traceId: workflowRunId,
        });
        this.initialized = true;
        return;
      }

      // Fetch from RESOURCES and insert
      await this.fetchAndInsert(workflowRunId);

      // Update workflow run status to 'running' in RESOURCES (D1)
      const workflowRunsResource = this.env.RESOURCES.workflowRuns();
      await workflowRunsResource.updateStatus(workflowRunId, 'running');

      // Log table counts
      const nodeCount = this.db.select({ id: nodes.id }).from(nodes).all().length;
      const transitionCount = this.db.select({ id: transitions.id }).from(transitions).all().length;
      this.logger.info({
        eventType: 'defs.populated',
        message: 'DO SQLite populated from RESOURCES',
        traceId: workflowRunId,
        metadata: {
          workflowRunId: workflowRunId,
          nodeCount: nodeCount,
          transitionCount: transitionCount,
        },
      });

      this.initialized = true;
    } catch (error) {
      this.logger.error({
        eventType: 'defs.initialize.failed',
        message: 'Failed to initialize DefinitionManager',
        traceId: workflowRunId,
        metadata: {
          workflowRunId: workflowRunId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Fetch definitions from RESOURCES service and insert into DO SQLite.
   */
  private async fetchAndInsert(workflowRunId: string): Promise<void> {
    // 1. Fetch workflow run
    const workflowRunsResource = this.env.RESOURCES.workflowRuns();
    const runResponse = await workflowRunsResource.get(workflowRunId);
    const run = runResponse.workflowRun;

    // 2. Fetch workflow def with nodes and transitions
    const workflowDefsResource = this.env.RESOURCES.workflowDefs();
    const defResponse = await workflowDefsResource.get(run.workflowDefId, run.workflowVersion);
    const def = defResponse.workflowDef;
    const nodesList = defResponse.nodes;
    const transitionsList = defResponse.transitions;

    // 3. Insert workflow run
    this.db
      .insert(workflowRuns)
      .values({
        id: run.id,
        projectId: run.projectId,
        workflowId: run.workflowId,
        workflowDefId: run.workflowDefId,
        workflowVersion: run.workflowVersion,
        status: run.status as 'running' | 'completed' | 'failed' | 'waiting',
        context: run.context,
        activeTokens: run.activeTokens,
        durableObjectId: run.durableObjectId,
        latestSnapshot: run.latestSnapshot,
        parentRunId: run.parentRunId,
        parentNodeId: run.parentNodeId,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        completedAt: run.completedAt,
      })
      .run();

    // 4. Insert workflow def
    this.db
      .insert(workflowDefs)
      .values({
        id: def.id,
        version: def.version,
        name: def.name,
        description: def.description,
        projectId: def.projectId,
        libraryId: def.libraryId,
        tags: def.tags,
        inputSchema: def.inputSchema,
        outputSchema: def.outputSchema,
        outputMapping: def.outputMapping,
        contextSchema: def.contextSchema,
        initialNodeId: def.initialNodeId,
        createdAt: def.createdAt,
        updatedAt: def.updatedAt,
      })
      .run();

    // 5. Insert nodes
    for (const node of nodesList) {
      this.db
        .insert(nodes)
        .values({
          id: node.id,
          ref: node.ref,
          workflowDefId: node.workflowDefId,
          workflowDefVersion: node.workflowDefVersion,
          name: node.name,
          taskId: node.taskId,
          taskVersion: node.taskVersion,
          inputMapping: node.inputMapping,
          outputMapping: node.outputMapping,
          resourceBindings: node.resourceBindings,
        })
        .run();
    }

    // 6. Insert transitions
    for (const transition of transitionsList) {
      this.db
        .insert(transitions)
        .values({
          id: transition.id,
          ref: transition.ref,
          workflowDefId: transition.workflowDefId,
          workflowDefVersion: transition.workflowDefVersion,
          fromNodeId: transition.fromNodeId,
          toNodeId: transition.toNodeId,
          priority: transition.priority,
          condition: transition.condition,
          spawnCount: transition.spawnCount,
          siblingGroup: transition.siblingGroup,
          foreach: transition.foreach,
          synchronization: transition.synchronization,
          loopConfig: transition.loopConfig,
        })
        .run();
    }
  }

  /**
   * Accessors
   */

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DefinitionManager not initialized - call initialize() first');
    }
  }

  /**
   * Get the workflow run
   */
  getWorkflowRun(): WorkflowRunRow {
    this.ensureInitialized();
    const result = this.db.select().from(workflowRuns).limit(1).all();
    if (result.length === 0) {
      throw new Error('WorkflowRun not found');
    }
    return result[0];
  }

  /**
   * Get the workflow definition
   */
  getWorkflowDef(): WorkflowDefRow {
    this.ensureInitialized();
    const result = this.db.select().from(workflowDefs).limit(1).all();
    if (result.length === 0) {
      throw new Error('WorkflowDef not found');
    }
    return result[0];
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): NodeRow {
    this.ensureInitialized();
    const def = this.getWorkflowDef();
    const result = this.db
      .select()
      .from(nodes)
      .where(
        and(
          eq(nodes.workflowDefId, def.id),
          eq(nodes.workflowDefVersion, def.version),
          eq(nodes.id, nodeId),
        ),
      )
      .limit(1)
      .all();

    if (result.length === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return result[0];
  }

  /**
   * Get all nodes for this workflow
   */
  getNodes(): NodeRow[] {
    this.ensureInitialized();
    const def = this.getWorkflowDef();
    return this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.workflowDefId, def.id), eq(nodes.workflowDefVersion, def.version)))
      .all();
  }

  /**
   * Get transitions from a specific node (for routing)
   */
  getTransitionsFrom(nodeId: string): TransitionRow[] {
    this.ensureInitialized();
    const def = this.getWorkflowDef();
    return this.db
      .select()
      .from(transitions)
      .where(
        and(
          eq(transitions.workflowDefId, def.id),
          eq(transitions.workflowDefVersion, def.version),
          eq(transitions.fromNodeId, nodeId),
        ),
      )
      .all();
  }

  /**
   * Get all transitions for this workflow
   */
  getTransitions(): TransitionRow[] {
    this.ensureInitialized();
    const def = this.getWorkflowDef();
    return this.db
      .select()
      .from(transitions)
      .where(
        and(
          eq(transitions.workflowDefId, def.id),
          eq(transitions.workflowDefVersion, def.version),
        ),
      )
      .all();
  }

  /**
   * Get a transition by ID
   */
  getTransition(transitionId: string): TransitionRow {
    this.ensureInitialized();
    const def = this.getWorkflowDef();
    const result = this.db
      .select()
      .from(transitions)
      .where(
        and(
          eq(transitions.workflowDefId, def.id),
          eq(transitions.workflowDefVersion, def.version),
          eq(transitions.id, transitionId),
        ),
      )
      .limit(1)
      .all();

    if (result.length === 0) {
      throw new Error(`Transition not found: ${transitionId}`);
    }
    return result[0];
  }
}
