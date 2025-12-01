/** Test fixtures for effects domain */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { createAction } from './repository';

type Action = Awaited<ReturnType<typeof createAction>>;

export async function buildAction(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createAction>[1]>,
): Promise<Action> {
  return await createAction(db, {
    version: overrides?.version ?? 1,
    name: 'Test Action',
    description: 'Test action description',
    kind: 'llm_call',
    implementation: JSON.stringify({
      prompt_spec_id: 'prompt_test',
      model_profile_id: 'model_test',
    }),
    requires: null,
    produces: null,
    execution: null,
    idempotency: null,
    ...overrides,
  });
}

export function buildLLMCallAction(params: {
  prompt_spec_id: string;
  model_profile_id: string;
  name?: string;
  description?: string;
}): Omit<Parameters<typeof createAction>[1], 'version' | 'created_at' | 'updated_at'> {
  return {
    name: params.name ?? 'LLM Call',
    description: params.description ?? 'Execute LLM call',
    kind: 'llm_call',
    implementation: JSON.stringify({
      prompt_spec_id: params.prompt_spec_id,
      model_profile_id: params.model_profile_id,
    }),
    requires: null,
    produces: null,
    execution: null,
    idempotency: null,
  };
}
