/**
 * Workflow Verification Error
 *
 * Custom error that includes full diagnostic context for debugging.
 * When a verification fails, this error provides everything needed
 * to understand what went wrong without bolt-on diagnostics.
 */

import type { DiagnosticContext } from './types';

/**
 * Error thrown when workflow verification fails.
 * Includes full diagnostic context in the error message.
 */
export class WorkflowVerificationError extends Error {
  /** The verification that failed */
  public readonly verification: string;

  /** Full diagnostic context */
  public readonly diagnostics: DiagnosticContext;

  /** Additional details about the failure */
  public readonly details?: unknown;

  constructor(
    verification: string,
    message: string,
    diagnostics: DiagnosticContext,
    details?: unknown,
  ) {
    // Build comprehensive error message with diagnostics
    const fullMessage = WorkflowVerificationError.buildMessage(
      verification,
      message,
      diagnostics,
      details,
    );

    super(fullMessage);

    this.name = 'WorkflowVerificationError';
    this.verification = verification;
    this.diagnostics = diagnostics;
    this.details = details;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, WorkflowVerificationError.prototype);
  }

  /**
   * Build comprehensive error message with all diagnostic context.
   */
  private static buildMessage(
    verification: string,
    message: string,
    diagnostics: DiagnosticContext,
    details?: unknown,
  ): string {
    const lines: string[] = [
      '',
      '═══════════════════════════════════════════════════════════════════════════════',
      `  VERIFICATION FAILED: ${verification}`,
      '═══════════════════════════════════════════════════════════════════════════════',
      '',
      `  ${message}`,
      '',
    ];

    // Add details if provided
    if (details !== undefined) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push('  DETAILS');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push(`  ${JSON.stringify(details, null, 2).split('\n').join('\n  ')}`);
      lines.push('');
    }

    // Workflow failure - show prominently if present
    if (diagnostics.failure) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push('  ⚠️  WORKFLOW FAILURE DETECTED');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push(`  Message: ${diagnostics.failure.message}`);
      if (diagnostics.failure.nodeId) {
        lines.push(`  Node ID: ${diagnostics.failure.nodeId}`);
      }
      if (diagnostics.failure.taskId) {
        lines.push(`  Task ID: ${diagnostics.failure.taskId}`);
      }
      if (diagnostics.failure.tokenId) {
        lines.push(`  Token ID: ${diagnostics.failure.tokenId}`);
      }
      if (diagnostics.failure.error) {
        lines.push('  Error Details:');
        lines.push(
          `    ${JSON.stringify(diagnostics.failure.error, null, 2).split('\n').join('\n    ')}`,
        );
      }
      if (diagnostics.failure.metrics) {
        lines.push('  Metrics:');
        lines.push(
          `    ${JSON.stringify(diagnostics.failure.metrics, null, 2).split('\n').join('\n    ')}`,
        );
      }
      lines.push('');
    }

    // Token summary
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    lines.push('  TOKEN STRUCTURE');
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    lines.push(`  Root tokens:          ${diagnostics.tokenSummary.root}`);
    lines.push(`  Fan-out siblings:     ${diagnostics.tokenSummary.siblings}`);
    lines.push(`  Fan-in arrivals:      ${diagnostics.tokenSummary.fanInArrivals}`);
    lines.push(`  Fan-in continuations: ${diagnostics.tokenSummary.fanInContinuations}`);
    lines.push(`  Other:                ${diagnostics.tokenSummary.other}`);
    lines.push(`  Total:                ${diagnostics.tokenSummary.total}`);
    lines.push('');

    // Token creations
    if (diagnostics.tokenCreations.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push('  ALL TOKENS');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      const header =
        '  ID (last 8)   | Path ID                          | Parent    | Sibling   | Branch';
      lines.push(header);
      lines.push('  ' + '-'.repeat(header.length - 2));
      for (const tc of diagnostics.tokenCreations) {
        const id = tc.tokenId?.slice(-8) ?? 'null';
        const pathId = tc.pathId.padEnd(32);
        const parent = (tc.parentId?.slice(-8) ?? 'null').padEnd(9);
        const siblingGroup = (tc.siblingGroup?.slice(0, 9) ?? 'null').padEnd(9);
        const branch = `${tc.branchIndex}/${tc.branchTotal}`;
        lines.push(`  ${id.padEnd(13)} | ${pathId} | ${parent} | ${siblingGroup} | ${branch}`);
      }
      lines.push('');
    }

    // State writes
    if (diagnostics.stateWrites.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push('  STATE WRITES (in order)');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      for (const sw of diagnostics.stateWrites) {
        const valueStr = JSON.stringify(sw.value) ?? 'undefined';
        const truncated = valueStr.length > 60 ? valueStr.slice(0, 57) + '...' : valueStr;
        lines.push(`  [${sw.sequence}] ${sw.path} = ${truncated}`);
      }
      lines.push('');
    }

    // Branch writes
    if (diagnostics.branchWrites.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push('  BRANCH WRITES');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      for (const bw of diagnostics.branchWrites) {
        const tokenId = bw.tokenId?.slice(-8) ?? 'null';
        const outputStr = JSON.stringify(bw.output);
        const truncated = outputStr.length > 60 ? outputStr.slice(0, 57) + '...' : outputStr;
        lines.push(`  Token ${tokenId}: ${truncated}`);
      }
      lines.push('');
    }

    // Final output
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    lines.push('  FINAL OUTPUT');
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    if (diagnostics.finalOutput) {
      lines.push(`  ${JSON.stringify(diagnostics.finalOutput, null, 2).split('\n').join('\n  ')}`);
    } else {
      lines.push('  (no final output captured)');
    }
    lines.push('');

    // Snapshots (abbreviated)
    if (diagnostics.snapshots.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push(`  CONTEXT SNAPSHOTS (${diagnostics.snapshots.length} total)`);
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      // Show first and last snapshot for brevity
      const first = diagnostics.snapshots[0];
      lines.push(`  First [seq ${first.sequence}]:`);
      lines.push(`    input: ${JSON.stringify(first.input)}`);
      lines.push(`    state: ${JSON.stringify(first.state)}`);

      if (diagnostics.snapshots.length > 1) {
        const last = diagnostics.snapshots[diagnostics.snapshots.length - 1];
        lines.push(`  Last [seq ${last.sequence}]:`);
        lines.push(`    input: ${JSON.stringify(last.input)}`);
        lines.push(`    state: ${JSON.stringify(last.state)}`);
      }
      lines.push('');
    }

    // Errors
    if (diagnostics.errors.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      lines.push('  ERRORS');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      for (const err of diagnostics.errors) {
        lines.push(`  ${err.type}: ${JSON.stringify(err.payload)}`);
      }
      lines.push('');
    }

    // Workflow input
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    lines.push('  WORKFLOW INPUT');
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    lines.push(`  ${JSON.stringify(diagnostics.input, null, 2).split('\n').join('\n  ')}`);
    lines.push('');

    lines.push('═══════════════════════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Get a compact summary of the error.
   */
  get summary(): string {
    return `[${this.verification}] ${this.message.split('\n')[3]?.trim() ?? 'Verification failed'}`;
  }
}
