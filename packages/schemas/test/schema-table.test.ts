import { beforeEach, describe, expect, it } from 'vitest';
import { Schema } from '../src/schema.js';
import type { JSONSchema } from '../src/types.js';

/**
 * Mock SqlExecutor that records all SQL operations
 */
class MockSqlExecutor {
  queries: { sql: string; args: unknown[] }[] = [];
  private lastInsertId = 0;

  exec(query: string, ...args: unknown[]): Iterable<Record<string, unknown>> {
    this.queries.push({ sql: query, args });

    // Handle last_insert_rowid() for ID retrieval
    if (query.includes('last_insert_rowid')) {
      this.lastInsertId++;
      return [{ id: this.lastInsertId }];
    }

    return [];
  }

  reset(): void {
    this.queries = [];
    this.lastInsertId = 0;
  }

  getInserts(): { sql: string; args: unknown[] }[] {
    return this.queries.filter((q) => q.sql.startsWith('INSERT'));
  }
}

describe('SchemaTable.insert()', () => {
  let sql: MockSqlExecutor;

  beforeEach(() => {
    sql = new MockSqlExecutor();
  });

  describe('scalar fields', () => {
    it('should insert string and number fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
          score: { type: 'number' },
        },
      };

      const table = new Schema(schema).bind(sql, 'users');
      table.insert({ name: 'Alice', age: 30, score: 95.5 });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).toContain('INSERT INTO users');
      expect(inserts[0].sql).toContain('name');
      expect(inserts[0].sql).toContain('age');
      expect(inserts[0].sql).toContain('score');
      expect(inserts[0].args).toContain('Alice');
      expect(inserts[0].args).toContain(30);
      expect(inserts[0].args).toContain(95.5);
    });

    it('should convert boolean to 0/1', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          active: { type: 'boolean' },
          verified: { type: 'boolean' },
        },
      };

      const table = new Schema(schema).bind(sql, 'users');
      table.insert({ active: true, verified: false });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0].args).toContain(1); // true -> 1
      expect(inserts[0].args).toContain(0); // false -> 0
    });

    it('should skip undefined fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          optional: { type: 'string' },
        },
      };

      const table = new Schema(schema).bind(sql, 'users');
      table.insert({ name: 'Alice' });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).not.toContain('optional');
      expect(inserts[0].args).toEqual(['Alice']);
    });
  });

  describe('empty data', () => {
    it('should insert DEFAULT VALUES for empty data', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const table = new Schema(schema).bind(sql, 'users');
      table.insert({});

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).toBe('INSERT INTO users DEFAULT VALUES;');
    });
  });

  describe('nested objects (flattened)', () => {
    it('should flatten single-level nested object', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              createdAt: { type: 'integer' },
              source: { type: 'string' },
            },
          },
        },
      };

      const table = new Schema(schema).bind(sql, 'events');
      table.insert({ metadata: { createdAt: 12345, source: 'api' } });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).toContain('metadata_createdAt');
      expect(inserts[0].sql).toContain('metadata_source');
      expect(inserts[0].args).toContain(12345);
      expect(inserts[0].args).toContain('api');
    });

    it('should flatten deeply nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: {
            type: 'object',
            properties: {
              b: {
                type: 'object',
                properties: {
                  c: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const table = new Schema(schema).bind(sql, 'deep');
      table.insert({ a: { b: { c: 'value' } } });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).toContain('a_b_c');
      expect(inserts[0].args).toContain('value');
    });
  });

  describe('simple arrays', () => {
    it('should insert array of scalars into child table', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      };

      const table = new Schema(schema).bind(sql, 'users');
      table.insert({ name: 'Alice', tags: ['dev', 'ts', 'node'] });

      const inserts = sql.getInserts();
      // 1 parent + 3 array items
      expect(inserts).toHaveLength(4);

      // Parent insert
      expect(inserts[0].sql).toContain('INSERT INTO users');
      expect(inserts[0].args).toContain('Alice');

      // Array item inserts
      expect(inserts[1].sql).toContain('INSERT INTO users_tags');
      expect(inserts[1].args).toContain(1); // parent ID
      expect(inserts[1].args).toContain(0); // index
      expect(inserts[1].args).toContain('dev');

      expect(inserts[2].args).toContain(1); // index
      expect(inserts[2].args).toContain('ts');

      expect(inserts[3].args).toContain(2); // index
      expect(inserts[3].args).toContain('node');
    });

    it('should handle empty array', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      };

      const table = new Schema(schema).bind(sql, 'users');
      table.insert({ tags: [] });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(1); // Only parent, no array items
    });
  });

  describe('arrays of objects', () => {
    it('should insert array of objects with proper FK', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                qty: { type: 'integer' },
              },
            },
          },
        },
      };

      const table = new Schema(schema).bind(sql, 'orders');
      table.insert({
        items: [
          { name: 'Apple', qty: 3 },
          { name: 'Banana', qty: 5 },
        ],
      });

      const inserts = sql.getInserts();
      expect(inserts).toHaveLength(3); // 1 parent + 2 items

      // Array items have FK and index
      expect(inserts[1].sql).toContain('INSERT INTO orders_items');
      expect(inserts[1].sql).toContain('orders_id');
      expect(inserts[1].sql).toContain('"index"');
      expect(inserts[1].args).toContain(1); // parent ID
      expect(inserts[1].args).toContain(0); // index
      expect(inserts[1].args).toContain('Apple');
      expect(inserts[1].args).toContain(3);
    });
  });

  describe('nested arrays (2+ levels)', () => {
    it('should insert 2-level nested arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const table = new Schema(schema).bind(sql, 'docs');
      table.insert({
        sections: [
          { title: 'Intro', items: [{ name: 'A' }, { name: 'B' }] },
          { title: 'Body', items: [{ name: 'C' }] },
        ],
      });

      const inserts = sql.getInserts();
      // 1 parent + 2 sections + 3 items
      expect(inserts).toHaveLength(6);

      // Check nested items have correct parent FK
      const sectionInserts = inserts.filter((i) => i.sql.includes('docs_sections ('));
      const itemInserts = inserts.filter((i) => i.sql.includes('docs_sections_items'));

      expect(sectionInserts).toHaveLength(2);
      expect(itemInserts).toHaveLength(3);

      // Items from section 1 reference the same parent ID
      expect(itemInserts[0].args[0]).toBe(itemInserts[1].args[0]);
      // Item from section 2 references a different parent ID
      expect(itemInserts[2].args[0]).not.toBe(itemInserts[0].args[0]);
    });
  });

  describe('arrays inside nested objects', () => {
    it('should insert arrays from flattened objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          report: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              items: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      };

      const table = new Schema(schema).bind(sql, 'data');
      table.insert({
        report: {
          summary: 'Overview',
          items: ['one', 'two'],
        },
      });

      const inserts = sql.getInserts();
      // 1 parent + 2 array items
      expect(inserts).toHaveLength(3);

      // Parent has flattened summary
      expect(inserts[0].sql).toContain('report_summary');
      expect(inserts[0].args).toContain('Overview');

      // Array table uses full path: data_report_items
      expect(inserts[1].sql).toContain('INSERT INTO data_report_items');
    });
  });

  describe('mixed complex schema', () => {
    it('should handle scalars, nested objects, and multiple arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          active: { type: 'boolean' },
          metadata: {
            type: 'object',
            properties: {
              version: { type: 'integer' },
            },
          },
          tags: { type: 'array', items: { type: 'string' } },
          authors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const table = new Schema(schema).bind(sql, 'docs');
      table.insert({
        title: 'Guide',
        active: true,
        metadata: { version: 2 },
        tags: ['a', 'b'],
        authors: [{ name: 'Alice' }],
      });

      const inserts = sql.getInserts();
      // 1 parent + 2 tags + 1 author
      expect(inserts).toHaveLength(4);

      // Parent has scalar, boolean, and flattened object
      expect(inserts[0].args).toContain('Guide');
      expect(inserts[0].args).toContain(1); // true
      expect(inserts[0].args).toContain(2); // version
    });
  });
});
