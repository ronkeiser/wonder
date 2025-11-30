/** Unit tests for events repository */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createEvent,
  createEvents,
  getEvent,
  listEventsByWorkflowRun,
} from '~/domains/events/repository';
import { buildWorkflowRun } from '~/domains/execution/fixtures';
import { createTestDb } from '../../helpers/db';

const db = createTestDb();

beforeAll(async () => {
  // Migrations applied automatically via setup file
});

describe('Event', () => {
  test('creates and retrieves single event', async () => {
    const run = await buildWorkflowRun(db);

    const event = await createEvent(db, {
      workflow_run_id: run.id,
      sequence_number: 1,
      kind: 'workflow_started',
      payload: JSON.stringify({ input: { text: 'test' } }),
      archived_at: null,
    });

    expect(event.workflow_run_id).toBe(run.id);
    expect(event.sequence_number).toBe(1);
    expect(event.kind).toBe('workflow_started');
    expect(event.timestamp).toBeDefined();

    const retrieved = await getEvent(db, run.id, 1);
    expect(retrieved).toEqual(event);
  });

  test('batch creates multiple events', async () => {
    const run = await buildWorkflowRun(db);

    await createEvents(db, [
      {
        workflow_run_id: run.id,
        sequence_number: 1,
        kind: 'workflow_started',
        payload: JSON.stringify({}),
        archived_at: null,
      },
      {
        workflow_run_id: run.id,
        sequence_number: 2,
        kind: 'node_started',
        payload: JSON.stringify({ node_id: 'node_1' }),
        archived_at: null,
      },
      {
        workflow_run_id: run.id,
        sequence_number: 3,
        kind: 'node_completed',
        payload: JSON.stringify({ node_id: 'node_1' }),
        archived_at: null,
      },
    ]);

    const events = await listEventsByWorkflowRun(db, run.id);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  test('lists events filtered by workflow run', async () => {
    const run1 = await buildWorkflowRun(db);
    const run2 = await buildWorkflowRun(db);

    await createEvent(db, {
      workflow_run_id: run1.id,
      sequence_number: 1,
      kind: 'workflow_started',
      payload: JSON.stringify({}),
      archived_at: null,
    });

    await createEvent(db, {
      workflow_run_id: run2.id,
      sequence_number: 1,
      kind: 'workflow_started',
      payload: JSON.stringify({}),
      archived_at: null,
    });

    const run1Events = await listEventsByWorkflowRun(db, run1.id);
    expect(run1Events.length).toBeGreaterThanOrEqual(1);
    expect(run1Events.every((e) => e.workflow_run_id === run1.id)).toBe(true);
  });

  test('lists events after specific sequence number', async () => {
    const run = await buildWorkflowRun(db);

    await createEvents(db, [
      {
        workflow_run_id: run.id,
        sequence_number: 1,
        kind: 'workflow_started',
        payload: JSON.stringify({}),
        archived_at: null,
      },
      {
        workflow_run_id: run.id,
        sequence_number: 2,
        kind: 'node_started',
        payload: JSON.stringify({}),
        archived_at: null,
      },
      {
        workflow_run_id: run.id,
        sequence_number: 3,
        kind: 'node_completed',
        payload: JSON.stringify({}),
        archived_at: null,
      },
    ]);

    const events = await listEventsByWorkflowRun(db, run.id, 1);
    expect(events.every((e) => e.sequence_number > 1)).toBe(true);
  });

  test('limits number of events returned', async () => {
    const run = await buildWorkflowRun(db);

    await createEvents(db, [
      {
        workflow_run_id: run.id,
        sequence_number: 1,
        kind: 'workflow_started',
        payload: JSON.stringify({}),
        archived_at: null,
      },
      {
        workflow_run_id: run.id,
        sequence_number: 2,
        kind: 'node_started',
        payload: JSON.stringify({}),
        archived_at: null,
      },
      {
        workflow_run_id: run.id,
        sequence_number: 3,
        kind: 'node_completed',
        payload: JSON.stringify({}),
        archived_at: null,
      },
    ]);

    const events = await listEventsByWorkflowRun(db, run.id, undefined, 2);
    expect(events.length).toBeLessThanOrEqual(2);
  });
});
