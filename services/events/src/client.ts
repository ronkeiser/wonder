import type {
  Emitter,
  EventContext,
  EventInput,
  TraceEventContext,
  TraceEventInput,
} from './types.js';

/**
 * Create an event emitter that wraps the EVENTS service binding
 * Works with both Workers (ExecutionContext) and Durable Objects (DurableObjectState)
 * Tracks sequence_number internally for event ordering within a workflow run
 */
export function createEmitter(
  eventsBinding: {
    write(context: EventContext, event: EventInput): void;
    writeTraceEvent(
      context: TraceEventContext,
      event: TraceEventInput & { sequence: number },
    ): void;
  },
  context: EventContext & TraceEventContext,
  options: { traceEnabled?: boolean } = {},
): Emitter {
  let eventSequenceNumber = 0;
  let traceSequenceNumber = 0;
  const traceEnabled = options.traceEnabled ?? false;

  return {
    emit: (input: EventInput) => {
      eventSequenceNumber++;
      // The service's write() method handles id, timestamp, and waitUntil internally
      eventsBinding.write(context, {
        ...input,
        sequence_number: eventSequenceNumber,
      });
    },

    emitTrace: (input: TraceEventInput) => {
      if (!traceEnabled) return;

      traceSequenceNumber++;
      // The service's writeTraceEvent() method handles id, timestamp, and other entry fields
      eventsBinding.writeTraceEvent(context, {
        ...input,
        sequence: traceSequenceNumber,
      });
    },
  };
}
