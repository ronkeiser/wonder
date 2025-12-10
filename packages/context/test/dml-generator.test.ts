import { describe, expect, it } from 'vitest';
import { CustomTypeRegistry } from '../src/custom-types.js';
import { DMLGenerator } from '../src/dml-generator.js';
import type { SchemaType } from '../src/types.js';

describe('DMLGenerator', () => {
  describe('INSERT generation - scalar fields', () => {
    it('should generate basic INSERT statement', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          active: { type: 'boolean' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('users', {
        id: 1,
        name: 'Alice',
        active: true,
      });

      expect(result.statements).toHaveLength(1);
      expect(result.statements[0]).toBe('INSERT INTO users (id, name, active) VALUES (?, ?, ?);');
      expect(result.values).toHaveLength(1);
      expect(result.values[0]).toEqual([1, 'Alice', 1]); // boolean → 0/1
    });

    it('should convert boolean to 0/1', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          disabled: { type: 'boolean' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('flags', {
        enabled: true,
        disabled: false,
      });

      expect(result.values[0]).toEqual([1, 0]);
    });

    it('should handle missing optional fields', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['id', 'name'],
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('users', {
        id: 1,
        name: 'Alice',
        // email is omitted
      });

      expect(result.statements[0]).toBe('INSERT INTO users (id, name) VALUES (?, ?);');
      expect(result.values[0]).toEqual([1, 'Alice']);
    });

    it('should handle all scalar types', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          text: { type: 'string' },
          count: { type: 'integer' },
          price: { type: 'number' },
          flag: { type: 'boolean' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('test', {
        text: 'hello',
        count: 42,
        price: 19.99,
        flag: true,
      });

      expect(result.values[0]).toEqual(['hello', 42, 19.99, 1]);
    });
  });

  describe('INSERT generation - nested objects (flatten)', () => {
    it('should flatten nested objects', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          metadata: {
            type: 'object',
            properties: {
              timestamp: { type: 'integer' },
              source: { type: 'string' },
            },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('events', {
        id: 1,
        metadata: {
          timestamp: 1234567890,
          source: 'api',
        },
      });

      expect(result.statements[0]).toBe(
        'INSERT INTO events (id, metadata_timestamp, metadata_source) VALUES (?, ?, ?);',
      );
      expect(result.values[0]).toEqual([1, 1234567890, 'api']);
    });

    it('should handle multiple nesting levels', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('data', {
        user: {
          profile: {
            name: 'Alice',
          },
        },
      });

      expect(result.statements[0]).toContain('user_profile_name');
      expect(result.values[0]).toEqual(['Alice']);
    });
  });

  describe('INSERT generation - arrays (table strategy)', () => {
    it('should generate separate INSERT for array of scalars', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('posts', {
        id: 1,
        tags: ['typescript', 'testing', 'sql'],
      });

      expect(result.statements).toHaveLength(4); // 1 main + 3 array items
      expect(result.statements[0]).toBe('INSERT INTO posts (id) VALUES (?);');
      expect(result.statements[1]).toBe(
        'INSERT INTO posts_tags (posts_id, "index", value) VALUES (?, ?, ?);',
      );

      expect(result.values[0]).toEqual([1]);
      expect(result.values[1]).toEqual(['{{PARENT_ID}}', 0, 'typescript']);
      expect(result.values[2]).toEqual(['{{PARENT_ID}}', 1, 'testing']);
      expect(result.values[3]).toEqual(['{{PARENT_ID}}', 2, 'sql']);
    });

    it('should generate separate INSERT for array of objects', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          comments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                author: { type: 'string' },
                text: { type: 'string' },
              },
            },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('posts', {
        id: 1,
        comments: [
          { author: 'Alice', text: 'Great!' },
          { author: 'Bob', text: 'Thanks!' },
        ],
      });

      expect(result.statements).toHaveLength(3);
      expect(result.statements[1]).toBe(
        'INSERT INTO posts_comments (posts_id, "index", author, text) VALUES (?, ?, ?, ?);',
      );

      expect(result.values[1]).toEqual(['{{PARENT_ID}}', 0, 'Alice', 'Great!']);
      expect(result.values[2]).toEqual(['{{PARENT_ID}}', 1, 'Bob', 'Thanks!']);
    });

    it('should handle empty arrays', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('posts', {
        id: 1,
        tags: [],
      });

      expect(result.statements).toHaveLength(1); // Only main table
      expect(result.statements[0]).toBe('INSERT INTO posts (id) VALUES (?);');
    });

    it('should use PARENT_ID placeholder for foreign keys', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('orders', {
        id: 1,
        items: ['item1'],
      });

      expect(result.values[1][0]).toBe('{{PARENT_ID}}');
    });
  });

  describe('INSERT generation - arrays (json strategy)', () => {
    it('should store array as JSON string', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry(), {
        arrayStrategy: 'json',
      });
      const result = generator.generateInsert('posts', {
        id: 1,
        tags: ['typescript', 'testing'],
      });

      expect(result.statements).toHaveLength(1);
      expect(result.statements[0]).toBe('INSERT INTO posts (id, tags) VALUES (?, ?);');
      expect(result.values[0]).toEqual([1, JSON.stringify(['typescript', 'testing'])]);
    });
  });

  describe('UPDATE generation', () => {
    it('should generate basic UPDATE statement', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          active: { type: 'boolean' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateUpdate('users', { name: 'Bob', active: false }, 'id = 1');

      expect(result.statements).toHaveLength(1);
      expect(result.statements[0]).toBe('UPDATE users SET name = ?, active = ? WHERE id = 1;');
      expect(result.values[0]).toEqual(['Bob', 0]);
    });

    it('should handle partial updates', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          age: { type: 'integer' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateUpdate('users', { name: 'Charlie' }, 'id = 5');

      expect(result.statements[0]).toBe('UPDATE users SET name = ? WHERE id = 5;');
      expect(result.values[0]).toEqual(['Charlie']);
    });

    it('should handle array updates with DELETE and INSERT', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateUpdate('posts', { tags: ['new', 'tags'] }, 'id = 1');

      // Should include DELETE for old array items, then INSERT for new ones
      expect(result.statements.length).toBeGreaterThan(1);
      expect(result.statements.some((s) => s.includes('DELETE'))).toBe(true);
      expect(result.statements.some((s) => s.includes('INSERT'))).toBe(true);
    });

    it('should flatten nested objects in UPDATE', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              updated: { type: 'integer' },
            },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateUpdate('events', { metadata: { updated: 9999 } }, 'id = 1');

      expect(result.statements[0]).toBe('UPDATE events SET metadata_updated = ? WHERE id = 1;');
      expect(result.values[0]).toEqual([9999]);
    });
  });

  describe('DELETE generation', () => {
    it('should generate basic DELETE statement', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateDelete('users', 'id = 1');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('DELETE FROM users WHERE id = 1;');
    });

    it('should cascade delete for array tables', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateDelete('posts', 'id = 1');

      expect(result).toHaveLength(2);
      // Array table deleted first (FK constraint)
      expect(result[0]).toBe(
        'DELETE FROM posts_tags WHERE posts_id IN (SELECT id FROM posts WHERE id = 1);',
      );
      expect(result[1]).toBe('DELETE FROM posts WHERE id = 1;');
    });

    it('should handle multiple array tables in correct order', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          comments: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateDelete('posts', 'id = 1');

      expect(result).toHaveLength(3); // 2 array tables + main table
      expect(result[2]).toBe('DELETE FROM posts WHERE id = 1;'); // Main table last
    });
  });

  describe('Edge cases', () => {
    it('should handle empty data object', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('users', {});

      expect(result.statements).toHaveLength(0);
      expect(result.values).toHaveLength(0);
    });

    it('should throw error for non-object schema', () => {
      const schema: SchemaType = {
        type: 'string',
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());

      expect(() => generator.generateInsert('test', { value: 'test' })).toThrow(
        'DML generation requires an object schema at root',
      );
    });

    it('should handle schema with no properties', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {},
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('empty', {});

      expect(result.statements).toHaveLength(0);
    });

    it('should handle mixed field types', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          scalar: { type: 'string' },
          nested: {
            type: 'object',
            properties: {
              value: { type: 'integer' },
            },
          },
          list: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry());
      const result = generator.generateInsert('mixed', {
        scalar: 'test',
        nested: { value: 42 },
        list: ['a', 'b'],
      });

      expect(result.statements.length).toBeGreaterThan(0);
      expect(result.statements[0]).toContain('scalar');
      expect(result.statements[0]).toContain('nested_value');
    });
  });

  describe('Strategy consistency', () => {
    it('should use array table prefix', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry(), {
        arrayTablePrefix: 'arr_',
      });
      const result = generator.generateInsert('orders', { id: 1, items: ['x'] });

      expect(result.statements[1]).toContain('arr_orders_items');
    });

    it('should respect nested object JSON strategy', () => {
      const schema: SchemaType = {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              key: { type: 'string' },
            },
          },
        },
      };

      const generator = new DMLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const result = generator.generateInsert('data', {
        metadata: { key: 'value' },
      });

      expect(result.statements[0]).toBe('INSERT INTO data (metadata) VALUES (?);');
      expect(result.values[0]).toEqual([JSON.stringify({ key: 'value' })]);
    });
  });
});
