/**
 * Metadata Operations
 *
 * MetadataManager handles workflow metadata (WorkflowRun and WorkflowDef)
 * with multi-level caching (memory → SQL → RESOURCES RPC).
 *
 * Used by ContextManager, CoordinatorEmitter, and start() to access metadata.
 * All metadata access goes through this manager - single source of truth.
 */

import type { JSONSchema } from '@wonder/context';
import { createLogger, type Logger } from '@wonder/logs';
import type { WorkflowDef, WorkflowRun } from '../types.js';

/**
 * MetadataManager provides cached access to workflow metadata
 *
 * Caching strategy:
 * 1. Memory cache (fastest) - cleared on DO eviction
 * 2. SQL cache (durable) - persists across DO wake-ups
 * 3. RESOURCES RPC (slowest) - only on first access
 */
export class MetadataManager {
  private readonly sql: SqlStorage;
  private readonly env: Env;
  private readonly logger: Logger;

  // Memory cache
  private cachedRun: WorkflowRun | null = null;
  private cachedDef: WorkflowDef | null = null;
  private workflow_run_id: string | null = null;

  constructor(ctx: DurableObjectState, sql: SqlStorage, env: Env) {
    this.sql = sql;
    this.env = env;
    this.logger = createLogger(ctx, env.LOGS, {
      service: 'coordinator',
      environment: 'development',
    });

    // Ensure metadata table exists
    this.initializeTable();
  }

  /**
   * Initialize metadata table in DO SQL
   */
  private initializeTable(): void {
    try {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_table_init_failed',
        message: 'Failed to create metadata table',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Initialize metadata manager with workflow_run_id
   *
   * Must be called before getWorkflowRun() or getWorkflowDef().
   * Triggers load/fetch of metadata on first call.
   */
  async initialize(workflow_run_id: string): Promise<void> {
    try {
      this.workflow_run_id = workflow_run_id;
      // Trigger metadata load (will cache for subsequent calls)
      await this.getWorkflowRun();
      await this.getWorkflowDef();
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_initialize_failed',
        message: 'Failed to initialize metadata manager',
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
   * Get WorkflowRun with multi-level caching
   *
   * Checks memory → SQL → RESOURCES, caching at each level.
   * Must be called after initialize().
   */
  async getWorkflowRun(): Promise<WorkflowRun> {
    try {
      if (!this.workflow_run_id) {
        throw new Error('MetadataManager not initialized - call initialize() first');
      }

      // Check memory cache
      if (this.cachedRun) {
        return this.cachedRun;
      }

      // Check SQL cache
      const sqlRun = this.getWorkflowRunFromSql();
      if (sqlRun) {
        this.cachedRun = sqlRun;
        return sqlRun;
      }

      // Fetch from RESOURCES
      const metadata = await this.fetchFromResources(this.workflow_run_id);
      this.cachedRun = metadata.workflowRun;
      this.cachedDef = metadata.workflowDef;
      this.saveToSql(metadata.workflowRun, metadata.workflowDef);

      return this.cachedRun;
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_get_workflow_run_failed',
        message: 'Failed to get WorkflowRun',
        trace_id: this.workflow_run_id || 'unknown',
        metadata: {
          workflow_run_id: this.workflow_run_id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Get WorkflowDef with multi-level caching
   *
   * Checks memory → SQL. Must be called after initialize().
   */
  async getWorkflowDef(): Promise<WorkflowDef> {
    try {
      // Check memory cache
      if (this.cachedDef) {
        return this.cachedDef;
      }

      // Check SQL cache
      const sqlDef = this.getWorkflowDefFromSql();
      if (sqlDef) {
        this.cachedDef = sqlDef;
        return sqlDef;
      }

      // Should not reach here - getWorkflowRun() should have loaded both
      throw new Error('WorkflowDef not found - getWorkflowRun() must be called first');
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_get_workflow_def_failed',
        message: 'Failed to get WorkflowDef',
        trace_id: this.workflow_run_id || 'unknown',
        metadata: {
          workflow_run_id: this.workflow_run_id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Get WorkflowRun from SQL cache
   */
  private getWorkflowRunFromSql(): WorkflowRun | null {
    try {
      const result = this.sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_run');
      const rows = [...result];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0] as { value: string };
      return JSON.parse(row.value) as WorkflowRun;
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_sql_read_failed',
        message: 'Failed to read WorkflowRun from SQL cache',
        trace_id: this.workflow_run_id || 'unknown',
        metadata: {
          workflow_run_id: this.workflow_run_id,
          key: 'workflow_run',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Get WorkflowDef from SQL cache
   */
  private getWorkflowDefFromSql(): WorkflowDef | null {
    try {
      const result = this.sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_def');
      const rows = [...result];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0] as { value: string };
      return JSON.parse(row.value) as WorkflowDef;
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_sql_read_failed',
        message: 'Failed to read WorkflowDef from SQL cache',
        trace_id: this.workflow_run_id || 'unknown',
        metadata: {
          workflow_run_id: this.workflow_run_id,
          key: 'workflow_def',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Save metadata to SQL cache
   */
  private saveToSql(workflowRun: WorkflowRun, workflowDef: WorkflowDef): void {
    try {
      this.sql.exec(
        'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
        'workflow_run',
        JSON.stringify(workflowRun),
      );

      this.sql.exec(
        'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
        'workflow_def',
        JSON.stringify(workflowDef),
      );
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_sql_write_failed',
        message: 'Failed to save metadata to SQL cache',
        trace_id: this.workflow_run_id || 'unknown',
        metadata: {
          workflow_run_id: workflowRun.id,
          workflow_def_id: workflowDef.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Fetch metadata from RESOURCES service
   */
  private async fetchFromResources(
    workflowRunId: string,
  ): Promise<{ workflowRun: WorkflowRun; workflowDef: WorkflowDef }> {
    try {
      // Fetch workflow run
      using workflowRunsResource = this.env.RESOURCES.workflowRuns();
      const runResponse = await workflowRunsResource.get(workflowRunId);
      const workflowRun = runResponse.workflow_run;

      // Fetch workflow definition
      using workflowDefsResource = this.env.RESOURCES.workflowDefs();
      const defResponse = await workflowDefsResource.get(workflowRun.workflow_def_id);
      const rawDef = defResponse.workflow_def;

      // Map to coordinator's WorkflowDef type
      if (!rawDef.initial_node_id) {
        throw new Error(`WorkflowDef ${rawDef.id} is missing initial_node_id`);
      }

      const workflowDef: WorkflowDef = {
        id: rawDef.id,
        version: rawDef.version,
        initial_node_id: rawDef.initial_node_id,
        input_schema: rawDef.input_schema as JSONSchema,
        context_schema: rawDef.context_schema as JSONSchema | undefined,
        output_schema: rawDef.output_schema as JSONSchema,
        output_mapping: rawDef.output_mapping as Record<string, string> | undefined,
      };

      return { workflowRun, workflowDef };
    } catch (error) {
      this.logger.error({
        event_type: 'metadata_fetch_failed',
        message: 'Failed to fetch metadata from RESOURCES',
        trace_id: workflowRunId,
        metadata: {
          workflow_run_id: workflowRunId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }
}
