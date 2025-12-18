#!/usr/bin/env node

/**
 * Helper script to run a specific foundation test by number.
 * Usage: pnpm test:f <number>
 * Example: pnpm test:f 03
 */

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const testNum = process.argv[2];

if (!testNum) {
  console.error('Usage: pnpm test:f <number>');
  console.error('Example: pnpm test:f 03');
  process.exit(1);
}

// Pad the number to 2 digits
const paddedNum = testNum.padStart(2, '0');

// Find the test file
const foundationDir = join(process.cwd(), 'packages/tests/src/tests/foundation');
const files = readdirSync(foundationDir);
const testFile = files.find((f) => f.startsWith(`${paddedNum}-`));

if (!testFile) {
  console.error(`No foundation test found starting with "${paddedNum}"`);
  console.error('\nAvailable tests:');
  files.forEach((f) => {
    const match = f.match(/^(\d+)-(.+)\.test\.ts$/);
    if (match) {
      console.error(`  ${match[1]}: ${match[2]}`);
    }
  });
  process.exit(1);
}

// Run the test
console.log(`Running foundation test: ${testFile}\n`);
try {
  execSync(`vitest run --config packages/tests/vitest.config.ts --reporter=verbose ${paddedNum}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch (error) {
  process.exit(1);
}
