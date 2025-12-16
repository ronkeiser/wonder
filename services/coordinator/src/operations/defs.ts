/**
 * Definition Operations
 *
 * DefinitionManager handles workflow definitions with drizzle-orm.
 * On initialize(), copies definitions from RESOURCES into DO SQLite.
 * Provides type-safe accessors for routing decisions.
 */

import { createLogger, type Logger } from '@wonder/logs';
import { and, eq } from 'drizzle-orm';
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';

import * as schema from '../schema';
import { nodes, transitions, workflow_defs, workflow_runs } from '../schema';
import migrations from '../schema/migrations';

// Types inferred from schema
export type WorkflowRunRow = typeof workflow_runs.$inferSelect;
export type WorkflowDefRow = typeof workflow_defs.$inferSelect;
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
  private readonly db: DrizzleSqliteDODatabase<typeof schema>;
  private readonly env: Env;
  private readonly logger: Logger;
  private workflow_run_id: string | null = null;
  private initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    this.db = drizzle(ctx.storage, { schema });
    this.env = env;
    this.logger = createLogger(ctx, env.LOGS, {
      service: 'coordinator',
      environment: 'development',
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
  async initialize(workflow_run_id: string): Promise<void> {
    try {
      this.workflow_run_id = workflow_run_id;

      // Run migrations (idempotent - creates tables if not exist)
      migrate(this.db, migrations);
      this.logger.info({
        event_type: 'defs_migrations_complete',
        message: 'DO SQLite migrations applied',
        trace_id: workflow_run_id,
      });

      // Check if already populated (DO wake-up case)
      const existing = this.db.select({ id: workflow_runs.id }).from(workflow_runs).limit(1).all();
      if (existing.length > 0) {
        this.logger.info({
          event_type: 'defs_already_populated',
          message: 'DO SQLite already populated (wake-up)',
          trace_id: workflow_run_id,
        });
        this.initialized = true;
        return;
      }

      // Fetch from RESOURCES and insert
      await this.fetchAndInsert(workflow_run_id);

      // Update workflow run status to 'running' in RESOURCES (D1)
      const workflowRunsResource = this.env.RESOURCES.workflowRuns();
      await workflowRunsResource.updateStatus(workflow_run_id, 'running');

      // Log table counts
      const nodeCount = this.db.select({ id: nodes.id }).from(nodes).all().length;
      const transitionCount = this.db.select({ id: transitions.id }).from(transitions).all().length;
      this.logger.info({
        event_type: 'defs_populated',
        message: 'DO SQLite populated from RESOURCES',
        trace_id: workflow_run_id,
        metadata: {
          workflow_run_id,
          node_count: nodeCount,
          transition_count: transitionCount,
        },
      });

      this.initialized = true;
    } catch (error) {
      this.logger.error({
        event_type: 'defs_initialize_failed',
        message: 'Failed to initialize DefinitionManager',
        trace_id: workflow_run_id,
        metadata: {
          workflow_run_id,
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
    const run = runResponse.workflow_run;

    // 2. Fetch workflow def with nodes and transitions
    const workflowDefsResource = this.env.RESOURCES.workflowDefs();
    const defResponse = await workflowDefsResource.get(run.workflow_def_id, run.workflow_version);
    const def = defResponse.workflow_def;
    const nodesList = defResponse.nodes;
    const transitionsList = defResponse.transitions;

    // 3. Insert workflow run
    this.db
      .insert(workflow_runs)
      .values({
        id: run.id,
        project_id: run.project_id,
        workflow_id: run.workflow_id,
        workflow_def_id: run.workflow_def_id,
        workflow_version: run.workflow_version,
        status: run.status as 'running' | 'completed' | 'failed' | 'waiting',
        context: run.context,
        active_tokens: run.active_tokens,
        durable_object_id: run.durable_object_id,
        latest_snapshot: run.latest_snapshot,
        parent_run_id: run.parent_run_id,
        parent_node_id: run.parent_node_id,
        created_at: run.created_at,
        updated_at: run.updated_at,
        completed_at: run.completed_at,
      })
      .run();

    // 4. Insert workflow def
    this.db
      .insert(workflow_defs)
      .values({
        id: def.id,
        version: def.version,
        name: def.name,
        description: def.description,
        project_id: def.project_id,
        library_id: def.library_id,
        tags: def.tags,
        input_schema: def.input_schema,
        output_schema: def.output_schema,
        output_mapping: def.output_mapping,
        context_schema: def.context_schema,
        initial_node_id: def.initial_node_id,
        created_at: def.created_at,
        updated_at: def.updated_at,
      })
      .run();

    // 5. Insert nodes
    for (const node of nodesList) {
      this.db
        .insert(nodes)
        .values({
          id: node.id,
          ref: node.ref,
          workflow_def_id: node.workflow_def_id,
          workflow_def_version: node.workflow_def_version,
          name: node.name,
          task_id: node.task_id,
          task_version: node.task_version,
          input_mapping: node.input_mapping,
          output_mapping: node.output_mapping,
          resource_bindings: node.resource_bindings,
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
          workflow_def_id: transition.workflow_def_id,
          workflow_def_version: transition.workflow_def_version,
          from_node_id: transition.from_node_id,
          to_node_id: transition.to_node_id,
          priority: transition.priority,
          condition: transition.condition,
          spawn_count: transition.spawn_count,
          foreach: transition.foreach,
          synchronization: transition.synchronization,
          loop_config: transition.loop_config,
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
    const result = this.db.select().from(workflow_runs).limit(1).all();
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
    const result = this.db.select().from(workflow_defs).limit(1).all();
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
          eq(nodes.workflow_def_id, def.id),
          eq(nodes.workflow_def_version, def.version),
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
      .where(and(eq(nodes.workflow_def_id, def.id), eq(nodes.workflow_def_version, def.version)))
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
          eq(transitions.workflow_def_id, def.id),
          eq(transitions.workflow_def_version, def.version),
          eq(transitions.from_node_id, nodeId),
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
          eq(transitions.workflow_def_id, def.id),
          eq(transitions.workflow_def_version, def.version),
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
          eq(transitions.workflow_def_id, def.id),
          eq(transitions.workflow_def_version, def.version),
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
