/**
 * wflow check command
 *
 * Supports two modes:
 * 1. File mode (default): Check individual files for parse errors and document validation
 * 2. Workspace mode: Check entire workspace with cross-file reference validation
 */

import {
  DiagnosticSeverity,
  formatReference,
  getFileType,
  parseAction,
  parseModel,
  parsePersona,
  parseTask,
  parseTest,
  parseTool,
  parseWorkflow,
  validateModelDocument,
  validatePersonaDocument,
  validateToolDocument,
  validateWorkspace,
  type Diagnostic,
  type StandardLibraryManifest,
  type WorkspaceValidationResult,
} from '@wonder/wflow';
import chalk from 'chalk';
import { Command } from 'commander';
import { glob } from 'glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isWorkspaceRoot, loadWorkspace } from '../workspace/loader';

interface CheckResult {
  path: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

interface WorkspaceCheckResult {
  workspace: string;
  fileResults: CheckResult[];
  validationResult: WorkspaceValidationResult;
  totalErrors: number;
  totalWarnings: number;
}

export const checkCommand = new Command('check')
  .description('Check files for errors and warnings')
  .argument('[paths...]', 'Files or directories to check', ['.'])
  .option('--workspace', 'Enable workspace mode with cross-file validation')
  .option('--strict', 'Treat warnings as errors')
  .option('--format <type>', 'Output format: pretty, json', 'pretty')
  .option('--quiet', 'Only output on errors')
  .option('--no-color', 'Disable colored output')
  .option('--api-url <url>', 'API URL for fetching standard library manifest')
  .action(async (paths: string[], options) => {
    try {
      // Determine if we should run in workspace mode
      let workspaceMode = options.workspace;
      let workspaceRoot: string | null = null;

      // Auto-detect workspace mode if not explicitly set
      if (!workspaceMode && paths.length === 1) {
        const resolved = path.resolve(paths[0]);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
          workspaceMode = await isWorkspaceRoot(resolved);
          if (workspaceMode) {
            workspaceRoot = resolved;
          }
        }
      }

      if (workspaceMode) {
        await runWorkspaceCheck(paths, options, workspaceRoot);
      } else {
        await runFileCheck(paths, options);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });

/**
 * Run file-by-file check (original behavior)
 */
async function runFileCheck(
  paths: string[],
  options: { strict?: boolean; format?: string; quiet?: boolean; color?: boolean },
): Promise<void> {
  // Find all wflow-related files
  const files: string[] = [];

  for (const p of paths) {
    const resolved = path.resolve(p);

    // Check if path exists and is a file or directory
    let stats;
    try {
      stats = fs.statSync(resolved);
    } catch {
      console.error(`Path not found: ${p}`);
      continue;
    }

    if (stats.isFile()) {
      files.push(resolved);
    } else if (stats.isDirectory()) {
      const found = await glob('**/*.{wflow,task,action,test,persona,tool,model}', {
        cwd: resolved,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**'],
      });
      files.push(...found);
    }
  }

  if (files.length === 0) {
    if (!options.quiet) {
      console.log('No files found to check');
    }
    process.exit(0);
  }

  // Check all files
  const results: CheckResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of files) {
    const result = checkFile(file);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Report results
  if (options.format === 'json') {
    reportJson(results);
  } else {
    reportPretty(results, options);
  }

  // Exit code
  const hasErrors = totalErrors > 0 || (options.strict && totalWarnings > 0);
  process.exit(hasErrors ? 1 : 0);
}

/**
 * Run workspace-level check with cross-file validation
 */
async function runWorkspaceCheck(
  paths: string[],
  options: {
    strict?: boolean;
    format?: string;
    quiet?: boolean;
    color?: boolean;
    apiUrl?: string;
  },
  detectedRoot: string | null,
): Promise<void> {
  // Determine workspace root
  const workspaceRoot = detectedRoot ?? path.resolve(paths[0] ?? '.');

  if (!options.quiet && options.format !== 'json') {
    console.log(`\nChecking workspace: ${workspaceRoot}\n`);
  }

  // Load workspace
  const workspace = await loadWorkspace(workspaceRoot);

  if (workspace.definitions.size === 0) {
    if (!options.quiet) {
      console.log('No definition files found in workspace');
    }
    process.exit(0);
  }

  // Optionally fetch standard library manifest for validation
  let standardLibrary: StandardLibraryManifest | undefined;
  if (options.apiUrl) {
    try {
      standardLibrary = await fetchStandardLibraryManifest(options.apiUrl);
    } catch (error) {
      if (!options.quiet && options.format !== 'json') {
        console.warn(
          `Warning: Could not fetch standard library manifest: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  // Check individual files first (parse errors, document validation)
  const fileResults: CheckResult[] = [];

  for (const def of workspace.definitions.values()) {
    const result = checkFile(def.filePath);
    fileResults.push(result);
  }

  // Run workspace-level validation (cross-file references, cycles)
  const validationResult = validateWorkspace(workspace, standardLibrary);

  // Merge file diagnostics with workspace diagnostics
  for (const [filePath, diagnostics] of validationResult.diagnosticsByFile) {
    let fileResult = fileResults.find((r) => r.path === filePath);

    if (!fileResult) {
      fileResult = { path: filePath, errors: [], warnings: [] };
      fileResults.push(fileResult);
    }

    for (const diag of diagnostics) {
      if (diag.severity === DiagnosticSeverity.Error) {
        // Avoid duplicates
        if (!fileResult.errors.some((e) => e.message === diag.message)) {
          fileResult.errors.push(diag);
        }
      } else if (diag.severity === DiagnosticSeverity.Warning) {
        if (!fileResult.warnings.some((w) => w.message === diag.message)) {
          fileResult.warnings.push(diag);
        }
      }
    }
  }

  // Calculate totals
  const totalErrors = fileResults.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = fileResults.reduce((sum, r) => sum + r.warnings.length, 0);

  const wsResult: WorkspaceCheckResult = {
    workspace: workspaceRoot,
    fileResults,
    validationResult,
    totalErrors,
    totalWarnings,
  };

  // Report results
  if (options.format === 'json') {
    reportWorkspaceJson(wsResult);
  } else {
    reportWorkspacePretty(wsResult, options);
  }

  // Exit code
  const hasErrors = totalErrors > 0 || (options.strict && totalWarnings > 0);
  process.exit(hasErrors ? 1 : 0);
}

/**
 * Fetch standard library manifest from API
 */
async function fetchStandardLibraryManifest(apiUrl: string): Promise<StandardLibraryManifest> {
  const url = new URL('/standard-library/manifest', apiUrl);
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as StandardLibraryManifest;
}

function checkFile(filePath: string): CheckResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileType = getFileType(filePath);

  const diagnostics: Diagnostic[] = [];

  try {
    switch (fileType) {
      case 'wflow': {
        const result = parseWorkflow(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        }
        // TODO: Add structural validation
        break;
      }
      case 'task': {
        const result = parseTask(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        }
        break;
      }
      case 'action': {
        const result = parseAction(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        }
        break;
      }
      case 'test': {
        const result = parseTest(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        }
        break;
      }
      case 'persona': {
        const result = parsePersona(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        } else if (result.document) {
          diagnostics.push(...validatePersonaDocument(result.document, result.imports));
        }
        break;
      }
      case 'tool': {
        const result = parseTool(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        } else if (result.document) {
          diagnostics.push(...validateToolDocument(result.document, result.imports));
        }
        break;
      }
      case 'model': {
        const result = parseModel(content, filePath);
        if (result.error) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: `Parse error: ${result.error.message}`,
            source: 'wflow',
            code: 'PARSE_ERROR',
          });
        } else if (result.document) {
          diagnostics.push(...validateModelDocument(result.document, result.imports));
        }
        break;
      }
      default:
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          message: `Unknown file type: ${filePath}`,
          source: 'wflow',
          code: 'UNKNOWN_FILE_TYPE',
        });
    }
  } catch (e) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      message: `Error checking file: ${e instanceof Error ? e.message : String(e)}`,
      source: 'wflow',
      code: 'CHECK_ERROR',
    });
  }

  return {
    path: filePath,
    errors: diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error),
    warnings: diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning),
  };
}

function reportPretty(results: CheckResult[], options: { quiet?: boolean; color?: boolean }): void {
  const c =
    options.color === false
      ? {
          red: (s: string) => s,
          yellow: (s: string) => s,
          green: (s: string) => s,
          gray: (s: string) => s,
          cyan: (s: string) => s,
        }
      : chalk;

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const result of results) {
    const hasIssues = result.errors.length > 0 || result.warnings.length > 0;

    if (options.quiet && !hasIssues) continue;

    console.log();
    console.log(`  ${result.path}`);

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`    ${c.green('✓')} No issues`);
    }

    for (const error of result.errors) {
      const loc = error.range.start;
      console.log(`    ${c.red('✗')} error  Line ${loc.line + 1}: ${error.message}`);
      totalErrors++;
    }

    for (const warning of result.warnings) {
      const loc = warning.range.start;
      console.log(`    ${c.yellow('⚠')} warn   Line ${loc.line + 1}: ${warning.message}`);
      totalWarnings++;
    }
  }

  console.log();

  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(c.green(`  ✓ All ${results.length} files passed`));
  } else {
    console.log(
      c.gray(
        `  Found ${totalErrors} error${totalErrors !== 1 ? 's' : ''} and ${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''} in ${results.length} file${results.length !== 1 ? 's' : ''}`,
      ),
    );
  }

  console.log();
}

function reportWorkspacePretty(
  result: WorkspaceCheckResult,
  options: { quiet?: boolean; color?: boolean },
): void {
  const c =
    options.color === false
      ? {
          red: (s: string) => s,
          yellow: (s: string) => s,
          green: (s: string) => s,
          gray: (s: string) => s,
          cyan: (s: string) => s,
          bold: (s: string) => s,
        }
      : chalk;

  // Report file results
  for (const fileResult of result.fileResults) {
    const hasIssues = fileResult.errors.length > 0 || fileResult.warnings.length > 0;

    if (options.quiet && !hasIssues) continue;

    console.log(`  ${fileResult.path}`);

    if (fileResult.errors.length === 0 && fileResult.warnings.length === 0) {
      console.log(`    ${c.green('✓')} No issues`);
    }

    for (const error of fileResult.errors) {
      const loc = error.range.start;
      console.log(`    ${c.red('✗')} error  Line ${loc.line + 1}: ${error.message}`);
    }

    for (const warning of fileResult.warnings) {
      const loc = warning.range.start;
      console.log(`    ${c.yellow('⚠')} warn   Line ${loc.line + 1}: ${warning.message}`);
    }

    console.log();
  }

  // Report dependency cycles separately if any
  if (result.validationResult.cycles.length > 0) {
    console.log(c.bold('\n  Dependency Cycles:\n'));
    for (const cycle of result.validationResult.cycles) {
      const cycleStr = cycle.map(formatReference).join(' → ');
      console.log(`    ${c.red('✗')} ${cycleStr}`);
    }
    console.log();
  }

  // Summary
  if (result.totalErrors === 0 && result.totalWarnings === 0) {
    console.log(
      c.green(
        `  ✓ Workspace check passed (${result.fileResults.length} definitions, ${result.validationResult.dependencyGraph.size} dependencies)`,
      ),
    );
  } else {
    console.log(
      c.gray(
        `  Found ${result.totalErrors} error${result.totalErrors !== 1 ? 's' : ''} and ${result.totalWarnings} warning${result.totalWarnings !== 1 ? 's' : ''} in ${result.fileResults.length} file${result.fileResults.length !== 1 ? 's' : ''}`,
      ),
    );
  }

  console.log();
}

function reportJson(results: CheckResult[]): void {
  const output = {
    mode: 'file',
    files: results.map((r) => ({
      path: r.path,
      errors: r.errors.map((d) => ({
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: 'error',
        code: d.code,
        message: d.message,
      })),
      warnings: r.warnings.map((d) => ({
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: 'warning',
        code: d.code,
        message: d.message,
      })),
    })),
    summary: {
      files: results.length,
      errors: results.reduce((sum, r) => sum + r.errors.length, 0),
      warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

function reportWorkspaceJson(result: WorkspaceCheckResult): void {
  const output = {
    mode: 'workspace',
    workspace: result.workspace,
    files: result.fileResults.map((r) => ({
      path: r.path,
      errors: r.errors.map((d) => ({
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: 'error',
        code: d.code,
        message: d.message,
      })),
      warnings: r.warnings.map((d) => ({
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: 'warning',
        code: d.code,
        message: d.message,
      })),
    })),
    cycles: result.validationResult.cycles.map((cycle) => cycle.map(formatReference)),
    summary: {
      definitions: result.fileResults.length,
      dependencies: result.validationResult.dependencyGraph.size,
      cycles: result.validationResult.cycles.length,
      errors: result.totalErrors,
      warnings: result.totalWarnings,
      valid: result.validationResult.valid,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}
