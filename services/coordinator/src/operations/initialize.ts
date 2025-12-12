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
  sql.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

/**
 * Load metadata from DO SQL
 */
function loadFromSql(
  sql: SqlStorage,
): { workflowRun: WorkflowRun; workflowDef: WorkflowDef } | null {
  const workflowRunResult = sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_run');
  const workflowDefResult = sql.exec('SELECT value FROM metadata WHERE key = ?', 'workflow_def');

  const workflowRunRows = [...workflowRunResult];
  const workflowDefRows = [...workflowDefResult];

  if (workflowRunRows.length === 0 || workflowDefRows.length === 0) {
    return null;
  }

  const workflowRunRow = workflowRunRows[0] as { value: string };
  const workflowDefRow = workflowDefRows[0] as { value: string };

  return {
    workflowRun: JSON.parse(workflowRunRow.value),
    workflowDef: JSON.parse(workflowDefRow.value),
  };
}

/**
 * Save metadata to DO SQL
 */
function saveToSql(sql: SqlStorage, workflowRun: WorkflowRun, workflowDef: WorkflowDef): void {
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
}

/**
 * Fetch metadata from RESOURCES service
 */
async function fetchFromResources(
  env: Env,
  workflowRunId: string,
): Promise<{ workflowRun: WorkflowRun; workflowDef: WorkflowDef }> {
  // Fetch workflow run
  using workflowRunsResource = env.RESOURCES.workflowRuns();
  const runResponse = await workflowRunsResource.get(workflowRunId);
  const workflowRun = runResponse.workflow_run;

  // Fetch workflow definition
  using workflowDefsResource = env.RESOURCES.workflowDefs();
  const defResponse = await workflowDefsResource.get(workflowRun.workflow_def_id);
  const rawDef = defResponse.workflow_def;

  // Map to coordinator's WorkflowDef type
  const workflowDef: WorkflowDef = {
    id: rawDef.id,
    version: rawDef.version,
    initial_node_id: rawDef.initial_node_id!,
    input_schema: rawDef.input_schema as JSONSchema,
    context_schema: rawDef.context_schema as JSONSchema | undefined,
    output_schema: rawDef.output_schema as JSONSchema,
    output_mapping: rawDef.output_mapping as Record<string, string> | undefined,
  };

  return { workflowRun, workflowDef };
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
  // Initialize table
  initializeTable(sql);

  // Try to load from SQL first
  const cached = loadFromSql(sql);
  if (cached) {
    return cached;
  }

  // Not cached - fetch from RESOURCES
  const metadata = await fetchFromResources(env, workflowRunId);

  // Cache in SQL for next time
  saveToSql(sql, metadata.workflowRun, metadata.workflowDef);

  return metadata;
}
