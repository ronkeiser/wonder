/**
 * wflow CLI - Workflow testing and execution
 */

import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { deployCommand } from './commands/deploy.js';
import { diffCommand } from './commands/diff.js';
import { pullCommand } from './commands/pull.js';
import { testCommand } from './commands/test.js';

const program = new Command();

program.name('wflow').description('CLI for wflow workflow testing and validation').version('0.0.1');

// Register commands
program.addCommand(testCommand);
program.addCommand(checkCommand);
program.addCommand(deployCommand);
program.addCommand(pullCommand);
program.addCommand(diffCommand);

// Parse arguments
program.parse();
