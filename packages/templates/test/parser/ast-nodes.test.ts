import { describe, expect, test } from 'vitest';
import type { Position, SourceLocation } from '../../src/lexer/token';
import type { Node } from '../../src/parser/ast-nodes';

describe('AST Base Node Types', () => {
  describe('Node interface', () => {
    test('has required type field', () => {
      const node: Node = {
        type: 'TestNode',
        loc: null,
      };

      expect(node.type).toBe('TestNode');
    });

    test('has loc field that can be null', () => {
      const node: Node = {
        type: 'TestNode',
        loc: null,
      };

      expect(node.loc).toBeNull();
    });

    test('has loc field that can be SourceLocation', () => {
      const loc: SourceLocation = {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 5, index: 5 },
      };

      const node: Node = {
        type: 'TestNode',
        loc,
      };

      expect(node.loc).toBe(loc);
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.end.column).toBe(5);
    });

    test('type field is string discriminator', () => {
      const node1: Node = { type: 'TypeA', loc: null };
      const node2: Node = { type: 'TypeB', loc: null };

      expect(node1.type).not.toBe(node2.type);
    });
  });

  describe('SourceLocation compatibility', () => {
    test('SourceLocation from lexer is compatible with parser', () => {
      // This test verifies we can use lexer's SourceLocation in parser nodes
      const lexerLoc: SourceLocation = {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 10, index: 10 },
      };

      const node: Node = {
        type: 'TestNode',
        loc: lexerLoc,
      };

      expect(node.loc).toBe(lexerLoc);
    });

    test('Position from lexer is compatible with parser', () => {
      const position: Position = {
        line: 5,
        column: 10,
        index: 42,
      };

      const loc: SourceLocation = {
        start: position,
        end: { line: 5, column: 15, index: 47 },
      };

      const node: Node = {
        type: 'TestNode',
        loc,
      };

      expect(node.loc?.start).toBe(position);
      expect(node.loc?.start.line).toBe(5);
      expect(node.loc?.start.column).toBe(10);
      expect(node.loc?.start.index).toBe(42);
    });
  });

  describe('Node creation', () => {
    test('can create minimal node', () => {
      const node: Node = {
        type: 'Minimal',
        loc: null,
      };

      expect(node).toMatchObject({
        type: 'Minimal',
        loc: null,
      });
    });

    test('can create node with full location', () => {
      const node: Node = {
        type: 'Located',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 3, column: 5, index: 42 },
        },
      };

      expect(node.type).toBe('Located');
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.end.line).toBe(3);
      expect(node.loc?.end.index).toBe(42);
    });

    test('can create multiple nodes with different types', () => {
      const nodes: Node[] = [
        { type: 'ContentStatement', loc: null },
        { type: 'MustacheStatement', loc: null },
        { type: 'BlockStatement', loc: null },
      ];

      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe('ContentStatement');
      expect(nodes[1].type).toBe('MustacheStatement');
      expect(nodes[2].type).toBe('BlockStatement');
    });
  });

  describe('Type safety', () => {
    test('Node interface enforces required fields', () => {
      // This is a compile-time test - if it compiles, the test passes
      // @ts-expect-error - missing required fields
      const invalid1: Node = {};

      // @ts-expect-error - missing loc field
      const invalid2: Node = { type: 'Test' };

      // Valid nodes
      const valid1: Node = { type: 'Test', loc: null };
      const valid2: Node = {
        type: 'Test',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 1, index: 1 },
        },
      };

      expect(valid1).toBeDefined();
      expect(valid2).toBeDefined();
    });

    test('loc field is nullable', () => {
      const withLoc: Node = {
        type: 'Test',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 1, index: 1 },
        },
      };

      const withoutLoc: Node = {
        type: 'Test',
        loc: null,
      };

      expect(withLoc.loc).not.toBeNull();
      expect(withoutLoc.loc).toBeNull();
    });
  });
});
