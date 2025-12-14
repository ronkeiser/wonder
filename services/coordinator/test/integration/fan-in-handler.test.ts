/**
 * Integration tests for ACTIVATE_FAN_IN_TOKEN handler
 *
 * Tests dispatch/apply.ts ACTIVATE_FAN_IN_TOKEN handler with real SQLite operations:
 * 1. Branch table operations (read outputs from sibling tables)
 * 2. Merge strategy execution (using planning/merge functions)
 * 3. Context updates (write merged value)
 * 4. Token state updates (mark waiting tokens completed, mark proceeding token dispatched)
 * 5. Cleanup (drop branch tables)
 */

import { beforeEach, describe, expect, test } from 'vitest';

describe('ACTIVATE_FAN_IN_TOKEN handler', () => {
  let sql: any; // SQLite instance
  let ctx: any; // Mock workflow context

  beforeEach(() => {
    // Setup: Create in-memory SQLite, initialize tables
    // This will be implemented when we create the handler
  });

  describe('branch table operations', () => {
    test('reads outputs from sibling branch tables', async () => {
      // Given: 3 question tokens (siblings) completed with branch outputs
      const questionTokenIds = ['tok_q1', 'tok_q2', 'tok_q3'];

      // Simulate branch tables exist with outputs
      questionTokenIds.forEach((id, index) => {
        sql.exec(`CREATE TABLE branch_output_${id} (answer TEXT)`);
        sql.exec(`INSERT INTO branch_output_${id} VALUES ('Answer ${index + 1}')`);
      });

      // When: ACTIVATE_FAN_IN_TOKEN decision applied
      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: questionTokenIds,
        waitingTokenIds: ['tok_c1', 'tok_c2'],
        proceedingTokenId: 'tok_c3',
        merge: {
          source: '_branch.output',
          target: 'state.all_answers',
          strategy: 'append',
        },
      };

      await applyDecision(decision, sql, ctx);

      // Then: Context updated with merged data from all 3 question token branch tables
      const context = ctx.getSnapshot();
      expect(context.state.all_answers).toEqual([
        { answer: 'Answer 1' },
        { answer: 'Answer 2' },
        { answer: 'Answer 3' },
      ]);
    });

    test('handles missing branch tables gracefully (failed siblings)', async () => {
      // Given: 3 question tokens, 1 failed (no branch table)
      const successfulTokenIds = ['tok_q1', 'tok_q2'];

      successfulTokenIds.forEach((id, index) => {
        sql.exec(`CREATE TABLE branch_output_${id} (value INTEGER)`);
        sql.exec(`INSERT INTO branch_output_${id} VALUES (${(index + 1) * 10})`);
      });

      // tok_q3 failed, no branch table

      // When: ACTIVATE_FAN_IN_TOKEN with only successful tokens
      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: successfulTokenIds, // Only successful ones
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: {
          source: '_branch.output',
          target: 'state.results',
          strategy: 'append',
        },
      };

      await applyDecision(decision, sql, ctx);

      // Then: Merges only available outputs
      const context = ctx.getSnapshot();
      expect(context.state.results).toEqual([{ value: 10 }, { value: 20 }]);
    });

    test('drops branch tables after merge', async () => {
      // Given: Branch tables exist
      const tokenIds = ['tok_q1', 'tok_q2', 'tok_q3'];
      tokenIds.forEach((id) => {
        sql.exec(`CREATE TABLE branch_output_${id} (data TEXT)`);
      });

      // When: ACTIVATE_FAN_IN_TOKEN applied
      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: tokenIds,
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: null,
      };

      await applyDecision(decision, sql, ctx);

      // Then: All branch tables dropped
      const tables = sql
        .exec("SELECT name FROM sqlite_master WHERE type='table'")
        .map((r: any) => r.name);

      tokenIds.forEach((id) => {
        expect(tables).not.toContain(`branch_output_${id}`);
      });
    });
  });

  describe('token state updates', () => {
    test('marks waiting collect tokens as completed', async () => {
      // Given: 2 collect tokens in waiting_for_siblings state
      const waitingTokens = [
        { id: 'tok_c1', state: 'waiting_for_siblings' },
        { id: 'tok_c2', state: 'waiting_for_siblings' },
      ];

      waitingTokens.forEach((t) => {
        sql.exec(`INSERT INTO tokens (id, state) VALUES ('${t.id}', '${t.state}')`);
      });

      // When: ACTIVATE_FAN_IN_TOKEN applied
      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: ['tok_q1', 'tok_q2', 'tok_q3'],
        waitingTokenIds: ['tok_c1', 'tok_c2'],
        proceedingTokenId: 'tok_c3',
        merge: null,
      };

      await applyDecision(decision, sql, ctx);

      // Then: Waiting tokens marked completed
      const c1 = sql.exec("SELECT state FROM tokens WHERE id='tok_c1'")[0];
      const c2 = sql.exec("SELECT state FROM tokens WHERE id='tok_c2'")[0];

      expect(c1.state).toBe('completed');
      expect(c2.state).toBe('completed');
    });

    test('marks proceeding token ready for dispatch', async () => {
      // Given: Proceeding token in pending state
      sql.exec("INSERT INTO tokens (id, state) VALUES ('tok_c3', 'pending')");

      // When: ACTIVATE_FAN_IN_TOKEN applied
      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: ['tok_q1', 'tok_q2', 'tok_q3'],
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c3',
        merge: null,
      };

      const tokensToDispatch = await applyDecision(decision, sql, ctx);

      // Then: Proceeding token ID returned for dispatch
      expect(tokensToDispatch).toContain('tok_c3');
    });
  });

  describe('merge strategies', () => {
    test('applies append strategy correctly', async () => {
      const tokenIds = ['tok_q1', 'tok_q2'];
      tokenIds.forEach((id, index) => {
        sql.exec(`CREATE TABLE branch_output_${id} (choice TEXT)`);
        sql.exec(`INSERT INTO branch_output_${id} VALUES ('Option ${index + 1}')`);
      });

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: tokenIds,
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: {
          source: '_branch.output',
          target: 'state.choices',
          strategy: 'append',
        },
      };

      await applyDecision(decision, sql, ctx);

      const context = ctx.getSnapshot();
      expect(context.state.choices).toEqual([{ choice: 'Option 1' }, { choice: 'Option 2' }]);
    });

    test('applies merge_object strategy correctly', async () => {
      const tokenIds = ['tok_q1', 'tok_q2'];
      sql.exec(`CREATE TABLE branch_output_tok_q1 (key TEXT, value INTEGER)`);
      sql.exec(`INSERT INTO branch_output_tok_q1 VALUES ('a', 1), ('b', 2)`);

      sql.exec(`CREATE TABLE branch_output_tok_q2 (key TEXT, value INTEGER)`);
      sql.exec(`INSERT INTO branch_output_tok_q2 VALUES ('b', 3), ('c', 4)`);

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: tokenIds,
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: {
          source: '_branch.output',
          target: 'state.merged',
          strategy: 'merge_object',
        },
      };

      await applyDecision(decision, sql, ctx);

      const context = ctx.getSnapshot();
      expect(context.state.merged).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('applies keyed_by_branch strategy correctly', async () => {
      const tokenIds = ['tok_q1', 'tok_q2'];
      tokenIds.forEach((id, index) => {
        sql.exec(`CREATE TABLE branch_output_${id} (result TEXT)`);
        sql.exec(`INSERT INTO branch_output_${id} VALUES ('Result ${index}')`);
      });

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: tokenIds,
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: {
          source: '_branch.output',
          target: 'state.by_branch',
          strategy: 'keyed_by_branch',
        },
      };

      await applyDecision(decision, sql, ctx);

      const context = ctx.getSnapshot();
      expect(context.state.by_branch).toEqual({
        '0': { result: 'Result 0' },
        '1': { result: 'Result 1' },
      });
    });

    test('applies last_wins strategy correctly', async () => {
      const tokenIds = ['tok_q1', 'tok_q2', 'tok_q3'];
      tokenIds.forEach((id, index) => {
        sql.exec(`CREATE TABLE branch_output_${id} (winner TEXT)`);
        sql.exec(`INSERT INTO branch_output_${id} VALUES ('Branch ${index}')`);
      });

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: tokenIds,
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: {
          source: '_branch.output',
          target: 'state.winner',
          strategy: 'last_wins',
        },
      };

      await applyDecision(decision, sql, ctx);

      const context = ctx.getSnapshot();
      expect(context.state.winner).toEqual({ winner: 'Branch 2' }); // Last by branch_index
    });
  });

  describe('no merge configured', () => {
    test('skips merge when merge is null', async () => {
      // Given: Branch tables exist but merge is null
      sql.exec(`CREATE TABLE branch_output_tok_q1 (data TEXT)`);
      sql.exec(`INSERT INTO branch_output_tok_q1 VALUES ('Data')`);

      const decision = {
        type: 'ACTIVATE_FAN_IN_TOKEN' as const,
        workflow_run_id: 'run_1',
        node_id: 'node_collect',
        fan_in_path: 'root.question',
        mergedTokenIds: ['tok_q1'],
        waitingTokenIds: [],
        proceedingTokenId: 'tok_c1',
        merge: null,
      };

      const initialContext = ctx.getSnapshot();
      await applyDecision(decision, sql, ctx);
      const finalContext = ctx.getSnapshot();

      // Then: Context unchanged (except maybe internal state updates)
      expect(finalContext).toEqual(initialContext);
    });
  });
});

// Placeholder functions (to be implemented)
function applyDecision(decision: any, sql: any, ctx: any): Promise<string[]> {
  throw new Error('Not implemented');
}
