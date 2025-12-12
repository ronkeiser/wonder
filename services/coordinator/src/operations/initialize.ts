/**
 * Initialization Operations
 *
 * Shared utilities for accessing workflow metadata from DO SQL.
 * Used by start() to fetch/cache metadata and by managers to read cached metadata.
 */

import type { JSONSchema } from '@wonder/context';
import type { WorkflowDef, WorkflowRun } from '../types.js';

/**
 * Initialize metadata table in DO SQL
 */
export function initializeTable(sql: SqlStorage): void {
  try {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    console.log('[initialize] metadata table created/verified');
  } catch (error) {
    console.error('[initialize] FATAL: Failed to create metadata table:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get WorkflowRun from metadata table
 * Throws if not found - start() must be called first
 */
export function getWorkflowRun(sql: SqlStorage): WorkflowRun {
  try {
    const result = sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_run');
    const rows = [...result];

    if (rows.length === 0) {
      throw new Error('WorkflowRun not found in metadata - start() must be called first');
    }

    const row = rows[0] as { value: string };
    return JSON.parse(row.value) as WorkflowRun;
  } catch (error) {
    console.error('[initialize] ERROR: Failed to get WorkflowRun from metadata:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get WorkflowDef from metadata table
 * Throws if not found - start() must be called first
 */
export function getWorkflowDef(sql: SqlStorage): WorkflowDef {
  try {
    const result = sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_def');
    const rows = [...result];

    if (rows.length === 0) {
      throw new Error('WorkflowDef not found in metadata - start() must be called first');
    }

    const row = rows[0] as { value: string };
    return JSON.parse(row.value) as WorkflowDef;
  } catch (error) {
    console.error('[initialize] ERROR: Failed to get WorkflowDef from metadata:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Save metadata to DO SQL
 */
export function saveMetadata(
  sql: SqlStorage,
  workflowRun: WorkflowRun,
  workflowDef: WorkflowDef,
): void {
  try {
    console.log('[initialize] saving metadata to SQL', {
      workflowRunId: workflowRun.id,
      workflowDefId: workflowDef.id,
      workflowDefVersion: workflowDef.version,
    });

    sql.exec(
      'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
      'workflow_run',
      JSON.stringify(workflowRun),
    );

    sql.exec(
      'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
      'workflow_def',
      JSON.stringify(workflowDef),
    );

    console.log('[initialize] metadata successfully saved to SQL');
  } catch (error) {
    console.error('[initialize] ERROR: Failed to save metadata to SQL:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      workflowRunId: workflowRun.id,
      workflowDefId: workflowDef.id,
    });
    throw error;
  }
}

/**
 * Fetch metadata from RESOURCES service
 */
async function fetchFromResources(
  env: Env,
  workflowRunId: string,
): Promise<{ workflowRun: WorkflowRun; workflowDef: WorkflowDef }> {
  try {
    console.log('[initialize] fetching metadata from RESOURCES service', { workflowRunId });

    // Fetch workflow run
    using workflowRunsResource = env.RESOURCES.workflowRuns();
    console.log('[initialize] fetching workflow run from RESOURCES');
    const runResponse = await workflowRunsResource.get(workflowRunId);
    const workflowRun = runResponse.workflow_run;
    console.log('[initialize] workflow run fetched', {
      workflowRunId: workflowRun.id,
      workflowDefId: workflowRun.workflow_def_id,
      status: workflowRun.status,
    });

    // Fetch workflow definition
    using workflowDefsResource = env.RESOURCES.workflowDefs();
    console.log('[initialize] fetching workflow def from RESOURCES', {
      workflowDefId: workflowRun.workflow_def_id,
    });
    const defResponse = await workflowDefsResource.get(workflowRun.workflow_def_id);
    const rawDef = defResponse.workflow_def;
    console.log('[initialize] workflow def fetched', {
      workflowDefId: rawDef.id,
      version: rawDef.version,
      initialNodeId: rawDef.initial_node_id,
    });

    // Map to coordinator's WorkflowDef type
    if (!rawDef.initial_node_id) {
      console.error('[initialize] ERROR: workflow def missing initial_node_id', {
        workflowDefId: rawDef.id,
        version: rawDef.version,
      });
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

    console.log('[initialize] successfully fetched and mapped metadata from RESOURCES');
    return { workflowRun, workflowDef };
  } catch (error) {
    console.error('[initialize] ERROR: Failed to fetch metadata from RESOURCES:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      workflowRunId,
    });
    throw error;
  }
}

/**
 * Initialize coordinator metadata
 *
 * Fetches metadata from RESOURCES and caches in DO SQL.
 * Called by start() on first workflow invocation.
 */
export async function initialize(
  sql: SqlStorage,
  env: Env,
  workflowRunId: string,
): Promise<{ workflowRun: WorkflowRun; workflowDef: WorkflowDef }> {
  try {
    console.log('[initialize] START: initializing coordinator metadata', { workflowRunId });

    // Ensure metadata table exists
    initializeTable(sql);

    // Fetch from RESOURCES
    console.log('[initialize] fetching from RESOURCES');
    const metadata = await fetchFromResources(env, workflowRunId);

    // Save to SQL for managers to access
    saveMetadata(sql, metadata.workflowRun, metadata.workflowDef);

    console.log('[initialize] SUCCESS: metadata fetched and cached');
    return metadata;
  } catch (error) {
    console.error('[initialize] FATAL: Initialization failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      workflowRunId,
    });
    throw error;
  }
}
