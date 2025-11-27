/** Event types and schemas for workflow execution events */

import type { SchemaType } from '@wonder/schema';

/**
 * EventKind represents all possible workflow execution events
 */
export type EventKind =
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'transition_taken'
  | 'token_spawned';

/**
 * Event represents a state change during workflow execution
 */
export type Event = {
  workflow_run_id: string;
  sequence_number: number;
  kind: EventKind;
  payload: Record<string, unknown>;
  timestamp: string;
};

/**
 * Event table schema for SQLite storage in DO
 */
export const eventSchemaType: SchemaType = {
  type: 'object',
  properties: {
    sequence_number: { type: 'number' },
    kind: { type: 'string' },
    payload: { type: 'string' }, // JSON string
    timestamp: { type: 'string' },
  },
  required: ['sequence_number', 'kind', 'payload', 'timestamp'],
};
