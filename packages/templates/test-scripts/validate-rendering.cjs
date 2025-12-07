/**
 * Validation: Rendering Output Comparison
 *
 * Compares rendered output between our implementation and Handlebars
 * for end-to-end behavioral validation.
 */

const Handlebars = require('handlebars');

// Dynamic import for ESM module
let render;

async function loadRender() {
  const module = await import('../src/index.ts');
  return module.render;
}

// Test cases covering all implemented features
const testCases = [
  // Basic variable substitution
  {
    name: 'Simple variable',
    template: 'Hello {{name}}!',
    context: { name: 'World' },
  },
  {
    name: 'Nested property',
    template: '{{user.name}}',
    context: { user: { name: 'Alice' } },
  },
  {
    name: 'Multiple variables',
    template: '{{greeting}} {{name}}!',
    context: { greeting: 'Hello', name: 'World' },
  },

  // HTML escaping
  {
    name: 'HTML escaping',
    template: '{{html}}',
    context: { html: '<script>alert("xss")</script>' },
  },
  {
    name: 'Unescaped output',
    template: '{{{html}}}',
    context: { html: '<b>bold</b>' },
  },

  // Null/undefined handling
  {
    name: 'Null variable',
    template: '{{missing}}',
    context: {},
  },
  {
    name: 'Undefined property',
    template: '{{user.missing}}',
    context: { user: {} },
  },

  // Path resolution
  {
    name: 'Deep nesting',
    template: '{{a.b.c.d}}',
    context: { a: { b: { c: { d: 'value' } } } },
  },
  {
    name: 'Current context',
    template: '{{.}}',
    context: 'Hello',
  },
  {
    name: 'This keyword',
    template: '{{this}}',
    context: 'World',
  },

  // Data variables
  {
    name: 'Data @root',
    template: '{{@root.value}}',
    context: { value: 'root' },
  },

  // #if helper
  {
    name: '#if with truthy value',
    template: '{{#if value}}yes{{/if}}',
    context: { value: true },
  },
  {
    name: '#if with falsy value',
    template: '{{#if value}}yes{{/if}}',
    context: { value: false },
  },
  {
    name: '#if with else',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: false },
  },
  {
    name: '#if with zero (truthy in Handlebars)',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: 0 },
  },

  // #unless helper
  {
    name: '#unless with truthy',
    template: '{{#unless value}}no{{else}}yes{{/unless}}',
    context: { value: true },
  },
  {
    name: '#unless with falsy',
    template: '{{#unless value}}yes{{/unless}}',
    context: { value: false },
  },

  // #each with arrays
  {
    name: '#each array',
    template: '{{#each items}}{{this}} {{/each}}',
    context: { items: [1, 2, 3] },
  },
  {
    name: '#each with @index',
    template: '{{#each items}}{{@index}}:{{this}} {{/each}}',
    context: { items: ['a', 'b', 'c'] },
  },
  {
    name: '#each with @first',
    template: '{{#each items}}{{#if @first}}first{{/if}}{{this}} {{/each}}',
    context: { items: ['a', 'b'] },
  },
  {
    name: '#each with @last',
    template: '{{#each items}}{{this}}{{#unless @last}},{{/unless}}{{/each}}',
    context: { items: ['a', 'b', 'c'] },
  },
  {
    name: '#each empty array',
    template: '{{#each items}}item{{else}}empty{{/each}}',
    context: { items: [] },
  },

  // #each with objects
  {
    name: '#each object',
    template: '{{#each obj}}{{@key}}={{this}} {{/each}}',
    context: { obj: { a: 1, b: 2 } },
  },

  // #with helper
  {
    name: '#with context',
    template: '{{#with user}}{{name}}{{/with}}',
    context: { user: { name: 'Alice' } },
  },
  {
    name: '#with else',
    template: '{{#with user}}{{name}}{{else}}none{{/with}}',
    context: { user: null },
  },

  // Parent context access
  {
    name: 'Parent context in #each',
    template: '{{#each items}}{{../total}} {{/each}}',
    context: { items: [1, 2], total: 10 },
  },
  {
    name: 'Parent context in #with',
    template: '{{#with user}}{{name}} ({{../company}}){{/with}}',
    context: { user: { name: 'Alice' }, company: 'Acme' },
  },

  // Nested blocks
  {
    name: 'Nested #if',
    template: '{{#if a}}{{#if b}}both{{/if}}{{/if}}',
    context: { a: true, b: true },
  },
  {
    name: 'Nested #each',
    template: '{{#each rows}}{{#each this}}{{this}} {{/each}}\n{{/each}}',
    context: {
      rows: [
        [1, 2],
        [3, 4],
      ],
    },
  },

  // Built-in comparison helpers
  {
    name: 'eq helper',
    template: '{{#if (eq a b)}}yes{{else}}no{{/if}}',
    context: { a: 5, b: 5 },
  },
  {
    name: 'ne helper',
    template: '{{#if (ne a b)}}yes{{else}}no{{/if}}',
    context: { a: 5, b: 10 },
  },
  {
    name: 'gt helper',
    template: '{{#if (gt a b)}}yes{{else}}no{{/if}}',
    context: { a: 10, b: 5 },
  },
  {
    name: 'lt helper',
    template: '{{#if (lt a b)}}yes{{else}}no{{/if}}',
    context: { a: 5, b: 10 },
  },
  {
    name: 'and helper',
    template: '{{#if (and a b)}}yes{{else}}no{{/if}}',
    context: { a: true, b: true },
  },
  {
    name: 'or helper',
    template: '{{#if (or a b)}}yes{{else}}no{{/if}}',
    context: { a: false, b: true },
  },
  {
    name: 'not helper',
    template: '{{#if (not value)}}yes{{else}}no{{/if}}',
    context: { value: false },
  },

  // Custom helpers
  {
    name: 'Custom helper without args',
    template: '{{timestamp}}',
    context: {},
    helpers: {
      timestamp: () => '2024-01-01',
    },
  },
  {
    name: 'Custom helper with args',
    template: '{{add a b}}',
    context: { a: 5, b: 3 },
    helpers: {
      add: (a, b) => a + b,
    },
  },
  {
    name: 'Helper with context access',
    template: '{{greeting}}',
    context: { name: 'Alice' },
    helpers: {
      greeting: function () {
        return `Hello ${this.name}!`;
      },
    },
  },

  // Complex real-world scenarios
  {
    name: 'User list with conditionals',
    template: `{{#each users}}
{{#if active}}✓{{else}}✗{{/if}} {{name}} ({{@index}})
{{/each}}`,
    context: {
      users: [
        { name: 'Alice', active: true },
        { name: 'Bob', active: false },
      ],
    },
  },
];

function compareRender(testCase) {
  const { name, template, context, helpers = {} } = testCase;

  try {
    // Render with Handlebars
    let hbsTemplate = Handlebars.compile(template);
    const hbsResult = hbsTemplate(context, { helpers });

    // Render with our implementation
    const ourResult = render(template, context, { helpers });

    // Compare results
    if (hbsResult === ourResult) {
      return { pass: true, name };
    } else {
      return {
        pass: false,
        name,
        template,
        expected: hbsResult,
        actual: ourResult,
        context,
      };
    }
  } catch (error) {
    return {
      pass: false,
      name,
      template,
      error: error.message,
      stack: error.stack,
    };
  }
}

// Run all tests
async function runTests() {
  render = await loadRender();

  console.log('=== Rendering Output Validation ===\n');
  console.log('Comparing our implementation against Handlebars...\n');

  let passed = 0;
  let failed = 0;
  const failures = [];

  testCases.forEach((testCase) => {
    const result = compareRender(testCase);

    if (result.pass) {
      passed++;
      console.log(`✓ ${result.name}`);
    } else {
      failed++;
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  ERROR: ${result.error}`);
      } else {
        console.log(`  Expected: ${JSON.stringify(result.expected)}`);
        console.log(`  Actual:   ${JSON.stringify(result.actual)}`);
      }
      failures.push(result);
    }
  });

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  // Detailed failures
  if (failures.length > 0) {
    console.log(`\n=== Detailed Failures ===\n`);
    failures.forEach((failure, i) => {
      console.log(`${i + 1}. ${failure.name}`);
      console.log(`   Template: ${failure.template}`);
      if (failure.error) {
        console.log(`   Error: ${failure.error}`);
        console.log(`   Stack: ${failure.stack}`);
      } else {
        console.log(`   Context: ${JSON.stringify(failure.context)}`);
        console.log(`   Expected: ${JSON.stringify(failure.expected)}`);
        console.log(`   Actual:   ${JSON.stringify(failure.actual)}`);
      }
      console.log();
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Failed to run tests:', err);
  process.exit(1);
});
