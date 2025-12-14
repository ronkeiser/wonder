/**
 * Integration tests for concurrent fan-in activation
 *
 * Tests race condition handling in ACTIVATE_FAN_IN_TOKEN handler.
 * Uses SQLite transactions to simulate concurrent token arrivals.
 */

import { beforeEach, describe, expect, test } from 'vitest';

describe('fan-in race conditions', () => {
  let sql: any;
  let ctx: any;

  beforeEach(() => {
    // Setup: Create in-memory SQLite, initialize tables
  });

  describe('concurrent activation attempts', () => {
    test('only one collect token proceeds when multiple activate simultaneously', async () => {
      // Given: 3 collect tokens all reach sync point at same time
      const collectTokenIds = ['tok_c1', 'tok_c2', 'tok_c3'];
      collectTokenIds.forEach((id) => {
        sql.exec(`INSERT INTO tokens (id, state) VALUES ('${id}', 'pending')`);
      });

      // When: All 3 try to activate (simulating concurrent completion)
      const decisions = collectTokenIds.map((id) => ({
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: ['tok_q1', 'tok_q2', 'tok_q3'],
        waitingTokenIds: collectTokenIds.filter((cid) => cid !== id),
        proceedingTokenId: id,
        merge: null,
      }));

      const results = await Promise.all(decisions.map((d) => applyDecision(d, sql, ctx)));

      // Then: Only one activation succeeds
      const dispatchedTokens = results.flat().filter(Boolean);
      expect(dispatchedTokens).toHaveLength(1);

      // Then: 2 marked completed, 1 dispatched
      const states = collectTokenIds.map((id) => {
        const row = sql.exec(`SELECT state FROM tokens WHERE id='${id}'`)[0];
        return row.state;
      });

      expect(states.filter((s) => s === 'completed')).toHaveLength(2);
      expect(states.filter((s) => s === 'dispatched')).toHaveLength(1);
    });

    test('branch tables dropped only once (atomic cleanup)', async () => {
      // Given: Branch tables exist
      const questionTokenIds = ['tok_q1', 'tok_q2', 'tok_q3'];
      questionTokenIds.forEach((id) => {
        sql.exec(`CREATE TABLE branch_output_${id} (data TEXT)`);
      });

      // When: Multiple concurrent ACTIVATE_FAN_IN_TOKEN attempts
      const collectTokenIds = ['tok_c1', 'tok_c2'];
      const decisions = collectTokenIds.map((id) => ({
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: questionTokenIds,
        waitingTokenIds: [],
        proceedingTokenId: id,
        merge: null,
      }));

      await Promise.all(decisions.map((d) => applyDecision(d, sql, ctx)));

      // Then: No errors (DROP TABLE IF EXISTS handles concurrent drops)
      const tables = sql
        .exec("SELECT name FROM sqlite_master WHERE type='table'")
        .map((r: any) => r.name);

      questionTokenIds.forEach((id) => {
        expect(tables).not.toContain(`branch_output_${id}`);
      });
    });
  });

  describe('idempotency', () => {
    test('applying same ACTIVATE_FAN_IN_TOKEN decision twice is safe', async () => {
      // Given: Branch tables and waiting tokens
      sql.exec('CREATE TABLE branch_output_tok_q1 (value INTEGER)');
      sql.exec('INSERT INTO branch_output_tok_q1 VALUES (42)');
      sql.exec("INSERT INTO tokens (id, state) VALUES ('tok_c1', 'waiting_for_siblings')");

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN',
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: ['tok_q1'],
        waitingTokenIds: ['tok_c1'],
        proceedingTokenId: 'tok_c2',
        merge: {
          source: '_branch.output',
          target: 'state.result',
          strategy: 'last_wins',
        },
      };

      // When: Apply decision twice
      await applyDecision(decision, sql, ctx);
      await applyDecision(decision, sql, ctx);

      // Then: Context updated once (not duplicated)
      const context = ctx.getSnapshot();
      expect(context.state.result).toEqual({ value: 42 });

      // Then: Token marked completed once (not error)
      const token = sql.exec("SELECT state FROM tokens WHERE id='tok_c1'")[0];
      expect(token.state).toBe('completed');
    });
  });

  describe('partial failures', () => {
    test('rolls back on merge failure', async () => {
      // Given: Invalid merge configuration (will fail)
      sql.exec('CREATE TABLE branch_output_tok_q1 (data TEXT)');
      sql.exec("INSERT INTO tokens (id, state) VALUES ('tok_c1', 'pending')");

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN',
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: ['tok_q1'],
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: {
          source: '_branch.invalid_field',
          target: 'state.result',
          strategy: 'append',
        },
      };

      // When: Apply decision (should fail during merge)
      await expect(applyDecision(decision, sql, ctx)).rejects.toThrow();

      // Then: Token state unchanged (rollback)
      const token = sql.exec("SELECT state FROM tokens WHERE id='tok_c1'")[0];
      expect(token.state).toBe('pending');

      // Then: Branch table still exists (not dropped)
      const tables = sql
        .exec("SELECT name FROM sqlite_master WHERE type='table'")
        .map((r: any) => r.name);
      expect(tables).toContain('branch_output_tok_q1');
    });
  });
});

// Placeholder function
function applyDecision(decision: any, sql: any, ctx: any): Promise<string[]> {
  throw new Error('Not implemented');
}
