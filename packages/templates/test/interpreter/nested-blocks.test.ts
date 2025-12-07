/**
 * Nested Block Helpers Integration Tests
 *
 * Tests for complex nesting scenarios combining #if, #unless, #each, and #with.
 * Verifies context stack, data frame scoping, parent access, and @root access.
 */

import { describe, expect, it } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';

/**
 * Helper function to render a template with context
 */
function render(template: string, context: any): string {
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  parser.setInput(template);
  const ast = parser.parse();
  const interpreter = new Interpreter(ast);
  return interpreter.evaluate(context);
}

describe('Nested Block Helpers', () => {
  describe('Root access basics', () => {
    it('simple @root access works', () => {
      const template = '{{@root.title}}';
      const result = render(template, { title: 'TEST' });
      expect(result).toBe('TEST');
    });

    it('@root in #each works', () => {
      const template = '{{#each items}}{{@root.prefix}}-{{this}}{{/each}}';
      const result = render(template, { prefix: 'ITEM', items: ['A', 'B'] });
      expect(result).toBe('ITEM-AITEM-B');
    });
  });

  describe('Multi-level nesting', () => {
    it('handles #each → #if → #with (3 levels)', () => {
      const template = `{{#each items}}{{#if active}}{{#with details}}{{../name}}: {{desc}} ({{status}})
{{/with}}{{/if}}{{/each}}`;
      const result = render(template, {
        items: [
          { active: true, name: 'Item 1', details: { desc: 'First', status: 'ready' } },
          { active: false, name: 'Item 2', details: { desc: 'Second', status: 'pending' } },
          { active: true, name: 'Item 3', details: { desc: 'Third', status: 'done' } },
        ],
      });
      expect(result).toContain('Item 1: First (ready)');
      expect(result).not.toContain('Item 2');
      expect(result).toContain('Item 3: Third (done)');
    });

    it('handles #if → #each → #with (different order)', () => {
      const template = `{{#if enabled}}{{#each users}}{{#with profile}}Name: {{name}}, Role: {{role}}
{{/with}}{{/each}}{{/if}}`;
      const result = render(template, {
        enabled: true,
        users: [
          { profile: { name: 'Alice', role: 'Admin' } },
          { profile: { name: 'Bob', role: 'User' } },
        ],
      });
      expect(result).toContain('Name: Alice, Role: Admin');
      expect(result).toContain('Name: Bob, Role: User');
    });

    it('handles nested #each loops', () => {
      const template = `{{#each rows}}{{#each this}}[{{../rowNum}},{{@index}}]{{/each}}
{{/each}}`;
      const result = render(template, {
        rows: [
          { rowNum: 0, '0': 'a', '1': 'b' },
          { rowNum: 1, '0': 'c', '1': 'd' },
        ],
      });
      expect(result).toContain('[0,0]');
      expect(result).toContain('[0,1]');
      expect(result).toContain('[1,0]');
      expect(result).toContain('[1,1]');
    });

    it('handles #with → #with → #if (context changes)', () => {
      const template = `{{#with company}}{{#with address}}{{#if verified}}{{city}}, {{state}}{{/if}}{{/with}}{{/with}}`;
      const result = render(template, {
        company: {
          address: {
            city: 'Seattle',
            state: 'WA',
            verified: true,
          },
        },
      });
      expect(result).toBe('Seattle, WA');
    });
  });

  describe('Parent context access', () => {
    it('accesses parent context with ../ through 2 levels', () => {
      const template = `{{#each items}}{{#with details}}Item: {{name}}, Total: {{../total}}
{{/with}}{{/each}}`;
      const result = render(template, {
        items: [
          { total: 100, details: { name: 'A' } },
          { total: 200, details: { name: 'B' } },
        ],
      });
      expect(result).toContain('Item: A, Total: 100');
      expect(result).toContain('Item: B, Total: 200');
    });

    it('accesses grandparent context with ../../ through 3 levels', () => {
      const template = `{{#with user}}{{#with profile}}{{#with settings}}Theme: {{theme}}, User: {{../../name}}
{{/with}}{{/with}}{{/with}}`;
      const result = render(template, {
        user: {
          name: 'Alice',
          profile: {
            settings: {
              theme: 'dark',
            },
          },
        },
      });
      expect(result).toContain('Theme: dark, User: Alice');
    });

    it('accesses parent from nested #each with data variables', () => {
      const template = `{{#each groups}}Group {{@index}}: {{#each members}}{{name}} ({{../groupName}}){{#unless @last}}, {{/unless}}{{/each}}
{{/each}}`;
      const result = render(template, {
        groups: [
          { groupName: 'Team A', members: [{ name: 'Alice' }, { name: 'Bob' }] },
          { groupName: 'Team B', members: [{ name: 'Charlie' }] },
        ],
      });
      expect(result).toContain('Group 0: Alice (Team A), Bob (Team A)');
      expect(result).toContain('Group 1: Charlie (Team B)');
    });

    it('accesses parent across #with boundaries', () => {
      const template = `{{#with outer}}{{#with inner}}Inner: {{value}}, Outer: {{../outerValue}}
{{/with}}{{/with}}`;
      const result = render(template, {
        outer: {
          outerValue: 'OUTER',
          inner: {
            value: 'INNER',
          },
        },
      });
      expect(result).toContain('Inner: INNER, Outer: OUTER');
    });
  });

  describe('Data variable scoping', () => {
    it('accesses outer @index from inner block', () => {
      const template = `{{#each items}}{{#if visible}}Outer index: {{@index}}, Name: {{name}}
{{/if}}{{/each}}`;
      const result = render(template, {
        items: [
          { visible: true, name: 'First' },
          { visible: false, name: 'Second' },
          { visible: true, name: 'Third' },
        ],
      });
      expect(result).toContain('Outer index: 0, Name: First');
      expect(result).not.toContain('Second');
      expect(result).toContain('Outer index: 2, Name: Third');
    });

    it('handles multiple @index variables in nested #each', () => {
      const template = `{{#each matrix}}Row {{@index}}: {{#each row}}[{{../rowIndex}},{{@index}}]{{/each}}
{{/each}}`;
      const result = render(template, {
        matrix: [
          { rowIndex: 0, row: [1, 2] },
          { rowIndex: 1, row: [3, 4] },
          { rowIndex: 2, row: [5, 6] },
        ],
      });
      expect(result).toContain('Row 0: [0,0][0,1]');
      expect(result).toContain('Row 1: [1,0][1,1]');
      expect(result).toContain('Row 2: [2,0][2,1]');
    });

    it('accesses @key from outer #each object in nested blocks', () => {
      const template = `{{#each users}}{{#if active}}{{@key}}: {{name}}{{/if}}{{/each}}`;
      const result = render(template, {
        users: {
          alice: { name: 'Alice', active: true },
          bob: { name: 'Bob', active: false },
          charlie: { name: 'Charlie', active: true },
        },
      });
      expect(result).toContain('alice: Alice');
      expect(result).not.toContain('bob');
      expect(result).toContain('charlie: Charlie');
    });

    it('preserves @first and @last in nested contexts', () => {
      const template = `{{#each items}}{{#with data}}{{#if ../isFirst}}FIRST: {{/if}}{{value}}{{#if ../isLast}} LAST{{/if}}
{{/with}}{{/each}}`;
      const result = render(template, {
        items: [
          { isFirst: true, isLast: false, data: { value: 'A' } },
          { isFirst: false, isLast: false, data: { value: 'B' } },
          { isFirst: false, isLast: true, data: { value: 'C' } },
        ],
      });
      expect(result).toContain('FIRST: A');
      expect(result).toContain('B');
      expect(result).toContain('C LAST');
    });
  });

  describe('Root access', () => {
    it('accesses @root from deeply nested context', () => {
      const template = `{{#each items}}{{#with user}}{{#if active}}{{@root.title}}: {{name}}
{{/if}}{{/with}}{{/each}}`;
      const result = render(template, {
        title: 'User List',
        items: [
          { user: { name: 'Alice', active: true } },
          { user: { name: 'Bob', active: false } },
          { user: { name: 'Charlie', active: true } },
        ],
      });
      expect(result).toContain('User List: Alice');
      expect(result).not.toContain('Bob');
      expect(result).toContain('User List: Charlie');
    });

    it('accesses nested @root properties from deep nesting', () => {
      const template = `{{#each groups}}{{#each members}}{{name}} at {{@root.company.name}}
{{/each}}{{/each}}`;
      const result = render(template, {
        company: { name: 'Acme Corp' },
        groups: [{ members: [{ name: 'Alice' }] }, { members: [{ name: 'Bob' }] }],
      });
      expect(result).toContain('Alice at Acme Corp');
      expect(result).toContain('Bob at Acme Corp');
    });

    it('combines @root with local context and parent access', () => {
      const template = `{{#each items}}{{#with details}}{{@root.prefix}}-{{../id}}-{{name}}
{{/with}}{{/each}}`;
      const result = render(template, {
        prefix: 'ITEM',
        items: [
          { id: 'A1', details: { name: 'First' } },
          { id: 'B2', details: { name: 'Second' } },
        ],
      });
      expect(result).toContain('ITEM-A1-First');
      expect(result).toContain('ITEM-B2-Second');
    });
  });

  describe('Edge cases', () => {
    it('handles empty collection in nested #each', () => {
      const template = `{{#each outer}}Outer: {{name}}{{#each inner}}Inner{{else}}No items{{/each}}
{{/each}}`;
      const result = render(template, {
        outer: [
          { name: 'A', inner: [] },
          { name: 'B', inner: [1] },
        ],
      });
      expect(result).toContain('Outer: ANo items');
      expect(result).toContain('Outer: BInner');
    });

    it('handles falsy condition breaking nested flow', () => {
      const template = `{{#each items}}{{#if enabled}}{{#with data}}Value: {{value}}{{/with}}{{else}}Disabled{{/if}}
{{/each}}`;
      const result = render(template, {
        items: [
          { enabled: true, data: { value: 'OK' } },
          { enabled: false, data: { value: 'SKIP' } },
        ],
      });
      expect(result).toContain('Value: OK');
      expect(result).toContain('Disabled');
      expect(result).not.toContain('SKIP');
    });

    it('handles missing properties in nested #with', () => {
      const template = `{{#each items}}{{#with user}}User: {{name}}{{else}}No user{{/with}}
{{/each}}`;
      const result = render(template, {
        items: [{ user: { name: 'Alice' } }, { user: null }, { other: 'data' }],
      });
      expect(result).toContain('User: Alice');
      expect(result).toContain('No user');
    });

    it('handles complex nesting with all block types', () => {
      const template = `{{#if config.enabled}}{{#each users}}{{#unless archived}}{{#with profile}}{{@root.config.prefix}}-{{../userId}}: {{name}}{{#if verified}} ✓{{/if}}
{{/with}}{{/unless}}{{/each}}{{/if}}`;
      const result = render(template, {
        config: { enabled: true, prefix: 'USER' },
        users: [
          { userId: '001', archived: false, profile: { name: 'Alice', verified: true } },
          { userId: '002', archived: true, profile: { name: 'Bob', verified: false } },
          { userId: '003', archived: false, profile: { name: 'Charlie', verified: false } },
        ],
      });
      expect(result).toContain('USER-001: Alice ✓');
      expect(result).not.toContain('Bob');
      expect(result).toContain('USER-003: Charlie');
      expect(result).not.toContain('Charlie ✓');
    });
  });
});
