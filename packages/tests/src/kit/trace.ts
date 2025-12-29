/**
 * Trace Event Helpers - Ergonomic trace event access for tests
 *
 * Provides typed access to trace events with semantic query methods.
 * Types match exactly what the coordinator emits - no remapping.
 *
 * Event structure:
 * - Top-level: type, streamId, executionId, executionType, durationMs, sequence, timestamp, category
 * - payload: Event-specific data (varies by event type), includes tokenId and nodeId for workflow events
 */

import type { TraceEventEntry } from '@wonder/sdk';

export type { TraceEventEntry };

/**
 * Typed trace event with known payload structure.
 * Payload contains event-specific data plus tokenId/nodeId for filtering.
 */
export interface TypedTraceEvent<TPayload = Record<string, unknown>> extends Omit<
  TraceEventEntry,
  'payload'
> {
  payload: TPayload & {
    tokenId?: string;
    nodeId?: string;
  };
}

/**
 * Trace event payload types - matches exactly what coordinator emits in payload.
 * tokenId and nodeId are now included in payload for workflow events.
 */
export namespace TracePayloads {
  // Context operations
  export interface ContextInitialize {
    hasInputSchema: boolean;
    hasContextSchema: boolean;
    tableCount: number;
    tablesCreated: string[];
  }

  export interface ContextRead {
    path: string;
    value: unknown;
  }

  export interface ContextSetField {
    path: string;
    value: unknown;
  }

  export interface ContextReplaceSection {
    section: string;
    data: unknown;
  }

  export interface ContextValidate {
    path: string;
    schemaType: string;
    valid: boolean;
    errorCount: number;
    errors?: string[];
  }

  export interface ContextSnapshot {
    snapshot: {
      input: unknown;
      state: unknown;
      output: unknown;
    };
  }

  // Branch operations
  export interface BranchTableCreate {
    tableName: string;
    schemaType: string;
  }

  export interface BranchTableDrop {
    tokenIds: string[];
    tablesDropped: number;
  }

  export interface BranchValidate {
    valid: boolean;
    errorCount: number;
    errors?: string[];
  }

  export interface BranchWrite {
    output: unknown;
  }

  export interface BranchesRead {
    tokenIds: string[];
    outputCount: number;
  }

  export interface Merged {
    targetPath: string;
    branchCount: number;
  }

  // Token operations
  export interface TokenCreatedPayload {
    taskId: string;
    parentTokenId: string | null;
    pathId: string;
    siblingGroup: string | null;
    branchIndex: number;
    branchTotal: number;
  }

  export interface TokenStatusUpdatedPayload {
    from: string;
    to: string;
  }

  // SQL operations
  export interface SqlQuery {
    sql: string;
    params: unknown[];
    durationMs: number;
  }

  // Routing/decision operations
  export interface RoutingStart {
    // Empty - token_id and node_id are top level
  }

  export interface RoutingEvaluateTransition {
    transitionId: string;
    condition: unknown;
  }

  export interface RoutingTransitionMatched {
    transitionId: string;
    spawnCount: number;
  }

  export interface RoutingComplete {
    decisions: unknown[];
  }

  // Completion operations
  export interface CompletionStart {
    outputMapping: Record<string, string> | null;
    contextKeys: {
      input: string[];
      state: string[];
      output: string[];
    };
  }

  export interface CompletionExtract {
    targetField: string;
    sourcePath: string;
    extractedValue: unknown;
  }

  export interface CompletionComplete {
    finalOutput: Record<string, unknown>;
  }

  // Dispatch operations
  export interface TaskSent {
    taskId: string;
    taskVersion: number;
    resources: Record<string, string>;
  }

  // Executor operations
  export interface ExecutorTaskStarted {
    taskId: string;
    taskVersion: number;
    stepCount: number;
    inputKeys: string[];
  }

  export interface ExecutorTaskCompleted {
    taskId: string;
    taskVersion: number;
    stepsExecuted: number;
    stepsSkipped: number;
    output: Record<string, unknown>;
  }

  export interface ExecutorStepStarted {
    stepRef: string;
    stepOrdinal: number;
    actionId: string;
    actionVersion: number;
    hasCondition: boolean;
  }

  export interface ExecutorStepCompleted {
    stepRef: string;
    actionId: string;
    success: boolean;
    outputKeys: string[];
  }

  export interface ExecutorActionStarted {
    stepRef: string;
    actionId: string;
    actionKind: string;
    actionVersion: number;
    inputKeys: string[];
  }

  export interface ExecutorActionCompleted {
    stepRef: string;
    actionId: string;
    actionKind: string;
    outputKeys: string[];
  }

  export interface ExecutorActionFailed {
    stepRef: string;
    actionId: string;
    actionKind: string;
    error?: string;
    errorCode?: string;
    retryable?: boolean;
  }

  export interface ExecutorMockGenerated {
    stepRef: string;
    actionId: string;
    schemaType: string;
    hasSeed: boolean;
  }

}

/**
 * Trace event collection with ergonomic query methods
 */
export class TraceEventCollection {
  private events: TypedTraceEvent[];

  constructor(events: TraceEventEntry[]) {
    // Payloads are parsed objects from the service
    // Sort by sequence to ensure causal ordering - events may arrive out of order via WebSocket
    // due to fire-and-forget emission from coordinator (network race conditions)
    this.events = (events as TypedTraceEvent[]).sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Get all events
   */
  all(): TypedTraceEvent[] {
    return this.events;
  }

  /**
   * Find first event matching type
   */
  find<T = any>(type: string): TypedTraceEvent<T> | undefined {
    return this.events.find((e) => e.type === type) as TypedTraceEvent<T> | undefined;
  }

  /**
   * Find first event matching predicate
   */
  findWhere(predicate: (event: TypedTraceEvent) => boolean): TypedTraceEvent | undefined {
    return this.events.find(predicate);
  }

  /**
   * Filter events by type
   */
  filter<T = any>(type: string): TypedTraceEvent<T>[] {
    return this.events.filter((e) => e.type === type) as TypedTraceEvent<T>[];
  }

  /**
   * Filter events by type (alias for filter)
   */
  byType<T = any>(type: string): TypedTraceEvent<T>[] {
    return this.filter<T>(type);
  }

  /**
   * Filter events by category
   */
  byCategory(category: string): TypedTraceEvent[] {
    return this.events.filter((e) => e.category === category);
  }

  /**
   * Filter events by token
   */
  byToken(tokenId: string): TypedTraceEvent[] {
    return this.events.filter((e) => e.payload.tokenId === tokenId);
  }

  /**
   * Filter events by node
   */
  byNode(nodeId: string): TypedTraceEvent[] {
    return this.events.filter((e) => e.payload.nodeId === nodeId);
  }

  /**
   * Filter events to only include root workflow events (excludes subworkflow events).
   * Root events have executionId === streamId (no outer context).
   */
  rootOnly(): TypedTraceEvent[] {
    return this.events.filter((e) => {
      const entry = e as TraceEventEntry;
      return entry.executionId === entry.streamId;
    });
  }

  /**
   * Find first root workflow event matching type (excludes subworkflow events)
   */
  findRoot<T = any>(type: string): TypedTraceEvent<T> | undefined {
    return this.rootOnly().find((e) => e.type === type) as TypedTraceEvent<T> | undefined;
  }

  /**
   * Get event count by type
   */
  count(type?: string): number {
    if (!type) return this.events.length;
    return this.events.filter((e) => e.type === type).length;
  }

  /**
   * Check if event exists
   */
  has(type: string): boolean {
    return this.events.some((e) => e.type === type);
  }

  /**
   * Get events in chronological order
   */
  chronological(): TypedTraceEvent[] {
    return [...this.events].sort((a, b) => a.sequence - b.sequence);
  }

  // Semantic helpers for common operations

  /**
   * Context operations
   */
  get context() {
    const self = this;
    return {
      initialize(): TypedTraceEvent<TracePayloads.ContextInitialize> | undefined {
        return self.find<TracePayloads.ContextInitialize>('operation.context.initialized');
      },
      reads(): TypedTraceEvent<TracePayloads.ContextRead>[] {
        return self.filter<TracePayloads.ContextRead>('operation.context.read');
      },
      /** @deprecated Use setFields() or replaceSections() instead */
      writes(): TypedTraceEvent<TracePayloads.ContextSetField>[] {
        // For backwards compatibility, combine set_field events (they have path+value)
        return self
          .filter<TracePayloads.ContextSetField>('operation.context.field_set')
          .map((e) => ({ ...e, payload: { path: e.payload.path, value: e.payload.value } }));
      },
      setFields(): TypedTraceEvent<TracePayloads.ContextSetField>[] {
        return self.filter<TracePayloads.ContextSetField>('operation.context.field_set');
      },
      replaceSections(): TypedTraceEvent<TracePayloads.ContextReplaceSection>[] {
        return self.filter<TracePayloads.ContextReplaceSection>(
          'operation.context.section_replaced',
        );
      },
      readAt(path: string): TypedTraceEvent<TracePayloads.ContextRead> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.context.read' && e.payload.path === path,
        ) as TypedTraceEvent<TracePayloads.ContextRead> | undefined;
      },
      /** @deprecated Use setFieldAt() or replaceSectionAt() instead */
      writeAt(path: string): TypedTraceEvent<TracePayloads.ContextSetField> | undefined {
        // First look for set_field events with matching path
        const setFieldEvent = self.findWhere(
          (e) => e.type === 'operation.context.field_set' && e.payload.path === path,
        ) as TypedTraceEvent<TracePayloads.ContextSetField> | undefined;
        if (setFieldEvent) {
          return {
            ...setFieldEvent,
            payload: { path: setFieldEvent.payload.path, value: setFieldEvent.payload.value },
          };
        }
        // Also check for replace_section events (for section-level writes like 'input')
        const replaceSectionEvent = self.findWhere(
          (e) => e.type === 'operation.context.section_replaced' && e.payload.section === path,
        ) as TypedTraceEvent<TracePayloads.ContextReplaceSection> | undefined;
        if (replaceSectionEvent) {
          return {
            ...replaceSectionEvent,
            payload: {
              path: replaceSectionEvent.payload.section,
              value: replaceSectionEvent.payload.data,
            },
          };
        }
        return undefined;
      },
      setFieldAt(path: string): TypedTraceEvent<TracePayloads.ContextSetField> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.context.field_set' && e.payload.path === path,
        ) as TypedTraceEvent<TracePayloads.ContextSetField> | undefined;
      },
      replaceSectionAt(
        section: string,
      ): TypedTraceEvent<TracePayloads.ContextReplaceSection> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.context.section_replaced' && e.payload.section === section,
        ) as TypedTraceEvent<TracePayloads.ContextReplaceSection> | undefined;
      },
      /** @deprecated Use setFieldsTo() instead */
      writesTo(path: string): TypedTraceEvent<TracePayloads.ContextSetField>[] {
        // Look for set_field events where path starts with the given prefix
        const setFieldEvents = self
          .filter<TracePayloads.ContextSetField>('operation.context.field_set')
          .filter((e) => e.payload.path === path || e.payload.path.startsWith(path + '.'))
          .map((e) => ({ ...e, payload: { path: e.payload.path, value: e.payload.value } }));
        // Also check for replace_section events (for section-level writes like 'input')
        const replaceSectionEvents = self
          .filter<TracePayloads.ContextReplaceSection>('operation.context.section_replaced')
          .filter((e) => e.payload.section === path)
          .map((e) => ({ ...e, payload: { path: e.payload.section, value: e.payload.data } }));
        return [...setFieldEvents, ...replaceSectionEvents];
      },
      setFieldsTo(path: string): TypedTraceEvent<TracePayloads.ContextSetField>[] {
        return self
          .filter<TracePayloads.ContextSetField>('operation.context.field_set')
          .filter((e) => e.payload.path === path || e.payload.path.startsWith(path + '.'));
      },
      readsFrom(path: string): TypedTraceEvent<TracePayloads.ContextRead>[] {
        return self
          .filter<TracePayloads.ContextRead>('operation.context.read')
          .filter((e) => e.payload.path === path);
      },
      validate(): TypedTraceEvent<TracePayloads.ContextValidate> | undefined {
        return self.find<TracePayloads.ContextValidate>('operation.context.validate');
      },
      validates(): TypedTraceEvent<TracePayloads.ContextValidate>[] {
        return self.filter<TracePayloads.ContextValidate>('operation.context.validate');
      },
      validateAt(path: string): TypedTraceEvent<TracePayloads.ContextValidate> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.context.validate' && e.payload.path === path,
        ) as TypedTraceEvent<TracePayloads.ContextValidate> | undefined;
      },
      snapshots(): TypedTraceEvent<TracePayloads.ContextSnapshot>[] {
        return self.filter<TracePayloads.ContextSnapshot>('operation.context.snapshot');
      },
    };
  }

  /**
   * Token operations
   *
   * Note: tokenId and nodeId are in the payload.
   * Access via event.payload.tokenId, event.payload.nodeId.
   */
  get tokens() {
    const self = this;
    return {
      creates(): TypedTraceEvent<TracePayloads.TokenCreatedPayload>[] {
        return self.filter<TracePayloads.TokenCreatedPayload>('operation.tokens.created');
      },
      /** Alias for creates() */
      creations(): TypedTraceEvent<TracePayloads.TokenCreatedPayload>[] {
        return this.creates();
      },
      created(tokenId: string): TypedTraceEvent<TracePayloads.TokenCreatedPayload> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.tokens.created' && e.payload.tokenId === tokenId,
        ) as TypedTraceEvent<TracePayloads.TokenCreatedPayload> | undefined;
      },
      statusUpdates(): TypedTraceEvent<TracePayloads.TokenStatusUpdatedPayload>[] {
        return self.filter<TracePayloads.TokenStatusUpdatedPayload>(
          'operation.tokens.status_updated',
        );
      },
      statusTransitions(tokenId: string): string[] {
        const updates = self
          .filter<TracePayloads.TokenStatusUpdatedPayload>('operation.tokens.status_updated')
          .filter((e) => e.payload.tokenId === tokenId)
          .sort((a, b) => a.sequence - b.sequence);
        if (updates.length === 0) return [];
        // Return list of status names in order
        const statuses = [updates[0].payload.from];
        for (const u of updates) {
          statuses.push(u.payload.to);
        }
        return statuses;
      },
      /** Get the specific status update event when token transitioned to a status */
      statusUpdate(
        tokenId: string,
        toStatus: string,
      ): TypedTraceEvent<TracePayloads.TokenStatusUpdatedPayload> | undefined {
        return self
          .filter<TracePayloads.TokenStatusUpdatedPayload>('operation.tokens.status_updated')
          .find((e) => e.payload.tokenId === tokenId && e.payload.to === toStatus);
      },
    };
  }

  /**
   * Branch table operations
   */
  get branches() {
    const self = this;
    return {
      creates(): TypedTraceEvent<TracePayloads.BranchTableCreate>[] {
        return self.filter<TracePayloads.BranchTableCreate>(
          'operation.context.branch_table.created',
        );
      },
      drops(): TypedTraceEvent<TracePayloads.BranchTableDrop>[] {
        return self.filter<TracePayloads.BranchTableDrop>('operation.context.branch_table.dropped');
      },
      validates(): TypedTraceEvent<TracePayloads.BranchValidate>[] {
        return self.filter<TracePayloads.BranchValidate>('operation.context.branch.validate');
      },
      writes(): TypedTraceEvent<TracePayloads.BranchWrite>[] {
        return self.filter<TracePayloads.BranchWrite>('operation.context.branch.written');
      },
      reads(): TypedTraceEvent<TracePayloads.BranchesRead>[] {
        return self.filter<TracePayloads.BranchesRead>('operation.context.branches_read');
      },
      merges(): TypedTraceEvent<TracePayloads.Merged>[] {
        return self.filter<TracePayloads.Merged>('operation.context.merged');
      },
      lifecycle(): Map<string, { created: boolean; dropped: boolean }> {
        const tables = new Map<string, { created: boolean; dropped: boolean }>();

        for (const event of self.filter<TracePayloads.BranchTableCreate>(
          'operation.context.branch_table.created',
        )) {
          const name = event.payload.tableName;
          if (!tables.has(name)) {
            tables.set(name, { created: false, dropped: false });
          }
          tables.get(name)!.created = true;
        }

        for (const event of self.filter<TracePayloads.BranchTableDrop>(
          'operation.context.branch_table.dropped',
        )) {
          // Drop events now include multiple tokenIds
          for (const tokenId of event.payload.tokenIds) {
            const name = `branch_output_${tokenId}`;
            if (!tables.has(name)) {
              tables.set(name, { created: false, dropped: false });
            }
            tables.get(name)!.dropped = true;
          }
        }

        return tables;
      },
    };
  }

  /**
   * SQL operations
   */
  get sql() {
    const self = this;
    return {
      queries(): TypedTraceEvent<TracePayloads.SqlQuery>[] {
        return self.filter<TracePayloads.SqlQuery>('operation.sql.query');
      },
      slow(thresholdMs = 10): TypedTraceEvent<TracePayloads.SqlQuery>[] {
        return self
          .filter<TracePayloads.SqlQuery>('operation.sql.query')
          .filter((e) => e.payload.durationMs > thresholdMs);
      },
      avgDuration(): number {
        const queries = this.queries();
        if (queries.length === 0) return 0;
        return queries.reduce((sum, q) => sum + q.payload.durationMs, 0) / queries.length;
      },
    };
  }

  /**
   * Routing/decision operations
   */
  get routing() {
    const self = this;
    return {
      starts(): TypedTraceEvent<TracePayloads.RoutingStart>[] {
        return self.filter<TracePayloads.RoutingStart>('decision.routing.start');
      },
      evaluations(): TypedTraceEvent<TracePayloads.RoutingEvaluateTransition>[] {
        return self.filter<TracePayloads.RoutingEvaluateTransition>(
          'decision.routing.evaluate_transition',
        );
      },
      matches(): TypedTraceEvent<TracePayloads.RoutingTransitionMatched>[] {
        return self.filter<TracePayloads.RoutingTransitionMatched>(
          'decision.routing.transition_matched',
        );
      },
      completions(): TypedTraceEvent<TracePayloads.RoutingComplete>[] {
        return self.filter<TracePayloads.RoutingComplete>('decision.routing.complete');
      },
    };
  }

  /**
   * Completion/finalization operations.
   * Note: These methods filter to root workflow only to exclude subworkflow completion events.
   */
  get completion() {
    const self = this;
    return {
      start(): TypedTraceEvent<TracePayloads.CompletionStart> | undefined {
        return self.findRoot<TracePayloads.CompletionStart>('decision.completion.start');
      },
      extracts(): TypedTraceEvent<TracePayloads.CompletionExtract>[] {
        return self.filter<TracePayloads.CompletionExtract>('decision.completion.extract');
      },
      complete(): TypedTraceEvent<TracePayloads.CompletionComplete> | undefined {
        // Use findRoot to get the root workflow's completion, not a subworkflow's
        return self.findRoot<TracePayloads.CompletionComplete>('decision.completion.complete');
      },
      noMapping(): boolean {
        return self.has('decision.completion.no_mapping');
      },
    };
  }

  /**
   * Synchronization operations (fan-in)
   */
  get sync() {
    const self = this;
    return {
      all(): TypedTraceEvent[] {
        return self.events.filter((e) => e.type.startsWith('decision.sync.'));
      },
      starts(): TypedTraceEvent[] {
        return self.filter('decision.sync.start');
      },
      waits(): TypedTraceEvent[] {
        return self.filter('decision.sync.wait');
      },
      activations(): TypedTraceEvent[] {
        return self.filter('decision.sync.activate');
      },
    };
  }

  /**
   * Dispatch operations (task dispatch to executor)
   */
  get dispatch() {
    const self = this;
    return {
      all(): TypedTraceEvent[] {
        return self.byCategory('dispatch');
      },
      taskDispatches(): TypedTraceEvent[] {
        return self.filter('dispatch.task.inputMapping.applied');
      },
      taskDispatch(tokenId: string): TypedTraceEvent | undefined {
        return self.findWhere(
          (e) => e.type === 'dispatch.task.inputMapping.applied' && e.payload.tokenId === tokenId,
        );
      },
      /** Get all dispatch.task.sent events (task dispatched to executor) */
      sends(): TypedTraceEvent<TracePayloads.TaskSent>[] {
        return self.filter<TracePayloads.TaskSent>('dispatch.task.sent');
      },
      /** Get dispatch.task.sent event for a specific token */
      send(tokenId: string): TypedTraceEvent<TracePayloads.TaskSent> | undefined {
        return self.findWhere((e) => e.type === 'dispatch.task.sent' && e.payload.tokenId === tokenId) as
          | TypedTraceEvent<TracePayloads.TaskSent>
          | undefined;
      },
      batchStarts(): TypedTraceEvent[] {
        return self.filter('dispatch.batch.start');
      },
      batchCompletes(): TypedTraceEvent[] {
        return self.filter('dispatch.batch.complete');
      },
    };
  }

  /**
   * Executor operations (task/step/action execution in executor service)
   */
  get executor() {
    const self = this;
    return {
      /** Get all executor.task.started events */
      taskStarts(): TypedTraceEvent<TracePayloads.ExecutorTaskStarted>[] {
        return self.filter<TracePayloads.ExecutorTaskStarted>('executor.task.started');
      },
      /** Get executor.task.started event for a specific token */
      taskStart(tokenId: string): TypedTraceEvent<TracePayloads.ExecutorTaskStarted> | undefined {
        return self.findWhere(
          (e) => e.type === 'executor.task.started' && e.payload.tokenId === tokenId,
        ) as TypedTraceEvent<TracePayloads.ExecutorTaskStarted> | undefined;
      },
      /** Get all executor.task.completed events */
      taskCompletions(): TypedTraceEvent<TracePayloads.ExecutorTaskCompleted>[] {
        return self.filter<TracePayloads.ExecutorTaskCompleted>('executor.task.completed');
      },
      /** Get executor.task.completed event for a specific token */
      taskCompletion(
        tokenId: string,
      ): TypedTraceEvent<TracePayloads.ExecutorTaskCompleted> | undefined {
        return self.findWhere(
          (e) => e.type === 'executor.task.completed' && e.payload.tokenId === tokenId,
        ) as TypedTraceEvent<TracePayloads.ExecutorTaskCompleted> | undefined;
      },
      /** Get all executor.step.started events */
      stepStarts(): TypedTraceEvent<TracePayloads.ExecutorStepStarted>[] {
        return self.filter<TracePayloads.ExecutorStepStarted>('executor.step.started');
      },
      /** Get executor.step.started events for a specific token */
      stepStartsFor(tokenId: string): TypedTraceEvent<TracePayloads.ExecutorStepStarted>[] {
        return self
          .filter<TracePayloads.ExecutorStepStarted>('executor.step.started')
          .filter((e) => e.payload.tokenId === tokenId);
      },
      /** Get all executor.step.completed events */
      stepCompletions(): TypedTraceEvent<TracePayloads.ExecutorStepCompleted>[] {
        return self.filter<TracePayloads.ExecutorStepCompleted>('executor.step.completed');
      },
      /** Get executor.step.completed events for a specific token */
      stepCompletionsFor(tokenId: string): TypedTraceEvent<TracePayloads.ExecutorStepCompleted>[] {
        return self
          .filter<TracePayloads.ExecutorStepCompleted>('executor.step.completed')
          .filter((e) => e.payload.tokenId === tokenId);
      },
      /** Get all executor.action.started events */
      actionStarts(): TypedTraceEvent<TracePayloads.ExecutorActionStarted>[] {
        return self.filter<TracePayloads.ExecutorActionStarted>('executor.action.started');
      },
      /** Get executor.action.started events for a specific token */
      actionStartsFor(tokenId: string): TypedTraceEvent<TracePayloads.ExecutorActionStarted>[] {
        return self
          .filter<TracePayloads.ExecutorActionStarted>('executor.action.started')
          .filter((e) => e.payload.tokenId === tokenId);
      },
      /** Get all executor.action.completed events */
      actionCompletions(): TypedTraceEvent<TracePayloads.ExecutorActionCompleted>[] {
        return self.filter<TracePayloads.ExecutorActionCompleted>('executor.action.completed');
      },
      /** Get executor.action.completed events for a specific token */
      actionCompletionsFor(
        tokenId: string,
      ): TypedTraceEvent<TracePayloads.ExecutorActionCompleted>[] {
        return self
          .filter<TracePayloads.ExecutorActionCompleted>('executor.action.completed')
          .filter((e) => e.payload.tokenId === tokenId);
      },
      /** Get all executor.action.failed events */
      actionFailures(): TypedTraceEvent<TracePayloads.ExecutorActionFailed>[] {
        return self.filter<TracePayloads.ExecutorActionFailed>('executor.action.failed');
      },
      /** Get all executor.mock.generated events */
      mockGenerations(): TypedTraceEvent<TracePayloads.ExecutorMockGenerated>[] {
        return self.filter<TracePayloads.ExecutorMockGenerated>('executor.mock.generated');
      },
      /** Get executor.mock.generated event for a specific token */
      mockGeneration(
        tokenId: string,
      ): TypedTraceEvent<TracePayloads.ExecutorMockGenerated> | undefined {
        return self.findWhere(
          (e) => e.type === 'executor.mock.generated' && e.payload.tokenId === tokenId,
        ) as TypedTraceEvent<TracePayloads.ExecutorMockGenerated> | undefined;
      },
    };
  }

  /**
   * Error events (any event with 'error' in the type)
   */
  get errors() {
    const self = this;
    return {
      all(): TypedTraceEvent[] {
        return self.events.filter((e) => e.type.toLowerCase().includes('error'));
      },
      count(): number {
        return this.all().length;
      },
    };
  }
}

/**
 * Create trace event collection from raw events
 */
export function parseTraceEvents(events: TraceEventEntry[]): TraceEventCollection {
  return new TraceEventCollection(events);
}
