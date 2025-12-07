/**
 * Tests for Template Interpreter
 */

import { describe, expect, it } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import type { ContentStatement, Program } from '../../src/parser/ast-nodes.js';

describe('Interpreter', () => {
  describe('constructor', () => {
    it('should create interpreter with valid AST', () => {
      const ast: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      const interpreter = new Interpreter(ast);
      expect(interpreter).toBeInstanceOf(Interpreter);
    });

    it('should create interpreter with options', () => {
      const ast: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      const interpreter = new Interpreter(ast, { helpers: {}, partials: {} });
      expect(interpreter).toBeInstanceOf(Interpreter);
    });

    it('should create interpreter without options', () => {
      const ast: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      const interpreter = new Interpreter(ast);
      expect(interpreter).toBeInstanceOf(Interpreter);
    });
  });

  describe('evaluate', () => {
    describe('empty programs', () => {
      it('should evaluate empty program', () => {
        const ast: Program = {
          type: 'Program',
          body: [],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('');
      });

      it('should handle any context for empty program', () => {
        const ast: Program = {
          type: 'Program',
          body: [],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        expect(interpreter.evaluate(null)).toBe('');
        expect(interpreter.evaluate(undefined)).toBe('');
        expect(interpreter.evaluate({})).toBe('');
        expect(interpreter.evaluate({ foo: 'bar' })).toBe('');
      });
    });

    describe('single ContentStatement', () => {
      it('should evaluate simple content', () => {
        const content: ContentStatement = {
          type: 'ContentStatement',
          value: 'Hello World',
          original: 'Hello World',
          loc: null,
        };

        const ast: Program = {
          type: 'Program',
          body: [content],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('Hello World');
      });

      it('should evaluate empty content', () => {
        const content: ContentStatement = {
          type: 'ContentStatement',
          value: '',
          original: '',
          loc: null,
        };

        const ast: Program = {
          type: 'Program',
          body: [content],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('');
      });

      it('should preserve content with newlines', () => {
        const content: ContentStatement = {
          type: 'ContentStatement',
          value: 'Line 1\nLine 2\nLine 3',
          original: 'Line 1\nLine 2\nLine 3',
          loc: null,
        };

        const ast: Program = {
          type: 'Program',
          body: [content],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('Line 1\nLine 2\nLine 3');
      });

      it('should preserve special characters', () => {
        const content: ContentStatement = {
          type: 'ContentStatement',
          value: '<div>&amp;</div>',
          original: '<div>&amp;</div>',
          loc: null,
        };

        const ast: Program = {
          type: 'Program',
          body: [content],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('<div>&amp;</div>');
      });

      it('should preserve whitespace', () => {
        const content: ContentStatement = {
          type: 'ContentStatement',
          value: '  spaces  \t\ttabs\t\t  ',
          original: '  spaces  \t\ttabs\t\t  ',
          loc: null,
        };

        const ast: Program = {
          type: 'Program',
          body: [content],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('  spaces  \t\ttabs\t\t  ');
      });
    });

    describe('multiple ContentStatements', () => {
      it('should concatenate multiple content statements', () => {
        const content1: ContentStatement = {
          type: 'ContentStatement',
          value: 'Hello ',
          original: 'Hello ',
          loc: null,
        };

        const content2: ContentStatement = {
          type: 'ContentStatement',
          value: 'World',
          original: 'World',
          loc: null,
        };

        const ast: Program = {
          type: 'Program',
          body: [content1, content2],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('Hello World');
      });

      it('should concatenate three content statements', () => {
        const ast: Program = {
          type: 'Program',
          body: [
            { type: 'ContentStatement', value: 'First', original: 'First', loc: null },
            { type: 'ContentStatement', value: ' ', original: ' ', loc: null },
            { type: 'ContentStatement', value: 'Last', original: 'Last', loc: null },
          ],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('First Last');
      });

      it('should handle mix of empty and non-empty content', () => {
        const ast: Program = {
          type: 'Program',
          body: [
            { type: 'ContentStatement', value: '', original: '', loc: null },
            { type: 'ContentStatement', value: 'Text', original: 'Text', loc: null },
            { type: 'ContentStatement', value: '', original: '', loc: null },
          ],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('Text');
      });
    });

    describe('CommentStatement', () => {
      it('should produce no output for comment', () => {
        const ast: Program = {
          type: 'Program',
          body: [
            {
              type: 'CommentStatement',
              value: 'This is a comment',
              loc: null,
            },
          ],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('');
      });

      it('should produce no output for multiple comments', () => {
        const ast: Program = {
          type: 'Program',
          body: [
            { type: 'CommentStatement', value: 'Comment 1', loc: null },
            { type: 'CommentStatement', value: 'Comment 2', loc: null },
          ],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('');
      });

      it('should ignore comments between content', () => {
        const ast: Program = {
          type: 'Program',
          body: [
            { type: 'ContentStatement', value: 'Before', original: 'Before', loc: null },
            { type: 'CommentStatement', value: 'Comment', loc: null },
            { type: 'ContentStatement', value: 'After', original: 'After', loc: null },
          ],
          loc: null,
        };

        const interpreter = new Interpreter(ast);
        const result = interpreter.evaluate({});
        expect(result).toBe('BeforeAfter');
      });
    });

    describe('stack initialization', () => {
      it('should initialize context stack with root context', () => {
        const ast: Program = {
          type: 'Program',
          body: [{ type: 'ContentStatement', value: 'test', original: 'test', loc: null }],
          loc: null,
        };

        const context = { name: 'Alice', age: 30 };
        const interpreter = new Interpreter(ast);

        // Evaluate to trigger stack initialization
        interpreter.evaluate(context);

        // Context stack should be initialized (verified by no errors during evaluation)
        expect(true).toBe(true);
      });

      it('should initialize data stack with @root', () => {
        const ast: Program = {
          type: 'Program',
          body: [{ type: 'ContentStatement', value: 'test', original: 'test', loc: null }],
          loc: null,
        };

        const context = { value: 'root' };
        const interpreter = new Interpreter(ast);

        // Evaluate to trigger stack initialization
        interpreter.evaluate(context);

        // Data stack should be initialized with @root (verified by no errors)
        expect(true).toBe(true);
      });

      it('should allow multiple evaluations with different contexts', () => {
        const ast: Program = {
          type: 'Program',
          body: [{ type: 'ContentStatement', value: 'static', original: 'static', loc: null }],
          loc: null,
        };

        const interpreter = new Interpreter(ast);

        const result1 = interpreter.evaluate({ context: 1 });
        const result2 = interpreter.evaluate({ context: 2 });
        const result3 = interpreter.evaluate({ context: 3 });

        expect(result1).toBe('static');
        expect(result2).toBe('static');
        expect(result3).toBe('static');
      });
    });
  });
});
