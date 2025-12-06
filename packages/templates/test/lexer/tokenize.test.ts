import { beforeEach, describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer.tokenize()', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Basic functionality', () => {
    test('returns array of tokens for simple template', () => {
      const tokens = lexer.tokenize('{{name}}');

      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(4); // OPEN, ID, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[2].type).toBe(TokenType.CLOSE);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('includes EOF token at end', () => {
      const tokens = lexer.tokenize('{{x}}');
      const lastToken = tokens[tokens.length - 1];

      expect(lastToken.type).toBe(TokenType.EOF);
      expect(lastToken.value).toBe('');
    });

    test('works with empty template', () => {
      const tokens = lexer.tokenize('');

      expect(tokens.length).toBe(1);
      expect(tokens[0].type).toBe(TokenType.EOF);
    });

    test('works with content-only template', () => {
      const tokens = lexer.tokenize('Hello, world!');

      expect(tokens.length).toBe(2); // CONTENT, EOF
      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[0].value).toBe('Hello, world!');
      expect(tokens[1].type).toBe(TokenType.EOF);
    });
  });

  describe('Complex templates', () => {
    test('tokenizes template with multiple mustaches', () => {
      const tokens = lexer.tokenize('{{first}} {{second}} {{third}}');

      // OPEN, ID, CLOSE, CONTENT, OPEN, ID, CLOSE, CONTENT, OPEN, ID, CLOSE, EOF
      // No leading content since template starts with {{
      expect(tokens.length).toBe(12);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[2].type).toBe(TokenType.CLOSE);
      expect(tokens[11].type).toBe(TokenType.EOF);
    });

    test('tokenizes template with blocks', () => {
      const tokens = lexer.tokenize('{{#if}}content{{/if}}');

      expect(tokens.length).toBe(8); // OPEN_BLOCK, ID, CLOSE, CONTENT, OPEN_ENDBLOCK, ID, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[2].type).toBe(TokenType.CLOSE);
      expect(tokens[3].type).toBe(TokenType.CONTENT);
      expect(tokens[4].type).toBe(TokenType.OPEN_ENDBLOCK);
      expect(tokens[5].type).toBe(TokenType.ID);
      expect(tokens[6].type).toBe(TokenType.CLOSE);
      expect(tokens[7].type).toBe(TokenType.EOF);
    });

    test('tokenizes template with comments', () => {
      const tokens = lexer.tokenize('{{! comment }}{{name}}');

      expect(tokens.length).toBe(5); // COMMENT, OPEN, ID, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.COMMENT);
      expect(tokens[1].type).toBe(TokenType.OPEN);
      expect(tokens[2].type).toBe(TokenType.ID);
      expect(tokens[3].type).toBe(TokenType.CLOSE);
      expect(tokens[4].type).toBe(TokenType.EOF);
    });

    test('tokenizes template with literals', () => {
      const tokens = lexer.tokenize('{{helper "string" 123 true}}');

      expect(tokens.length).toBe(7); // OPEN, ID, STRING, NUMBER, BOOLEAN, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[2].type).toBe(TokenType.STRING);
      expect(tokens[3].type).toBe(TokenType.NUMBER);
      expect(tokens[4].type).toBe(TokenType.BOOLEAN);
      expect(tokens[5].type).toBe(TokenType.CLOSE);
      expect(tokens[6].type).toBe(TokenType.EOF);
    });

    test('tokenizes template with path expressions', () => {
      const tokens = lexer.tokenize('{{foo.bar.baz}}');

      expect(tokens.length).toBe(8); // OPEN, ID, SEP, ID, SEP, ID, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[2].type).toBe(TokenType.SEP);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[4].type).toBe(TokenType.SEP);
      expect(tokens[5].type).toBe(TokenType.ID);
      expect(tokens[6].type).toBe(TokenType.CLOSE);
      expect(tokens[7].type).toBe(TokenType.EOF);
    });

    test('tokenizes template with escaped delimiters', () => {
      const tokens = lexer.tokenize('\\{{not a mustache}}');

      expect(tokens.length).toBe(2); // CONTENT (including escaped {{), EOF
      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[0].value).toBe('{{not a mustache}}');
      expect(tokens[1].type).toBe(TokenType.EOF);
    });
  });

  describe('Real-world templates', () => {
    test('tokenizes email template', () => {
      const template = `
Hello {{firstName}},

Your order #{{orderId}} has been shipped.

{{#if tracking}}
Track your package: {{trackingUrl}}
{{/if}}

Thanks!
`;

      const tokens = lexer.tokenize(template);

      // Should have tokens for content, mustaches, block, etc.
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);

      // Verify we got the key mustaches
      const ids = tokens.filter((t) => t.type === TokenType.ID);
      const idValues = ids.map((t) => t.value);
      expect(idValues).toContain('firstName');
      expect(idValues).toContain('orderId');
      expect(idValues).toContain('tracking');
      expect(idValues).toContain('trackingUrl');
    });

    test('tokenizes nested blocks', () => {
      const template = `
{{#each items}}
  {{#if active}}
    {{name}}: {{price}}
  {{/if}}
{{/each}}
`;

      const tokens = lexer.tokenize(template);

      // Count block delimiters
      const openBlocks = tokens.filter((t) => t.type === TokenType.OPEN_BLOCK);
      const endBlocks = tokens.filter((t) => t.type === TokenType.OPEN_ENDBLOCK);

      expect(openBlocks.length).toBe(2); // #each and #if
      expect(endBlocks.length).toBe(2); // /each and /if
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });

    test('tokenizes HTML template with attributes', () => {
      const template = '<div class="{{className}}" id="{{elementId}}">{{content}}</div>';

      const tokens = lexer.tokenize(template);

      // Should handle HTML content and mustaches
      const mustaches = tokens.filter(
        (t) => t.type === TokenType.OPEN || t.type === TokenType.CLOSE,
      );
      expect(mustaches.length).toBe(6); // 3 opens, 3 closes

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('className');
      expect(ids).toContain('elementId');
      expect(ids).toContain('content');
    });
  });

  describe('State independence', () => {
    test('can be called multiple times on same lexer instance', () => {
      const tokens1 = lexer.tokenize('{{first}}');
      const tokens2 = lexer.tokenize('{{second}}');

      expect(tokens1.length).toBe(4);
      expect(tokens2.length).toBe(4);

      expect(tokens1[1].value).toBe('first');
      expect(tokens2[1].value).toBe('second');
    });

    test('does not affect lexer state for manual tokenization', () => {
      // Use tokenize() first
      lexer.tokenize('{{x}}');

      // Then use manual tokenization
      lexer.setInput('{{y}}');
      const token1 = lexer.lex();
      const token2 = lexer.lex();

      expect(token1.type).toBe(TokenType.OPEN);
      expect(token2.type).toBe(TokenType.ID);
      expect(token2.value).toBe('y');
    });

    test('resets position for each call', () => {
      const tokens1 = lexer.tokenize('{{a}}');
      const tokens2 = lexer.tokenize('{{b}}');

      // Both should start at position 0
      expect(tokens1[0].loc.start.index).toBe(0);
      expect(tokens2[0].loc.start.index).toBe(0);
    });
  });

  describe('Error handling', () => {
    test('throws LexerError for malformed template', () => {
      expect(() => {
        lexer.tokenize('{{! unclosed comment');
      }).toThrow('Unclosed comment');
    });

    test('throws LexerError for unclosed string', () => {
      expect(() => {
        lexer.tokenize('{{helper "unclosed}}');
      }).toThrow('Unclosed string');
    });

    test('error includes position information', () => {
      try {
        lexer.tokenize('Some content\n{{! unclosed');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.line).toBe(2);
        expect(error.column).toBe(0); // 0-indexed internally
        expect(error.message).toContain('line 2');
        expect(error.message).toContain('column 1'); // 1-indexed in message
      }
    });
  });

  describe('Token properties', () => {
    test('all tokens have type property', () => {
      const tokens = lexer.tokenize('{{name}}');

      tokens.forEach((token) => {
        expect(token.type).toBeDefined();
        expect(typeof token.type).toBe('string');
      });
    });

    test('all tokens have value property', () => {
      const tokens = lexer.tokenize('{{name}}');

      tokens.forEach((token) => {
        expect(token.value).toBeDefined();
        expect(typeof token.value).toBe('string');
      });
    });

    test('all tokens have location information', () => {
      const tokens = lexer.tokenize('{{name}}');

      tokens.forEach((token) => {
        expect(token.loc).toBeDefined();
        expect(token.loc.start).toBeDefined();
        expect(token.loc.end).toBeDefined();
        expect(typeof token.loc.start.line).toBe('number');
        expect(typeof token.loc.start.column).toBe('number');
        expect(typeof token.loc.start.index).toBe('number');
      });
    });
  });
});
