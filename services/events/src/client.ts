import type { Emitter, EventContext, EventInput } from './types.js';

/**
 * Create an event emitter that wraps the EVENTS service binding
 * Works with both Workers (ExecutionContext) and Durable Objects (DurableObjectState)
 * Tracks sequence_number internally for event ordering within a workflow run
 */
export function createEmitter(
  ctx: { waitUntil(promise: Promise<unknown>): void },
  eventsBinding: {
    write(context: EventContext, input: EventInput): void;
  },
): Emitter {
  let sequenceNumber = 0;

  return {
    emit: (context: EventContext, input: EventInput) => {
      sequenceNumber++;
      // The service's write() method handles id, timestamp, and waitUntil internally
      eventsBinding.write(context, {
        ...input,
        sequence_number: sequenceNumber,
      });
    },
  };
}
