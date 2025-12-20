/**
 * Test result reporter
 */

import chalk from 'chalk';
import type { AssertionResult } from './assertions.js';
import type { TestCaseResult, TestSuiteResult } from './executor.js';

export interface ReporterOptions {
  format: 'pretty' | 'json';
  verbose?: boolean;
  noColor?: boolean;
}

/**
 * Format duration in human readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Report test results in pretty format
 */
function reportPretty(results: TestSuiteResult[], options: ReporterOptions): void {
  const c = options.noColor
    ? {
        green: (s: string) => s,
        red: (s: string) => s,
        yellow: (s: string) => s,
        gray: (s: string) => s,
        cyan: (s: string) => s,
        bold: (s: string) => s,
        dim: (s: string) => s,
      }
    : chalk;

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalDuration = 0;

  for (const suite of results) {
    console.log();
    console.log(`  ${c.cyan(suite.suite)}`);

    for (const test of suite.tests) {
      const icon = getStatusIcon(test.status, c);
      const duration = c.gray(`(${formatDuration(test.durationMs)})`);

      console.log(`    ${icon} ${test.name} ${duration}`);

      if (test.status === 'failed' && test.assertions) {
        for (const assertion of test.assertions) {
          if (!assertion.passed) {
            console.log(c.red(`        ✗ ${assertion.path}: ${assertion.message}`));
            if (options.verbose) {
              console.log(c.gray(`          Expected: ${JSON.stringify(assertion.expected)}`));
              console.log(c.gray(`          Actual:   ${JSON.stringify(assertion.actual)}`));
            }
          }
        }
        if (options.verbose && test.workflowRunId) {
          console.log(c.gray(`        workflowRunId: ${test.workflowRunId}`));
        }
      }

      if (test.status === 'error' && test.error) {
        console.log(c.red(`        Error: ${test.error.message}`));
        if (options.verbose && test.error.stack) {
          console.log(
            c.gray(
              test.error.stack
                .split('\n')
                .map((l) => `        ${l}`)
                .join('\n'),
            ),
          );
        }
      }
    }

    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalSkipped += suite.skipped;
    totalErrors += suite.errors;
    totalDuration += suite.durationMs;
  }

  console.log();
  console.log(
    `  ${c.bold(c.green(`${totalPassed} passing`))} ${c.gray(`(${formatDuration(totalDuration)})`)}`,
  );

  if (totalFailed > 0) {
    console.log(`  ${c.bold(c.red(`${totalFailed} failing`))}`);
  }

  if (totalSkipped > 0) {
    console.log(`  ${c.yellow(`${totalSkipped} skipped`)}`);
  }

  if (totalErrors > 0) {
    console.log(`  ${c.red(`${totalErrors} errors`)}`);
  }

  console.log();
}

/**
 * Get status icon for test result
 */
function getStatusIcon(
  status: TestCaseResult['status'],
  c: typeof chalk | Record<string, (s: string) => string>,
): string {
  switch (status) {
    case 'passed':
      return c.green('✓');
    case 'failed':
      return c.red('✗');
    case 'skipped':
      return c.yellow('○');
    case 'error':
      return c.red('!');
    default:
      return '?';
  }
}

/**
 * Report test results in JSON format
 */
function reportJson(results: TestSuiteResult[]): void {
  const summary = {
    suites: results.length,
    tests: results.reduce((sum, s) => sum + s.tests.length, 0),
    passed: results.reduce((sum, s) => sum + s.passed, 0),
    failed: results.reduce((sum, s) => sum + s.failed, 0),
    skipped: results.reduce((sum, s) => sum + s.skipped, 0),
    errors: results.reduce((sum, s) => sum + s.errors, 0),
    durationMs: results.reduce((sum, s) => sum + s.durationMs, 0),
  };

  const output = {
    summary,
    suites: results.map((suite) => ({
      name: suite.suite,
      file: suite.file,
      durationMs: suite.durationMs,
      passed: suite.passed,
      failed: suite.failed,
      skipped: suite.skipped,
      errors: suite.errors,
      tests: suite.tests.map((test) => ({
        name: test.name,
        status: test.status,
        durationMs: test.durationMs,
        assertions: test.assertions?.map((a) => ({
          path: a.path,
          passed: a.passed,
          expected: a.expected,
          actual: a.actual,
          message: a.message,
        })),
        error: test.error
          ? {
              message: test.error.message,
              stack: test.error.stack,
            }
          : undefined,
      })),
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Report test results
 */
export function reportResults(results: TestSuiteResult[], options: ReporterOptions): void {
  if (options.format === 'json') {
    reportJson(results);
  } else {
    reportPretty(results, options);
  }
}

/**
 * Get exit code based on results
 */
export function getExitCode(results: TestSuiteResult[]): number {
  const hasFailures = results.some((s) => s.failed > 0 || s.errors > 0);
  return hasFailures ? 1 : 0;
}
