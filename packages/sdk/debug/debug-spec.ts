#!/usr/bin/env tsx
/**
 * Debug script to verify OpenAPI spec is loaded correctly
 * Step 1: Verify the OpenAPI Spec
 */

const API_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

async function debugSpec() {
  console.log('=== Step 1: Verify OpenAPI Spec ===\n');
  console.log(`Fetching from: ${API_URL}/doc\n`);

  try {
    const response = await fetch(`${API_URL}/doc`);
    
    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const spec = await response.json() as any;

    console.log('✓ Spec fetched successfully\n');

    // Check basic structure
    console.log('Spec structure:');
    console.log(`- openapi: ${spec.openapi}`);
    console.log(`- info.title: ${spec.info?.title}`);
    console.log(`- info.version: ${spec.info?.version}`);
    console.log(`- Has paths: ${!!spec.paths}`);
    console.log(`- Has components: ${!!spec.components}\n`);

    if (!spec.paths) {
      console.error('❌ Missing "paths" property in spec');
      process.exit(1);
    }

    // Analyze paths
    const paths = Object.keys(spec.paths);
    console.log(`Total paths: ${paths.length}\n`);

    if (paths.length === 0) {
      console.error('❌ No paths found in spec');
      process.exit(1);
    }

    // Show first 10 paths
    console.log('First 10 paths:');
    paths.slice(0, 10).forEach((path) => {
      const methods = Object.keys(spec.paths[path]).filter(
        m => ['get', 'post', 'put', 'patch', 'delete'].includes(m)
      );
      console.log(`  ${path}`);
      console.log(`    Methods: ${methods.join(', ')}`);
    });

    if (paths.length > 10) {
      console.log(`  ... and ${paths.length - 10} more\n`);
    }

    // Check for expected Wonder API paths
    console.log('\nChecking for expected paths:');
    const expectedPaths = [
      '/workspaces',
      '/workspaces/{workspaceId}',
      '/projects',
      '/workflows',
    ];

    expectedPaths.forEach((path) => {
      const exists = paths.includes(path);
      console.log(`  ${exists ? '✓' : '❌'} ${path}`);
    });

    // Analyze path structure
    console.log('\nPath structure analysis:');
    let withParams = 0;
    let withMultipleParams = 0;
    let deepestNesting = 0;

    paths.forEach((path) => {
      const params = (path.match(/\{[^}]+\}/g) || []).length;
      const segments = path.split('/').filter(Boolean).length;
      
      if (params > 0) withParams++;
      if (params > 1) withMultipleParams++;
      if (segments > deepestNesting) deepestNesting = segments;
    });

    console.log(`  Paths with parameters: ${withParams}`);
    console.log(`  Paths with multiple parameters: ${withMultipleParams}`);
    console.log(`  Deepest nesting level: ${deepestNesting} segments`);

    // Show method distribution
    console.log('\nHTTP method distribution:');
    const methodCounts: Record<string, number> = {};
    
    paths.forEach((path) => {
      Object.keys(spec.paths[path]).forEach((method) => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          methodCounts[method] = (methodCounts[method] || 0) + 1;
        }
      });
    });

    Object.entries(methodCounts).sort((a, b) => b[1] - a[1]).forEach(([method, count]) => {
      console.log(`  ${method.toUpperCase()}: ${count}`);
    });

    // Write spec to file for inspection
    const fs = await import('node:fs/promises');
    const outputPath = 'debug-spec-output.json';
    await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
    console.log(`\n✓ Full spec written to ${outputPath} for inspection`);

    console.log('\n=== Step 1 Complete ===');
    console.log('Spec is valid and contains paths. Ready for parsing.\n');

  } catch (error) {
    console.error('❌ Error fetching spec:', error);
    process.exit(1);
  }
}

debugSpec();
