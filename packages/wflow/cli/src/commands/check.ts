/**
 * wflow check command
 */

import {
  DiagnosticSeverity,
  getFileType,
  parseAction,
  parsePersona,
  parseTask,
  parseTest,
  parseTool,
  parseWorkflow,
  validatePersonaDocument,
  validateToolDocument,
  type Diagnostic,
} from '@wonder/wflow';
import chalk from 'chalk';
import { Command } from 'commander';
import { glob } from 'glob';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface CheckResult {
  path: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export const checkCommand = new Command('check')
  .description('Check files for errors and warnings')
  .argument('[paths...]', 'Files or directories to check', ['.'])
  .option('--strict', 'Treat warnings as errors')
  .option('--format <type>', 'Output format: pretty, json', 'pretty')
  .option('--quiet', 'Only output on errors')
  .option('--no-color', 'Disable colored output')
  .action(async (paths: string[], options) => {
    try {
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
          const found = await glob('**/*.{wflow,task,action,test,persona,tool}', {
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
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });

function checkFile(filePath: string): CheckResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileType = getFileType(filePath);

  let diagnostics: Diagnostic[] = [];

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

function reportJson(results: CheckResult[]): void {
  const output = {
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
