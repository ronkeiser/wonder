/**
 * Trace Event Helpers - Ergonomic trace event access for tests
 *
 * Provides typed access to trace events with semantic query methods.
 * Payloads are parsed objects returned directly from the service.
 */

import type { components } from './generated/schema.js';

export type TraceEventEntry = components['schemas']['TraceEventEntry'];

/**
 * Typed trace event with known payload structure
 * Note: payload is guaranteed to be present despite being optional in the generated schema
 */
export interface TypedTraceEvent<T = any> extends Omit<TraceEventEntry, 'payload'> {
  payload: T;
}

/**
 * Common trace event payload types
 */
export namespace TracePayloads {
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

  export interface ContextWrite {
    path: string;
    value: unknown;
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

  export interface BranchTableCreate {
    token_id: string;
    table_name: string;
  }

  export interface BranchTableDrop {
    table_name: string;
  }

  export interface TokenCreate {
    token_id: string;
    node_id: string;
    parent_token_id: string | null;
  }

  export interface TokenUpdateStatus {
    token_id: string;
    from: string;
    to: string;
  }

  export interface SqlQuery {
    sql: string;
    params: any[];
    duration_ms: number;
  }

  export interface RoutingStart {
    token_id: string;
    node_id: string;
  }

  export interface RoutingEvaluateTransition {
    transition_id: string;
    condition: any;
  }

  export interface RoutingTransitionMatched {
    transition_id: string;
    spawn_count: number;
  }

  export interface RoutingComplete {
    decisions: any[];
  }
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
        return self.find<TracePayloads.ContextInitialize>('operation.context.initialize');
      },
      reads(): TypedTraceEvent<TracePayloads.ContextRead>[] {
        return self.filter<TracePayloads.ContextRead>('operation.context.read');
      },
      writes(): TypedTraceEvent<TracePayloads.ContextWrite>[] {
        return self.filter<TracePayloads.ContextWrite>('operation.context.write');
      },
      readAt(path: string): TypedTraceEvent<TracePayloads.ContextRead> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.context.read' && e.payload.path === path,
        ) as TypedTraceEvent<TracePayloads.ContextRead> | undefined;
      },
      writeAt(path: string): TypedTraceEvent<TracePayloads.ContextWrite> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.context.write' && e.payload.path === path,
        ) as TypedTraceEvent<TracePayloads.ContextWrite> | undefined;
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
   */
  get tokens() {
    const self = this;
    return {
      creates(): TypedTraceEvent<TracePayloads.TokenCreate>[] {
        return self.filter<TracePayloads.TokenCreate>('operation.tokens.create');
      },
      created(tokenId: string): TypedTraceEvent<TracePayloads.TokenCreate> | undefined {
        return self.findWhere(
          (e) => e.type === 'operation.tokens.create' && e.payload.token_id === tokenId,
        ) as TypedTraceEvent<TracePayloads.TokenCreate> | undefined;
      },
      statusUpdates(): TypedTraceEvent<TracePayloads.TokenUpdateStatus>[] {
        return self.filter<TracePayloads.TokenUpdateStatus>('operation.tokens.update_status');
      },
      statusTransitions(tokenId: string): string[] {
        return self
          .byToken(tokenId)
          .filter((e) => e.type === 'operation.tokens.update_status')
          .map((e) => `${e.payload.from}→${e.payload.to}`);
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
          'operation.context.branch_table.create',
        );
      },
      drops(): TypedTraceEvent<TracePayloads.BranchTableDrop>[] {
        return self.filter<TracePayloads.BranchTableDrop>('operation.context.branch_table.drop');
      },
      lifecycle(): Map<string, { created: boolean; dropped: boolean }> {
        const tables = new Map<string, { created: boolean; dropped: boolean }>();

        for (const event of self.filter('operation.context.branch_table.create')) {
          const name = event.payload.table_name;
          if (!tables.has(name)) {
            tables.set(name, { created: false, dropped: false });
          }
          tables.get(name)!.created = true;
        }

        for (const event of self.filter('operation.context.branch_table.drop')) {
          const name = event.payload.table_name;
          if (!tables.has(name)) {
            tables.set(name, { created: false, dropped: false });
          }
          tables.get(name)!.dropped = true;
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
}

/**
 * Create trace event collection from raw events
 */
export function parseTraceEvents(events: TraceEventEntry[]): TraceEventCollection {
  return new TraceEventCollection(events);
}
