/**
 * Definition Operations
 *
 * DefinitionManager handles workflow definitions with drizzle-orm.
 * On initialize(), copies definitions from RESOURCES into DO SQLite.
 * Provides type-safe accessors for routing decisions.
 */

import { createLogger, type Logger } from '@wonder/logs';
import type { WorkflowDefContent } from '@wonder/resources/schemas';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';

import { definitions, nodes, transitions, workflowRuns } from '../schema';
import { errorDetails } from '../shared';
import migrations from '../schema/migrations';
import type { CoordinatorDb } from './db';

// Types inferred from schema
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type DefinitionRow = typeof definitions.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type TransitionRow = typeof transitions.$inferSelect;

/**
 * Parameters for initializing an ephemeral subworkflow
 */
export interface SubworkflowParams {
  /** The subworkflow's own run ID (ephemeral, not in D1) */
  runId: string;
  /** The workflow definition ID to load */
  workflowId: string;
  /** Optional version (null = latest) */
  version?: number;
  /** Input to the subworkflow */
  input: Record<string, unknown>;
  /** Root run ID for event scoping (inherited from parent) */
  rootRunId: string;
  /** Parent workflow run ID (for callbacks) */
  parentRunId: string;
  /** Parent token ID (for callbacks) */
  parentTokenId: string;
  /** Project ID (inherited from parent) */
  projectId: string;
}

/**
 * DefinitionManager provides access to workflow definitions stored in DO SQLite.
 *
 * Two initialization paths:
 * - initializeWorkflow: For root workflows with D1 records
 * - initializeSubworkflow: For ephemeral subworkflows (no D1 record)
 */
export class DefinitionManager {
  private readonly db: CoordinatorDb;
  private readonly env: Env;
  private readonly logger: Logger;

  constructor(db: CoordinatorDb, ctx: DurableObjectState, env: Env) {
    this.db = db;
    this.env = env;
    this.logger = createLogger(ctx, env.LOGS, {
      service: env.SERVICE,
      environment: env.ENVIRONMENT,
    });
  }

  /**
   * Initialize definitions for a root workflow run (has D1 record).
   *
   * - Runs migrations (idempotent)
   * - Checks if already populated (DO wake-up)
   * - If not, fetches from RESOURCES and inserts
   * - Updates workflow run status to 'running' in D1
   */
  async initializeWorkflow(workflowRunId: string): Promise<void> {
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
    } catch (error) {
      this.logger.error({
        eventType: 'defs.initialize.failed',
        message: 'Failed to initialize DefinitionManager',
        traceId: workflowRunId,
        metadata: {
          workflowRunId: workflowRunId,
          ...errorDetails(error),
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
    this.logger.info({
      eventType: 'defs.fetch_workflow_run.starting',
      message: 'Fetching workflow run from RESOURCES',
      traceId: workflowRunId,
      metadata: { workflowRunId },
    });

    let runResponse;
    try {
      runResponse = await workflowRunsResource.get(workflowRunId);
    } catch (error) {
      // Log detailed error info for debugging
      const errorInfo: Record<string, unknown> = {
        workflowRunId,
        error_name: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : String(error),
      };
      if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        if ('cause' in err) errorInfo.cause = String(err.cause);
        if ('code' in err) errorInfo.code = err.code;
      }
      this.logger.error({
        eventType: 'defs.fetch_workflow_run.failed',
        message: 'Failed to fetch workflow run from RESOURCES',
        traceId: workflowRunId,
        metadata: errorInfo,
      });
      throw error;
    }

    this.logger.info({
      eventType: 'defs.fetch_workflow_run.success',
      message: 'Successfully fetched workflow run',
      traceId: workflowRunId,
      metadata: { workflowRunId, definitionId: runResponse.workflowRun.definitionId },
    });

    const run = runResponse.workflowRun;

    // 2. Fetch workflow def with nodes and transitions
    const workflowDefsResource = this.env.RESOURCES.workflowDefs();
    const defResponse = await workflowDefsResource.get(run.definitionId, run.definitionVersion);
    const def = defResponse.definition; // Use raw definition row for DO SQLite insertion
    const nodesList = defResponse.nodes;
    const transitionsList = defResponse.transitions;

    // Log the context before inserting
    this.logger.info({
      eventType: 'defs.insert_workflow_run.context',
      message: 'Workflow run context before insert',
      traceId: workflowRunId,
      metadata: {
        contextType: typeof run.context,
        context: run.context,
        contextKeys: run.context ? Object.keys(run.context as object) : [],
        inputKeys: (run.context as { input?: object })?.input
          ? Object.keys((run.context as { input: object }).input)
          : [],
      },
    });

    // 3. Insert workflow run
    this.db.insert(workflowRuns).values(run).run();

    // 4. Insert workflow def
    this.db.insert(definitions).values(def).run();

    // 5. Insert nodes
    for (const node of nodesList) {
      this.db.insert(nodes).values(node).run();
    }

    // 6. Insert transitions
    for (const transition of transitionsList) {
      this.db.insert(transitions).values(transition).run();
    }
  }

  /**
   * Initialize definitions for an ephemeral subworkflow (no D1 record).
   *
   * - Runs migrations (idempotent)
   * - Checks if already populated (DO wake-up)
   * - If not, fetches WorkflowDef directly and creates synthetic run record
   * - Does NOT update D1 (subworkflows are ephemeral)
   */
  async initializeSubworkflow(params: SubworkflowParams): Promise<void> {
    try {
      // Run migrations (idempotent - creates tables if not exist)
      migrate(this.db, migrations);
      this.logger.info({
        eventType: 'defs.migrations.complete',
        message: 'DO SQLite migrations applied (subworkflow)',
        traceId: params.runId,
      });

      // Check if already populated (DO wake-up case)
      const existing = this.db.select({ id: workflowRuns.id }).from(workflowRuns).limit(1).all();
      if (existing.length > 0) {
        this.logger.info({
          eventType: 'defs.already_populated',
          message: 'DO SQLite already populated (subworkflow wake-up)',
          traceId: params.runId,
        });
        return;
      }

      // Fetch workflow def directly (not via workflowRun)
      const workflowDefsResource = this.env.RESOURCES.workflowDefs();
      const defResponse = await workflowDefsResource.get(params.workflowId, params.version);
      const def = defResponse.definition; // Use raw definition row for DO SQLite insertion
      const nodesList = defResponse.nodes;
      const transitionsList = defResponse.transitions;

      // Create synthetic workflow run record (local to DO, not in D1)
      const now = new Date().toISOString();
      const syntheticRun: WorkflowRunRow = {
        id: params.runId,
        projectId: params.projectId,
        workflowId: params.workflowId,
        definitionId: def.id,
        definitionVersion: def.version,
        status: 'running',
        context: { input: params.input, state: {}, output: {} },
        activeTokens: [],
        durableObjectId: params.runId,
        latestSnapshot: null,
        rootRunId: params.rootRunId,
        parentRunId: params.parentRunId,
        parentNodeId: null,
        parentTokenId: params.parentTokenId,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      this.db.insert(workflowRuns).values(syntheticRun).run();

      // Insert workflow def
      this.db.insert(definitions).values(def).run();

      // Insert nodes
      for (const node of nodesList) {
        this.db.insert(nodes).values(node).run();
      }

      // Insert transitions
      for (const transition of transitionsList) {
        this.db.insert(transitions).values(transition).run();
      }

      // Log table counts
      const nodeCount = this.db.select({ id: nodes.id }).from(nodes).all().length;
      const transitionCount = this.db.select({ id: transitions.id }).from(transitions).all().length;
      this.logger.info({
        eventType: 'defs.subworkflow.populated',
        message: 'DO SQLite populated for subworkflow',
        traceId: params.runId,
        metadata: {
          runId: params.runId,
          workflowId: params.workflowId,
          rootRunId: params.rootRunId,
          parentRunId: params.parentRunId,
          nodeCount,
          transitionCount,
        },
      });
    } catch (error) {
      this.logger.error({
        eventType: 'defs.subworkflow.initialize.failed',
        message: 'Failed to initialize subworkflow DefinitionManager',
        traceId: params.runId,
        metadata: {
          runId: params.runId,
          workflowId: params.workflowId,
          ...errorDetails(error),
        },
      });
      throw error;
    }
  }

  /**
   * Accessors
   */

  /**
   * Get the workflow run
   */
  getWorkflowRun(): WorkflowRunRow {
    const result = this.db.select().from(workflowRuns).limit(1).all();
    if (result.length === 0) {
      throw new Error('WorkflowRun not found');
    }
    const run = result[0];
    this.logger.info({
      eventType: 'defs.get_workflow_run.context',
      message: 'Workflow run context after read',
      metadata: {
        contextType: typeof run.context,
        context: run.context,
        contextKeys: run.context ? Object.keys(run.context as object) : [],
      },
    });
    return run;
  }

  /**
   * Get the workflow definition
   */
  getWorkflowDef(): DefinitionRow {
    const result = this.db.select().from(definitions).limit(1).all();
    if (result.length === 0) {
      throw new Error('WorkflowDef not found');
    }
    return result[0];
  }

  /**
   * Get the workflow definition content with proper typing
   */
  getWorkflowDefContent(): WorkflowDefContent {
    const def = this.getWorkflowDef();
    return def.content as WorkflowDefContent;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): NodeRow {
    const def = this.getWorkflowDef();
    const result = this.db
      .select()
      .from(nodes)
      .where(
        and(
          eq(nodes.definitionId, def.id),
          eq(nodes.definitionVersion, def.version),
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
    const def = this.getWorkflowDef();
    return this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.definitionId, def.id), eq(nodes.definitionVersion, def.version)))
      .all();
  }

  /**
   * Get transitions from a specific node (for routing)
   */
  getTransitionsFrom(nodeId: string): TransitionRow[] {
    const def = this.getWorkflowDef();
    return this.db
      .select()
      .from(transitions)
      .where(
        and(
          eq(transitions.definitionId, def.id),
          eq(transitions.definitionVersion, def.version),
          eq(transitions.fromNodeId, nodeId),
        ),
      )
      .all();
  }

  /**
   * Get all transitions for this workflow
   */
  getTransitions(): TransitionRow[] {
    const def = this.getWorkflowDef();
    return this.db
      .select()
      .from(transitions)
      .where(
        and(
          eq(transitions.definitionId, def.id),
          eq(transitions.definitionVersion, def.version),
        ),
      )
      .all();
  }

  /**
   * Get a transition by ID
   */
  getTransition(transitionId: string): TransitionRow {
    const def = this.getWorkflowDef();
    const result = this.db
      .select()
      .from(transitions)
      .where(
        and(
          eq(transitions.definitionId, def.id),
          eq(transitions.definitionVersion, def.version),
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
