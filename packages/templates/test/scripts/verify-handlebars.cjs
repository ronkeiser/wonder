const Handlebars = require('handlebars');

// Test cases from our implementation
const testCases = [
  '{{foo.bar}}',
  '{{foo .bar}}',
  '{{  foo  .  bar  }}',
  '{{../value}}',
  '{{#if ../value}}test{{/if}}',
  '{{foo...}}',
  '{{../../grand}}',
  '{{#each items}}{{../total}}{{/each}}',
  '{{#if true}}{{../value}}{{/if}}',
];

console.log('=== Handlebars Parsing Verification ===\n');

testCases.forEach(template => {
  try {
    const ast = Handlebars.parse(template);
    console.log(`Template: ${template}`);
    console.log('AST:', JSON.stringify(ast, null, 2));
    console.log('---\n');
  } catch (err) {
    console.log(`Template: ${template}`);
    console.log('ERROR:', err.message);
    console.log('---\n');
  }
});

// Test specific parameter cases
console.log('\n=== Block Parameter Cases ===\n');
const paramCases = [
  '{{#if ../value}}test{{/if}}',
  '{{#if "string"}}test{{/if}}',
  '{{#if 123}}test{{/if}}',
  '{{#if true}}test{{/if}}',
  '{{#if foo.bar}}test{{/if}}',
  '{{#each items key="value"}}test{{/each}}',
];

paramCases.forEach(template => {
  try {
    const ast = Handlebars.parse(template);
    const block = ast.body[0];
    console.log(`Template: ${template}`);
    if (block.params) {
      console.log('Params:', JSON.stringify(block.params, null, 2));
    }
    if (block.hash) {
      console.log('Hash:', JSON.stringify(block.hash, null, 2));
    }
    console.log('---\n');
  } catch (err) {
    console.log(`Template: ${template}`);
    console.log('ERROR:', err.message);
    console.log('---\n');
  }
});
