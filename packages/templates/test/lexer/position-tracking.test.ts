import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Position Tracking (C1-F4-T2)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Single-line template positions', () => {
    it('should track position correctly for simple mustache', () => {
      lexer.setInput('{{foo}}');

      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN);
      expect(open.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(open.loc.end).toEqual({ line: 1, column: 2, index: 2 });

      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      expect(id.loc.start).toEqual({ line: 1, column: 2, index: 2 });
      expect(id.loc.end).toEqual({ line: 1, column: 5, index: 5 });

      const close = lexer.lex();
      expect(close.type).toBe(TokenType.CLOSE);
      expect(close.loc.start).toEqual({ line: 1, column: 5, index: 5 });
      expect(close.loc.end).toEqual({ line: 1, column: 7, index: 7 });
    });

    it('should track position with content before mustache', () => {
      lexer.setInput('Hello {{name}}');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 1, column: 6, index: 6 });

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 1, column: 6, index: 6 });
      expect(open.loc.end).toEqual({ line: 1, column: 8, index: 8 });
    });

    it('should track position with whitespace in mustache', () => {
      lexer.setInput('{{  foo  }}');

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(open.loc.end).toEqual({ line: 1, column: 2, index: 2 });

      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      // Whitespace is skipped but position advances
      expect(id.loc.start).toEqual({ line: 1, column: 4, index: 4 });
      expect(id.loc.end).toEqual({ line: 1, column: 7, index: 7 });
    });
  });

  describe('Multi-line template line numbers', () => {
    it('should track line numbers across newlines in content', () => {
      lexer.setInput('line 1\nline 2\n{{foo}}');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 3, column: 0, index: 14 });

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 3, column: 0, index: 14 });
      expect(open.loc.end).toEqual({ line: 3, column: 2, index: 16 });
    });

    it('should track position across multiple mustaches on different lines', () => {
      lexer.setInput('{{foo}}\n{{bar}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID(foo)
      lexer.lex(); // CLOSE
      lexer.lex(); // CONTENT(\n)

      const open2 = lexer.lex();
      expect(open2.type).toBe(TokenType.OPEN);
      expect(open2.loc.start).toEqual({ line: 2, column: 0, index: 8 });
      expect(open2.loc.end).toEqual({ line: 2, column: 2, index: 10 });

      const id2 = lexer.lex();
      expect(id2.type).toBe(TokenType.ID);
      expect(id2.loc.start).toEqual({ line: 2, column: 2, index: 10 });
      expect(id2.loc.end).toEqual({ line: 2, column: 5, index: 13 });
    });

    it('should track position in multi-line block comments', () => {
      lexer.setInput('{{!-- line 1\nline 2\nline 3 --}}');

      const comment = lexer.lex();
      expect(comment.type).toBe(TokenType.COMMENT);
      expect(comment.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(comment.loc.end).toEqual({ line: 3, column: 11, index: 31 });
    });
  });

  describe('Newlines in CONTENT update line tracking', () => {
    it('should reset column to 0 after newline', () => {
      lexer.setInput('abc\ndef');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 2, column: 3, index: 7 });
    });

    it('should track multiple newlines correctly', () => {
      lexer.setInput('a\n\n\nb');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 4, column: 1, index: 5 });
    });

    it('should track newline immediately before mustache', () => {
      lexer.setInput('text\n{{foo}}');

      const content = lexer.lex();
      expect(content.loc.end).toEqual({ line: 2, column: 0, index: 5 });

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 2, column: 0, index: 5 });
    });
  });

  describe('Tab handling', () => {
    it('should advance column by tabWidth (default 4) for tabs', () => {
      lexer.setInput('\t{{foo}}');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 1, column: 4, index: 1 }); // tab at index 0, column advances by 4

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 1, column: 4, index: 1 });
      expect(open.loc.end).toEqual({ line: 1, column: 6, index: 3 });
    });

    it('should handle multiple tabs', () => {
      lexer.setInput('\t\t{{foo}}');

      const content = lexer.lex();
      expect(content.loc.end).toEqual({ line: 1, column: 8, index: 2 }); // 2 tabs = 8 columns

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 1, column: 8, index: 2 });
    });

    it('should handle tabs in mustache content (identifiers)', () => {
      // Note: tabs in mustache are whitespace and get skipped
      lexer.setInput('{{\tfoo\t}}');

      lexer.lex(); // OPEN
      const id = lexer.lex();
      expect(id.type).toBe(TokenType.ID);
      // After OPEN (column 2), tab advances by 4 to column 6, then 'foo' ends at column 9
      expect(id.loc.start).toEqual({ line: 1, column: 6, index: 3 });
      expect(id.loc.end).toEqual({ line: 1, column: 9, index: 6 });
    });

    it('should handle tabs mixed with spaces', () => {
      lexer.setInput('\t {{foo}}');

      const content = lexer.lex();
      // Tab = 4, then space = 1, total = 5
      expect(content.loc.end).toEqual({ line: 1, column: 5, index: 2 });
    });
  });

  describe('Token location accuracy', () => {
    it('should have accurate locations for all token types', () => {
      lexer.setInput('{{foo.bar}}');

      const open = lexer.lex();
      expect(open.loc.start.column).toBe(0);
      expect(open.loc.end.column).toBe(2);

      const id1 = lexer.lex();
      expect(id1.loc.start.column).toBe(2);
      expect(id1.loc.end.column).toBe(5);

      const sep = lexer.lex();
      expect(sep.type).toBe(TokenType.SEP);
      expect(sep.loc.start.column).toBe(5);
      expect(sep.loc.end.column).toBe(6);

      const id2 = lexer.lex();
      expect(id2.loc.start.column).toBe(6);
      expect(id2.loc.end.column).toBe(9);

      const close = lexer.lex();
      expect(close.loc.start.column).toBe(9);
      expect(close.loc.end.column).toBe(11);
    });

    it('should track locations for literals', () => {
      lexer.setInput('{{true 123 "hello"}}');

      lexer.lex(); // OPEN

      const bool = lexer.lex();
      expect(bool.type).toBe(TokenType.BOOLEAN);
      expect(bool.loc.start.column).toBe(2);
      expect(bool.loc.end.column).toBe(6);

      const num = lexer.lex();
      expect(num.type).toBe(TokenType.NUMBER);
      expect(num.loc.start.column).toBe(7);
      expect(num.loc.end.column).toBe(10);

      const str = lexer.lex();
      expect(str.type).toBe(TokenType.STRING);
      expect(str.loc.start.column).toBe(11);
      expect(str.loc.end.column).toBe(18); // includes quotes
    });

    it('should track locations for block delimiters', () => {
      lexer.setInput('{{#if}}{{/if}}');

      const openBlock = lexer.lex();
      expect(openBlock.type).toBe(TokenType.OPEN_BLOCK);
      expect(openBlock.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(openBlock.loc.end).toEqual({ line: 1, column: 3, index: 3 });

      lexer.lex(); // ID(if)
      lexer.lex(); // CLOSE

      const openEnd = lexer.lex();
      expect(openEnd.type).toBe(TokenType.OPEN_ENDBLOCK);
      expect(openEnd.loc.start).toEqual({ line: 1, column: 7, index: 7 });
      expect(openEnd.loc.end).toEqual({ line: 1, column: 10, index: 10 });
    });

    it('should track locations for comments', () => {
      lexer.setInput('{{! comment }}');

      const comment = lexer.lex();
      expect(comment.type).toBe(TokenType.COMMENT);
      expect(comment.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(comment.loc.end).toEqual({ line: 1, column: 14, index: 14 });
    });
  });

  describe('Edge cases', () => {
    it('should handle EOF token position', () => {
      lexer.setInput('{{foo}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID
      lexer.lex(); // CLOSE

      const eof = lexer.lex();
      expect(eof.type).toBe(TokenType.EOF);
      expect(eof.loc.start).toEqual({ line: 1, column: 7, index: 7 });
      expect(eof.loc.end).toEqual({ line: 1, column: 7, index: 7 }); // start === end for EOF
    });

    it('should handle empty template', () => {
      lexer.setInput('');

      const eof = lexer.lex();
      expect(eof.type).toBe(TokenType.EOF);
      expect(eof.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(eof.loc.end).toEqual({ line: 1, column: 0, index: 0 });
    });

    it('should track position after escaped mustaches', () => {
      lexer.setInput('\\\\{{foo}}');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);
      expect(content.value).toBe('\\');
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 1, column: 1, index: 1 });

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 1, column: 1, index: 1 });
    });

    it('should handle unescaped mustache positions', () => {
      lexer.setInput('{{{html}}}');

      const open = lexer.lex();
      expect(open.type).toBe(TokenType.OPEN_UNESCAPED);
      expect(open.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(open.loc.end).toEqual({ line: 1, column: 3, index: 3 });

      lexer.lex(); // ID

      const close = lexer.lex();
      expect(close.type).toBe(TokenType.CLOSE_UNESCAPED);
      expect(close.loc.start).toEqual({ line: 1, column: 7, index: 7 });
      expect(close.loc.end).toEqual({ line: 1, column: 10, index: 10 });
    });
  });

  describe('Complex multi-line scenarios', () => {
    it('should track positions in realistic template', () => {
      const template = `<div>
\t{{#each items}}
\t\t<p>{{name}}</p>
\t{{/each}}
</div>`;

      lexer.setInput(template);

      const content1 = lexer.lex();
      expect(content1.type).toBe(TokenType.CONTENT);
      expect(content1.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content1.loc.end).toEqual({ line: 2, column: 4, index: 7 }); // tab = 4 columns

      const openBlock = lexer.lex();
      expect(openBlock.type).toBe(TokenType.OPEN_BLOCK);
      expect(openBlock.loc.start).toEqual({ line: 2, column: 4, index: 7 });
      expect(openBlock.loc.start.line).toBe(2);
    });

    it('should handle tabs at various positions in multi-line template', () => {
      lexer.setInput('\tline1\n\t\tline2\n{{foo}}');
      // String breakdown: '\t' (1) + 'line1' (5) + '\n' (1) + '\t\t' (2) + 'line2' (5) + '\n' (1) = 15 chars total

      const content = lexer.lex();
      expect(content.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(content.loc.end).toEqual({ line: 3, column: 0, index: 15 });

      const open = lexer.lex();
      expect(open.loc.start).toEqual({ line: 3, column: 0, index: 15 });
    });
  });
});
