#!/usr/bin/env node

/**
 * Helper script to run a specific test by category and number.
 * Usage: pnpm test:<category> <number>
 *        pnpm test:<category> --latest
 * Example: pnpm test:workflows 03
 *          pnpm test:workflows --latest
 */

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const category = args[0];
const isLatest = args.includes('--latest');
const testNum = isLatest ? null : args[1];

if (!category) {
  console.error('Usage: tsx run-test.ts <category> <number>');
  console.error('       tsx run-test.ts <category> --latest');
  console.error('Example: tsx run-test.ts workflows 03');
  console.error('         tsx run-test.ts workflows --latest');
  process.exit(1);
}

if (!isLatest && !testNum) {
  console.error('Usage: tsx run-test.ts <category> <number>');
  console.error('       tsx run-test.ts <category> --latest');
  process.exit(1);
}

// Find the test files
const testsDir = join(process.cwd(), 'packages/tests/src/tests', category);
let files: string[];
try {
  files = readdirSync(testsDir);
} catch {
  console.error(`Category "${category}" not found.`);
  console.error('\nAvailable categories:');
  const categories = readdirSync(join(process.cwd(), 'packages/tests/src/tests'));
  categories.forEach((c) => console.error(`  ${c}`));
  process.exit(1);
}

let testFile: string | undefined;
let testPath: string;

if (isLatest) {
  // Find the most recently modified test file
  const testFiles = files
    .filter((f) => f.match(/^\d+-.*\.test\.ts$/))
    .map((f) => ({
      name: f,
      mtime: statSync(join(testsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (testFiles.length === 0) {
    console.error(`No tests found in category "${category}"`);
    process.exit(1);
  }

  testFile = testFiles[0].name;
  testPath = join('packages/tests/src/tests', category, testFile);
} else {
  // Find test by number
  const paddedNum = testNum!.padStart(2, '0');
  testFile = files.find((f) => f.startsWith(`${paddedNum}-`));

  if (!testFile) {
    console.error(`No ${category} test found starting with "${paddedNum}"`);
    console.error('\nAvailable tests:');
    files.forEach((f) => {
      const match = f.match(/^(\d+)-(.+)\.test\.ts$/);
      if (match) {
        console.error(`  ${match[1]}: ${match[2]}`);
      }
    });
    process.exit(1);
  }

  testPath = testNum!.padStart(2, '0');
}

// Run the test
console.log(`Running ${category} test: ${testFile}\n`);
try {
  execSync(`vitest run --config packages/tests/vitest.config.ts --reporter=verbose ${testPath}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch {
  process.exit(1);
}
