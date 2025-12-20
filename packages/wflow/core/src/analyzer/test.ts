/**
 * Test document validation and analysis
 */

import type { ImportsMap } from '../parser/index.js';
import type {
  AssertionObject,
  AssertionValue,
  Diagnostic,
  MockDecl,
  MockResponseDecl,
  TestCaseDecl,
  TestDocument,
} from '../types/index.js';
import { DiagnosticSeverity } from '../types/index.js';

/**
 * Allowed properties for test document validation
 */
export const TEST_DOCUMENT_ALLOWED_PROPS = new Set([
  'imports',
  'test_suite',
  'description',
  'mocks',
  'fixtures',
  'tests',
  'groups',
  'hooks',
  'config',
  'coverage',
]);

export const TEST_CASE_ALLOWED_PROPS = new Set([
  'description',
  'target',
  'input',
  'context',
  'mocks',
  'timeoutMs',
  'assert',
  'snapshot',
  'tags',
  'skip',
  'only',
]);

export const MOCK_DECL_ALLOWED_PROPS = new Set([
  'action',
  'response',
  'track_calls',
  'returns',
  'sequence',
  'when',
  'throws',
  'delay_ms',
]);

export const MOCK_RESPONSE_ALLOWED_PROPS = new Set([
  'returns',
  'sequence',
  'when',
  'throws',
  'delay_ms',
]);

export const ASSERTION_PRIMITIVES = new Set([
  'eq',
  'not_eq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'matches',
  'starts_with',
  'ends_with',
  'length',
  'min_length',
  'max_length',
  'type',
  'exists',
  'not_empty',
  'has_keys',
  'every',
  'some',
  'not',
]);

export const TEST_CONFIG_ALLOWED_PROPS = new Set([
  'parallel',
  'max_concurrent',
  'timeoutMs',
  'fail_fast',
]);

export const TEST_COVERAGE_ALLOWED_PROPS = new Set(['targets', 'thresholds']);

export const TEST_HOOKS_ALLOWED_PROPS = new Set([
  'before_all',
  'after_all',
  'before_each',
  'after_each',
]);

/**
 * Result of test document analysis
 */
export interface TestAnalysis {
  /** All test names */
  testNames: string[];
  /** Tests with 'only' flag */
  onlyTests: string[];
  /** Tests with 'skip' flag */
  skippedTests: string[];
  /** All mock aliases referenced */
  mockAliases: string[];
  /** All import aliases referenced as targets */
  targetAliases: string[];
  /** Groups and their tests */
  groups: Map<string, string[]>;
}

/**
 * Check if a value is a MockResponseDecl (shorthand form)
 */
function isMockResponseDecl(value: MockDecl | MockResponseDecl): value is MockResponseDecl {
  return 'returns' in value || 'sequence' in value || 'when' in value || 'throws' in value;
}

/**
 * Validate assertion value structure
 */
function validateAssertionValue(
  value: AssertionValue,
  path: string,
  diagnostics: Diagnostic[],
  line: number,
): void {
  if (value === null || typeof value !== 'object') {
    // Primitive value - valid as implicit eq
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateAssertionValue(item, `${path}[${index}]`, diagnostics, line);
    });
    return;
  }

  // Object assertion
  const assertionObj = value as AssertionObject;
  const keys = Object.keys(assertionObj);

  for (const key of keys) {
    if (!ASSERTION_PRIMITIVES.has(key)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: 0 },
          end: { line, character: 100 },
        },
        message: `Unknown assertion primitive '${key}' at ${path}`,
        source: 'wflow',
        code: 'UNKNOWN_ASSERTION',
      });
    }
  }

  // Validate nested assertions
  if (assertionObj.every !== undefined) {
    validateAssertionValue(assertionObj.every, `${path}.every`, diagnostics, line);
  }
  if (assertionObj.some !== undefined) {
    validateAssertionValue(assertionObj.some, `${path}.some`, diagnostics, line);
  }
  if (assertionObj.not !== undefined) {
    validateAssertionValue(assertionObj.not, `${path}.not`, diagnostics, line);
  }
}

/**
 * Validate a test document
 */
export function validateTestDocument(doc: TestDocument, imports: ImportsMap): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Check for unknown top-level properties
  for (const key of Object.keys(doc)) {
    if (key.startsWith('_')) continue;
    if (!TEST_DOCUMENT_ALLOWED_PROPS.has(key)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: key.length },
        },
        message: `Unknown property '${key}' in test document`,
        source: 'wflow',
        code: 'UNKNOWN_PROPERTY',
      });
    }
  }

  // Validate test_suite is present
  if (!doc.test_suite) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'test_suite'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate tests
  if (doc.tests) {
    for (const [testName, testCase] of Object.entries(doc.tests)) {
      validateTestCase(testName, testCase, imports, diagnostics);
    }
  }

  // Validate mocks reference valid imports
  if (doc.mocks) {
    for (const [mockAlias] of Object.entries(doc.mocks)) {
      // Mock alias should reference an import
      if (!imports.byAlias.has(mockAlias)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          message: `Mock '${mockAlias}' does not reference an imported action`,
          source: 'wflow',
          code: 'UNRESOLVED_MOCK',
        });
      }
    }
  }

  // Validate groups reference existing tests
  if (doc.groups && doc.tests) {
    const testNames = new Set(Object.keys(doc.tests));
    for (const [groupName, group] of Object.entries(doc.groups)) {
      if (group.tests) {
        for (const testRef of group.tests) {
          if (!testNames.has(testRef)) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              message: `Group '${groupName}' references unknown test '${testRef}'`,
              source: 'wflow',
              code: 'UNKNOWN_TEST_REF',
            });
          }
        }
      }
    }
  }

  // Validate hooks reference valid actions
  if (doc.hooks) {
    const hookTypes = ['before_all', 'after_all', 'before_each', 'after_each'];
    for (const hookType of hookTypes) {
      const hooks = doc.hooks[hookType as keyof typeof doc.hooks];
      if (hooks) {
        for (const hook of hooks) {
          if (!imports.byAlias.has(hook.action)) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              message: `Hook action '${hook.action}' is not imported`,
              source: 'wflow',
              code: 'UNRESOLVED_IMPORT',
            });
          }
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Validate a single test case
 */
function validateTestCase(
  testName: string,
  testCase: TestCaseDecl,
  imports: ImportsMap,
  diagnostics: Diagnostic[],
): void {
  const line = testCase._loc?.start.line ?? 0;

  // Check for unknown properties
  for (const key of Object.keys(testCase)) {
    if (key.startsWith('_')) continue;
    if (!TEST_CASE_ALLOWED_PROPS.has(key)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line, character: 0 },
          end: { line, character: 100 },
        },
        message: `Unknown property '${key}' in test '${testName}'`,
        source: 'wflow',
        code: 'UNKNOWN_PROPERTY',
      });
    }
  }

  // Validate target is present and references an import
  if (!testCase.target) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line, character: 0 },
        end: { line, character: 100 },
      },
      message: `Test '${testName}' is missing required 'target' property`,
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  } else if (!imports.byAlias.has(testCase.target)) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line, character: 0 },
        end: { line, character: 100 },
      },
      message: `Test '${testName}' references unknown target '${testCase.target}'`,
      source: 'wflow',
      code: 'UNRESOLVED_IMPORT',
    });
  }

  // Validate assertions
  if (testCase.assert) {
    for (const [path, assertion] of Object.entries(testCase.assert)) {
      validateAssertionValue(assertion, path, diagnostics, line);
    }
  }

  // Warn if no assertions and no snapshot
  if (!testCase.assert && !testCase.snapshot) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: { line, character: 0 },
        end: { line, character: 100 },
      },
      message: `Test '${testName}' has no assertions or snapshot`,
      source: 'wflow',
      code: 'NO_ASSERTIONS',
    });
  }
}

/**
 * Analyze a test document to extract metadata
 */
export function analyzeTestDocument(doc: TestDocument): TestAnalysis {
  const testNames: string[] = [];
  const onlyTests: string[] = [];
  const skippedTests: string[] = [];
  const mockAliases: string[] = [];
  const targetAliases: string[] = [];
  const groups = new Map<string, string[]>();

  // Collect test names and flags
  if (doc.tests) {
    for (const [name, testCase] of Object.entries(doc.tests)) {
      testNames.push(name);
      if (testCase.only) onlyTests.push(name);
      if (testCase.skip) skippedTests.push(name);
      if (testCase.target) targetAliases.push(testCase.target);
    }
  }

  // Collect mock aliases
  if (doc.mocks) {
    mockAliases.push(...Object.keys(doc.mocks));
  }

  // Collect groups
  if (doc.groups) {
    for (const [name, group] of Object.entries(doc.groups)) {
      groups.set(name, group.tests || []);
    }
  }

  return {
    testNames,
    onlyTests,
    skippedTests,
    mockAliases,
    targetAliases: [...new Set(targetAliases)],
    groups,
  };
}

/**
 * Get all tests that should be run (respecting only/skip flags)
 */
export function getTestsToRun(
  analysis: TestAnalysis,
  filter?: string | RegExp,
  tags?: string[],
  doc?: TestDocument,
): string[] {
  let tests = analysis.testNames;

  // If any test has 'only', run only those
  if (analysis.onlyTests.length > 0) {
    tests = analysis.onlyTests;
  }

  // Filter out skipped tests
  tests = tests.filter((t) => !analysis.skippedTests.includes(t));

  // Apply name filter
  if (filter) {
    const regex = typeof filter === 'string' ? new RegExp(filter, 'i') : filter;
    tests = tests.filter((t) => regex.test(t));
  }

  // Apply tag filter
  if (tags && tags.length > 0 && doc?.tests) {
    tests = tests.filter((t) => {
      const testTags = doc.tests?.[t]?.tags || [];
      return tags.some((tag) => testTags.includes(tag));
    });
  }

  return tests;
}
