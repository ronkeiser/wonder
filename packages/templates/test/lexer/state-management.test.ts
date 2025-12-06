import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - State Management (C1-F4-T1)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('State transitions', () => {
    it('should start in STATE_CONTENT', () => {
      lexer.setInput('Hello World');

      // First token should be CONTENT, which means we started in STATE_CONTENT
      const token = lexer.lex();
      expect(token.type).toBe(TokenType.CONTENT);
      expect(token.value).toBe('Hello World');
    });

    it('should switch to STATE_MUSTACHE when entering {{', () => {
      lexer.setInput('{{foo}}');

      // First token is OPEN - this switches to STATE_MUSTACHE
      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN);

      // Next token is ID - only tokenized in STATE_MUSTACHE
      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      expect(id.value).toBe('foo');
    });

    it('should switch back to STATE_CONTENT when exiting }}', () => {
      lexer.setInput('{{foo}} bar');

      lexer.lex(); // OPEN
      lexer.lex(); // ID(foo)

      // CLOSE switches back to STATE_CONTENT
      const close = lexer.lex();
      expect(close.type).toBe(TokenType.CLOSE);

      // Next token is CONTENT - proves we're in STATE_CONTENT
      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe(' bar');
    });

    it('should handle multiple state transitions', () => {
      lexer.setInput('start {{foo}} middle {{bar}} end');

      const tokens = [];
      let token;
      while ((token = lexer.lex()).type !== TokenType.EOF) {
        tokens.push(token);
      }

      expect(tokens).toHaveLength(9);
      expect(tokens[0].type).toBe(TokenType.CONTENT); // STATE_CONTENT
      expect(tokens[1].type).toBe(TokenType.OPEN); // -> STATE_MUSTACHE
      expect(tokens[2].type).toBe(TokenType.ID); // STATE_MUSTACHE
      expect(tokens[3].type).toBe(TokenType.CLOSE); // -> STATE_CONTENT
      expect(tokens[4].type).toBe(TokenType.CONTENT); // STATE_CONTENT
      expect(tokens[5].type).toBe(TokenType.OPEN); // -> STATE_MUSTACHE
      expect(tokens[6].type).toBe(TokenType.ID); // STATE_MUSTACHE
      expect(tokens[7].type).toBe(TokenType.CLOSE); // -> STATE_CONTENT
      expect(tokens[8].type).toBe(TokenType.CONTENT); // STATE_CONTENT
    });
  });

  describe('State-specific tokenization', () => {
    it('should only tokenize identifiers in STATE_MUSTACHE', () => {
      // In STATE_CONTENT, "foo" is just content text
      lexer.setInput('foo');
      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe('foo');
    });

    it('should tokenize identifiers in STATE_MUSTACHE', () => {
      // In STATE_MUSTACHE, "foo" is tokenized as ID
      lexer.setInput('{{foo}}');
      lexer.lex(); // OPEN
      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      expect(id.value).toBe('foo');
    });

    it('should only tokenize separators in STATE_MUSTACHE', () => {
      // In STATE_CONTENT, dots are just content
      lexer.setInput('foo.bar');
      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe('foo.bar');
    });

    it('should tokenize separators in STATE_MUSTACHE', () => {
      // In STATE_MUSTACHE, dots are SEP tokens
      lexer.setInput('{{foo.bar}}');
      lexer.lex(); // OPEN
      lexer.lex(); // ID(foo)
      const sep = lexer.lex();
      expect(sep.type).toBe(TokenType.SEP);
      expect(sep.value).toBe('.');
    });

    it('should only tokenize literals in STATE_MUSTACHE', () => {
      lexer.setInput('{{true}}');
      lexer.lex(); // OPEN
      const bool = lexer.lex();
      expect(bool.type).toBe(TokenType.BOOLEAN);
      expect(bool.value).toBe('true');
    });

    it('should treat literal keywords as content in STATE_CONTENT', () => {
      lexer.setInput('true false null');
      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe('true false null');
    });
  });

  describe('Block delimiter state transitions', () => {
    it('should switch to STATE_MUSTACHE on {{#', () => {
      lexer.setInput('{{#if}}');
      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN_BLOCK);

      // Next token is ID - proves we're in STATE_MUSTACHE
      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      expect(id.value).toBe('if');
    });

    it('should switch to STATE_MUSTACHE on {{/', () => {
      lexer.setInput('{{/if}}');
      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN_ENDBLOCK);

      // Next token is ID
      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      expect(id.value).toBe('if');
    });

    it('should switch to STATE_MUSTACHE on {{^', () => {
      lexer.setInput('{{^}}');
      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN_INVERSE);

      // Next token is CLOSE
      const close = lexer.lex();
      expect(close.type).toBe(TokenType.CLOSE);
    });
  });

  describe('Unescaped delimiter state transitions', () => {
    it('should switch to STATE_MUSTACHE on {{{', () => {
      lexer.setInput('{{{html}}}');
      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN_UNESCAPED);

      // Next token is ID
      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      expect(id.value).toBe('html');
    });

    it('should switch to STATE_CONTENT on }}}', () => {
      lexer.setInput('{{{html}}} text');
      lexer.lex(); // OPEN_UNESCAPED
      lexer.lex(); // ID(html)

      const close = lexer.lex();
      expect(close.type).toBe(TokenType.CLOSE_UNESCAPED);

      // Next token is CONTENT
      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe(' text');
    });
  });

  describe('EOF token', () => {
    it('should generate EOF token at end of input', () => {
      lexer.setInput('{{foo}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID
      lexer.lex(); // CLOSE

      const eof = lexer.lex();
      expect(eof.type).toBe(TokenType.EOF);
    });

    it('should generate EOF token from STATE_CONTENT', () => {
      lexer.setInput('text');

      lexer.lex(); // CONTENT

      const eof = lexer.lex();
      expect(eof.type).toBe(TokenType.EOF);
    });

    it('should generate EOF token from STATE_MUSTACHE', () => {
      // This is an unclosed mustache, but we still generate EOF
      lexer.setInput('{{foo');

      lexer.lex(); // OPEN
      lexer.lex(); // ID

      const eof = lexer.lex();
      expect(eof.type).toBe(TokenType.EOF);
    });

    it('should continue returning EOF on subsequent calls', () => {
      lexer.setInput('{{foo}}');

      // Exhaust all tokens
      while (lexer.lex().type !== TokenType.EOF) {
        // Continue
      }

      // Should keep returning EOF
      expect(lexer.lex().type).toBe(TokenType.EOF);
      expect(lexer.lex().type).toBe(TokenType.EOF);
    });
  });

  describe('State preservation across whitespace', () => {
    it('should skip whitespace in STATE_MUSTACHE', () => {
      lexer.setInput('{{  foo  }}');

      lexer.lex(); // OPEN
      const id = lexer.lex(); // ID (whitespace skipped)
      expect(id.type).toBe(TokenType.ID);
      expect(id.value).toBe('foo');
    });

    it('should preserve whitespace in STATE_CONTENT', () => {
      lexer.setInput('  foo  ');
      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe('  foo  ');
    });
  });
});
