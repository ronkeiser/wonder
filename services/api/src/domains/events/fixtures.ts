/** Test fixtures for events domain */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { buildWorkflowRun } from '../execution/fixtures';
import { createEvent } from './repository';

type Event = Awaited<ReturnType<typeof createEvent>>;
type WorkflowRun = Awaited<ReturnType<typeof buildWorkflowRun>>;

export async function buildEvent(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createEvent>[1]> & { workflow_run?: WorkflowRun },
): Promise<Event> {
  let workflow_run_id = overrides?.workflow_run_id;

  if (!workflow_run_id && !overrides?.workflow_run) {
    const run = await buildWorkflowRun(db);
    workflow_run_id = run.id;
  } else if (overrides?.workflow_run) {
    workflow_run_id = overrides.workflow_run.id;
  }

  return await createEvent(db, {
    workflow_run_id: workflow_run_id!,
    sequence_number: 1,
    kind: 'workflow_started',
    payload: JSON.stringify({ input: {} }),
    archived_at: null,
    ...overrides,
  });
}
