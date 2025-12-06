import { describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { ContentStatement } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Content Parsing', () => {
  describe('parseContentStatement', () => {
    test('parses simple content correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello, world!');
      const node = parser.parseContentStatement();

      expect(node.type).toBe('ContentStatement');
      expect(node.value).toBe('Hello, world!');
      expect(node.original).toBe('Hello, world!');
    });

    test('creates ContentStatement with correct structure', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Test content');
      const node = parser.parseContentStatement();

      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('value');
      expect(node).toHaveProperty('original');
      expect(node).toHaveProperty('loc');
      expect(node.type).toBe('ContentStatement');
    });

    test('includes proper location information', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Content text');
      const node = parser.parseContentStatement();

      expect(node.loc).not.toBeNull();
      expect(node.loc?.start).toBeDefined();
      expect(node.loc?.end).toBeDefined();
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.start.column).toBe(0);
    });

    test('handles multiple content segments', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('First content {{x}} Second content');

      // Parse first content
      const node1 = parser.parseContentStatement();
      expect(node1.value).toBe('First content ');
      expect(node1.type).toBe('ContentStatement');

      // Skip mustache tokens
      parser.advance(); // OPEN
      parser.advance(); // ID
      parser.advance(); // CLOSE

      // Parse second content
      const node2 = parser.parseContentStatement();
      expect(node2.value).toBe(' Second content');
      expect(node2.type).toBe('ContentStatement');
    });

    test('content values preserve original text', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      const originalText = 'Text with   spaces\tand\ttabs';
      parser.setInput(originalText);
      const node = parser.parseContentStatement();

      expect(node.value).toBe(originalText);
      expect(node.original).toBe(originalText);
    });

    test('handles content with special characters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      const specialText = 'Text with <html> & "quotes" and \\backslashes';
      parser.setInput(specialText);
      const node = parser.parseContentStatement();

      expect(node.value).toBe(specialText);
    });

    test('advances parser position after parsing', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Content {{x}}');
      const initialPosition = parser.getPosition();

      parser.parseContentStatement();

      expect(parser.getPosition()).toBe(initialPosition + 1);
    });

    test('throws error if current token is not CONTENT', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');

      expect(() => {
        parser.parseContentStatement();
      }).toThrow('Expected token of type CONTENT');
    });
  });
});
