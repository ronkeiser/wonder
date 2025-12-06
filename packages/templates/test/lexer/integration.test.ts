import { beforeEach, describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer Integration Tests', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Real-world HTML templates', () => {
    test('tokenizes complete HTML email template', () => {
      const template = `<!DOCTYPE html>
<html>
<head>
  <title>{{subject}}</title>
</head>
<body>
  <h1>Hello {{user.firstName}} {{user.lastName}}!</h1>
  
  {{#if order}}
  <p>Your order #{{order.id}} has been {{order.status}}.</p>
  
  {{#if order.tracking}}
  <p>Track your package: <a href="{{order.trackingUrl}}">{{order.trackingNumber}}</a></p>
  {{/if}}
  {{/if}}
  
  {{#each items}}
  <div class="item">
    <span>{{name}}</span> - <span>\${{price}}</span>
  </div>
  {{/each}}
  
  {{! This is a comment about the footer }}
  <footer>
    &copy; {{year}} {{companyName}}
  </footer>
</body>
</html>`;

      const tokens = lexer.tokenize(template);

      // Should successfully tokenize without errors
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);

      // Verify key identifiers are captured
      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('subject');
      expect(ids).toContain('user');
      expect(ids).toContain('firstName');
      expect(ids).toContain('order');
      expect(ids).toContain('items');
      expect(ids).toContain('year');

      // Verify block structures
      const openBlocks = tokens.filter((t) => t.type === TokenType.OPEN_BLOCK);
      const endBlocks = tokens.filter((t) => t.type === TokenType.OPEN_ENDBLOCK);
      expect(openBlocks.length).toBe(endBlocks.length); // Balanced blocks

      // Verify comment is captured
      const comments = tokens.filter((t) => t.type === TokenType.COMMENT);
      expect(comments.length).toBe(1);
      expect(comments[0].value).toContain('footer');

      // Verify HTML content is preserved
      const content = tokens.filter((t) => t.type === TokenType.CONTENT);
      const hasDoctype = content.some((t) => t.value.includes('DOCTYPE'));
      const hasHtmlTags = content.some((t) => t.value.includes('<html>'));
      expect(hasDoctype).toBe(true);
      expect(hasHtmlTags).toBe(true);
    });

    test('tokenizes HTML with inline styles and attributes', () => {
      const template = `<div class="{{className}}" style="color: {{color}}; background: {{bgColor}}" data-id="{{id}}">
  {{content}}
</div>`;

      const tokens = lexer.tokenize(template);

      // All mustaches should be properly tokenized
      const opens = tokens.filter((t) => t.type === TokenType.OPEN);
      expect(opens.length).toBe(5);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toEqual(['className', 'color', 'bgColor', 'id', 'content']);
    });

    test('tokenizes SVG template with paths', () => {
      const template = `<svg viewBox="0 0 100 100">
  {{#if showCircle}}
  <circle cx="{{circle.x}}" cy="{{circle.y}}" r="{{circle.radius}}" fill="{{circle.color}}" />
  {{/if}}
  <path d="{{pathData}}" />
</svg>`;

      const tokens = lexer.tokenize(template);

      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);

      // Verify path expressions with dots
      const seps = tokens.filter((t) => t.type === TokenType.SEP);
      expect(seps.length).toBeGreaterThan(0);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('circle');
      expect(ids).toContain('x');
      expect(ids).toContain('y');
      expect(ids).toContain('radius');
    });
  });

  describe('Deeply nested structures', () => {
    test('handles deeply nested blocks', () => {
      const template = `
{{#each level1}}
  {{#if level1.show}}
    {{#each level2}}
      {{#if level2.show}}
        {{#each level3}}
          {{#if level3.show}}
            {{level3.value}}
          {{/if}}
        {{/each}}
      {{/if}}
    {{/each}}
  {{/if}}
{{/each}}`;

      const tokens = lexer.tokenize(template);

      const openBlocks = tokens.filter((t) => t.type === TokenType.OPEN_BLOCK);
      const endBlocks = tokens.filter((t) => t.type === TokenType.OPEN_ENDBLOCK);

      expect(openBlocks.length).toBe(6); // 3 each + 3 if
      expect(endBlocks.length).toBe(6);
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });

    test('handles nested blocks with multiple levels', () => {
      const template = `
{{#each users}}
  {{#if user.active}}
    <div>{{user.name}}: {{user.email}}</div>
  {{/if}}
{{/each}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);

      // Verify block structures
      const openBlocks = tokens.filter((t) => t.type === TokenType.OPEN_BLOCK);
      const endBlocks = tokens.filter((t) => t.type === TokenType.OPEN_ENDBLOCK);

      expect(openBlocks.length).toBe(2); // each and if
      expect(endBlocks.length).toBe(2);
    });
  });

  describe('Complex expressions and helpers', () => {
    test('tokenizes template with helper functions and parameters', () => {
      const template = `{{helper "string" 123 true false null undefined}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('helper');
      expect(tokens[2].type).toBe(TokenType.STRING);
      expect(tokens[2].value).toBe('string');
      expect(tokens[3].type).toBe(TokenType.NUMBER);
      expect(tokens[3].value).toBe('123');
      expect(tokens[4].type).toBe(TokenType.BOOLEAN);
      expect(tokens[4].value).toBe('true');
      expect(tokens[5].type).toBe(TokenType.BOOLEAN);
      expect(tokens[5].value).toBe('false');
      expect(tokens[6].type).toBe(TokenType.NULL);
      expect(tokens[7].type).toBe(TokenType.UNDEFINED);
    });

    test('tokenizes multiple helpers with string and path parameters', () => {
      const template = `{{format user.createdAt "YYYY-MM-DD" locale}}`;

      const tokens = lexer.tokenize(template);

      // Verify basic structure
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('format');

      // Should have multiple identifiers and strings
      const ids = tokens.filter((t) => t.type === TokenType.ID);
      const strings = tokens.filter((t) => t.type === TokenType.STRING);
      expect(ids.length).toBe(4); // format, user, createdAt, locale
      expect(strings.length).toBe(1); // "YYYY-MM-DD"
    });

    test('tokenizes helper with multiple arguments', () => {
      const template = `{{helper "value1" 123 variable}}`;

      const tokens = lexer.tokenize(template);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('helper');
      expect(ids).toContain('variable');

      const strings = tokens.filter((t) => t.type === TokenType.STRING);
      expect(strings[0].value).toBe('value1');

      const numbers = tokens.filter((t) => t.type === TokenType.NUMBER);
      expect(numbers[0].value).toBe('123');
    });
  });

  describe('Path expressions and data access', () => {
    test('tokenizes complex path expressions', () => {
      const template = `{{user.profile.contact.email}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('user');
      expect(tokens[2].type).toBe(TokenType.SEP);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('profile');
      expect(tokens[4].type).toBe(TokenType.SEP);
      expect(tokens[5].type).toBe(TokenType.ID);
      expect(tokens[5].value).toBe('contact');
      expect(tokens[6].type).toBe(TokenType.SEP);
      expect(tokens[7].type).toBe(TokenType.ID);
      expect(tokens[7].value).toBe('email');
    });

    test('tokenizes parent path access', () => {
      const template = `{{#each items}}{{../parentValue}}{{/each}}`;

      const tokens = lexer.tokenize(template);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('items');
      expect(ids).toContain('..');
      expect(ids).toContain('parentValue');
    });

    test('tokenizes data variable access', () => {
      const template = `{{@root.title}} {{@index}} {{@key}} {{@first}} {{@last}}`;

      const tokens = lexer.tokenize(template);

      const dataVars = tokens.filter((t) => t.type === TokenType.DATA);
      expect(dataVars.length).toBe(5);

      // @ is the DATA token value
      dataVars.forEach((token) => {
        expect(token.value).toBe('@');
      });

      // Following identifiers should be the variable names
      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('root');
      expect(ids).toContain('index');
      expect(ids).toContain('key');
      expect(ids).toContain('first');
      expect(ids).toContain('last');
    });

    test('tokenizes data variable with path', () => {
      const template = `{{@root.user.name}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[1].type).toBe(TokenType.DATA);
      expect(tokens[1].value).toBe('@');
      expect(tokens[2].type).toBe(TokenType.ID);
      expect(tokens[2].value).toBe('root');
      expect(tokens[3].type).toBe(TokenType.SEP);
      expect(tokens[4].type).toBe(TokenType.ID);
      expect(tokens[4].value).toBe('user');
    });
  });

  describe('Whitespace and formatting', () => {
    test('preserves whitespace in content', () => {
      const template = `
        Line with leading spaces
          Line with more spaces
      {{value}}
        Trailing content
      `;

      const tokens = lexer.tokenize(template);

      const content = tokens.filter((t) => t.type === TokenType.CONTENT);
      expect(content.length).toBeGreaterThan(0);

      // Whitespace should be preserved
      const hasLeadingSpaces = content.some((t) => t.value.includes('  '));
      expect(hasLeadingSpaces).toBe(true);
    });

    test('handles tabs and mixed whitespace', () => {
      const template = `\t{{value}}\t\n  {{another}}  `;

      const tokens = lexer.tokenize(template);

      const content = tokens.filter((t) => t.type === TokenType.CONTENT);
      // Should have content tokens with tabs and spaces
      expect(content.some((t) => t.value.includes('\t') || t.value.includes('  '))).toBe(true);
    });

    test('handles multiple consecutive newlines', () => {
      const template = `{{value}}\n\n\n{{another}}`;

      const tokens = lexer.tokenize(template);

      const content = tokens.filter((t) => t.type === TokenType.CONTENT);
      expect(content.length).toBe(1);
      expect(content[0].value).toBe('\n\n\n');
    });
  });

  describe('Comments in various contexts', () => {
    test('handles comments between mustaches', () => {
      const template = `{{first}}{{! comment }}{{second}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('first');
      expect(tokens[2].type).toBe(TokenType.CLOSE);
      expect(tokens[3].type).toBe(TokenType.COMMENT);
      expect(tokens[3].value).toContain('comment');
      expect(tokens[4].type).toBe(TokenType.OPEN);
      expect(tokens[5].type).toBe(TokenType.ID);
      expect(tokens[5].value).toBe('second');
    });

    test('handles block comments with mustache-like content', () => {
      const template = `{{!-- This comment contains {{fake}} mustaches --}}{{real}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.COMMENT);
      expect(tokens[0].value).toContain('{{fake}}');
      expect(tokens[1].type).toBe(TokenType.OPEN);
      expect(tokens[2].type).toBe(TokenType.ID);
      expect(tokens[2].value).toBe('real');
    });

    test('handles comments in nested blocks', () => {
      const template = `
{{#if condition}}
  {{! Comment in if block }}
  {{value}}
  {{#each items}}
    {{! Comment in each block }}
    {{item}}
  {{/each}}
{{/if}}`;

      const tokens = lexer.tokenize(template);

      const comments = tokens.filter((t) => t.type === TokenType.COMMENT);
      expect(comments.length).toBe(2);
    });
  });

  describe('Escaped sequences', () => {
    test('handles escaped mustache delimiters in content', () => {
      const template = `Before \\{{notAMustache}} After`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[0].value).toBe('Before {{notAMustache}} After');
      expect(tokens[1].type).toBe(TokenType.EOF);
    });

    test('handles multiple escaped sequences', () => {
      const template = `\\{{first}} \\{{second}} {{real}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[0].value).toBe('{{first}} {{second}} ');
      expect(tokens[1].type).toBe(TokenType.OPEN);
      expect(tokens[2].type).toBe(TokenType.ID);
      expect(tokens[2].value).toBe('real');
    });

    test('handles escaped sequences in strings', () => {
      const template = `{{helper "string with \\"quotes\\"" 'and \\'apostrophes\\''}}`;

      const tokens = lexer.tokenize(template);

      const strings = tokens.filter((t) => t.type === TokenType.STRING);
      expect(strings[0].value).toBe('string with "quotes"');
      expect(strings[1].value).toBe("and 'apostrophes'");
    });

    test('handles backslash before non-special characters', () => {
      const template = `{{helper "string\\nwith\\tescapes"}}`;

      const tokens = lexer.tokenize(template);

      const strings = tokens.filter((t) => t.type === TokenType.STRING);
      expect(strings[0].value).toContain('\\n');
      expect(strings[0].value).toContain('\\t');
    });
  });

  describe('Edge cases and boundary conditions', () => {
    test('handles empty mustaches', () => {
      const template = `{{}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.CLOSE);
      expect(tokens[2].type).toBe(TokenType.EOF);
    });

    test('handles mustache at start of template', () => {
      const template = `{{value}} content`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
    });

    test('handles mustache at end of template', () => {
      const template = `content {{value}}`;

      const tokens = lexer.tokenize(template);

      const lastNonEof = tokens[tokens.length - 2];
      expect(lastNonEof.type).toBe(TokenType.CLOSE);
    });

    test('handles consecutive mustaches with no content between', () => {
      const template = `{{first}}{{second}}{{third}}`;

      const tokens = lexer.tokenize(template);

      // Should be OPEN, ID, CLOSE, OPEN, ID, CLOSE, OPEN, ID, CLOSE, EOF
      expect(tokens.length).toBe(10);
      expect(tokens.filter((t) => t.type === TokenType.CONTENT).length).toBe(0);
    });

    test('handles single character identifiers', () => {
      const template = `{{a}} {{b}} {{c}}`;

      const tokens = lexer.tokenize(template);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toEqual(['a', 'b', 'c']);
    });

    test('handles very long identifiers', () => {
      const longId = 'a'.repeat(1000);
      const template = `{{${longId}}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value.length).toBe(1000);
    });

    test('handles template with only whitespace', () => {
      const template = `   \n\t  \n   `;

      const tokens = lexer.tokenize(template);

      expect(tokens.length).toBe(2); // CONTENT, EOF
      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[1].type).toBe(TokenType.EOF);
    });
  });

  describe('Performance with large templates', () => {
    test('handles template with many mustaches', () => {
      const parts: string[] = [];
      for (let i = 0; i < 100; i++) {
        parts.push(`{{value${i}}}`);
      }
      const template = parts.join(' ');

      const tokens = lexer.tokenize(template);

      // 100 mustaches = 100 * 3 tokens (OPEN, ID, CLOSE) + 99 CONTENT (spaces) + EOF
      expect(tokens.length).toBe(400);
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });

    test('handles template with large content blocks', () => {
      const largeContent = 'x'.repeat(10000);
      const template = `${largeContent}{{value}}${largeContent}`;

      const tokens = lexer.tokenize(template);

      const content = tokens.filter((t) => t.type === TokenType.CONTENT);
      expect(content.length).toBe(2);
      expect(content[0].value.length).toBe(10000);
      expect(content[1].value.length).toBe(10000);
    });

    test('handles deeply nested path expressions', () => {
      const parts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const path = parts.join('.');
      const template = `{{${path}}}`;

      const tokens = lexer.tokenize(template);

      const ids = tokens.filter((t) => t.type === TokenType.ID);
      const seps = tokens.filter((t) => t.type === TokenType.SEP);

      expect(ids.length).toBe(10);
      expect(seps.length).toBe(9);
    });
  });

  describe('Error recovery and malformed templates', () => {
    test('throws on unclosed comment at end of template', () => {
      const template = `
<div>
  {{#if condition}}
    {{value}}
  {{/if}}
  {{! This comment is not closed
</div>`;

      expect(() => {
        lexer.tokenize(template);
      }).toThrow('Unclosed comment');
    });

    test('throws on unclosed string in nested context', () => {
      const template = `
{{#each items}}
  {{helper "unclosed string}}
{{/each}}`;

      expect(() => {
        lexer.tokenize(template);
      }).toThrow('Unclosed string');
    });

    test('provides correct position for errors in multiline templates', () => {
      const template = `Line 1
Line 2
Line 3 with {{! unclosed comment`;

      try {
        lexer.tokenize(template);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.line).toBe(3);
        expect(error.message).toContain('line 3');
      }
    });
  });

  describe('Subexpression integration', () => {
    test('tokenizes simple subexpression in block helper', () => {
      const template = `{{#if (gt x 1)}}greater{{/if}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('if');
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('gt');
      expect(tokens[4].type).toBe(TokenType.ID);
      expect(tokens[4].value).toBe('x');
      expect(tokens[5].type).toBe(TokenType.NUMBER);
      expect(tokens[5].value).toBe('1');
      expect(tokens[6].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[7].type).toBe(TokenType.CLOSE);
    });

    test('tokenizes nested subexpressions (2 levels)', () => {
      const template = `{{#if (and (gt x 1) (lt x 10))}}in range{{/if}}`;

      const tokens = lexer.tokenize(template);

      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexpr.length).toBe(3); // Main and, gt, lt
      expect(closeSexpr.length).toBe(3);
      expect(openSexpr.length).toBe(closeSexpr.length);

      // Verify structure: OPEN_BLOCK, ID(if), OPEN_SEXPR, ID(and), OPEN_SEXPR, ID(gt)...
      expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
      expect(tokens[1].value).toBe('if');
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].value).toBe('and');
      expect(tokens[4].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[5].value).toBe('gt');
    });

    test('tokenizes deeply nested subexpressions (5+ levels)', () => {
      const template = `{{#if (a (b (c (d (e x)))))}}deep{{/if}}`;

      const tokens = lexer.tokenize(template);

      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexpr.length).toBe(5);
      expect(closeSexpr.length).toBe(5);

      // Verify helper names in sequence
      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
      expect(ids).toContain('d');
      expect(ids).toContain('e');
      expect(ids).toContain('x');
    });

    test('tokenizes subexpression with string literal', () => {
      const template = `{{#if (eq status "active")}}active user{{/if}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('eq');
      expect(tokens[4].type).toBe(TokenType.ID);
      expect(tokens[4].value).toBe('status');
      expect(tokens[5].type).toBe(TokenType.STRING);
      expect(tokens[5].value).toBe('active');
      expect(tokens[6].type).toBe(TokenType.CLOSE_SEXPR);
    });

    test('tokenizes subexpression with multiple parameters', () => {
      const template = `{{#if (between value 1 100)}}in range{{/if}}`;

      const tokens = lexer.tokenize(template);

      const sexprStart = tokens.findIndex((t) => t.type === TokenType.OPEN_SEXPR);
      expect(tokens[sexprStart + 1].value).toBe('between');
      expect(tokens[sexprStart + 2].value).toBe('value');
      expect(tokens[sexprStart + 3].type).toBe(TokenType.NUMBER);
      expect(tokens[sexprStart + 3].value).toBe('1');
      expect(tokens[sexprStart + 4].type).toBe(TokenType.NUMBER);
      expect(tokens[sexprStart + 4].value).toBe('100');
    });

    test('tokenizes subexpression with all literal types', () => {
      const template = `{{helper (sub "text" 42 true false null undefined)}}`;

      const tokens = lexer.tokenize(template);

      const sexprStart = tokens.findIndex((t) => t.type === TokenType.OPEN_SEXPR);
      expect(tokens[sexprStart + 2].type).toBe(TokenType.STRING);
      expect(tokens[sexprStart + 2].value).toBe('text');
      expect(tokens[sexprStart + 3].type).toBe(TokenType.NUMBER);
      expect(tokens[sexprStart + 3].value).toBe('42');
      expect(tokens[sexprStart + 4].type).toBe(TokenType.BOOLEAN);
      expect(tokens[sexprStart + 4].value).toBe('true');
      expect(tokens[sexprStart + 5].type).toBe(TokenType.BOOLEAN);
      expect(tokens[sexprStart + 5].value).toBe('false');
      expect(tokens[sexprStart + 6].type).toBe(TokenType.NULL);
      expect(tokens[sexprStart + 7].type).toBe(TokenType.UNDEFINED);
    });

    test('tokenizes subexpression in mustache statement', () => {
      const template = `{{uppercase (concat firstName lastName)}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('uppercase');
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('concat');
      expect(tokens[4].type).toBe(TokenType.ID);
      expect(tokens[4].value).toBe('firstName');
      expect(tokens[5].type).toBe(TokenType.ID);
      expect(tokens[5].value).toBe('lastName');
      expect(tokens[6].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[7].type).toBe(TokenType.CLOSE);
    });

    test('tokenizes empty subexpression', () => {
      const template = `{{helper ()}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].type).toBe(TokenType.CLOSE_SEXPR);
    });

    test('tokenizes whitespace inside subexpressions', () => {
      const template = `{{#if ( gt   x   1 )}}yes{{/if}}`;

      const tokens = lexer.tokenize(template);

      // Whitespace should be handled, parentheses should tokenize
      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);
      expect(openSexpr.length).toBe(1);
      expect(closeSexpr.length).toBe(1);

      // IDs should still be recognized despite extra whitespace
      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('gt');
      expect(ids).toContain('x');
    });

    test('tokenizes unmatched parentheses (lexer should tokenize, parser will catch)', () => {
      const template = `{{helper (sub x}}`;

      const tokens = lexer.tokenize(template);

      // Lexer should successfully tokenize, even with unmatched parens
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      // Parser will detect the mismatch later
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);
      expect(closeSexpr.length).toBe(0); // No closing paren
    });

    test('tokenizes parentheses in content (not subexpressions)', () => {
      const template = `Text with (parentheses) {{value}}`;

      const tokens = lexer.tokenize(template);

      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[0].value).toContain('(parentheses)');
      // No OPEN_SEXPR/CLOSE_SEXPR tokens since they're in CONTENT
      const sexpr = tokens.filter(
        (t) => t.type === TokenType.OPEN_SEXPR || t.type === TokenType.CLOSE_SEXPR,
      );
      expect(sexpr.length).toBe(0);
    });

    test('tokenizes real-world template with comparison helpers', () => {
      const template = `
<div class="items">
  {{#each users}}
    {{#if (and (gte age 18) (eq status "active"))}}
      <div class="user">
        <span>{{name}}</span>
        {{#if (gt score 80)}}
          <span class="badge">Top Performer</span>
        {{/if}}
      </div>
    {{/if}}
  {{/each}}
</div>`;

      const tokens = lexer.tokenize(template);

      // Count subexpressions
      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexpr.length).toBe(4); // and, gte, eq, gt
      expect(closeSexpr.length).toBe(4);

      // Verify comparison helpers are recognized
      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('and');
      expect(ids).toContain('gte');
      expect(ids).toContain('eq');
      expect(ids).toContain('gt');
    });

    test('tokenizes complex nested template with mixed blocks and subexpressions', () => {
      const template = `
{{#each items}}
  {{#if (or (eq type "featured") (gt priority 5))}}
    <div class="{{type}}">
      {{#if (and available (not soldOut))}}
        <button>{{formatPrice (multiply price quantity)}}</button>
      {{else}}
        <span class="unavailable">Out of Stock</span>
      {{/if}}
    </div>
  {{/if}}
{{/each}}`;

      const tokens = lexer.tokenize(template);

      // Should successfully tokenize
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);

      // Count structures
      const openBlocks = tokens.filter((t) => t.type === TokenType.OPEN_BLOCK);
      const endBlocks = tokens.filter((t) => t.type === TokenType.OPEN_ENDBLOCK);
      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openBlocks.length).toBe(endBlocks.length); // Balanced blocks
      expect(openSexpr.length).toBe(closeSexpr.length); // Balanced subexpressions
      expect(openSexpr.length).toBe(6); // or, eq, gt, and, not, multiply

      // Verify helper names
      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('or');
      expect(ids).toContain('eq');
      expect(ids).toContain('gt');
      expect(ids).toContain('and');
      expect(ids).toContain('not');
      expect(ids).toContain('multiply');
      expect(ids).toContain('formatPrice');
    });

    test('tokenizes subexpressions with path expressions', () => {
      const template = `{{#if (eq user.role "admin")}}Admin Panel{{/if}}`;

      const tokens = lexer.tokenize(template);

      const sexprStart = tokens.findIndex((t) => t.type === TokenType.OPEN_SEXPR);
      expect(tokens[sexprStart + 1].value).toBe('eq');
      expect(tokens[sexprStart + 2].value).toBe('user');
      expect(tokens[sexprStart + 3].type).toBe(TokenType.SEP);
      expect(tokens[sexprStart + 4].value).toBe('role');
      expect(tokens[sexprStart + 5].type).toBe(TokenType.STRING);
      expect(tokens[sexprStart + 5].value).toBe('admin');
    });

    test('tokenizes subexpressions with data variables', () => {
      const template = `{{#if (eq @index 0)}}First Item{{/if}}`;

      const tokens = lexer.tokenize(template);

      const sexprStart = tokens.findIndex((t) => t.type === TokenType.OPEN_SEXPR);
      expect(tokens[sexprStart + 1].value).toBe('eq');
      expect(tokens[sexprStart + 2].type).toBe(TokenType.DATA);
      expect(tokens[sexprStart + 3].value).toBe('index');
      expect(tokens[sexprStart + 4].type).toBe(TokenType.NUMBER);
      expect(tokens[sexprStart + 4].value).toBe('0');
    });

    test('tokenizes subexpressions with parent path access', () => {
      const template = `{{#each items}}{{#if (eq name ../parentName)}}match{{/if}}{{/each}}`;

      const tokens = lexer.tokenize(template);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('..');
      expect(ids).toContain('parentName');
    });

    test('tokenizes multiple subexpressions at same level', () => {
      const template = `{{helper (sub1 a) (sub2 b) (sub3 c)}}`;

      const tokens = lexer.tokenize(template);

      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexpr.length).toBe(3);
      expect(closeSexpr.length).toBe(3);

      const ids = tokens.filter((t) => t.type === TokenType.ID).map((t) => t.value);
      expect(ids).toContain('sub1');
      expect(ids).toContain('sub2');
      expect(ids).toContain('sub3');
    });

    test('tokenizes subexpressions with negative numbers', () => {
      const template = `{{#if (gt value -5)}}positive{{/if}}`;

      const tokens = lexer.tokenize(template);

      const numbers = tokens.filter((t) => t.type === TokenType.NUMBER);
      expect(numbers[0].value).toBe('-5');
    });

    test('tokenizes subexpressions with decimal numbers', () => {
      const template = `{{#if (lte price 99.99)}}affordable{{/if}}`;

      const tokens = lexer.tokenize(template);

      const numbers = tokens.filter((t) => t.type === TokenType.NUMBER);
      expect(numbers[0].value).toBe('99.99');
    });

    test('handles extremely deep nesting (10+ levels)', () => {
      // b, c, d, e, f, g, h, i, j, k = 10 levels of subexpressions
      // Each ( has a matching )
      const template = `{{a (b (c (d (e (f (g (h (i (j (k x))))))))))}}`;

      const tokens = lexer.tokenize(template);

      const openSexpr = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexpr = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexpr.length).toBeGreaterThanOrEqual(10); // 10+ levels
      expect(closeSexpr.length).toBeGreaterThanOrEqual(10);
      expect(openSexpr.length).toBe(closeSexpr.length); // Balanced
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });
  });
});
