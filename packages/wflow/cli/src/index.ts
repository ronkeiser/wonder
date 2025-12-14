#!/usr/bin/env node

/**
 * wflow CLI - Workflow testing and execution
 */

import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { testCommand } from './commands/test.js';

const program = new Command();

program.name('wflow').description('CLI for wflow workflow testing and validation').version('0.0.1');

// Register commands
program.addCommand(testCommand);
program.addCommand(checkCommand);

// Parse arguments
program.parse();
