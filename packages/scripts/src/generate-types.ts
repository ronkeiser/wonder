#!/usr/bin/env npx tsx

import { parse as parseJsonc } from 'jsonc-parser';
import { exec } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVICES_DIR = resolve(__dirname, '../../../services');
const PACKAGES_DIR = resolve(__dirname, '../../../packages');

// ============================================================================
// Types
// ============================================================================

interface PackageInfo {
  /** Directory name (e.g., "schemas") */
  dirName: string;
  /** Absolute path to package directory */
  path: string;
}

interface WranglerConfig {
  name: string;
  services?: Array<{ binding: string; service: string }>;
  durable_objects?: {
    bindings?: Array<{
      name: string;
      class_name: string;
      script_name?: string;
    }>;
  };
}

interface ServiceInfo {
  /** Directory name (e.g., "events") */
  dirName: string;
  /** Wrangler service name (e.g., "wonder-events") */
  serviceName: string;
  /** Absolute path to service directory */
  path: string;
  /** Dependencies (directory names) */
  dependencies: string[];
}

// ============================================================================
// Wrangler Config Parsing
// ============================================================================

function loadWranglerConfig(servicePath: string): WranglerConfig | null {
  const configPath = join(servicePath, 'wrangler.jsonc');
  if (!existsSync(configPath)) {
    return null;
  }
  const content = readFileSync(configPath, 'utf-8');
  return parseJsonc(content) as WranglerConfig;
}

// ============================================================================
// Service Discovery
// ============================================================================

function serviceNameToDirName(
  serviceName: string,
  serviceMap: Map<string, ServiceInfo>,
): string | null {
  for (const [dirName, info] of serviceMap) {
    if (info.serviceName === serviceName) {
      return dirName;
    }
  }
  return null;
}

function discoverServices(): Map<string, ServiceInfo> {
  const services = new Map<string, ServiceInfo>();

  const entries = readdirSync(SERVICES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const servicePath = join(SERVICES_DIR, entry.name);
    const config = loadWranglerConfig(servicePath);
    if (!config) {
      console.warn(`⚠️  Skipping ${entry.name}: no wrangler.jsonc found`);
      continue;
    }

    services.set(entry.name, {
      dirName: entry.name,
      serviceName: config.name,
      path: servicePath,
      dependencies: [], // populated below
    });
  }

  // Second pass: resolve dependencies (for informational purposes)
  for (const [dirName, info] of services) {
    const config = loadWranglerConfig(info.path)!;
    const deps = new Set<string>();

    // Service bindings
    for (const svc of config.services ?? []) {
      const depDir = serviceNameToDirName(svc.service, services);
      if (depDir && depDir !== dirName) {
        deps.add(depDir);
      }
    }

    // Durable object bindings with script_name (cross-service)
    for (const doBinding of config.durable_objects?.bindings ?? []) {
      if (doBinding.script_name) {
        const depDir = serviceNameToDirName(doBinding.script_name, services);
        if (depDir && depDir !== dirName) {
          deps.add(depDir);
        }
      }
    }

    info.dependencies = Array.from(deps);
  }

  return services;
}

// ============================================================================
// Package Discovery
// ============================================================================

function discoverPackages(): Map<string, PackageInfo> {
  const packages = new Map<string, PackageInfo>();

  const entries = readdirSync(PACKAGES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packagePath = join(PACKAGES_DIR, entry.name);
    const tsconfigPath = join(packagePath, 'tsconfig.json');

    if (existsSync(tsconfigPath)) {
      // Standard package with tsconfig at top level
      packages.set(entry.name, {
        dirName: entry.name,
        path: packagePath,
      });
    } else {
      // Check for nested packages (e.g., wflow/core, wflow/cli, etc.)
      const subEntries = readdirSync(packagePath, { withFileTypes: true });
      let foundNested = false;

      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory()) continue;

        const subPackagePath = join(packagePath, subEntry.name);
        const subTsconfigPath = join(subPackagePath, 'tsconfig.json');

        if (existsSync(subTsconfigPath)) {
          foundNested = true;
          const nestedName = `${entry.name}/${subEntry.name}`;
          packages.set(nestedName, {
            dirName: nestedName,
            path: subPackagePath,
          });
        }
      }

      if (!foundNested) {
        console.warn(`⚠️  Skipping package ${entry.name}: no tsconfig.json found`);
      }
    }
  }

  return packages;
}

// ============================================================================
// Step 1: Generate Wrangler Types (parallel)
// ============================================================================

async function generateAllWranglerTypes(services: Map<string, ServiceInfo>): Promise<void> {
  console.log('📝 Step 1: Generating wrangler types for all services...\n');

  const tasks = Array.from(services.values()).map(async (service) => {
    // Include all dependency configs for proper typed bindings
    const configFlags = [`-c wrangler.jsonc`];
    for (const depName of service.dependencies) {
      const relativePath = `../${depName}/wrangler.jsonc`;
      configFlags.push(`-c ${relativePath}`);
    }

    const cmd = `wrangler types ${configFlags.join(' ')}`;
    console.log(`  [${service.dirName}] ${cmd}`);

    try {
      await execAsync(cmd, { cwd: service.path });
      return { service: service.dirName, success: true };
    } catch (error) {
      return {
        service: service.dirName,
        success: false,
        error: (error as Error).message,
      };
    }
  });

  const results = await Promise.all(tasks);
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    console.error('\n❌ Some wrangler types failed:');
    for (const f of failures) {
      console.error(`  • ${f.service}: ${f.error}`);
    }
    throw new Error('wrangler types failed');
  }

  console.log('\n✅ All wrangler types generated\n');
}

// ============================================================================
// Step 2: Patch worker-configuration.d.ts (src → dist)
// ============================================================================

function patchAllWorkerConfigurations(services: Map<string, ServiceInfo>): void {
  console.log('🔧 Step 2: Patching worker-configuration.d.ts files...\n');

  for (const [name, service] of services) {
    const configPath = join(service.path, 'worker-configuration.d.ts');
    if (!existsSync(configPath)) {
      console.log(`  [${name}] ⚠️  No worker-configuration.d.ts found`);
      continue;
    }

    let content = readFileSync(configPath, 'utf-8');
    const original = content;

    // Pattern: import("../servicename/src/index") or import("./src/index")
    // Replace with: import("../servicename/dist/index") or import("./dist/index")
    content = content.replace(/import\(["'](\.\.[^"']*|\.)(\/src\/)/g, 'import("$1/dist/');

    if (content !== original) {
      writeFileSync(configPath, content);
      console.log(`  [${name}] ✅ Patched (src → dist)`);
    } else {
      console.log(`  [${name}] ℹ️  No changes needed`);
    }
  }

  console.log();
}

// ============================================================================
// Step 3: Build declarations (parallel, with skipLibCheck for bootstrap)
// ============================================================================

async function buildAllDeclarations(services: Map<string, ServiceInfo>): Promise<void> {
  console.log('🏗️  Step 3: Building TypeScript declarations (parallel, skipLibCheck)...\n');

  // First, clean dist directories to avoid "would overwrite input file" errors
  console.log('  Cleaning dist directories...');
  for (const service of services.values()) {
    const distPath = join(service.path, 'dist');
    if (existsSync(distPath)) {
      await execAsync(`rm -rf ${distPath}`, { cwd: service.path });
    }
  }
  console.log('  ✅ Cleaned\n');

  const tasks = Array.from(services.values()).map(async (service) => {
    const tsconfigPath = join(service.path, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
      return { service: service.dirName, success: true, skipped: true };
    }

    // Use project config but override noEmit to enable declaration emit
    // --skipLibCheck tolerates .d.ts issues
    // --noEmitOnError false to emit declarations even with cross-service type errors
    const cmd = `tsc -p tsconfig.json --declaration --emitDeclarationOnly --noEmit false --skipLibCheck --noEmitOnError false --outDir dist`;
    console.log(`  [${service.dirName}] ${cmd}`);

    try {
      await execAsync(cmd, { cwd: service.path });
      return { service: service.dirName, success: true };
    } catch (error) {
      // Check if declarations were actually emitted despite errors
      const distIndexPath = join(service.path, 'dist', 'index.d.ts');
      if (existsSync(distIndexPath)) {
        // Declarations emitted, treat as success with warnings
        return { service: service.dirName, success: true, hadWarnings: true };
      }
      const execError = error as { stdout?: string; stderr?: string };
      return {
        service: service.dirName,
        success: false,
        error: execError.stderr || execError.stdout || String(error),
      };
    }
  });

  const results = await Promise.all(tasks);
  const failures = results.filter((r) => !r.success);
  const skipped = results.filter((r) => (r as any).skipped);
  const withWarnings = results.filter((r) => (r as any).hadWarnings);

  if (skipped.length > 0) {
    console.log(`\n  ℹ️  Skipped (no tsconfig): ${skipped.map((s) => s.service).join(', ')}`);
  }

  if (withWarnings.length > 0) {
    console.log(
      `  ⚠️  Built with warnings (cross-service type errors): ${withWarnings.map((w) => w.service).join(', ')}`,
    );
  }

  if (failures.length > 0) {
    console.error('\n❌ Some declaration builds failed (no output):');
    for (const f of failures) {
      console.error(`\n  • ${f.service}:`);
      console.error(`    ${(f as any).error?.split('\n').join('\n    ')}`);
    }
    throw new Error('Declaration build failed');
  }

  console.log('\n✅ All declarations built\n');
}

// ============================================================================
// Step 4: Type check services
// ============================================================================

async function typeCheckServices(services: Map<string, ServiceInfo>): Promise<boolean> {
  console.log('🔍 Step 4: Type checking services (tsc --noEmit)...\n');

  const tasks = Array.from(services.values()).map(async (service) => {
    const tsconfigPath = join(service.path, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
      return { name: service.dirName, success: true, skipped: true };
    }

    const cmd = `tsc --noEmit`;
    console.log(`  [${service.dirName}] ${cmd}`);

    try {
      await execAsync(cmd, { cwd: service.path });
      return { name: service.dirName, success: true };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return {
        name: service.dirName,
        success: false,
        error: execError.stderr || execError.stdout || String(error),
      };
    }
  });

  const results = await Promise.all(tasks);
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    console.error('\n❌ Service type errors found:');
    for (const f of failures) {
      console.error(`\n  • ${f.name}:`);
      console.error(`    ${(f as any).error?.split('\n').join('\n    ')}`);
    }
    return false;
  }

  console.log('\n✅ All services type check passed\n');
  return true;
}

// ============================================================================
// Step 5: Type check packages
// ============================================================================

async function typeCheckPackages(packages: Map<string, PackageInfo>): Promise<boolean> {
  console.log('🔍 Step 5: Type checking packages...\n');

  const tasks = Array.from(packages.values()).map(async (pkg) => {
    // Check if package has a custom check script (e.g., svelte-check for Svelte packages)
    const pkgJsonPath = join(pkg.path, 'package.json');
    let cmd = 'tsc --noEmit';

    if (existsSync(pkgJsonPath)) {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      if (pkgJson.scripts?.check) {
        cmd = 'pnpm run check';
      }
    }

    console.log(`  [${pkg.dirName}] ${cmd}`);

    try {
      await execAsync(cmd, { cwd: pkg.path });
      return { name: pkg.dirName, success: true };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return {
        name: pkg.dirName,
        success: false,
        error: execError.stderr || execError.stdout || String(error),
      };
    }
  });

  const results = await Promise.all(tasks);
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    console.error('\n❌ Package type errors found:');
    for (const f of failures) {
      console.error(`\n  • ${f.name}:`);
      console.error(`    ${(f as any).error?.split('\n').join('\n    ')}`);
    }
    return false;
  }

  console.log('\n✅ All packages type check passed\n');
  return true;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipTypeCheck = args.includes('--skip-check');

  console.log('🔍 Discovering services...\n');
  const services = discoverServices();

  console.log(`Found ${services.size} services:`);
  for (const [name, info] of services) {
    const deps =
      info.dependencies.length > 0 ? ` → [${info.dependencies.join(', ')}]` : ' (no dependencies)';
    console.log(`  • ${name} (${info.serviceName})${deps}`);
  }
  console.log();

  console.log('🔍 Discovering packages...\n');
  const packages = discoverPackages();

  console.log(`Found ${packages.size} packages:`);
  for (const [name] of packages) {
    console.log(`  • ${name}`);
  }
  console.log();

  // Step 1: Generate wrangler types for all services
  await generateAllWranglerTypes(services);

  // Step 2: Patch all worker-configuration.d.ts
  patchAllWorkerConfigurations(services);

  // Step 3: Build declarations (parallel with skipLibCheck)
  await buildAllDeclarations(services);

  // Step 4 & 5: Type check (unless skipped)
  if (!skipTypeCheck) {
    const servicesOk = await typeCheckServices(services);
    const packagesOk = await typeCheckPackages(packages);

    if (!servicesOk || !packagesOk) {
      throw new Error('Type check failed');
    }
  } else {
    console.log('⏭️  Skipping type check (--skip-check)\n');
  }

  console.log(`${'='.repeat(60)}`);
  console.log('✅ All services and packages processed successfully!');
  console.log(`${'='.repeat(60)}\n`);
}

main().catch((error) => {
  console.error('\nFatal error:', error.message);
  process.exit(1);
});
