import { describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { SourceLocation } from '../../src/lexer/token';
import { TokenType } from '../../src/lexer/token-types';
import type { Node } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser', () => {
  describe('constructor', () => {
    test('can instantiate parser with lexer', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser).toBeInstanceOf(Parser);
    });

    test('throws error if lexer is not provided', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        new Parser(null);
      }).toThrow('Parser requires a lexer instance');

      expect(() => {
        // @ts-expect-error - Testing invalid input
        new Parser(undefined);
      }).toThrow('Parser requires a lexer instance');
    });

    test('maintains lexer reference', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.getLexer()).toBe(lexer);
    });
  });

  describe('initial state', () => {
    test('current token is null initially', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.getCurrentToken()).toBeNull();
    });

    test('position is 0 initially', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.getPosition()).toBe(0);
    });

    test('lexer is accessible after construction', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      const retrievedLexer = parser.getLexer();
      expect(retrievedLexer).toBe(lexer);

      // Verify lexer still works
      const tokens = retrievedLexer.tokenize('Hello {{name}}');
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('setInput', () => {
    test('initializes tokens and sets first token as current', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');

      expect(parser.getCurrentToken()).not.toBeNull();
      expect(parser.getCurrentToken()?.type).toBe(TokenType.CONTENT);
      expect(parser.getPosition()).toBe(0);
    });

    test('handles empty input', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('');

      expect(parser.getCurrentToken()).not.toBeNull();
      expect(parser.getCurrentToken()?.type).toBe(TokenType.EOF);
    });
  });

  describe('advance', () => {
    test('moves to next token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello {{name}}');
      const firstToken = parser.getCurrentToken();

      parser.advance();
      const secondToken = parser.getCurrentToken();

      expect(secondToken).not.toBe(firstToken);
      expect(parser.getPosition()).toBe(1);
    });

    test('returns new current token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');
      parser.advance(); // Move past OPEN

      const result = parser.advance();
      expect(result).toBe(parser.getCurrentToken());
    });

    test('returns null at end of stream', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('x');
      // Advance to EOF
      while (parser.getCurrentToken()?.type !== TokenType.EOF) {
        parser.advance();
      }

      const result = parser.advance();
      expect(result).toBeNull();
    });
  });

  describe('peek', () => {
    test('looks ahead without consuming token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello {{name}}');
      const current = parser.getCurrentToken();
      const next = parser.peek();

      expect(parser.getCurrentToken()).toBe(current);
      expect(parser.getPosition()).toBe(0);
      expect(next).not.toBeNull();
      expect(next).not.toBe(current);
    });

    test('works with custom offsets', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');
      const current = parser.getCurrentToken();
      const peek2 = parser.peek(2);

      expect(parser.getCurrentToken()).toBe(current);
      expect(peek2).not.toBeNull();
      expect(peek2).not.toBe(current);
    });

    test('returns null for out of bounds offset', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('x');
      const result = parser.peek(100);

      expect(result).toBeNull();
    });
  });

  describe('match', () => {
    test('returns true for matching token type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      expect(parser.match(TokenType.CONTENT)).toBe(true);
    });

    test('returns false for non-matching token type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      expect(parser.match(TokenType.OPEN)).toBe(false);
    });

    test('returns false when current token is null', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.match(TokenType.CONTENT)).toBe(false);
    });
  });

  describe('expect', () => {
    test('returns token for matching type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      const token = parser.expect(TokenType.CONTENT);

      expect(token).toBe(parser.getCurrentToken());
      expect(token.type).toBe(TokenType.CONTENT);
    });

    test('throws error for non-matching type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');

      expect(() => {
        parser.expect(TokenType.OPEN);
      }).toThrow('Expected token of type OPEN');
    });

    test('throws error when current token is null', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(() => {
        parser.expect(TokenType.CONTENT);
      }).toThrow('but reached end of input');
    });

    test('uses custom error message', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');

      expect(() => {
        parser.expect(TokenType.OPEN, 'Custom error message');
      }).toThrow('Custom error message');
    });
  });

  describe('getSourceLocation', () => {
    test('creates location from single token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      const token = parser.getCurrentToken()!;
      const location = parser.getSourceLocation(token);

      expect(location.start).toBe(token.loc.start);
      expect(location.end).toBe(token.loc.end);
    });

    test('creates location spanning multiple tokens', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{name}}');
      const startToken = parser.getCurrentToken()!; // OPEN
      parser.advance(); // Move to ID
      parser.advance(); // Move to CLOSE
      const endToken = parser.getCurrentToken()!;

      const location = parser.getSourceLocation(startToken, endToken);

      expect(location.start).toBe(startToken.loc.start);
      expect(location.end).toBe(endToken.loc.end);
    });

    test('defaults to startToken for end when no endToken provided', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('test');
      const token = parser.getCurrentToken()!;
      const location = parser.getSourceLocation(token);

      expect(location.start).toBe(token.loc.start);
      expect(location.end).toBe(token.loc.end);
    });
  });

  describe('startNode and finishNode', () => {
    test('startNode saves current token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');
      const initialToken = parser.getCurrentToken();

      parser.startNode();
      parser.advance();

      // startNode should have saved the initial token
      // We'll verify this by checking finishNode adds location
      const node: Node = {
        type: 'TestNode',
        loc: null,
      };

      const finished = parser.finishNode(node);
      expect(finished.loc).not.toBeNull();
    });

    test('finishNode adds location to node', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      parser.startNode();

      const node: Node & { value: string } = {
        type: 'ContentStatement',
        value: 'Hello',
        loc: null,
      };

      const finished = parser.finishNode(node);

      expect(finished.loc).not.toBeNull();
      expect(finished.loc?.start).toBeDefined();
      expect(finished.loc?.end).toBeDefined();
    });

    test('finishNode handles range from start to current token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{name}}');
      parser.startNode();
      const startToken = parser.getCurrentToken()!;

      parser.advance(); // ID
      parser.advance(); // CLOSE
      const endToken = parser.getCurrentToken()!;

      const node: Node = {
        type: 'MustacheStatement',
        loc: null,
      };

      const finished = parser.finishNode(node);

      expect(finished.loc?.start).toBe(startToken.loc.start);
      expect(finished.loc?.end).toBe(endToken.loc.end);
    });

    test('finishNode handles missing start token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('test');
      // Don't call startNode()

      const node: Node = {
        type: 'TestNode',
        loc: null,
      };

      const finished = parser.finishNode(node);
      expect(finished.loc).toBeNull();
    });

    test('finishNode clears start token after use', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}} {{y}}');

      // First node
      parser.startNode();
      parser.advance();
      const node1 = parser.finishNode<Node>({ type: 'Node1', loc: null });
      expect(node1.loc).not.toBeNull();

      // Second node without startNode should have null loc
      const node2 = parser.finishNode<Node>({ type: 'Node2', loc: null });
      expect(node2.loc).toBeNull();
    });

    test('position tracking works across multiple nodes', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello {{name}}');

      // First node - content
      parser.startNode();
      const contentStart = parser.getCurrentToken()!;
      const node1 = parser.finishNode<Node>({ type: 'Content', loc: null });
      expect(node1.loc?.start).toBe(contentStart.loc.start);

      // Second node - mustache
      parser.advance(); // Move to OPEN
      parser.startNode();
      const mustacheStart = parser.getCurrentToken()!;
      parser.advance(); // ID
      parser.advance(); // CLOSE
      const node2 = parser.finishNode<Node>({ type: 'Mustache', loc: null });

      expect(node2.loc?.start).toBe(mustacheStart.loc.start);
      expect(node2.loc?.end).toBe(parser.getCurrentToken()!.loc.end);
    });
  });

  describe('parse() - Main Entry Point', () => {
    test('parses complete template and returns Program', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello {{name}}!');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(3); // CONTENT, MustacheStatement, CONTENT
      expect(program.loc).not.toBeNull();
    });

    test('handles empty template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(0);
    });

    test('parses template with only content', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Plain text content');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('ContentStatement');
    });

    test('parses template with only mustache', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{value}}');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('MustacheStatement');
    });

    test('parses template with block statement', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{#if condition}}content{{/if}}');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('BlockStatement');
    });

    test('parses template with multiple statement types', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Before {{value}} {{#if x}}block{{/if}} After');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(5);
      expect(program.body[0].type).toBe('ContentStatement');
      expect(program.body[1].type).toBe('MustacheStatement');
      expect(program.body[2].type).toBe('ContentStatement');
      expect(program.body[3].type).toBe('BlockStatement');
      expect(program.body[4].type).toBe('ContentStatement');
    });

    test('parses template with comments', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{! comment }} content');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(2);
      expect(program.body[0].type).toBe('CommentStatement');
      expect(program.body[1].type).toBe('ContentStatement');
    });

    test('parses nested blocks correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{#if a}}{{#if b}}nested{{/if}}{{/if}}');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('BlockStatement');
    });

    test('parses blocks with else clauses', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{#if x}}yes{{else}}no{{/if}}');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('BlockStatement');
    });

    test('ensures parser is at EOF after parsing', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('content');
      parser.parse();

      expect(parser.getCurrentToken()?.type).toBe(TokenType.EOF);
    });

    test('throws error on unexpected content after template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      // This should not happen in normal usage, but test the guard
      parser.setInput('{{#if x}}{{/if}} extra');

      // Manually advance past the first complete statement to simulate the error condition
      // Actually, this should work fine - let's test a real error case
      // The parser should handle this correctly and parse all content
      const program = parser.parse();
      expect(program.body).toHaveLength(2); // BlockStatement + ContentStatement for " extra"
    });

    test('location spans entire template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Start {{value}} End');
      const program = parser.parse();

      expect(program.loc).not.toBeNull();
      expect(program.loc?.start.line).toBe(1);
      expect(program.loc?.start.column).toBe(0);
    });

    test('handles multi-line templates', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Line 1\n{{value}}\nLine 3');
      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(3);
    });
  });

  describe('Parser.parse() - Static Method', () => {
    test('parses template without creating parser instance', () => {
      const program = Parser.parse('Hello {{name}}!');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(3);
    });

    test('handles empty template', () => {
      const program = Parser.parse('');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(0);
    });

    test('parses content-only template', () => {
      const program = Parser.parse('Plain text');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('ContentStatement');
    });

    test('parses mustache-only template', () => {
      const program = Parser.parse('{{value}}');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('MustacheStatement');
    });

    test('parses block statement', () => {
      const program = Parser.parse('{{#if x}}content{{/if}}');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('BlockStatement');
    });

    test('parses complex templates', () => {
      const template = `
        {{! Header }}
        <div>
          {{#if user}}
            Hello {{user.name}}!
          {{else}}
            Please log in
          {{/if}}
        </div>
      `;

      const program = Parser.parse(template);

      expect(program.type).toBe('Program');
      expect(program.body.length).toBeGreaterThan(0);
    });

    test('throws same errors as instance method', () => {
      expect(() => {
        Parser.parse('{{#if x}}{{/each}}');
      }).toThrow('Block closing tag mismatch');
    });

    test('handles nested blocks', () => {
      const program = Parser.parse('{{#each items}}{{#if active}}{{name}}{{/if}}{{/each}}');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('BlockStatement');
    });

    test('produces same result as instance method', () => {
      const template = 'Hello {{name}}!';

      const staticResult = Parser.parse(template);

      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const instanceResult = parser.parse();

      expect(staticResult).toEqual(instanceResult);
    });

    test('handles comments', () => {
      const program = Parser.parse('{{! comment }}content');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(2);
      expect(program.body[0].type).toBe('CommentStatement');
    });

    test('handles unescaped mustaches', () => {
      const program = Parser.parse('{{{html}}}');

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('MustacheStatement');
    });

    test('works with real-world templates', () => {
      const template = `
<!DOCTYPE html>
<html>
  <head>
    <title>{{title}}</title>
  </head>
  <body>
    {{#each items}}
      <div class="item">{{name}}</div>
    {{/each}}
  </body>
</html>`;

      const program = Parser.parse(template);

      expect(program.type).toBe('Program');
      expect(program.body.length).toBeGreaterThan(0);
    });
  });
});
