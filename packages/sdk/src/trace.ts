/**
 * Trace Event Helpers - Ergonomic trace event access for tests
 *
 * Provides typed access to trace events with semantic query methods.
 * Types match exactly what the coordinator emits - no remapping.
 *
 * Event structure:
 * - Top-level: type, token_id, node_id, duration_ms, sequence, timestamp, category
 * - payload: Event-specific data (varies by event type)
 */

import type { components } from './generated/schema.js';

export type TraceEventEntry = components['schemas']['TraceEventEntry'];

/**
 * Typed trace event with known payload structure.
 * Top-level fields (token_id, node_id) come from TraceEventEntry.
 * Payload contains event-specific data.
 */
export interface TypedTraceEvent<TPayload = Record<string, unknown>> extends Omit<
  TraceEventEntry,
  'payload'
> {
  payload: TPayload;
}

/**
 * Trace event payload types - matches exactly what coordinator emits in payload.
 * Top-level fields (token_id, node_id) are NOT duplicated here.
 */
export namespace TracePayloads {
  // Context operations
  export interface ContextInitialize {
    has_input_schema: boolean;
    has_context_schema: boolean;
    table_count: number;
    tables_created: string[];
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
    schema_type: string;
    valid: boolean;
    error_count: number;
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
    token_id: string;
    table_name: string;
    schema_type: string;
  }

  export interface BranchTableDrop {
    token_ids: string[];
    tables_dropped: number;
  }

  export interface BranchValidate {
    token_id: string;
    valid: boolean;
    error_count: number;
    errors?: string[];
  }

  export interface BranchWrite {
    token_id: string;
    output: unknown;
  }

  export interface BranchesRead {
    token_ids: string[];
    output_count: number;
  }

  export interface Merged {
    target_path: string;
    branch_count: number;
  }

  // Token operations - token_id and node_id are TOP LEVEL, not in payload
  export interface TokenCreatedPayload {
    task_id: string;
    parent_token_id: string | null;
    fan_out_transition_id: string | null;
    branch_index: number;
    branch_total: number;
  }

  export interface TokenStatusUpdatedPayload {
    from: string;
    to: string;
  }

  // SQL operations
  export interface SqlQuery {
    sql: string;
    params: unknown[];
    duration_ms: number;
  }

  // Routing/decision operations
  export interface RoutingStart {
    // Empty - token_id and node_id are top level
  }

  export interface RoutingEvaluateTransition {
    transition_id: string;
    condition: unknown;
  }

  export interface RoutingTransitionMatched {
    transition_id: string;
    spawn_count: number;
  }

  export interface RoutingComplete {
    decisions: unknown[];
  }

  // Completion operations
  export interface CompletionStart {
    output_mapping: Record<string, string> | null;
    context_keys: {
      input: string[];
      state: string[];
      output: string[];
    };
  }

  export interface CompletionExtract {
    target_field: string;
    source_path: string;
    extracted_value: unknown;
  }

  export interface CompletionComplete {
    final_output: Record<string, unknown>;
  }

  // Backwards compatibility aliases (deprecated)
  /** @deprecated Use TokenCreatedPayload */
  export type TokenCreated = TokenCreatedPayload & { token_id: string; node_id: string };
  /** @deprecated Use TokenStatusUpdatedPayload */
  export type TokenStatusUpdated = TokenStatusUpdatedPayload & {
    token_id: string;
    node_id?: string;
  };
  /** @deprecated Use ContextSetField */
  export type ContextWrite = ContextSetField;
}

/**
 * Trace event collection with ergonomic query methods
 */
export class TraceEventCollection {
  private events: TypedTraceEvent[];

  constructor(events: TraceEventEntry[]) {
    // Payloads are parsed objects from the service
    this.events = events as TypedTraceEvent[];
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
   * Filter events by category
   */
  byCategory(category: 'decision' | 'operation' | 'dispatch' | 'sql'): TypedTraceEvent[] {
    return this.events.filter((e) => e.category === category);
  }

  /**
   * Filter events by token
   */
  byToken(tokenId: string): TypedTraceEvent[] {
    return this.events.filter((e) => e.token_id === tokenId);
  }

  /**
   * Filter events by node
   */
  byNode(nodeId: string): TypedTraceEvent[] {
    return this.events.filter((e) => e.node_id === nodeId);
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
      writes(): TypedTraceEvent<TracePayloads.ContextWrite>[] {
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
      writeAt(path: string): TypedTraceEvent<TracePayloads.ContextWrite> | undefined {
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
      writesTo(path: string): TypedTraceEvent<TracePayloads.ContextWrite>[] {
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
   * Note: token_id and node_id are TOP-LEVEL fields on the event,
   * not inside payload. Access via event.token_id, event.node_id.
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
        // token_id is top-level, not in payload
        return self.findWhere(
          (e) => e.type === 'operation.tokens.created' && e.token_id === tokenId,
        ) as TypedTraceEvent<TracePayloads.TokenCreatedPayload> | undefined;
      },
      statusUpdates(): TypedTraceEvent<TracePayloads.TokenStatusUpdatedPayload>[] {
        return self.filter<TracePayloads.TokenStatusUpdatedPayload>(
          'operation.tokens.status_updated',
        );
      },
      statusTransitions(tokenId: string): string[] {
        // token_id is top-level, not in payload
        const updates = self
          .filter<TracePayloads.TokenStatusUpdatedPayload>('operation.tokens.status_updated')
          .filter((e) => e.token_id === tokenId)
          .sort((a, b) => a.sequence - b.sequence);
        if (updates.length === 0) return [];
        // Return list of status names in order
        const statuses = [updates[0].payload.from];
        for (const u of updates) {
          statuses.push(u.payload.to);
        }
        return statuses;
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
          const name = event.payload.table_name;
          if (!tables.has(name)) {
            tables.set(name, { created: false, dropped: false });
          }
          tables.get(name)!.created = true;
        }

        for (const event of self.filter<TracePayloads.BranchTableDrop>(
          'operation.context.branch_table.dropped',
        )) {
          // Drop events now include multiple token_ids
          for (const tokenId of event.payload.token_ids) {
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
          .filter((e) => e.payload.duration_ms > thresholdMs);
      },
      avgDuration(): number {
        const queries = this.queries();
        if (queries.length === 0) return 0;
        return queries.reduce((sum, q) => sum + q.payload.duration_ms, 0) / queries.length;
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
   * Completion/finalization operations
   */
  get completion() {
    const self = this;
    return {
      start(): TypedTraceEvent<TracePayloads.CompletionStart> | undefined {
        return self.find<TracePayloads.CompletionStart>('decision.completion.start');
      },
      extracts(): TypedTraceEvent<TracePayloads.CompletionExtract>[] {
        return self.filter<TracePayloads.CompletionExtract>('decision.completion.extract');
      },
      complete(): TypedTraceEvent<TracePayloads.CompletionComplete> | undefined {
        return self.find<TracePayloads.CompletionComplete>('decision.completion.complete');
      },
      noMapping(): boolean {
        return self.has('decision.completion.no_mapping');
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
