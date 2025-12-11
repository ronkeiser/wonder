#!/usr/bin/env node

/**
 * Quick test to verify the web service UIs are accessible
 */

const BASE_URL = 'https://wonder-web.ron-keiser.workers.dev';

async function testUI(path, expectedTitle) {
  console.log(`\n🧪 Testing ${path}...`);

  try {
    const response = await fetch(`${BASE_URL}${path}`);

    if (!response.ok) {
      console.error(`❌ Failed: HTTP ${response.status}`);
      return false;
    }

    const html = await response.text();

    // Check for title
    if (!html.includes(`<title>${expectedTitle}</title>`)) {
      console.error(`❌ Failed: Title "${expectedTitle}" not found`);
      return false;
    }

    console.log(`✅ Success: ${path} is accessible`);
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Wonder Web Service UIs\n');
  console.log(`Base URL: ${BASE_URL}`);

  const tests = [
    ['/', 'Wonder Platform'],
    ['/events', 'Events'],
    ['/logs', 'Logs'],
  ];

  const results = [];
  for (const [path, title] of tests) {
    results.push(await testUI(path, title));
  }

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} tests passed`);

  if (passed !== total) {
    process.exit(1);
  }
}

main();
