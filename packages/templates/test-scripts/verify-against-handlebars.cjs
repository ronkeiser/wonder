const Handlebars = require('handlebars');
const { Lexer } = require('./src/lexer/lexer.ts');

// Test cases from Handlebars tokenizer spec
const testCases = [
  // Basic
  { template: '{{foo}}', desc: 'simple mustache' },
  { template: '{{&bar}}', desc: 'unescaping with &' },
  { template: '{{{bar}}}', desc: 'unescaping with {{{' },

  // Paths
  { template: '{{foo.bar}}', desc: 'dot notation' },
  { template: '{{foo.bar.baz}}', desc: 'multiple dots' },
  { template: '{{foo/bar}}', desc: 'slash separator' },
  { template: '{{../foo}}', desc: 'parent path' },
  { template: '{{../foo.bar}}', desc: 'parent path with dot' },
  { template: '{{../../grand}}', desc: 'multiple parent levels' },
  { template: '{{.}}', desc: 'current context' },
  { template: '{{./foo}}', desc: 'explicit current context' },
  { template: '{{this/foo}}', desc: 'this keyword' },

  // Whitespace
  { template: '{{  foo  }}', desc: 'mustache with spaces' },
  { template: '{{  foo  .  bar  }}', desc: 'mustache with spaces around dot' },
  { template: '{{  foo  \n   bar }}', desc: 'mustache with line breaks' },

  // Parameters
  { template: '{{ foo bar baz }}', desc: 'mustache with params' },
  { template: '{{ foo bar "baz" }}', desc: 'mustache with string param' },
  { template: "{{ foo bar 'baz' }}", desc: 'mustache with single quote string' },
  { template: '{{ foo 1 }}', desc: 'mustache with number' },
  { template: '{{ foo true }}', desc: 'mustache with boolean true' },
  { template: '{{ foo false }}', desc: 'mustache with boolean false' },
  { template: '{{ foo undefined null }}', desc: 'mustache with undefined and null' },

  // Hash arguments
  { template: '{{ foo bar=baz }}', desc: 'hash argument' },
  { template: '{{ foo bar baz=bat }}', desc: 'param and hash' },
  { template: '{{ foo bar=1 }}', desc: 'hash with number' },
  { template: '{{ foo bar="baz" }}', desc: 'hash with string' },

  // Data variables
  { template: '{{ @foo }}', desc: 'data variable' },
  { template: '{{ foo @bar }}', desc: 'param with data variable' },
  { template: '{{ foo bar=@baz }}', desc: 'hash with data variable' },

  // Blocks
  { template: '{{#foo}}content{{/foo}}', desc: 'basic block' },
  { template: '{{^foo}}', desc: 'inverse block' },
  { template: '{{else}}', desc: 'else' },

  // Subexpressions
  { template: '{{foo (bar)}}', desc: 'basic subexpression' },
  { template: '{{foo (bar baz)}}', desc: 'subexpression with param' },
  { template: '{{foo (bar (baz))}}', desc: 'nested subexpressions' },

  // Edge cases
  { template: '{{foo...}}', desc: 'triple dots after identifier' },
  { template: '{{#if ../value}}', desc: 'block with parent path param' },
];

function tokenizeWithHandlebars(template) {
  const parser = Handlebars.Parser;
  const lexer = parser.lexer;

  lexer.setInput(template);
  const tokens = [];
  let token;

  while ((token = lexer.lex())) {
    const name = parser.terminals_[token] || token;
    if (!name || name === 'EOF' || name === 'INVALID') {
      break;
    }
    tokens.push({ type: name, value: lexer.yytext });
  }

  return tokens;
}

function tokenizeWithOurs(template) {
  const lexer = new Lexer();
  lexer.setInput(template);
  const tokens = [];
  let token;

  while ((token = lexer.lex()) && token.type !== 'EOF') {
    tokens.push({ type: token.type, value: token.value });
  }

  return tokens;
}

function compareTokens(handlebarsTokens, ourTokens) {
  if (handlebarsTokens.length !== ourTokens.length) {
    return {
      match: false,
      reason: `Length mismatch: HBS ${handlebarsTokens.length} vs Ours ${ourTokens.length}`,
    };
  }

  for (let i = 0; i < handlebarsTokens.length; i++) {
    const hbs = handlebarsTokens[i];
    const ours = ourTokens[i];

    if (hbs.type !== ours.type) {
      return {
        match: false,
        reason: `Token ${i}: type mismatch: HBS ${hbs.type} vs Ours ${ours.type}`,
      };
    }

    if (hbs.value !== ours.value) {
      return {
        match: false,
        reason: `Token ${i}: value mismatch: HBS "${hbs.value}" vs Ours "${ours.value}"`,
      };
    }
  }

  return { match: true };
}

console.log('=== Handlebars Tokenizer Spec Verification ===\n');

let passed = 0;
let failed = 0;
const failures = [];

testCases.forEach(({ template, desc }) => {
  try {
    const hbsTokens = tokenizeWithHandlebars(template);
    const ourTokens = tokenizeWithOurs(template);
    const result = compareTokens(hbsTokens, ourTokens);

    if (result.match) {
      passed++;
      console.log(`✓ ${desc}`);
    } else {
      failed++;
      console.log(`✗ ${desc}`);
      console.log(`  ${result.reason}`);
      console.log(`  Template: ${template}`);
      console.log(`  HBS: ${hbsTokens.map((t) => `${t.type}:${t.value}`).join(' ')}`);
      console.log(`  Ours: ${ourTokens.map((t) => `${t.type}:${t.value}`).join(' ')}`);
      failures.push({ template, desc, reason: result.reason, hbsTokens, ourTokens });
    }
  } catch (err) {
    failed++;
    console.log(`✗ ${desc}`);
    console.log(`  ERROR: ${err.message}`);
    failures.push({ template, desc, error: err.message });
  }
});

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failures.length > 0) {
  console.log(`\n=== Failures ===`);
  failures.forEach((f, i) => {
    console.log(`\n${i + 1}. ${f.desc}`);
    console.log(`   Template: ${f.template}`);
    if (f.error) {
      console.log(`   Error: ${f.error}`);
    } else {
      console.log(`   Reason: ${f.reason}`);
      if (f.hbsTokens) {
        console.log(`   HBS: ${f.hbsTokens.map((t) => `${t.type}:${t.value}`).join(' ')}`);
      }
      if (f.ourTokens) {
        console.log(`   Ours: ${f.ourTokens.map((t) => `${t.type}:${t.value}`).join(' ')}`);
      }
    }
  });
}

process.exit(failed > 0 ? 1 : 0);
