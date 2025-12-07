import { describe, it } from 'vitest';
import { compile } from '../src/index.js';

describe('whitespace debug', () => {
  it('should debug simple block', () => {
    const template = ' {{~#if foo~}} bar {{~/if~}} ';
    console.log('\n=== DEBUGGING WHITESPACE CONTROL ===');
    console.log('Template:', JSON.stringify(template));

    try {
      console.log('\nCompiling and executing...\n');
      const compiled = compile(template);
      const result = compiled.render({ foo: true });
      console.log('Result:', JSON.stringify(result));
      console.log('Result length:', result.length);
      console.log('Expected: "bar"');
      console.log('Expected length: 3');
      console.log('Match:', result === 'bar' ? 'YES' : 'NO');
    } catch (e: any) {
      console.error('Error:', e.message);
      if (e.stack) console.error(e.stack);
      throw e;
    }
  });

  it('should debug inverse block tokens', async () => {
    const template = ' {{~^if foo~}} bar {{~/if~}} ';
    console.log('\n=== DEBUGGING INVERSE BLOCK TOKENS ===');
    console.log('Template:', JSON.stringify(template));

    try {
      // First, let's check the tokens
      const { Lexer } = await import('../src/lexer/lexer.js');
      const lexer = new Lexer();
      lexer.setInput(template);
      const tokens = [];
      while (true) {
        const token = lexer.lex();
        tokens.push(token);
        if (token.type === 'EOF') break;
      }
      console.log('\nTokens:');
      tokens.forEach((t: any, i: number) =>
        console.log(
          `  ${i}: ${t.type}${t.value !== undefined ? ` = ${JSON.stringify(t.value)}` : ''}`,
        ),
      );

      console.log('\nNow trying to compile...\n');
      const compiled = compile(template);
      const result = compiled.render({});
      console.log('Result:', JSON.stringify(result));
      console.log('Result length:', result.length);
      console.log('Expected: "bar"');
      console.log('Expected length: 3');
      console.log('Match:', result === 'bar' ? 'YES' : 'NO');
    } catch (e: any) {
      console.error('Error:', e.message);
      // Don't throw - we expect this to fail for now
    }
  });
});
