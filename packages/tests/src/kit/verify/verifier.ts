/**
 * Workflow Verifier
 *
 * Fluent API for declarative workflow execution verification.
 * Provides self-diagnosing test assertions with full context on failure.
 */

import type { EmbeddedWorkflowDef, TraceEventCollection } from '@wonder/sdk';
import { WorkflowVerificationError } from './error';
import type {
  BranchWriteSpec,
  DiagnosticContext,
  OutputFieldSpec,
  OutputSpec,
  SnapshotSpec,
  StateWriteSpec,
  TokenCreatedPayload,
  TokenStructure,
  TypedTraceEvent,
  VerificationConfig,
  VerificationContext,
} from './types';

/**
 * Workflow Verifier with fluent API
 */
export class WorkflowVerifier {
  private readonly trace: TraceEventCollection;
  private readonly input: unknown;
  private readonly definition: EmbeddedWorkflowDef;
  private readonly config: VerificationConfig = {};

  // Lazily computed diagnostic context
  private _diagnostics: DiagnosticContext | null = null;
  private _context: VerificationContext | null = null;

  constructor(
    trace: TraceEventCollection,
    options: {
      input: unknown;
      definition: EmbeddedWorkflowDef;
    },
  ) {
    this.trace = trace;
    this.input = options.input;
    this.definition = options.definition;
  }

  // ===========================================================================
  // Fluent Configuration Methods
  // ===========================================================================

  /**
   * Verify workflow completed successfully.
   */
  completed(): this {
    this.config.completed = true;
    return this;
  }

  /**
   * Verify token structure.
   */
  withTokens(structure: TokenStructure): this {
    this.config.tokens = structure;
    return this;
  }

  /**
   * Verify state writes occurred in specific order.
   */
  withStateWriteOrder(paths: string[]): this {
    this.config.stateWriteOrder = paths;
    return this;
  }

  /**
   * Verify specific state writes.
   */
  withStateWrites(writes: StateWriteSpec[]): this {
    this.config.stateWrites = writes;
    return this;
  }

  /**
   * Verify workflow output.
   * Pass an object where each value is either:
   * - A literal value for exact match
   * - An OutputFieldSpec for more complex verification
   */
  withOutput(spec: OutputSpec): this {
    this.config.output = spec;
    return this;
  }

  /**
   * Verify branch writes.
   */
  withBranchWrites(spec: BranchWriteSpec): this {
    this.config.branchWrites = spec;
    return this;
  }

  /**
   * Verify context snapshots.
   */
  withSnapshots(spec: SnapshotSpec): this {
    this.config.snapshots = spec;
    return this;
  }

  /**
   * Add custom verification.
   */
  withCustom(
    name: string,
    verify: (trace: TraceEventCollection, ctx: VerificationContext) => void,
  ): this {
    if (!this.config.custom) {
      this.config.custom = [];
    }
    this.config.custom.push({ name, verify });
    return this;
  }

  // ===========================================================================
  // Execution
  // ===========================================================================

  /**
   * Run all configured verifications.
   * Throws WorkflowVerificationError on failure with full diagnostics.
   */
  run(): void {
    // Build diagnostic context first (used in all error messages)
    const diagnostics = this.buildDiagnostics();
    const ctx = this.buildContext();

    // Run each configured verification
    if (this.config.completed) {
      this.verifyCompleted(diagnostics);
    }

    if (this.config.tokens) {
      this.verifyTokens(this.config.tokens, ctx, diagnostics);
    }

    if (this.config.stateWrites) {
      this.verifyStateWrites(this.config.stateWrites, ctx, diagnostics);
    }

    if (this.config.stateWriteOrder) {
      this.verifyStateWriteOrder(this.config.stateWriteOrder, ctx, diagnostics);
    }

    if (this.config.output) {
      this.verifyOutput(this.config.output, ctx, diagnostics);
    }

    if (this.config.branchWrites) {
      this.verifyBranchWrites(this.config.branchWrites, ctx, diagnostics);
    }

    if (this.config.snapshots) {
      this.verifySnapshots(this.config.snapshots, diagnostics);
    }

    if (this.config.custom) {
      for (const { name, verify } of this.config.custom) {
        try {
          verify(this.trace, ctx);
        } catch (error) {
          if (error instanceof WorkflowVerificationError) {
            throw error;
          }
          throw new WorkflowVerificationError(
            `custom: ${name}`,
            error instanceof Error ? error.message : String(error),
            diagnostics,
            { customVerification: name },
          );
        }
      }
    }
  }

  // ===========================================================================
  // Verification Methods
  // ===========================================================================

  private verifyCompleted(diagnostics: DiagnosticContext): void {
    const completion = this.trace.completion.complete();
    if (!completion) {
      throw new WorkflowVerificationError(
        'completed',
        'Workflow did not complete - no completion event found.',
        diagnostics,
      );
    }
  }

  private verifyTokens(
    structure: TokenStructure,
    ctx: VerificationContext,
    diagnostics: DiagnosticContext,
  ): void {
    const { rootTokens, fanOutSiblings, fanInArrivals, fanInContinuations } = ctx.collected;

    // Verify root tokens
    if (rootTokens.length !== structure.root) {
      throw new WorkflowVerificationError(
        'tokens.root',
        `Expected ${structure.root} root token(s), got ${rootTokens.length}.`,
        diagnostics,
        { expected: structure.root, actual: rootTokens.length },
      );
    }

    // Verify siblings
    if (structure.siblings) {
      if (fanOutSiblings.length !== structure.siblings.count) {
        throw new WorkflowVerificationError(
          'tokens.siblings.count',
          `Expected ${structure.siblings.count} fan-out siblings, got ${fanOutSiblings.length}.`,
          diagnostics,
          { expected: structure.siblings.count, actual: fanOutSiblings.length },
        );
      }

      // Verify shared fan_out_transition_id
      if (structure.siblings.sharedFanOutId) {
        const fanOutIds = new Set(fanOutSiblings.map((s) => s.payload.fan_out_transition_id));
        if (fanOutIds.size !== 1) {
          throw new WorkflowVerificationError(
            'tokens.siblings.sharedFanOutId',
            `Expected all siblings to share same fan_out_transition_id, found ${fanOutIds.size} distinct IDs.`,
            diagnostics,
            { distinctIds: Array.from(fanOutIds) },
          );
        }
        if (!fanOutIds.has(null) && fanOutIds.size === 1) {
          // Valid - all share same non-null ID
        } else if (fanOutIds.has(null)) {
          throw new WorkflowVerificationError(
            'tokens.siblings.sharedFanOutId',
            'Fan-out siblings have null fan_out_transition_id.',
            diagnostics,
          );
        }
      }

      // Verify branch indices
      if (structure.siblings.branchIndices) {
        const actualIndices = fanOutSiblings
          .map((s) => s.payload.branch_index)
          .sort((a, b) => a - b);
        const expectedIndices = [...structure.siblings.branchIndices].sort((a, b) => a - b);
        if (JSON.stringify(actualIndices) !== JSON.stringify(expectedIndices)) {
          throw new WorkflowVerificationError(
            'tokens.siblings.branchIndices',
            `Expected branch indices ${JSON.stringify(expectedIndices)}, got ${JSON.stringify(actualIndices)}.`,
            diagnostics,
            { expected: expectedIndices, actual: actualIndices },
          );
        }
      }

      // Verify branch_total
      if (structure.siblings.branchTotal !== undefined) {
        const wrongTotals = fanOutSiblings.filter(
          (s) => s.payload.branch_total !== structure.siblings!.branchTotal,
        );
        if (wrongTotals.length > 0) {
          throw new WorkflowVerificationError(
            'tokens.siblings.branchTotal',
            `Expected all siblings to have branch_total=${structure.siblings.branchTotal}, found mismatches.`,
            diagnostics,
            {
              expected: structure.siblings.branchTotal,
              mismatches: wrongTotals.map((s) => ({
                tokenId: s.token_id,
                branchTotal: s.payload.branch_total,
              })),
            },
          );
        }
      }
    }

    // Verify fan-in arrivals
    if (structure.fanInArrivals !== undefined && fanInArrivals.length !== structure.fanInArrivals) {
      throw new WorkflowVerificationError(
        'tokens.fanInArrivals',
        `Expected ${structure.fanInArrivals} fan-in arrival tokens, got ${fanInArrivals.length}.`,
        diagnostics,
        { expected: structure.fanInArrivals, actual: fanInArrivals.length },
      );
    }

    // Verify fan-in continuations
    if (
      structure.fanInContinuations !== undefined &&
      fanInContinuations.length !== structure.fanInContinuations
    ) {
      throw new WorkflowVerificationError(
        'tokens.fanInContinuations',
        `Expected ${structure.fanInContinuations} fan-in continuation tokens, got ${fanInContinuations.length}.`,
        diagnostics,
        { expected: structure.fanInContinuations, actual: fanInContinuations.length },
      );
    }

    // Verify total count
    if (structure.total !== undefined) {
      const total = this.trace.tokens.creations().length;
      if (total !== structure.total) {
        throw new WorkflowVerificationError(
          'tokens.total',
          `Expected ${structure.total} total tokens, got ${total}.`,
          diagnostics,
          { expected: structure.total, actual: total },
        );
      }
    }
  }

  private verifyStateWrites(
    writes: StateWriteSpec[],
    ctx: VerificationContext,
    diagnostics: DiagnosticContext,
  ): void {
    for (const spec of writes) {
      const write = ctx.collected.stateWrites.get(spec.path);

      if (!write) {
        throw new WorkflowVerificationError(
          `stateWrites: ${spec.path}`,
          `Expected state write to "${spec.path}" but none found.${spec.description ? ` (${spec.description})` : ''}`,
          diagnostics,
          {
            expectedPath: spec.path,
            availableWrites: Array.from(ctx.collected.stateWrites.keys()),
          },
        );
      }

      // Type check
      if (spec.type) {
        const actualType =
          write.value === null ? 'null' : Array.isArray(write.value) ? 'array' : typeof write.value;
        if (actualType !== spec.type) {
          throw new WorkflowVerificationError(
            `stateWrites: ${spec.path}`,
            `Expected ${spec.path} to be type "${spec.type}", got "${actualType}".`,
            diagnostics,
            { expected: spec.type, actual: actualType, value: write.value },
          );
        }
      }

      // Value check
      if (spec.value !== undefined) {
        if (JSON.stringify(write.value) !== JSON.stringify(spec.value)) {
          throw new WorkflowVerificationError(
            `stateWrites: ${spec.path}`,
            `Expected ${spec.path} to equal ${JSON.stringify(spec.value)}, got ${JSON.stringify(write.value)}.`,
            diagnostics,
            { expected: spec.value, actual: write.value },
          );
        }
      }

      // Matcher check
      if (spec.matcher && !spec.matcher(write.value)) {
        throw new WorkflowVerificationError(
          `stateWrites: ${spec.path}`,
          `State write to "${spec.path}" failed matcher validation.`,
          diagnostics,
          { value: write.value },
        );
      }

      // Array length check
      if (spec.arrayLength !== undefined) {
        if (!Array.isArray(write.value)) {
          throw new WorkflowVerificationError(
            `stateWrites: ${spec.path}`,
            `Expected ${spec.path} to be an array for length check, got ${typeof write.value}.`,
            diagnostics,
            { value: write.value },
          );
        }
        if (write.value.length !== spec.arrayLength) {
          throw new WorkflowVerificationError(
            `stateWrites: ${spec.path}`,
            `Expected ${spec.path} array to have length ${spec.arrayLength}, got ${write.value.length}.`,
            diagnostics,
            { expected: spec.arrayLength, actual: write.value.length, value: write.value },
          );
        }
      }
    }
  }

  private verifyStateWriteOrder(
    paths: string[],
    ctx: VerificationContext,
    diagnostics: DiagnosticContext,
  ): void {
    // Get all writes and their sequences
    const writes = ctx.collected.stateWrites;
    const sequences: Array<{ path: string; sequence: number }> = [];

    for (const path of paths) {
      const write = writes.get(path);
      if (!write) {
        throw new WorkflowVerificationError(
          'stateWriteOrder',
          `Expected state write to "${path}" for ordering check, but none found.`,
          diagnostics,
          { expectedPath: path, availableWrites: Array.from(writes.keys()) },
        );
      }
      sequences.push({ path, sequence: write.sequence });
    }

    // Verify ordering
    for (let i = 1; i < sequences.length; i++) {
      const prev = sequences[i - 1];
      const curr = sequences[i];
      if (prev.sequence >= curr.sequence) {
        throw new WorkflowVerificationError(
          'stateWriteOrder',
          `Expected "${prev.path}" (seq ${prev.sequence}) to be written before "${curr.path}" (seq ${curr.sequence}).`,
          diagnostics,
          { expectedOrder: paths, actualSequences: sequences },
        );
      }
    }
  }

  private verifyOutput(
    spec: OutputSpec,
    ctx: VerificationContext,
    diagnostics: DiagnosticContext,
  ): void {
    const output = ctx.collected.finalOutput;

    if (!output) {
      throw new WorkflowVerificationError(
        'output',
        'No final output found. Workflow may not have completed.',
        diagnostics,
      );
    }

    for (const [key, specValue] of Object.entries(spec)) {
      const actualValue = output[key];

      // Check if it's a field spec or a literal value
      if (this.isOutputFieldSpec(specValue)) {
        this.verifyOutputField(key, actualValue, specValue, diagnostics);
      } else {
        // Literal value comparison
        if (JSON.stringify(actualValue) !== JSON.stringify(specValue)) {
          throw new WorkflowVerificationError(
            `output.${key}`,
            `Expected output.${key} to equal ${JSON.stringify(specValue)}, got ${JSON.stringify(actualValue)}.`,
            diagnostics,
            { expected: specValue, actual: actualValue },
          );
        }
      }
    }
  }

  private isOutputFieldSpec(value: unknown): value is OutputFieldSpec {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    // Check if it has any OutputFieldSpec-specific keys
    return 'type' in obj || 'matcher' in obj || 'arrayLength' in obj || 'defined' in obj;
  }

  private verifyOutputField(
    key: string,
    actualValue: unknown,
    spec: OutputFieldSpec,
    diagnostics: DiagnosticContext,
  ): void {
    // Defined check
    if (spec.defined && (actualValue === undefined || actualValue === null)) {
      throw new WorkflowVerificationError(
        `output.${key}`,
        `Expected output.${key} to be defined, got ${actualValue}.`,
        diagnostics,
        { value: actualValue },
      );
    }

    // Type check
    if (spec.type) {
      const actualType =
        actualValue === undefined
          ? 'undefined'
          : actualValue === null
            ? 'null'
            : Array.isArray(actualValue)
              ? 'array'
              : typeof actualValue;
      if (actualType !== spec.type) {
        throw new WorkflowVerificationError(
          `output.${key}`,
          `Expected output.${key} to be type "${spec.type}", got "${actualType}".`,
          diagnostics,
          { expected: spec.type, actual: actualType, value: actualValue },
        );
      }
    }

    // Value check
    if (spec.value !== undefined) {
      if (JSON.stringify(actualValue) !== JSON.stringify(spec.value)) {
        throw new WorkflowVerificationError(
          `output.${key}`,
          `Expected output.${key} to equal ${JSON.stringify(spec.value)}, got ${JSON.stringify(actualValue)}.`,
          diagnostics,
          { expected: spec.value, actual: actualValue },
        );
      }
    }

    // Matcher check
    if (spec.matcher && !spec.matcher(actualValue)) {
      throw new WorkflowVerificationError(
        `output.${key}`,
        `Output field "${key}" failed matcher validation.`,
        diagnostics,
        { value: actualValue },
      );
    }

    // Array length check
    if (spec.arrayLength !== undefined) {
      if (!Array.isArray(actualValue)) {
        throw new WorkflowVerificationError(
          `output.${key}`,
          `Expected output.${key} to be an array for length check, got ${typeof actualValue}.`,
          diagnostics,
          { value: actualValue },
        );
      }
      if (actualValue.length !== spec.arrayLength) {
        throw new WorkflowVerificationError(
          `output.${key}`,
          `Expected output.${key} array to have length ${spec.arrayLength}, got ${actualValue.length}.`,
          diagnostics,
          { expected: spec.arrayLength, actual: actualValue.length, value: actualValue },
        );
      }
    }
  }

  private verifyBranchWrites(
    spec: BranchWriteSpec,
    ctx: VerificationContext,
    diagnostics: DiagnosticContext,
  ): void {
    const branchOutputs = ctx.collected.branchOutputs;

    // Unique token count
    if (spec.uniqueTokenCount !== undefined && branchOutputs.size !== spec.uniqueTokenCount) {
      throw new WorkflowVerificationError(
        'branchWrites.uniqueTokenCount',
        `Expected ${spec.uniqueTokenCount} unique tokens with branch writes, got ${branchOutputs.size}.`,
        diagnostics,
        { expected: spec.uniqueTokenCount, actual: branchOutputs.size },
      );
    }

    // Output fields check
    if (spec.outputFields) {
      for (const [tokenId, output] of branchOutputs) {
        for (const field of spec.outputFields) {
          if (!(field in output)) {
            throw new WorkflowVerificationError(
              `branchWrites.outputFields`,
              `Expected branch output for token ${tokenId.slice(-8)} to have field "${field}".`,
              diagnostics,
              { tokenId, output, expectedFields: spec.outputFields },
            );
          }
        }
      }
    }

    // Output matcher
    if (spec.outputMatcher) {
      for (const [tokenId, output] of branchOutputs) {
        if (!spec.outputMatcher(output, tokenId)) {
          throw new WorkflowVerificationError(
            'branchWrites.outputMatcher',
            `Branch output for token ${tokenId.slice(-8)} failed matcher validation.`,
            diagnostics,
            { tokenId, output },
          );
        }
      }
    }
  }

  private verifySnapshots(spec: SnapshotSpec, diagnostics: DiagnosticContext): void {
    const snapshots = this.trace.context.snapshots();

    // Min count
    if (spec.minCount !== undefined && snapshots.length < spec.minCount) {
      throw new WorkflowVerificationError(
        'snapshots.minCount',
        `Expected at least ${spec.minCount} context snapshots, got ${snapshots.length}.`,
        diagnostics,
        { expected: spec.minCount, actual: snapshots.length },
      );
    }

    // With state check
    if (spec.withState) {
      const matching = snapshots.find((s) => {
        const state = s.payload.snapshot.state as Record<string, unknown>;
        const value = state[spec.withState!.field];
        return spec.withState!.matcher(value);
      });

      if (!matching) {
        throw new WorkflowVerificationError(
          'snapshots.withState',
          `No snapshot found with state.${spec.withState.field} matching the provided condition.`,
          diagnostics,
          {
            field: spec.withState.field,
            snapshotCount: snapshots.length,
          },
        );
      }
    }
  }

  // ===========================================================================
  // Context Building
  // ===========================================================================

  private buildContext(): VerificationContext {
    if (this._context) return this._context;

    const tokenCreations = this.trace.tokens.creations();

    // Classify tokens
    const rootTokens = tokenCreations.filter((tc) => tc.payload.path_id === 'root');
    const rootTokenId = rootTokens[0]?.token_id;

    // Fan-out siblings: parent is root, have fan_out_transition_id, branch_total > 1
    const fanOutSiblings = tokenCreations.filter(
      (tc) =>
        tc.payload.parent_token_id === rootTokenId &&
        tc.payload.fan_out_transition_id !== null &&
        tc.payload.branch_total > 1,
    );
    const siblingIds = new Set(fanOutSiblings.map((s) => s.token_id));

    // Fan-in arrivals: parent is a sibling
    const fanInArrivals = tokenCreations.filter((tc) =>
      siblingIds.has(tc.payload.parent_token_id!),
    );

    // Fan-in continuations: parent is root, no fan_out_id, not root itself
    const fanInContinuations = tokenCreations.filter(
      (tc) =>
        tc.payload.parent_token_id === rootTokenId &&
        tc.payload.fan_out_transition_id === null &&
        tc.payload.path_id !== 'root',
    );

    // Collect branch outputs
    const branchOutputs = new Map<string, Record<string, unknown>>();
    const branchWrites = this.trace.branches.writes();
    for (const bw of branchWrites) {
      if (bw.token_id && siblingIds.has(bw.token_id)) {
        branchOutputs.set(bw.token_id, bw.payload.output as Record<string, unknown>);
      }
    }

    // Collect state writes
    const stateWrites = new Map<string, { value: unknown; sequence: number }>();
    const contextWrites = this.trace.context.setFields();
    for (const cw of contextWrites) {
      stateWrites.set(cw.payload.path, { value: cw.payload.value, sequence: cw.sequence });
    }

    // Get final output
    const completion = this.trace.completion.complete();
    const finalOutput = completion
      ? (completion.payload.final_output as Record<string, unknown>)
      : null;

    this._context = {
      trace: this.trace,
      input: this.input,
      definition: this.definition,
      collected: {
        rootTokens,
        fanOutSiblings,
        fanInArrivals,
        fanInContinuations,
        branchOutputs,
        stateWrites,
        finalOutput,
      },
    };

    return this._context;
  }

  private buildDiagnostics(): DiagnosticContext {
    if (this._diagnostics) return this._diagnostics;

    const ctx = this.buildContext();
    const tokenCreations = this.trace.tokens.creations();
    const otherTokens = tokenCreations.filter(
      (tc) =>
        !ctx.collected.rootTokens.includes(tc) &&
        !ctx.collected.fanOutSiblings.includes(tc) &&
        !ctx.collected.fanInArrivals.includes(tc) &&
        !ctx.collected.fanInContinuations.includes(tc),
    );

    const snapshots = this.trace.context.snapshots();
    const errors = this.trace.errors.all();

    this._diagnostics = {
      input: this.input,
      tokenCreations: tokenCreations.map((tc) => ({
        tokenId: tc.token_id,
        pathId: tc.payload.path_id,
        parentId: tc.payload.parent_token_id,
        fanOutId: tc.payload.fan_out_transition_id,
        branchIndex: tc.payload.branch_index,
        branchTotal: tc.payload.branch_total,
      })),
      tokenSummary: {
        root: ctx.collected.rootTokens.length,
        siblings: ctx.collected.fanOutSiblings.length,
        fanInArrivals: ctx.collected.fanInArrivals.length,
        fanInContinuations: ctx.collected.fanInContinuations.length,
        other: otherTokens.length,
        total: tokenCreations.length,
      },
      stateWrites: Array.from(ctx.collected.stateWrites.entries())
        .map(([path, { value, sequence }]) => ({ path, value, sequence }))
        .sort((a, b) => a.sequence - b.sequence),
      branchWrites: this.trace.branches.writes().map((bw) => ({
        tokenId: bw.token_id,
        output: bw.payload.output,
      })),
      finalOutput: ctx.collected.finalOutput,
      snapshots: snapshots.map((s) => ({
        sequence: s.sequence,
        input: s.payload.snapshot.input,
        state: s.payload.snapshot.state,
        output: s.payload.snapshot.output,
      })),
      errors: errors.map((e) => ({
        type: e.type,
        payload: e.payload,
      })),
    };

    return this._diagnostics;
  }

  // ===========================================================================
  // Static Helpers
  // ===========================================================================

  /**
   * Get diagnostic context without running verifications.
   * Useful for manual inspection.
   */
  getDiagnostics(): DiagnosticContext {
    return this.buildDiagnostics();
  }

  /**
   * Get verification context without running verifications.
   * Useful for custom assertions.
   */
  getContext(): VerificationContext {
    return this.buildContext();
  }
}

// =============================================================================
// Entry Point
// =============================================================================

/**
 * Create a workflow verifier with fluent API.
 *
 * @example
 * verify(trace, { input, definition })
 *   .completed()
 *   .withTokens({ root: 1, siblings: { count: 3, sharedFanOutId: true } })
 *   .withStateWriteOrder(['state.seed', 'state.results', 'state.summary'])
 *   .withOutput({
 *     prefix: 'TEST',
 *     merged_results: { type: 'array', arrayLength: 3 },
 *     summary: { defined: true }
 *   })
 *   .run();
 */
export function verify(
  trace: TraceEventCollection,
  options: {
    input: unknown;
    definition: EmbeddedWorkflowDef;
  },
): WorkflowVerifier {
  return new WorkflowVerifier(trace, options);
}
