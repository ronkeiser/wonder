/**
 * Initialization Operations
 *
 * Loads workflow metadata from DO SQL or fetches from RESOURCES if not cached.
 */

import type { JSONSchema } from '@wonder/context';
import type { WorkflowDef, WorkflowRun } from '../types.js';

/**
 * Initialize metadata table in DO SQL
 */
function initializeTable(sql: SqlStorage): void {
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
 * Load metadata from DO SQL
 */
function loadFromSql(
  sql: SqlStorage,
): { workflowRun: WorkflowRun; workflowDef: WorkflowDef } | null {
  try {
    console.log('[initialize] attempting to load metadata from SQL cache');

    const workflowRunResult = sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_run');
    const workflowDefResult = sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_def');

    const workflowRunRows = [...workflowRunResult];
    const workflowDefRows = [...workflowDefResult];

    if (workflowRunRows.length === 0 || workflowDefRows.length === 0) {
      console.log('[initialize] metadata not found in SQL cache', {
        workflowRunFound: workflowRunRows.length > 0,
        workflowDefFound: workflowDefRows.length > 0,
      });
      return null;
    }

    const workflowRunRow = workflowRunRows[0] as { value: string };
    const workflowDefRow = workflowDefRows[0] as { value: string };

    console.log('[initialize] parsing cached metadata JSON');
    const workflowRun = JSON.parse(workflowRunRow.value);
    const workflowDef = JSON.parse(workflowDefRow.value);

    console.log('[initialize] successfully loaded metadata from SQL cache', {
      workflowRunId: workflowRun.id,
      workflowDefId: workflowDef.id,
      workflowDefVersion: workflowDef.version,
    });

    return { workflowRun, workflowDef };
  } catch (error) {
    console.error('[initialize] ERROR: Failed to load metadata from SQL cache:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Save metadata to DO SQL
 */
function saveToSql(sql: SqlStorage, workflowRun: WorkflowRun, workflowDef: WorkflowDef): void {
  try {
    console.log('[initialize] saving metadata to SQL cache', {
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

    console.log('[initialize] metadata successfully saved to SQL cache');
  } catch (error) {
    console.error('[initialize] ERROR: Failed to save metadata to SQL cache:', {
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
 * Checks DO SQL for cached metadata first. If not found, fetches from RESOURCES
 * and caches in DO SQL for subsequent initializations.
 *
 * Called during DO initialization to load metadata.
 */
export async function initialize(
  sql: SqlStorage,
  env: Env,
  workflowRunId: string,
): Promise<{ workflowRun: WorkflowRun; workflowDef: WorkflowDef }> {
  try {
    console.log('[initialize] START: initializing coordinator metadata', { workflowRunId });

    // Initialize table
    initializeTable(sql);

    // Try to load from SQL first
    const cached = loadFromSql(sql);
    if (cached) {
      console.log('[initialize] SUCCESS: metadata loaded from cache');
      return cached;
    }

    // Not cached - fetch from RESOURCES
    console.log('[initialize] cache miss, fetching from RESOURCES');
    const metadata = await fetchFromResources(env, workflowRunId);

    // Cache in SQL for next time
    saveToSql(sql, metadata.workflowRun, metadata.workflowDef);

    console.log('[initialize] SUCCESS: metadata fetched and cached');
    return metadata;
  } catch (error) {
    console.error('[initialize] FATAL: Initialization failed completely:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      workflowRunId,
    });
    throw error;
  }
}
