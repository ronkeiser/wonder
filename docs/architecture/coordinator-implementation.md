# Coordinator Implementation Guide

This document provides code examples and implementation details for the coordinator's Decision Pattern architecture on the Actor Model.

## Decision Type Definitions

```typescript
// decisions.ts

export type Decision =
  // Token operations
  | { type: "CREATE_TOKEN"; params: CreateTokenParams }
  | { type: "CREATE_FAN_IN_TOKEN"; params: CreateFanInParams }
  | { type: "UPDATE_TOKEN_STATUS"; tokenId: string; status: TokenStatus }
  | {
      type: "ACTIVATE_FAN_IN_TOKEN";
      workflow_run_id: string;
      node_id: string;
      fanInPath: string;
    }
  | { type: "MARK_FOR_DISPATCH"; tokenId: string }

  // Context operations
  | { type: "SET_CONTEXT"; path: string; value: unknown }
  | {
      type: "APPLY_NODE_OUTPUT";
      nodeRef: string;
      output: Record<string, unknown>;
      tokenId?: string;
    }

  // Synchronization (triggers recursive decision generation)
  | {
      type: "CHECK_SYNCHRONIZATION";
      tokenId: string;
      transition: TransitionDef;
    }

  // Batched operations (optimization)
  | { type: "BATCH_CREATE_TOKENS"; allParams: CreateTokenParams[] }
  | {
      type: "BATCH_UPDATE_STATUS";
      updates: Array<{ tokenId: string; status: TokenStatus }>;
    };

export interface CreateTokenParams {
  id: string;
  workflow_run_id: string;
  node_id: string;
  parent_token_id: string | null;
  path_id: string;
  fan_out_transition_id: string | null;
  branch_index: number;
  branch_total: number;
}

export interface CreateFanInParams {
  workflow_run_id: string;
  node_id: string;
  path_id: string;
  status: "waiting_for_siblings";
}
```

## Decision Modules (Pure)

### decisions/routing.ts

```typescript
import { ulid } from "ulid";
import type { Decision, CreateTokenParams } from "../decisions";
import type { TokenRow, WorkflowDef, ContextSnapshot } from "../types";

/**
 * Decide what happens after a token completes.
 * Pure function - no I/O, testable without actors/SQL/RPC.
 */
export function decide(
  completedToken: TokenRow,
  workflow: WorkflowDef,
  contextData: ContextSnapshot
): Decision[] {
  const decisions: Decision[] = [];

  // Find completed node
  const node = workflow.nodes.find((n) => n.id === completedToken.node_id);
  if (!node) {
    throw new Error(`Node not found: ${completedToken.node_id}`);
  }

  // Get outgoing transitions
  const transitions = workflow.transitions.filter(
    (t) => t.from_node_id === node.id
  );

  // TODO: Group by priority tier for sequential evaluation
  // For now, evaluate all transitions

  for (const transition of transitions) {
    // Evaluate condition
    const matches = evaluateCondition(transition.condition, contextData);
    if (!matches) continue;

    // Determine spawn count
    const spawnCount = transition.spawn_count ?? 1;
    // TODO: Handle dynamic foreach

    // Generate decisions for each spawn
    for (let i = 0; i < spawnCount; i++) {
      const tokenId = ulid();
      const pathId = `${completedToken.path_id}.${node.ref}.${i}`;

      decisions.push({
        type: "CREATE_TOKEN",
        params: {
          id: tokenId,
          workflow_run_id: completedToken.workflow_run_id,
          node_id: transition.to_node_id,
          parent_token_id: completedToken.id,
          path_id: pathId,
          fan_out_transition_id: transition.id,
          branch_index: i,
          branch_total: spawnCount,
        },
      });

      // Check if transition has synchronization
      if (transition.synchronization) {
        decisions.push({
          type: "CHECK_SYNCHRONIZATION",
          tokenId,
          transition,
        });
      } else {
        decisions.push({
          type: "MARK_FOR_DISPATCH",
          tokenId,
        });
      }
    }
  }

  return decisions;
}

/**
 * Evaluate a transition condition against context.
 * Returns true if condition matches (or no condition specified).
 */
function evaluateCondition(
  condition: any, // TODO: Type this properly
  contextData: ContextSnapshot
): boolean {
  // No condition = always match
  if (!condition) return true;

  // TODO: Implement structured condition evaluation
  // TODO: Implement CEL condition evaluation

  return true; // Default: match all
}
```

### decisions/synchronization.ts

```typescript
import type { Decision } from "../decisions";
import type { TokenRow, TransitionDef, WorkflowDef } from "../types";

/**
 * Decide what happens when a token arrives at a synchronization point.
 * Pure function - no I/O, testable without actors/SQL/RPC.
 */
export function decide(
  token: TokenRow,
  transition: TransitionDef,
  siblings: TokenRow[],
  workflow: WorkflowDef
): Decision[] {
  const decisions: Decision[] = [];
  const syncConfig = transition.synchronization!;

  // Resolve joins_transition ref to ID
  const joinsTransition = workflow.transitions.find(
    (t) => t.ref === syncConfig.joins_transition
  );
  if (!joinsTransition) {
    // Invalid config - pass through
    return [{ type: "MARK_FOR_DISPATCH", tokenId: token.id }];
  }

  // Check if token is in sibling group
  if (token.fan_out_transition_id !== joinsTransition.id) {
    // Not a sibling - pass through immediately
    return [{ type: "MARK_FOR_DISPATCH", tokenId: token.id }];
  }

  // Evaluate synchronization condition
  const condition = evaluateSyncCondition(siblings, syncConfig.wait_for);

  if (!condition.met) {
    // Condition not met - create waiting token
    const fanInPath = buildFanInPath(token.path_id);

    return [
      {
        type: "CREATE_FAN_IN_TOKEN",
        params: {
          workflow_run_id: token.workflow_run_id,
          node_id: transition.to_node_id,
          path_id: fanInPath,
          status: "waiting_for_siblings",
        },
      },
    ];
  }

  // Condition met - merge outputs and activate
  if (syncConfig.merge) {
    const merged = mergeOutputs(siblings, syncConfig.merge);
    decisions.push({
      type: "SET_CONTEXT",
      path: syncConfig.merge.target.replace("$.", ""), // Remove JSONPath prefix
      value: merged,
    });
  }

  // Activate the waiting token
  const fanInPath = buildFanInPath(token.path_id);
  decisions.push({
    type: "ACTIVATE_FAN_IN_TOKEN",
    workflow_run_id: token.workflow_run_id,
    node_id: transition.to_node_id,
    fanInPath,
  });

  return decisions;
}

/**
 * Check if synchronization condition is met.
 * Pure function - easily testable.
 */
export function evaluateSyncCondition(
  siblings: TokenRow[],
  waitFor: "any" | "all" | { m_of_n: number }
): { met: boolean; finished: number; total: number } {
  const terminalStates = ["completed", "failed", "timed_out", "cancelled"];
  const finished = siblings.filter((s) => terminalStates.includes(s.status));
  const finishedCount = finished.length;
  const totalCount = siblings.length;

  let met = false;

  if (waitFor === "any") {
    met = finishedCount > 0;
  } else if (waitFor === "all") {
    met = finishedCount === totalCount;
  } else if (typeof waitFor === "object" && "m_of_n" in waitFor) {
    met = finishedCount >= waitFor.m_of_n;
  }

  return { met, finished: finishedCount, total: totalCount };
}

/**
 * Merge branch outputs according to merge strategy.
 * Pure function - easily testable.
 */
export function mergeOutputs(
  siblings: TokenRow[],
  mergeConfig: { source: string; target: string; strategy: string }
): unknown {
  // Extract outputs from siblings
  // Note: In practice, this would need access to context to get _branch.output
  // For now, assume siblings have output property
  const outputs = siblings.map((s) => (s as any).output);

  switch (mergeConfig.strategy) {
    case "append":
      return outputs;

    case "merge":
      return Object.assign({}, ...outputs);

    case "keyed":
      return Object.fromEntries(outputs.map((o, i) => [i, o]));

    case "last_wins":
      return outputs[outputs.length - 1];

    default:
      return outputs;
  }
}

/**
 * Build stable fan-in path from token path.
 * Pure function - easily testable.
 */
export function buildFanInPath(tokenPath: string): string {
  // Extract parent path by removing last segment (branch index)
  // root.A.0.B.2 → root.A.0.B.fanin
  const segments = tokenPath.split(".");
  const parentPath = segments.slice(0, -1).join(".");
  return `${parentPath}.fanin`;
}
```

### decisions/completion.ts

```typescript
import type { WorkflowDef, ContextSnapshot } from "../types";

/**
 * Extract final output using workflow's output_mapping.
 * Pure function - no I/O.
 */
export function extractFinalOutput(
  workflow: WorkflowDef,
  contextData: ContextSnapshot
): Record<string, unknown> {
  const finalOutput: Record<string, unknown> = {};

  if (!workflow.workflow_def.output_mapping) {
    return finalOutput;
  }

  for (const [key, jsonPath] of Object.entries(
    workflow.workflow_def.output_mapping
  )) {
    const pathStr = jsonPath as string;

    if (!pathStr.startsWith("$.")) {
      continue;
    }

    const contextPath = pathStr.slice(2); // Remove $.

    // Check if this is a branch collection path
    if (contextPath.endsWith("._branches")) {
      const nodeRef = contextPath.replace("_output._branches", "");
      const branchOutputs = contextData.branches?.[nodeRef];

      if (branchOutputs && branchOutputs.length > 0) {
        finalOutput[key] = branchOutputs;
      }
    } else {
      const value = getNestedValue(contextData, contextPath);

      if (value !== undefined) {
        finalOutput[key] = value;
      }
    }
  }

  return finalOutput;
}

/**
 * Get nested value from object using dot-notation path.
 */
function getNestedValue(obj: any, path: string): unknown {
  const keys = path.split(".");
  let value: any = obj;

  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }

  return value;
}
```

## Operations (Imperative)

### operations/tokens.ts

```typescript
import { ulid } from "ulid";
import type { CreateTokenParams, TokenRow } from "../types";

/**
 * Get token by ID.
 * Throws if not found.
 */
export function get(sql: SqlStorage, tokenId: string): TokenRow {
  const row = sql
    .exec<TokenRow>(`SELECT * FROM tokens WHERE id = ?`, tokenId)
    .one();

  if (!row) {
    throw new Error(`Token not found: ${tokenId}`);
  }

  return row;
}

/**
 * Create a new token.
 * Returns the token ID.
 */
export function create(sql: SqlStorage, params: CreateTokenParams): string {
  const now = new Date().toISOString();

  sql.exec(
    `INSERT INTO tokens (
      id, workflow_run_id, node_id, status, path_id,
      parent_token_id, fan_out_transition_id, branch_index, branch_total,
      state_data, state_updated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params.id,
    params.workflow_run_id,
    params.node_id,
    "pending",
    params.path_id,
    params.parent_token_id,
    params.fan_out_transition_id,
    params.branch_index,
    params.branch_total,
    null, // state_data
    now,
    now,
    now
  );

  return params.id;
}

/**
 * Try to create a fan-in token with unique constraint.
 * Returns token ID if created, null if already exists.
 */
export function tryCreateFanIn(
  sql: SqlStorage,
  params: { workflow_run_id: string; node_id: string; path_id: string }
): string | null {
  try {
    const tokenId = ulid();
    const now = new Date().toISOString();

    sql.exec(
      `INSERT INTO tokens (
        id, workflow_run_id, node_id, status, path_id,
        parent_token_id, fan_out_transition_id, branch_index, branch_total,
        state_data, state_updated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tokenId,
      params.workflow_run_id,
      params.node_id,
      "waiting_for_siblings",
      params.path_id,
      null, // parent_token_id
      null, // fan_out_transition_id
      0, // branch_index
      1, // branch_total
      null, // state_data
      now,
      now,
      now
    );

    return tokenId;
  } catch (e: any) {
    // Unique constraint violation means token already exists
    if (e.message?.includes("UNIQUE constraint failed")) {
      return null;
    }
    throw e;
  }
}

/**
 * Try to atomically activate a waiting token.
 * Returns true if activated, false if already activated or not found.
 */
export function tryActivate(
  sql: SqlStorage,
  workflowRunId: string,
  nodeId: string,
  fanInPath: string
): boolean {
  const now = new Date().toISOString();

  const result = sql.exec(
    `UPDATE tokens 
     SET status = 'pending', updated_at = ?
     WHERE workflow_run_id = ? 
       AND node_id = ?
       AND path_id = ?
       AND status = 'waiting_for_siblings'`,
    now,
    workflowRunId,
    nodeId,
    fanInPath
  );

  return result.rowsWritten > 0;
}

/**
 * Update token status.
 */
export function updateStatus(
  sql: SqlStorage,
  tokenId: string,
  status: string
): void {
  const now = new Date().toISOString();

  sql.exec(
    `UPDATE tokens SET status = ?, updated_at = ? WHERE id = ?`,
    status,
    now,
    tokenId
  );
}

/**
 * Get all sibling tokens by fan_out_transition_id.
 */
export function getSiblings(
  sql: SqlStorage,
  workflowRunId: string,
  fanOutTransitionId: string
): TokenRow[] {
  return sql
    .exec<TokenRow>(
      `SELECT * FROM tokens
     WHERE workflow_run_id = ? AND fan_out_transition_id = ?
     ORDER BY branch_index`,
      workflowRunId,
      fanOutTransitionId
    )
    .toArray();
}

/**
 * Get count of active (pending or executing) tokens.
 */
export function getActiveCount(sql: SqlStorage, workflowRunId: string): number {
  const result = sql
    .exec(
      `SELECT COUNT(*) as count FROM tokens
     WHERE workflow_run_id = ? AND status IN ('pending', 'executing')`,
      workflowRunId
    )
    .one();

  return (result?.count as number) ?? 0;
}

/**
 * Atomically mark workflow as completed.
 * Returns true if this call marked it complete, false if already completed.
 */
export function markWorkflowComplete(
  sql: SqlStorage,
  workflowRunId: string
): boolean {
  const result = sql.exec(
    `UPDATE workflow_state SET is_completed = 1
     WHERE workflow_run_id = ? AND is_completed = 0`,
    workflowRunId
  );

  return result.rowsWritten > 0;
}

/**
 * Get token by path.
 */
export function getByPath(sql: SqlStorage, pathId: string): TokenRow {
  const row = sql
    .exec<TokenRow>(`SELECT * FROM tokens WHERE path_id = ?`, pathId)
    .one();

  if (!row) {
    throw new Error(`Token not found at path: ${pathId}`);
  }

  return row;
}
```

### operations/context.ts

```typescript
import type { ContextSnapshot } from "../types";

/**
 * Initialize context table.
 */
export function initializeTable(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS context (
      path TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

/**
 * Initialize context with workflow input.
 */
export function initializeWithInput(
  sql: SqlStorage,
  input: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(input)) {
    sql.exec(
      `INSERT INTO context (path, value) VALUES (?, ?)`,
      `input.${key}`,
      JSON.stringify(value)
    );
  }
}

/**
 * Get a value from context by path.
 */
export function get(sql: SqlStorage, path: string): unknown {
  const row = sql.exec(`SELECT value FROM context WHERE path = ?`, path).one();

  if (!row) {
    return undefined;
  }

  return JSON.parse(row.value as string);
}

/**
 * Set a value in context.
 */
export function set(sql: SqlStorage, path: string, value: unknown): void {
  sql.exec(
    `INSERT OR REPLACE INTO context (path, value) VALUES (?, ?)`,
    path,
    JSON.stringify(value)
  );
}

/**
 * Apply node output to context.
 * Stores under {nodeRef}_output.{key} paths.
 * If tokenId provided, also stores in branch-specific path.
 */
export function applyNodeOutput(
  sql: SqlStorage,
  nodeRef: string,
  output: Record<string, unknown>,
  tokenId?: string
): void {
  for (const [key, value] of Object.entries(output)) {
    const contextPath = `${nodeRef}_output.${key}`;
    set(sql, contextPath, value);
  }

  // If this is a branch execution, also store in branch-specific path
  if (tokenId) {
    const branchPath = `${nodeRef}_output._branches.${tokenId}`;
    set(sql, branchPath, output);
  }
}

/**
 * Get read-only snapshot of entire context.
 * Used for decision logic.
 */
export function getSnapshot(sql: SqlStorage): ContextSnapshot {
  const rows = sql
    .exec<{ path: string; value: string }>(`SELECT path, value FROM context`)
    .toArray();

  const snapshot: any = {
    input: {},
    state: {},
    branches: {},
  };

  for (const row of rows) {
    const path = row.path;
    const value = JSON.parse(row.value);

    // Reconstruct nested structure
    const keys = path.split(".");
    let target: any = snapshot;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in target)) {
        target[key] = {};
      }
      target = target[key];
    }

    const lastKey = keys[keys.length - 1];
    target[lastKey] = value;
  }

  return snapshot;
}

/**
 * Get all branch outputs for a node.
 */
export function getBranchOutputs(
  sql: SqlStorage,
  nodeRef: string
): Array<Record<string, unknown>> {
  const prefix = `${nodeRef}_output._branches.`;

  const rows = sql
    .exec<{
      path: string;
      value: string;
    }>(`SELECT path, value FROM context WHERE path LIKE ?`, `${prefix}%`)
    .toArray();

  return rows.map((row) => JSON.parse(row.value));
}
```

### operations/workflows.ts

```typescript
import type { WorkflowDef } from "../types";

/**
 * Load workflow definition.
 * Fetches from RESOURCES service.
 */
export async function load(
  env: Env,
  workflowRunId: string
): Promise<WorkflowDef> {
  using workflowRuns = env.RESOURCES.workflowRuns();
  const workflowRun = await workflowRuns.get(workflowRunId);

  using workflowDefs = env.RESOURCES.workflowDefs();
  const workflowDef = await workflowDefs.get(
    workflowRun.workflow_run.workflow_def_id,
    workflowRun.workflow_run.workflow_version
  );

  return workflowDef as WorkflowDef;
}
```

## Application Layer

### application/apply.ts

```typescript
import type { Decision } from "../decisions";
import * as operations from "../operations";
import * as decisions from "../decisions";
import { batchDecisions } from "./batch";
import type { Logger } from "@wonder/logs";

/**
 * Apply decisions with optimizations.
 * Returns array of token IDs ready to dispatch.
 */
export async function applyDecisions(
  decisions: Decision[],
  sql: SqlStorage,
  env: Env,
  logger: Logger
): Promise<string[]> {
  // Batch decisions for optimization
  const batched = batchDecisions(decisions);

  const tokensToDispatch: string[] = [];

  for (const decision of batched) {
    logger.debug("APPLY_DECISION", { type: decision.type });

    switch (decision.type) {
      case "CREATE_TOKEN": {
        operations.tokens.create(sql, decision.params);
        break;
      }

      case "BATCH_CREATE_TOKENS": {
        // Single transaction for multiple tokens
        sql.exec("BEGIN TRANSACTION");
        try {
          for (const params of decision.allParams) {
            operations.tokens.create(sql, params);
          }
          sql.exec("COMMIT");
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
        break;
      }

      case "CREATE_FAN_IN_TOKEN": {
        // Handle race condition - may already exist
        const tokenId = operations.tokens.tryCreateFanIn(sql, decision.params);
        if (!tokenId) {
          logger.debug("Fan-in token already exists", {
            path: decision.params.path_id,
          });
        }
        break;
      }

      case "UPDATE_TOKEN_STATUS": {
        operations.tokens.updateStatus(sql, decision.tokenId, decision.status);
        break;
      }

      case "ACTIVATE_FAN_IN_TOKEN": {
        // Atomically transition from waiting → pending
        const activated = operations.tokens.tryActivate(
          sql,
          decision.workflow_run_id,
          decision.node_id,
          decision.fanInPath
        );

        if (activated) {
          logger.info("Fan-in token activated", { path: decision.fanInPath });
          const token = operations.tokens.getByPath(sql, decision.fanInPath);
          tokensToDispatch.push(token.id);
        } else {
          logger.debug("Failed to activate fan-in token (race condition)", {
            path: decision.fanInPath,
          });
        }
        break;
      }

      case "SET_CONTEXT": {
        operations.context.set(sql, decision.path, decision.value);
        break;
      }

      case "APPLY_NODE_OUTPUT": {
        operations.context.applyNodeOutput(
          sql,
          decision.nodeRef,
          decision.output,
          decision.tokenId
        );
        break;
      }

      case "MARK_FOR_DISPATCH": {
        tokensToDispatch.push(decision.tokenId);
        break;
      }

      case "CHECK_SYNCHRONIZATION": {
        // Recursive decision generation
        const token = operations.tokens.get(sql, decision.tokenId);
        const siblings = operations.tokens.getSiblings(
          sql,
          token.workflow_run_id,
          token.fan_out_transition_id!
        );
        const workflow = await operations.workflows.load(
          env,
          token.workflow_run_id
        );

        const syncDecisions = decisions.synchronization.decide(
          token,
          decision.transition,
          siblings,
          workflow
        );

        // Recursively apply synchronization decisions
        const dispatched = await applyDecisions(
          syncDecisions,
          sql,
          env,
          logger
        );
        tokensToDispatch.push(...dispatched);
        break;
      }

      case "BATCH_UPDATE_STATUS": {
        // Batch status updates in single transaction
        sql.exec("BEGIN TRANSACTION");
        try {
          for (const update of decision.updates) {
            operations.tokens.updateStatus(sql, update.tokenId, update.status);
          }
          sql.exec("COMMIT");
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
        break;
      }

      default: {
        const _exhaustive: never = decision;
        throw new Error(`Unknown decision type: ${(_exhaustive as any).type}`);
      }
    }
  }

  return tokensToDispatch;
}
```

### application/batch.ts

```typescript
import type { Decision } from "../decisions";

/**
 * Batch decisions for optimization.
 * Groups consecutive CREATE_TOKEN decisions into BATCH_CREATE_TOKENS.
 */
export function batchDecisions(decisions: Decision[]): Decision[] {
  const batched: Decision[] = [];
  const tokenCreations: any[] = [];

  for (const decision of decisions) {
    if (decision.type === "CREATE_TOKEN") {
      tokenCreations.push(decision.params);
    } else {
      // Flush batched tokens before non-batchable decision
      if (tokenCreations.length > 0) {
        if (tokenCreations.length === 1) {
          // Single token - no need to batch
          batched.push({ type: "CREATE_TOKEN", params: tokenCreations[0] });
        } else {
          // Multiple tokens - batch them
          batched.push({
            type: "BATCH_CREATE_TOKENS",
            allParams: tokenCreations,
          });
        }
        tokenCreations.length = 0;
      }
      batched.push(decision);
    }
  }

  // Flush remaining batched tokens
  if (tokenCreations.length > 0) {
    if (tokenCreations.length === 1) {
      batched.push({ type: "CREATE_TOKEN", params: tokenCreations[0] });
    } else {
      batched.push({ type: "BATCH_CREATE_TOKENS", allParams: tokenCreations });
    }
  }

  return batched;
}
```

## Coordinator DO

### index.ts

```typescript
import { DurableObject } from "cloudflare:workers";
import { createLogger, type Logger } from "@wonder/logs";
import { createEmitter, type Emitter } from "@wonder/events";
import * as operations from "./operations";
import * as decisions from "./decisions";
import * as application from "./application";
import type { WorkflowDef } from "./types";

/**
 * WorkflowCoordinator Durable Object
 *
 * Thin orchestration layer - decision logic in decisions/, execution in application/
 */
export class WorkflowCoordinator extends DurableObject {
  private logger: Logger;
  private emitter: Emitter;
  private workflowCache: Map<string, WorkflowDef> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(ctx, env.LOGS, {
      service: "coordinator",
      environment: "production",
    });
    this.emitter = createEmitter(ctx, env.EVENTS);
  }

  /**
   * Start workflow execution (RPC method)
   */
  async start(
    workflowRunId: string,
    input: Record<string, unknown>
  ): Promise<void> {
    this.logger.info("workflow_starting", {
      workflow_run_id: workflowRunId,
      input,
    });

    const sql = this.ctx.storage.sql;

    // Initialize storage tables
    operations.tokens.initializeTable(sql);
    operations.context.initializeTable(sql);
    operations.artifacts.initializeTable(sql);

    // Initialize workflow state for completion tracking
    sql.exec(
      `CREATE TABLE IF NOT EXISTS workflow_state (
        workflow_run_id TEXT PRIMARY KEY,
        is_completed INTEGER NOT NULL DEFAULT 0
      )`
    );
    sql.exec(
      `INSERT INTO workflow_state (workflow_run_id, is_completed) VALUES (?, 0)`,
      workflowRunId
    );

    // Store input in context
    operations.context.initializeWithInput(sql, input);

    // Load workflow definition
    const workflow = await this.getWorkflow(workflowRunId);

    if (!workflow.workflow_def.initial_node_id) {
      throw new Error("Workflow has no initial_node_id");
    }

    // Create initial token
    const tokenId = operations.tokens.create(sql, {
      id: ulid(),
      workflow_run_id: workflowRunId,
      node_id: workflow.workflow_def.initial_node_id,
      parent_token_id: null,
      path_id: "root",
      fan_out_transition_id: null,
      branch_index: 0,
      branch_total: 1,
    });

    this.logger.info("workflow_started", {
      workflow_run_id: workflowRunId,
      initial_token: tokenId,
    });

    // Dispatch initial token
    await this.dispatchToken(tokenId);
  }

  /**
   * Handle task result from executor (RPC method)
   */
  async handleTaskResult(
    tokenId: string,
    result: { output_data: Record<string, unknown> }
  ): Promise<void> {
    const sql = this.ctx.storage.sql;

    this.logger.info("task_result_received", { token_id: tokenId });

    // 1. Mark token complete and apply result
    operations.tokens.updateStatus(sql, tokenId, "completed");
    const token = operations.tokens.get(sql, tokenId);

    // Get node to find nodeRef for context
    const workflow = await this.getWorkflow(token.workflow_run_id);
    const node = workflow.nodes.find((n: any) => n.id === token.node_id);
    if (!node) {
      throw new Error(`Node not found: ${token.node_id}`);
    }

    operations.context.applyNodeOutput(
      sql,
      node.ref,
      result.output_data,
      tokenId
    );

    // 2. Load context snapshot for decision
    const contextData = operations.context.getSnapshot(sql);

    this.logger.debug("running_routing_decision", { token_id: tokenId });

    // 3. Run pure decision logic
    const routingDecisions = decisions.routing.decide(
      token,
      workflow,
      contextData
    );

    this.logger.debug("routing_decisions_generated", {
      token_id: tokenId,
      decision_count: routingDecisions.length,
    });

    // 4. Apply decisions (handles synchronization recursively)
    const tokensToDispatch = await application.applyDecisions(
      routingDecisions,
      sql,
      this.env,
      this.logger
    );

    this.logger.info("decisions_applied", {
      token_id: tokenId,
      tokens_to_dispatch: tokensToDispatch.length,
    });

    // 5. Dispatch all tokens in parallel
    await Promise.all(tokensToDispatch.map((id) => this.dispatchToken(id)));

    // 6. Check workflow completion
    const activeCount = operations.tokens.getActiveCount(
      sql,
      token.workflow_run_id
    );

    this.logger.debug("checked_active_count", {
      workflow_run_id: token.workflow_run_id,
      active_count: activeCount,
    });

    if (activeCount === 0) {
      // Try to mark as complete (atomic)
      const markedComplete = operations.tokens.markWorkflowComplete(
        sql,
        token.workflow_run_id
      );

      if (markedComplete) {
        this.logger.info("workflow_completing", {
          workflow_run_id: token.workflow_run_id,
        });

        // Extract final output
        const finalOutput = decisions.completion.extractFinalOutput(
          workflow,
          contextData
        );

        // Finalize workflow
        await this.finalizeWorkflow(token.workflow_run_id, finalOutput);

        this.logger.info("workflow_completed", {
          workflow_run_id: token.workflow_run_id,
          final_output: finalOutput,
        });
      } else {
        this.logger.debug("workflow_already_completed_by_another_handler", {
          workflow_run_id: token.workflow_run_id,
        });
      }
    }
  }

  /**
   * Dispatch a token for execution (private)
   */
  private async dispatchToken(tokenId: string): Promise<void> {
    const sql = this.ctx.storage.sql;

    operations.tokens.updateStatus(sql, tokenId, "executing");
    const token = operations.tokens.get(sql, tokenId);

    this.logger.info("dispatching_token", {
      token_id: tokenId,
      node_id: token.node_id,
    });

    // Load workflow and node
    const workflow = await this.getWorkflow(token.workflow_run_id);
    const node = workflow.nodes.find((n: any) => n.id === token.node_id);
    if (!node) {
      throw new Error(`Node not found: ${token.node_id}`);
    }

    // If node has no action, complete synchronously with empty output
    if (!node.action_id) {
      this.logger.debug("node_has_no_action_completing_synchronously", {
        token_id: tokenId,
        node_id: node.id,
      });
      await this.handleTaskResult(tokenId, { output_data: {} });
      return;
    }

    // Build executor payload
    // TODO: Extract this into operations/tasks.ts or similar
    const payload = await this.buildExecutorPayload(token, node, workflow);

    // Fire-and-forget to executor
    this.env.EXECUTOR.llmCall(payload);

    this.logger.debug("token_dispatched_to_executor", {
      token_id: tokenId,
      node_id: node.id,
    });
  }

  /**
   * Get workflow definition (cached in DO)
   */
  private async getWorkflow(workflowRunId: string): Promise<WorkflowDef> {
    if (!this.workflowCache.has(workflowRunId)) {
      this.logger.debug("loading_workflow_from_resources", {
        workflow_run_id: workflowRunId,
      });
      const workflow = await operations.workflows.load(this.env, workflowRunId);
      this.workflowCache.set(workflowRunId, workflow);
    }
    return this.workflowCache.get(workflowRunId)!;
  }

  /**
   * Build executor payload for a token
   * TODO: Move to operations/tasks.ts
   */
  private async buildExecutorPayload(
    token: any,
    node: any,
    workflow: any
  ): Promise<any> {
    // Placeholder - actual implementation needs to:
    // 1. Fetch action definition
    // 2. Fetch prompt spec
    // 3. Fetch model profile
    // 4. Evaluate input_mapping
    // 5. Render template
    return {
      workflow_run_id: token.workflow_run_id,
      token_id: token.id,
      // ... rest of payload
    };
  }

  /**
   * Finalize workflow (commit artifacts, store output)
   */
  private async finalizeWorkflow(
    workflowRunId: string,
    finalOutput: Record<string, unknown>
  ): Promise<void> {
    const sql = this.ctx.storage.sql;

    // Commit staged artifacts to RESOURCES
    await operations.artifacts.commitAll(this.env, sql);

    // Store final output with workflow run
    using workflowRuns = this.env.RESOURCES.workflowRuns();
    await workflowRuns.complete(workflowRunId, finalOutput);

    // Clear cache
    this.workflowCache.delete(workflowRunId);
  }
}
```

## Testing Examples

### Unit Tests (Pure Logic)

```typescript
// decisions/routing.test.ts
import { describe, test, expect } from "vitest";
import { decide } from "./routing";

describe("routing.decide", () => {
  test("creates tokens for matching transitions", () => {
    const token = {
      id: "tok_123",
      workflow_run_id: "run_456",
      node_id: "node_a",
      path_id: "root",
      // ...
    };

    const workflow = {
      nodes: [
        { id: "node_a", ref: "A", name: "Node A" },
        { id: "node_b", ref: "B", name: "Node B" },
      ],
      transitions: [
        {
          id: "trans_1",
          from_node_id: "node_a",
          to_node_id: "node_b",
          spawn_count: 1,
        },
      ],
    };

    const context = { input: { foo: "bar" } };

    const decisions = decide(token, workflow, context);

    expect(decisions).toHaveLength(2); // CREATE_TOKEN + MARK_FOR_DISPATCH
    expect(decisions[0]).toMatchObject({
      type: "CREATE_TOKEN",
      params: expect.objectContaining({
        node_id: "node_b",
        parent_token_id: "tok_123",
      }),
    });
  });

  test("generates multiple tokens for spawn_count > 1", () => {
    const token = { id: "tok_1", node_id: "node_a", path_id: "root" /* ... */ };
    const workflow = {
      nodes: [
        { id: "node_a", ref: "A" },
        { id: "node_b", ref: "B" },
      ],
      transitions: [
        {
          id: "trans_1",
          from_node_id: "node_a",
          to_node_id: "node_b",
          spawn_count: 5,
        },
      ],
    };
    const context = {};

    const decisions = decide(token, workflow, context);

    const createTokenDecisions = decisions.filter(
      (d) => d.type === "CREATE_TOKEN"
    );
    expect(createTokenDecisions).toHaveLength(5);

    // Check branch indices
    expect(createTokenDecisions[0].params.branch_index).toBe(0);
    expect(createTokenDecisions[4].params.branch_index).toBe(4);
    expect(createTokenDecisions[0].params.branch_total).toBe(5);
  });
});
```

```typescript
// decisions/synchronization.test.ts
import { describe, test, expect } from "vitest";
import { evaluateSyncCondition, decide } from "./synchronization";

describe("evaluateSyncCondition", () => {
  test("any - returns true if at least one finished", () => {
    const siblings = [
      { status: "completed" },
      { status: "executing" },
      { status: "executing" },
    ];

    const result = evaluateSyncCondition(siblings, "any");

    expect(result.met).toBe(true);
    expect(result.finished).toBe(1);
    expect(result.total).toBe(3);
  });

  test("all - returns false if not all finished", () => {
    const siblings = [
      { status: "completed" },
      { status: "executing" },
      { status: "completed" },
    ];

    const result = evaluateSyncCondition(siblings, "all");

    expect(result.met).toBe(false);
    expect(result.finished).toBe(2);
    expect(result.total).toBe(3);
  });

  test("all - returns true if all finished", () => {
    const siblings = [
      { status: "completed" },
      { status: "failed" },
      { status: "completed" },
    ];

    const result = evaluateSyncCondition(siblings, "all");

    expect(result.met).toBe(true);
    expect(result.finished).toBe(3);
  });

  test("m_of_n - returns true when threshold met", () => {
    const siblings = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "executing" },
      { status: "executing" },
    ];

    const result = evaluateSyncCondition(siblings, { m_of_n: 3 });

    expect(result.met).toBe(true);
    expect(result.finished).toBe(3);
  });
});

describe("synchronization.decide", () => {
  test("creates waiting token when condition not met", () => {
    const token = {
      id: "tok_1",
      workflow_run_id: "run_1",
      node_id: "node_a",
      path_id: "root.A.0",
      fan_out_transition_id: "trans_spawn",
    };

    const transition = {
      id: "trans_merge",
      to_node_id: "node_b",
      synchronization: {
        wait_for: "all",
        joins_transition: "spawn_ref",
      },
    };

    const siblings = [
      { status: "completed" },
      { status: "executing" }, // Not done yet
      { status: "executing" },
    ];

    const workflow = {
      transitions: [{ id: "trans_spawn", ref: "spawn_ref" }],
    };

    const decisions = decide(token, transition, siblings, workflow);

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      type: "CREATE_FAN_IN_TOKEN",
      params: expect.objectContaining({
        status: "waiting_for_siblings",
      }),
    });
  });

  test("activates token when condition met", () => {
    const token = {
      id: "tok_1",
      workflow_run_id: "run_1",
      node_id: "node_a",
      path_id: "root.A.0",
      fan_out_transition_id: "trans_spawn",
    };

    const transition = {
      id: "trans_merge",
      to_node_id: "node_b",
      synchronization: {
        wait_for: "all",
        joins_transition: "spawn_ref",
        merge: {
          source: "*",
          target: "$.state.results",
          strategy: "append",
        },
      },
    };

    const siblings = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
    ];

    const workflow = {
      transitions: [{ id: "trans_spawn", ref: "spawn_ref" }],
    };

    const decisions = decide(token, transition, siblings, workflow);

    expect(decisions).toContainEqual({
      type: "SET_CONTEXT",
      path: "state.results",
      value: expect.any(Array),
    });

    expect(decisions).toContainEqual({
      type: "ACTIVATE_FAN_IN_TOKEN",
      workflow_run_id: "run_1",
      node_id: "node_b",
      fanInPath: "root.A.fanin",
    });
  });
});
```

### Integration Tests (With SQL)

```typescript
// operations/tokens.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { getMiniflareBindings } from "test-helpers";
import * as tokens from "./tokens";

describe("tokens operations", () => {
  let sql: SqlStorage;

  beforeEach(async () => {
    const env = await getMiniflareBindings();
    const id = env.COORDINATOR.newUniqueId();
    const stub = env.COORDINATOR.get(id);
    sql = await stub.getStorage().sql;

    tokens.initializeTable(sql);
  });

  test("tryActivate handles race condition", async () => {
    // Create waiting token
    tokens.tryCreateFanIn(sql, {
      workflow_run_id: "run_1",
      node_id: "node_b",
      path_id: "root.A.fanin",
    });

    // Two concurrent activation attempts
    const [result1, result2] = await Promise.all([
      tokens.tryActivate(sql, "run_1", "node_b", "root.A.fanin"),
      tokens.tryActivate(sql, "run_1", "node_b", "root.A.fanin"),
    ]);

    // Only one should succeed
    expect([result1, result2].filter(Boolean)).toHaveLength(1);
  });

  test("markWorkflowComplete is atomic", async () => {
    // Initialize workflow state
    sql.exec(`
      CREATE TABLE workflow_state (
        workflow_run_id TEXT PRIMARY KEY,
        is_completed INTEGER NOT NULL DEFAULT 0
      )
    `);
    sql.exec(`INSERT INTO workflow_state VALUES ('run_1', 0)`);

    // Two concurrent completion attempts
    const [result1, result2] = await Promise.all([
      tokens.markWorkflowComplete(sql, "run_1"),
      tokens.markWorkflowComplete(sql, "run_1"),
    ]);

    // Only one should succeed
    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });
});
```
