#!/usr/bin/env node

/**
 * Generates VSCode tasks, settings, and package.json scripts based on directory structure.
 *
 * Discovers:
 * - Test categories from packages/tests/src/tests/
 * - Services from services/
 *
 * Updates:
 * - .vscode/tasks.json
 * - .vscode/settings.json (VsCodeTaskButtons)
 * - package.json (deploy:* and test:* scripts)
 * - packages/scripts/package.json (test:* scripts)
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as jsonc from 'jsonc-parser';

// Get root of monorepo (packages/scripts/src -> packages/scripts -> packages -> root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

// ============================================================================
// Types
// ============================================================================

interface TestFile {
  category: string;
  number: string;
  name: string;
  fileName: string;
}

interface Service {
  dirName: string;
  packageName: string;
}

interface Task {
  label: string;
  type: string;
  command: string;
  args: string[];
  group: string;
  presentation: {
    reveal: string;
    panel: string;
  };
}

interface TaskButtonItem {
  label: string;
  task: string;
  description: string;
}

interface TaskButtonGroup {
  label: string;
  tooltip: string;
  tasks: TaskButtonItem[];
}

type TaskButton = { label: string; task: string; tooltip: string } | TaskButtonGroup;

// ============================================================================
// Utilities
// ============================================================================

function toTitleCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// Discovery
// ============================================================================

function discoverTests(testsDir: string): TestFile[] {
  const tests: TestFile[] = [];
  const categories = readdirSync(testsDir).filter((f) => {
    const fullPath = join(testsDir, f);
    return statSync(fullPath).isDirectory();
  });

  for (const category of categories) {
    const categoryDir = join(testsDir, category);
    const files = readdirSync(categoryDir);

    for (const file of files) {
      const match = file.match(/^(\d+)-(.+)\.test\.ts$/);
      if (match) {
        tests.push({
          category,
          number: match[1],
          name: match[2],
          fileName: file,
        });
      }
    }
  }

  return tests.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.number.localeCompare(b.number);
  });
}

function discoverServices(servicesDir: string): Service[] {
  const services: Service[] = [];
  const dirs = readdirSync(servicesDir).filter((f) => {
    const fullPath = join(servicesDir, f);
    return statSync(fullPath).isDirectory();
  });

  for (const dirName of dirs) {
    const packageJsonPath = join(servicesDir, dirName, 'package.json');
    if (existsSync(packageJsonPath)) {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      services.push({
        dirName,
        packageName: pkg.name,
      });
    }
  }

  return services.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

// ============================================================================
// Test Task Generation
// ============================================================================

function generateTestTask(test: TestFile): Task {
  const categoryTitle = toTitleCase(test.category);
  const testTitle = toTitleCase(test.name);

  return {
    label: `Test: ${categoryTitle} ${test.number} ${testTitle}`,
    type: 'shell',
    command: 'pnpm',
    args: [`test:${test.category}`, test.number],
    group: 'test',
    presentation: {
      reveal: 'always',
      panel: 'shared',
    },
  };
}

function generateTestCategoryTasks(tests: TestFile[]): Task[] {
  const categories = [...new Set(tests.map((t) => t.category))];
  const tasks: Task[] = [];

  for (const category of categories) {
    const categoryTitle = toTitleCase(category);

    // "Run All" task for category
    tasks.push({
      label: `Test: ${categoryTitle} All`,
      type: 'shell',
      command: 'vitest',
      args: ['run', '--config', 'packages/tests/vitest.config.ts', `packages/tests/src/tests/${category}`],
      group: 'test',
      presentation: {
        reveal: 'always',
        panel: 'shared',
      },
    });

    // "Latest" task for category
    tasks.push({
      label: `Test: ${categoryTitle} Latest`,
      type: 'shell',
      command: 'pnpm',
      args: [`test:${category}`, '--latest'],
      group: 'test',
      presentation: {
        reveal: 'always',
        panel: 'shared',
      },
    });
  }

  return tasks;
}

function generateTestTaskButtons(tests: TestFile[]): TaskButtonGroup {
  const categories = [...new Set(tests.map((t) => t.category))];
  const buttonTasks: TaskButtonItem[] = [
    {
      label: 'Run All Tests',
      task: 'Test',
      description: 'pnpm test',
    },
    {
      label: 'Current File',
      task: 'Test: Current File',
      description: 'Run test for the file open in editor',
    },
  ];

  for (const category of categories) {
    const categoryTitle = toTitleCase(category);
    const categoryTests = tests.filter((t) => t.category === category);

    buttonTasks.push({
      label: `All ${categoryTitle}`,
      task: `Test: ${categoryTitle} All`,
      description: `Run all ${category} tests`,
    });

    buttonTasks.push({
      label: `${categoryTitle} Latest`,
      task: `Test: ${categoryTitle} Latest`,
      description: `Run the most recent ${category} test`,
    });

    for (const test of categoryTests) {
      const testTitle = toTitleCase(test.name);
      buttonTasks.push({
        label: `${test.number} ${testTitle}`,
        task: `Test: ${categoryTitle} ${test.number} ${testTitle}`,
        description: test.fileName,
      });
    }
  }

  return {
    label: '$(beaker) Test',
    tooltip: 'Run tests',
    tasks: buttonTasks,
  };
}

// ============================================================================
// Deploy Task Generation
// ============================================================================

function generateDeployTasks(services: Service[]): Task[] {
  const tasks: Task[] = [];

  for (const service of services) {
    const title = toTitleCase(service.dirName);
    tasks.push({
      label: `Deploy: ${title}`,
      type: 'shell',
      command: 'pnpm',
      args: [`deploy:${service.dirName}`],
      group: 'none',
      presentation: {
        reveal: 'always',
        panel: 'shared',
      },
    });
  }

  return tasks;
}

function generateDeployTaskButtons(services: Service[]): TaskButtonGroup {
  const buttonTasks: TaskButtonItem[] = [
    {
      label: 'Deploy All',
      task: 'Deploy All',
      description: 'Deploy all services',
    },
  ];

  for (const service of services) {
    const title = toTitleCase(service.dirName);
    buttonTasks.push({
      label: title,
      task: `Deploy: ${title}`,
      description: `Deploy ${service.dirName} service`,
    });
  }

  return {
    label: '$(cloud-upload) Deploy',
    tooltip: 'Deploy services',
    tasks: buttonTasks,
  };
}

// ============================================================================
// File Updates
// ============================================================================

function updateTasksJson(
  tasksPath: string,
  testTasks: Task[],
  deployTasks: Task[]
): void {
  const content = readFileSync(tasksPath, 'utf-8');
  const parsed = jsonc.parse(content);

  // Filter out generated tasks (Test: and Deploy:)
  const preservedTasks = parsed.tasks.filter(
    (t: Task) =>
      !t.label.startsWith('Test:') &&
      !t.label.startsWith('Deploy:') &&
      t.label !== 'Test' &&
      t.label !== 'Deploy All' &&
      t.group !== 'test'
  );

  // Base test tasks
  const baseTestTasks: Task[] = [
    {
      label: 'Test',
      type: 'shell',
      command: 'pnpm',
      args: ['test'],
      group: 'test',
      presentation: {
        reveal: 'always',
        panel: 'shared',
      },
    },
    {
      label: 'Test: Current File',
      type: 'shell',
      command: 'pnpm',
      args: ['test', '${relativeFile}'],
      group: 'test',
      presentation: {
        reveal: 'always',
        panel: 'shared',
      },
    },
  ];

  // Deploy All task
  const deployAllTask: Task = {
    label: 'Deploy All',
    type: 'shell',
    command: 'pnpm',
    args: ['deploy:all'],
    group: 'none',
    presentation: {
      reveal: 'always',
      panel: 'shared',
    },
  };

  parsed.tasks = [
    ...preservedTasks,
    deployAllTask,
    ...deployTasks,
    ...baseTestTasks,
    ...testTasks,
  ];

  writeFileSync(tasksPath, JSON.stringify(parsed, null, 2) + '\n');
}

function updateSettingsJson(
  settingsPath: string,
  testButton: TaskButtonGroup,
  deployButton: TaskButtonGroup
): void {
  const content = readFileSync(settingsPath, 'utf-8');
  const parsed = jsonc.parse(content);

  // Filter out generated buttons (beaker and cloud-upload)
  const preservedButtons = (parsed['VsCodeTaskButtons.tasks'] as TaskButton[]).filter(
    (b) => !b.label.includes('beaker') && !b.label.includes('cloud-upload')
  );

  parsed['VsCodeTaskButtons.tasks'] = [...preservedButtons, deployButton, testButton];

  writeFileSync(settingsPath, JSON.stringify(parsed, null, 2) + '\n');
}

function updateRootPackageJson(
  packagePath: string,
  testCategories: string[],
  services: Service[]
): void {
  const content = readFileSync(packagePath, 'utf-8');
  const parsed = jsonc.parse(content);

  const scripts = parsed.scripts as Record<string, string>;

  // Remove old test:* scripts (except test:all) and deploy:* scripts (except deploy:all)
  for (const key of Object.keys(scripts)) {
    if (key.startsWith('test:') && key !== 'test:all') {
      delete scripts[key];
    }
    if (key.startsWith('deploy:') && key !== 'deploy:all') {
      delete scripts[key];
    }
  }

  // Add test:all if it doesn't exist
  if (!scripts['test:all']) {
    scripts['test:all'] = 'vitest run --config packages/tests/vitest.config.ts';
  }

  // Add deploy:all if it doesn't exist
  if (!scripts['deploy:all']) {
    scripts['deploy:all'] = "pnpm -r --filter './services/*' --workspace-concurrency 1 deploy";
  }

  // Add test:* scripts for each category (delegates to @wonder/scripts)
  for (const category of testCategories) {
    scripts[`test:${category}`] = `pnpm --filter @wonder/scripts run test:${category}`;
  }

  // Add deploy:* scripts for each service (delegates to service package)
  for (const service of services) {
    scripts[`deploy:${service.dirName}`] = `pnpm --filter ${service.packageName} run deploy`;
  }

  // Sort scripts alphabetically
  const sortedScripts: Record<string, string> = {};
  for (const key of Object.keys(scripts).sort()) {
    sortedScripts[key] = scripts[key];
  }
  parsed.scripts = sortedScripts;

  writeFileSync(packagePath, JSON.stringify(parsed, null, 2) + '\n');
}

function updateScriptsPackageJson(packagePath: string, testCategories: string[]): void {
  const content = readFileSync(packagePath, 'utf-8');
  const parsed = jsonc.parse(content);

  const scripts = parsed.scripts as Record<string, string>;

  // Remove old test:* scripts
  for (const key of Object.keys(scripts)) {
    if (key.startsWith('test:')) {
      delete scripts[key];
    }
  }

  // Add test:* scripts for each category
  for (const category of testCategories) {
    scripts[`test:${category}`] = `tsx src/run-test.ts ${category}`;
  }

  // Sort scripts alphabetically
  const sortedScripts: Record<string, string> = {};
  for (const key of Object.keys(scripts).sort()) {
    sortedScripts[key] = scripts[key];
  }
  parsed.scripts = sortedScripts;

  writeFileSync(packagePath, JSON.stringify(parsed, null, 2) + '\n');
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const testsDir = join(ROOT, 'packages/tests/src/tests');
  const servicesDir = join(ROOT, 'services');
  const tasksPath = join(ROOT, '.vscode/tasks.json');
  const settingsPath = join(ROOT, '.vscode/settings.json');
  const rootPackagePath = join(ROOT, 'package.json');
  const scriptsPackagePath = join(ROOT, 'packages/scripts/package.json');

  // Discover
  console.log('Discovering tests...');
  const tests = discoverTests(testsDir);
  const testCategories = [...new Set(tests.map((t) => t.category))];

  console.log(`Found ${tests.length} tests in ${testCategories.length} categories:`);
  for (const category of testCategories) {
    const count = tests.filter((t) => t.category === category).length;
    console.log(`  ${category}: ${count} tests`);
  }

  console.log('\nDiscovering services...');
  const services = discoverServices(servicesDir);
  console.log(`Found ${services.length} services:`);
  for (const service of services) {
    console.log(`  ${service.dirName} (${service.packageName})`);
  }

  // Generate test tasks
  const individualTestTasks = tests.map(generateTestTask);
  const categoryTestTasks = generateTestCategoryTasks(tests);
  const allTestTasks = [...categoryTestTasks, ...individualTestTasks];
  const testButton = generateTestTaskButtons(tests);

  // Generate deploy tasks
  const deployTasks = generateDeployTasks(services);
  const deployButton = generateDeployTaskButtons(services);

  // Update files
  console.log('\nUpdating .vscode/tasks.json...');
  updateTasksJson(tasksPath, allTestTasks, deployTasks);

  console.log('Updating .vscode/settings.json...');
  updateSettingsJson(settingsPath, testButton, deployButton);

  console.log('Updating package.json...');
  updateRootPackageJson(rootPackagePath, testCategories, services);

  console.log('Updating packages/scripts/package.json...');
  updateScriptsPackageJson(scriptsPackagePath, testCategories);

  console.log('\nDone!');
}

main();
