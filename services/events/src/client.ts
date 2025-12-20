/**
 * Event Emitter Client
 *
 * Thin wrapper around Streamer DO for emitting events and trace events.
 * Used by coordinator and executor to emit events without knowing about
 * the underlying infrastructure.
 */

import type { Streamer } from './streamer';
import type { EventContext, EventInput, TraceEventInput } from './types';

/** Streamer stub type */
type StreamerStub = ReturnType<DurableObjectNamespace<Streamer>['get']>;

/**
 * Emitter interface - context-bound event emitter
 */
export interface Emitter {
  emit: (event: Omit<EventInput, 'sequence'>) => void;
  emitTrace: (event: TraceEventInput | TraceEventInput[]) => void;
}

/**
 * Create an emitter bound to a specific workflow context
 *
 * Context can be provided directly or as a function for lazy evaluation.
 * Use a function when context isn't available at creation time (e.g., coordinator DO).
 *
 * @param streamer - DurableObjectNamespace for Streamer DO
 * @param context - Event context or function returning context (lazy)
 * @param options - Emitter options
 * @returns Emitter instance
 */
export function createEmitter(
  streamer: DurableObjectNamespace<Streamer>,
  context: EventContext | (() => EventContext),
  options: { traceEnabled: boolean },
): Emitter {
  // Cached context and stub (lazy initialized on first emit)
  let cached: {
    context: EventContext;
    traceContext: { workflowRunId: string; projectId: string };
    stub: StreamerStub;
  } | null = null;

  const getCache = () => {
    if (!cached) {
      const ctx = typeof context === 'function' ? context() : context;
      cached = {
        context: ctx,
        traceContext: {
          workflowRunId: ctx.workflowRunId,
          projectId: ctx.projectId,
        },
        stub: streamer.get(streamer.idFromName(ctx.workflowRunId)),
      };
    }
    return cached;
  };

  return {
    emit: (event) => {
      const { context: ctx, stub } = getCache();
      stub.emit(ctx, event);
    },

    emitTrace: (event) => {
      if (!options.traceEnabled) return;

      const { traceContext, stub } = getCache();
      const events = Array.isArray(event) ? event : [event];
      for (const evt of events) {
        stub.emitTrace(traceContext, evt);
      }
    },
  };
}
