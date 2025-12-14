/**
 * wflow test command
 */

import { Command } from 'commander';
import { glob } from 'glob';
import * as path from 'node:path';
import { getExitCode, reportResults, runTestFiles } from '../runner/index.js';

export const testCommand = new Command('test')
  .description('Run .test files')
  .argument('[paths...]', 'Test files or directories to run', ['.'])
  .option('-f, --filter <pattern>', 'Run tests matching pattern')
  .option('-t, --tags <tags>', 'Run tests with specific tags (comma-separated)')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '30000')
  .option('--fail-fast', 'Stop on first failure')
  .option('--parallel', 'Run tests in parallel')
  .option('--max-concurrent <n>', 'Max parallel tests', '4')
  .option('--format <type>', 'Output format: pretty, json', 'pretty')
  .option('--no-color', 'Disable colored output')
  .option('-v, --verbose', 'Verbose output')
  .option('--api-key <key>', 'Wonder API key (or set WONDER_API_KEY env var)')
  .option('--api-url <url>', 'Wonder API URL (default: https://api.wflow.app)')
  .action(async (paths: string[], options) => {
    try {
      // Find all test files
      const testFiles: string[] = [];

      for (const p of paths) {
        const resolved = path.resolve(p);

        // Check if it's a file or directory
        const isDirectory = !p.includes('.test');

        if (isDirectory) {
          // Find all .test files in directory
          const files = await glob('**/*.test', {
            cwd: resolved,
            absolute: true,
          });
          testFiles.push(...files);
        } else {
          testFiles.push(resolved);
        }
      }

      if (testFiles.length === 0) {
        console.log('No test files found');
        process.exit(0);
      }

      // Parse options
      const runOptions = {
        filter: options.filter,
        tags: options.tags ? options.tags.split(',') : undefined,
        timeout_ms: parseInt(options.timeout, 10),
        failFast: options.failFast,
        parallel: options.parallel,
        maxConcurrent: parseInt(options.maxConcurrent, 10),
        apiKey: options.apiKey,
        baseUrl: options.apiUrl,
      };

      // Run tests
      const results = await runTestFiles(testFiles, runOptions);

      // Report results
      reportResults(results, {
        format: options.format as 'pretty' | 'json',
        verbose: options.verbose,
        noColor: !options.color,
      });

      // Exit with appropriate code
      process.exit(getExitCode(results));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });
