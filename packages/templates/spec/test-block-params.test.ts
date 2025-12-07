import { describe, it } from 'vitest';
import { Lexer } from './src/lexer/lexer.js';
import { Parser } from './src/parser/parser.js';

describe('block params exploration', () => {
  it('should show tokenization of block params', () => {
    const template = '{{#each items as |foo bar|}}{{foo}}{{/each}}';
    console.log('=== Tokenization ===');
    const lexer = new Lexer(template);
    const tokens = lexer.tokenize(template);
    tokens.forEach((t) => {
      console.log(`${t.type.padEnd(20)} ${JSON.stringify(t.value)}`);
    });
  });

  it('should show parsing of block params', () => {
    const template = '{{#each items as |foo bar|}}{{foo}}{{/each}}';
    console.log('\n=== Parsing ===');
    const lexer = new Lexer(template);
    const parser = new Parser(lexer);
    parser.setInput(template);
    try {
      const ast = parser.parse();
      console.log('AST:', JSON.stringify(ast, null, 2));
    } catch (error: any) {
      console.error('ERROR:', error.message);
      if (error.context) console.error('Context:', error.context);
      throw error;
    }
  });
});
