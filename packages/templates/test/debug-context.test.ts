import { describe, expect, test } from 'vitest';
import { Interpreter } from '../src/interpreter/interpreter.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

describe('Debug Context Binding', () => {
  test('simple context binding', () => {
    let receivedContext: any;
    const template = `{{#if (check)}}yes{{/if}}`;

    console.log('Template:', template);

    const lexer = new Lexer(template);
    console.log('Lexer created');

    const parser = new Parser(lexer);
    console.log('Parser created');

    const ast = parser.parse();
    console.log('AST:', JSON.stringify(ast, null, 2));

    const interpreter = new Interpreter(ast, {
      helpers: {
        check: function (this: any) {
          console.log('Helper called, this =', this);
          receivedContext = this;
          return true;
        },
      },
    });

    const result = interpreter.evaluate({ name: 'Alice', age: 30 });
    console.log('Result:', result);
    console.log('Received context:', receivedContext);

    expect(receivedContext).toEqual({ name: 'Alice', age: 30 });
  });
});
