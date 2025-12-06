import { describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { CommentStatement } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Comment Parsing', () => {
  describe('parseCommentStatement', () => {
    test('parses regular comments correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{! This is a comment }}');
      const node = parser.parseCommentStatement();

      expect(node.type).toBe('CommentStatement');
      expect(node.value).toBe(' This is a comment ');
    });

    test('parses block comments correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{!-- This is a block comment --}}');
      const node = parser.parseCommentStatement();

      expect(node.type).toBe('CommentStatement');
      expect(node.value).toBe(' This is a block comment ');
    });

    test('creates CommentStatement with correct structure', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{! test }}');
      const node = parser.parseCommentStatement();

      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('value');
      expect(node).toHaveProperty('loc');
      expect(node.type).toBe('CommentStatement');
    });

    test('includes proper location information', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{! comment }}');
      const node = parser.parseCommentStatement();

      expect(node.loc).not.toBeNull();
      expect(node.loc?.start).toBeDefined();
      expect(node.loc?.end).toBeDefined();
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.start.column).toBe(0);
    });

    test('strips comment delimiters from value', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      // Regular comment
      parser.setInput('{{!comment}}');
      const node1 = parser.parseCommentStatement();
      expect(node1.value).toBe('comment');
      expect(node1.value).not.toContain('{{!');
      expect(node1.value).not.toContain('}}');

      // Block comment
      parser.setInput('{{!--block--}}');
      const node2 = parser.parseCommentStatement();
      expect(node2.value).toBe('block');
      expect(node2.value).not.toContain('{{!--');
      expect(node2.value).not.toContain('--}}');
    });

    test('handles multi-line comments', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      const multiLineComment = `{{!--
        Line 1
        Line 2
        Line 3
      --}}`;

      parser.setInput(multiLineComment);
      const node = parser.parseCommentStatement();

      expect(node.type).toBe('CommentStatement');
      expect(node.value).toContain('Line 1');
      expect(node.value).toContain('Line 2');
      expect(node.value).toContain('Line 3');
    });

    test('handles empty comments', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{!}}');
      const node1 = parser.parseCommentStatement();
      expect(node1.value).toBe('');

      parser.setInput('{{!----}}');
      const node2 = parser.parseCommentStatement();
      expect(node2.value).toBe('');
    });

    test('advances parser position after parsing', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{! comment }} after');
      const initialPosition = parser.getPosition();

      parser.parseCommentStatement();

      expect(parser.getPosition()).toBe(initialPosition + 1);
    });

    test('throws error if current token is not COMMENT', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');

      expect(() => {
        parser.parseCommentStatement();
      }).toThrow('Expected token of type COMMENT');
    });

    test('handles comments with special characters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      const specialComment = '{{! Comment with <html> & "quotes" }}';
      parser.setInput(specialComment);
      const node = parser.parseCommentStatement();

      expect(node.value).toContain('<html>');
      expect(node.value).toContain('&');
      expect(node.value).toContain('"quotes"');
    });

    test('handles comments between content', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Before {{! comment }} After');

      // Parse first content
      parser.parseContentStatement();

      // Parse comment
      const comment = parser.parseCommentStatement();
      expect(comment.type).toBe('CommentStatement');
      expect(comment.value).toBe(' comment ');

      // Parse second content
      const content2 = parser.parseContentStatement();
      expect(content2.type).toBe('ContentStatement');
    });
  });
});
