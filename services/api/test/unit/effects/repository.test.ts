/** Unit tests for effects repository */

import { beforeAll, describe, expect, test } from 'vitest';
import { createAction, getAction, listActionsByKind } from '~/domains/effects/repository';
import { createTestDb } from '../../helpers/db';

const db = createTestDb();

beforeAll(async () => {
  // Migrations applied automatically via setup file
});

describe('Action', () => {
  test('creates and retrieves action', async () => {
    const action = await createAction(db, {
      name: 'LLM Call',
      description: 'Execute LLM call',
      kind: 'llm_call',
      implementation: JSON.stringify({
        prompt_spec_id: 'prompt_123',
        model_profile_id: 'model_123',
      }),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    expect(action.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(action.version).toBe(1);
    expect(action.kind).toBe('llm_call');

    const retrieved = await getAction(db, action.id);
    expect(retrieved).toEqual(action);
  });

  test('lists actions by kind', async () => {
    await createAction(db, {
      name: 'LLM Call 1',
      description: 'Test',
      kind: 'llm_call',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    await createAction(db, {
      name: 'MCP Tool',
      description: 'Test',
      kind: 'mcp_tool',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    await createAction(db, {
      name: 'LLM Call 2',
      description: 'Test',
      kind: 'llm_call',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    const llmActions = await listActionsByKind(db, 'llm_call');
    expect(llmActions.length).toBeGreaterThanOrEqual(2);
    expect(llmActions.every((a) => a.kind === 'llm_call')).toBe(true);
  });
});
