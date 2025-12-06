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
});
