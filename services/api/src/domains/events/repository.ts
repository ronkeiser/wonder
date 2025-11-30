/** Repository for events domain */

import { and, eq, gt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { events } from '~/infrastructure/db/schema';

type Event = typeof events.$inferSelect;
type NewEvent = Omit<typeof events.$inferInsert, 'timestamp'>;

/** Event */

export async function createEvent(db: DrizzleD1Database, data: NewEvent): Promise<Event> {
  const event = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  await db.insert(events).values(event).run();
  return event as Event;
}

export async function createEvents(db: DrizzleD1Database, data: NewEvent[]): Promise<void> {
  const timestamp = new Date().toISOString();
  const eventRecords = data.map((event) => ({
    ...event,
    timestamp,
  }));

  await db.insert(events).values(eventRecords).run();
}

export async function getEvent(
  db: DrizzleD1Database,
  workflow_run_id: string,
  sequence_number: number,
): Promise<Event | null> {
  const result = await db
    .select()
    .from(events)
    .where(
      and(eq(events.workflow_run_id, workflow_run_id), eq(events.sequence_number, sequence_number)),
    )
    .get();
  return result ?? null;
}

export async function listEventsByWorkflowRun(
  db: DrizzleD1Database,
  workflow_run_id: string,
  afterSequence?: number,
  limit?: number,
): Promise<Event[]> {
  const whereConditions = [eq(events.workflow_run_id, workflow_run_id)];

  if (afterSequence !== undefined) {
    whereConditions.push(gt(events.sequence_number, afterSequence));
  }

  const baseQuery = db
    .select()
    .from(events)
    .where(and(...whereConditions))
    .orderBy(events.sequence_number);

  if (limit !== undefined) {
    return await baseQuery.limit(limit).all();
  }

  return await baseQuery.all();
}
