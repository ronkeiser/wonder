import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Escape Handling (C1-F3-T1)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Basic Escape Sequences', () => {
    it('should treat \\\\{{foo}} as literal {{foo}}', () => {
      lexer.setInput('\\{{foo}}');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{foo}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF }); // EOF
    });

    it('should treat \\\\\\\\{{foo}} as literal backslash followed by {{foo}} mustache', () => {
      lexer.setInput('\\\\{{foo}}');

      // First token should be CONTENT with single backslash
      const content = lexer.lex();
      expect(content).toMatchObject({
        type: TokenType.CONTENT,
        value: '\\',
      });

      // Then normal mustache tokens
      const open = lexer.lex();
      expect(open).toMatchObject({
        type: TokenType.OPEN,
        value: '{{',
      });

      const id = lexer.lex();
      expect(id).toMatchObject({
        type: TokenType.ID,
        value: 'foo',
      });

      const close = lexer.lex();
      expect(close).toMatchObject({
        type: TokenType.CLOSE,
        value: '}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF }); // EOF
    });

    it('should handle escaped mustaches in mixed content', () => {
      lexer.setInput('normal \\{{escaped}} normal');

      // First content token
      const content1 = lexer.lex();
      expect(content1).toMatchObject({
        type: TokenType.CONTENT,
        value: 'normal {{escaped}} normal',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF }); // EOF
    });

    it('should handle multiple escaped mustaches', () => {
      lexer.setInput('\\{{foo}} \\{{bar}}');

      const content = lexer.lex();
      expect(content).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{foo}} {{bar}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF }); // EOF
    });
  });

  describe('Escaped Opening Delimiters', () => {
    it('should escape {{ delimiter', () => {
      lexer.setInput('text \\{{ more text');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text {{ more text',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should escape {{{ delimiter', () => {
      lexer.setInput('text \\{{{ more text');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text {{{ more text',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should escape {{# block delimiter', () => {
      lexer.setInput('text \\{{#if}} more text');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text {{#if}} more text',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should escape {{/ end block delimiter', () => {
      lexer.setInput('text \\{{/if}} more text');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text {{/if}} more text',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });

  describe('Escaped Closing Delimiters', () => {
    it('should escape }} delimiter', () => {
      lexer.setInput('text \\}} more text');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text }} more text',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should escape }}} delimiter', () => {
      lexer.setInput('text \\}}} more text');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text }}} more text',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });

  describe('Mixed Escaped and Unescaped Mustaches', () => {
    it('should handle normal mustache followed by escaped mustache', () => {
      lexer.setInput('{{foo}} \\{{bar}}');

      // Normal mustache
      expect(lexer.lex()).toMatchObject({
        type: TokenType.OPEN,
        value: '{{',
      });

      expect(lexer.lex()).toMatchObject({
        type: TokenType.ID,
        value: 'foo',
      });

      expect(lexer.lex()).toMatchObject({
        type: TokenType.CLOSE,
        value: '}}',
      });

      // Escaped mustache as content
      expect(lexer.lex()).toMatchObject({
        type: TokenType.CONTENT,
        value: ' {{bar}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle escaped mustache followed by normal mustache', () => {
      lexer.setInput('\\{{foo}} {{bar}}');

      // Escaped mustache as content
      expect(lexer.lex()).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{foo}} ',
      });

      // Normal mustache
      expect(lexer.lex()).toMatchObject({
        type: TokenType.OPEN,
        value: '{{',
      });

      expect(lexer.lex()).toMatchObject({
        type: TokenType.ID,
        value: 'bar',
      });

      expect(lexer.lex()).toMatchObject({
        type: TokenType.CLOSE,
        value: '}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle alternating escaped and unescaped mustaches', () => {
      lexer.setInput('\\{{a}} {{b}} \\{{c}} {{d}}');

      // Escaped
      expect(lexer.lex()).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{a}} ',
      });

      // Unescaped
      expect(lexer.lex()).toMatchObject({ type: TokenType.OPEN });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'b' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.CLOSE });

      // Escaped
      expect(lexer.lex()).toMatchObject({
        type: TokenType.CONTENT,
        value: ' {{c}} ',
      });

      // Unescaped
      expect(lexer.lex()).toMatchObject({ type: TokenType.OPEN });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'd' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.CLOSE });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });

  describe('Escaping Non-Mustache Characters', () => {
    it('should NOT escape backslash before regular character (kept as-is)', () => {
      lexer.setInput('text \\a more');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text \\a more',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should NOT escape backslash before space (kept as-is)', () => {
      lexer.setInput('text\\ space');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text\\ space',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should NOT escape backslash before newline (kept as-is)', () => {
      lexer.setInput('text\\\nmore');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text\\\nmore',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });

  describe('Multiple Backslashes', () => {
    it('should handle chain of backslashes before mustache', () => {
      lexer.setInput('\\\\\\{{foo}}');

      // First backslash escapes second -> produces single backslash
      // Third backslash escapes opening brace -> produces {{foo}} literally
      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '\\{{foo}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle four backslashes before mustache', () => {
      lexer.setInput('\\\\\\\\{{foo}}');

      // First backslash escapes second -> single backslash in content
      // Third backslash escapes fourth -> single backslash in content
      // Then normal mustache
      const content = lexer.lex();
      expect(content).toMatchObject({
        type: TokenType.CONTENT,
        value: '\\\\',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.OPEN });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'foo' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.CLOSE });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });

  describe('Edge Cases', () => {
    it('should keep trailing backslash (not escaping mustache)', () => {
      lexer.setInput('text\\');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text\\',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle escaped mustache at start of template', () => {
      lexer.setInput('\\{{foo}}');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{foo}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle escaped mustache at end of template', () => {
      lexer.setInput('text \\{{foo}}');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: 'text {{foo}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle only escaped mustache', () => {
      lexer.setInput('\\{{}}');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle escaped triple mustache', () => {
      lexer.setInput('\\{{{foo}}}');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{{foo}}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle empty template', () => {
      lexer.setInput('');
      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle template with only backslashes', () => {
      lexer.setInput('\\\\\\\\');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '\\\\',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle escaped mustaches in complete template', () => {
      lexer.setInput('Hello \\{{name}}, your balance is {{balance}}');

      // First part with escaped mustache
      expect(lexer.lex()).toMatchObject({
        type: TokenType.CONTENT,
        value: 'Hello {{name}}, your balance is ',
      });

      // Normal mustache
      expect(lexer.lex()).toMatchObject({ type: TokenType.OPEN });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'balance' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.CLOSE });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle escaped block helpers', () => {
      lexer.setInput('\\{{#if condition}}text\\{{/if}}');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{#if condition}}text{{/if}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });

    it('should handle partially escaped block helper', () => {
      lexer.setInput('{{#if condition}}\\{{inner}}{{/if}}');

      expect(lexer.lex()).toMatchObject({ type: TokenType.OPEN_BLOCK });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'if' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'condition' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.CLOSE });

      expect(lexer.lex()).toMatchObject({
        type: TokenType.CONTENT,
        value: '{{inner}}',
      });

      expect(lexer.lex()).toMatchObject({ type: TokenType.OPEN_ENDBLOCK });
      expect(lexer.lex()).toMatchObject({ type: TokenType.ID, value: 'if' });
      expect(lexer.lex()).toMatchObject({ type: TokenType.CLOSE });

      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
    });
  });
});
