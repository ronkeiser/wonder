import { describe, expect, it, vi } from 'vitest';
import { SelectGenerator } from '../src/generators/select-generator.js';
import type { SqlExecutor } from '../src/schema.js';
import type { JSONSchema } from '../src/types.js';

/**
 * Creates a mock SqlExecutor that returns predefined results for queries
 */
function createMockSql(queryResults: Map<string, Record<string, unknown>[]>): SqlExecutor {
  return {
    exec(query: string, ...args: unknown[]): Iterable<Record<string, unknown>> {
      // Find matching result by checking if query starts with a key
      for (const [key, result] of queryResults) {
        if (query.includes(key)) {
          return result;
        }
      }
      return [];
    },
  };
}

describe('SelectGenerator', () => {
  describe('readFirst - scalar fields', () => {
    it('should read simple scalar fields from a row', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          price: { type: 'number' },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM products', [{ id: 1, name: 'Widget', price: 19.99 }]]]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'products');

      expect(result).toEqual({
        id: 1,
        name: 'Widget',
        price: 19.99,
      });
    });

    it('should convert SQLite 0/1 back to boolean', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          disabled: { type: 'boolean' },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM flags', [{ id: 1, enabled: 1, disabled: 0 }]]]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'flags');

      expect(result).toEqual({
        enabled: true,
        disabled: false,
      });
    });

    it('should handle all scalar types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          text: { type: 'string' },
          count: { type: 'integer' },
          price: { type: 'number' },
          active: { type: 'boolean' },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM test', [{ id: 1, text: 'hello', count: 42, price: 9.99, active: 1 }]],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'test');

      expect(result).toEqual({
        text: 'hello',
        count: 42,
        price: 9.99,
        active: true,
      });
    });

    it('should return null when table is empty', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
        },
      };

      const mockSql = createMockSql(new Map([['SELECT * FROM empty', []]]));

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'empty');

      expect(result).toBeNull();
    });

    it('should handle null values in columns', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM users', [{ id: 1, name: 'Alice', email: null }]]]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'users');

      expect(result).toEqual({
        id: 1,
        name: 'Alice',
        email: null,
      });
    });
  });

  describe('readFirst - nested objects (flatten strategy)', () => {
    it('should reconstruct flattened nested objects', () => {
      const schema: JSONSchema = {
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

      const mockSql = createMockSql(
        new Map([
          [
            'SELECT * FROM events',
            [{ id: 1, metadata_timestamp: 1234567890, metadata_source: 'api' }],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'events');

      expect(result).toEqual({
        id: 1,
        metadata: {
          timestamp: 1234567890,
          source: 'api',
        },
      });
    });

    it('should handle deeply nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM deep', [{ id: 1, level1_level2_level3_value: 'deep-value' }]]]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'deep');

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'deep-value',
            },
          },
        },
      });
    });

    it('should handle multiple nested objects at same level', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM data', [{ id: 1, user_name: 'Alice', location_city: 'NYC' }]]]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'data');

      expect(result).toEqual({
        user: {
          name: 'Alice',
        },
        location: {
          city: 'NYC',
        },
      });
    });

    it('should convert booleans within nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          settings: {
            type: 'object',
            properties: {
              notifications: { type: 'boolean' },
              darkMode: { type: 'boolean' },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM prefs', [{ id: 1, settings_notifications: 1, settings_darkMode: 0 }]],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'prefs');

      expect(result).toEqual({
        settings: {
          notifications: true,
          darkMode: false,
        },
      });
    });
  });

  describe('readFirst - arrays (table strategy)', () => {
    it('should read scalar array from separate table', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM posts LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM posts_tags',
            [
              { id: 1, posts_id: 1, index: 0, value: 'typescript' },
              { id: 2, posts_id: 1, index: 1, value: 'testing' },
              { id: 3, posts_id: 1, index: 2, value: 'sql' },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        tags: ['typescript', 'testing', 'sql'],
      });
    });

    it('should read integer array from separate table', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          scores: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM results LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM results_scores',
            [
              { id: 1, results_id: 1, index: 0, value: 100 },
              { id: 2, results_id: 1, index: 1, value: 85 },
              { id: 3, results_id: 1, index: 2, value: 92 },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'results');

      expect(result).toEqual({
        id: 1,
        scores: [100, 85, 92],
      });
    });

    it('should read boolean array from separate table', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          flags: {
            type: 'array',
            items: { type: 'boolean' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM settings LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM settings_flags',
            [
              { id: 1, settings_id: 1, index: 0, value: 1 },
              { id: 2, settings_id: 1, index: 1, value: 0 },
              { id: 3, settings_id: 1, index: 2, value: 1 },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'settings');

      expect(result).toEqual({
        id: 1,
        flags: [true, false, true],
      });
    });

    it('should read array of objects from separate table', () => {
      const schema: JSONSchema = {
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

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM posts LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM posts_comments',
            [
              { id: 1, posts_id: 1, index: 0, author: 'Alice', text: 'Great post!' },
              { id: 2, posts_id: 1, index: 1, author: 'Bob', text: 'Thanks!' },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        comments: [
          { author: 'Alice', text: 'Great post!' },
          { author: 'Bob', text: 'Thanks!' },
        ],
      });
    });

    it('should handle empty arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM posts LIMIT 1', [{ id: 1 }]],
          ['SELECT * FROM posts_tags', []],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        tags: [],
      });
    });

    it('should handle array table with prefix', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM orders LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM arr_orders_items',
            [
              { id: 1, orders_id: 1, index: 0, value: 'item1' },
              { id: 2, orders_id: 1, index: 1, value: 'item2' },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema, { arrayTablePrefix: 'arr_' });
      const result = generator.readFirst(mockSql, 'orders');

      expect(result).toEqual({
        id: 1,
        items: ['item1', 'item2'],
      });
    });

    it('should handle multiple arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM posts LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM posts_tags',
            [
              { id: 1, posts_id: 1, index: 0, value: 'tag1' },
              { id: 2, posts_id: 1, index: 1, value: 'tag2' },
            ],
          ],
          [
            'SELECT * FROM posts_categories',
            [
              { id: 3, posts_id: 1, index: 0, value: 'cat1' },
              { id: 4, posts_id: 1, index: 1, value: 'cat2' },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        tags: ['tag1', 'tag2'],
        categories: ['cat1', 'cat2'],
      });
    });

    it('should handle arrays with nested objects containing booleans', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                completed: { type: 'boolean' },
              },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM todos LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM todos_tasks',
            [
              { id: 1, todos_id: 1, index: 0, name: 'Task 1', completed: 1 },
              { id: 2, todos_id: 1, index: 1, name: 'Task 2', completed: 0 },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'todos');

      expect(result).toEqual({
        id: 1,
        tasks: [
          { name: 'Task 1', completed: true },
          { name: 'Task 2', completed: false },
        ],
      });
    });
  });

  describe('readFirst - nested arrays (arrays within array objects)', () => {
    it('should read nested arrays from child tables', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      };

      // Use a more precise mock that checks the actual parentId argument
      const mockSql: SqlExecutor = {
        exec(query: string, ...args: unknown[]): Iterable<Record<string, unknown>> {
          if (query.includes('SELECT * FROM docs LIMIT 1')) {
            return [{ id: 1 }];
          }
          if (query.includes('docs_sections') && query.includes('docs_id')) {
            return [
              { id: 1, docs_id: 1, index: 0, title: 'Section 1' },
              { id: 2, docs_id: 1, index: 1, title: 'Section 2' },
            ];
          }
          if (query.includes('docs_sections_items') && args[0] === 1) {
            return [
              { id: 1, docs_sections_id: 1, index: 0, value: 'item1-1' },
              { id: 2, docs_sections_id: 1, index: 1, value: 'item1-2' },
            ];
          }
          if (query.includes('docs_sections_items') && args[0] === 2) {
            return [{ id: 3, docs_sections_id: 2, index: 0, value: 'item2-1' }];
          }
          return [];
        },
      };

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'docs');

      expect(result).toEqual({
        id: 1,
        sections: [
          { title: 'Section 1', items: ['item1-1', 'item1-2'] },
          { title: 'Section 2', items: ['item2-1'] },
        ],
      });
    });
  });

  describe('readFirst - nested objects in array items', () => {
    it('should reconstruct nested objects within array items', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          orders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                orderId: { type: 'string' },
                shipping: {
                  type: 'object',
                  properties: {
                    address: { type: 'string' },
                    city: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM customers LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM customers_orders',
            [
              {
                id: 1,
                customers_id: 1,
                index: 0,
                orderId: 'ORD-001',
                shipping_address: '123 Main St',
                shipping_city: 'NYC',
              },
              {
                id: 2,
                customers_id: 1,
                index: 1,
                orderId: 'ORD-002',
                shipping_address: '456 Oak Ave',
                shipping_city: 'LA',
              },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'customers');

      expect(result).toEqual({
        id: 1,
        orders: [
          {
            orderId: 'ORD-001',
            shipping: {
              address: '123 Main St',
              city: 'NYC',
            },
          },
          {
            orderId: 'ORD-002',
            shipping: {
              address: '456 Oak Ave',
              city: 'LA',
            },
          },
        ],
      });
    });

    it('should handle deeply nested objects within array items', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                meta: {
                  type: 'object',
                  properties: {
                    info: {
                      type: 'object',
                      properties: {
                        value: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM data LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM data_items',
            [{ id: 1, data_id: 1, index: 0, meta_info_value: 'deep-nested' }],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'data');

      expect(result).toEqual({
        items: [
          {
            meta: {
              info: {
                value: 'deep-nested',
              },
            },
          },
        ],
      });
    });
  });

  describe('readFirst - JSON strategy for arrays', () => {
    it('should parse JSON array column', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM posts', [{ id: 1, tags: JSON.stringify(['typescript', 'testing']) }]],
        ]),
      );

      const generator = new SelectGenerator(schema, { arrayStrategy: 'json' });
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        tags: ['typescript', 'testing'],
      });
    });

    it('should handle JSON array of objects', () => {
      const schema: JSONSchema = {
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

      const comments = [
        { author: 'Alice', text: 'Great!' },
        { author: 'Bob', text: 'Thanks!' },
      ];

      const mockSql = createMockSql(
        new Map([['SELECT * FROM posts', [{ id: 1, comments: JSON.stringify(comments) }]]]),
      );

      const generator = new SelectGenerator(schema, { arrayStrategy: 'json' });
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        comments,
      });
    });

    it('should handle null JSON array as empty array', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM posts', [{ id: 1, tags: null }]]]),
      );

      const generator = new SelectGenerator(schema, { arrayStrategy: 'json' });
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        tags: [],
      });
    });
  });

  describe('readFirst - JSON strategy for nested objects', () => {
    it('should parse JSON nested object column', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          metadata: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'number' },
            },
          },
        },
      };

      const metadata = { key: 'test', value: 42 };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM data', [{ id: 1, metadata: JSON.stringify(metadata) }]]]),
      );

      const generator = new SelectGenerator(schema, { nestedObjectStrategy: 'json' });
      const result = generator.readFirst(mockSql, 'data');

      expect(result).toEqual({
        id: 1,
        metadata,
      });
    });

    it('should handle null JSON object as empty object', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          settings: {
            type: 'object',
            properties: {
              theme: { type: 'string' },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM users', [{ id: 1, settings: null }]]]),
      );

      const generator = new SelectGenerator(schema, { nestedObjectStrategy: 'json' });
      const result = generator.readFirst(mockSql, 'users');

      expect(result).toEqual({
        id: 1,
        settings: {},
      });
    });

    it('should handle deeply nested JSON object', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  port: { type: 'integer' },
                },
              },
            },
          },
        },
      };

      const config = { database: { host: 'localhost', port: 5432 } };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM settings', [{ id: 1, config: JSON.stringify(config) }]]]),
      );

      const generator = new SelectGenerator(schema, { nestedObjectStrategy: 'json' });
      const result = generator.readFirst(mockSql, 'settings');

      expect(result).toEqual({ config });
    });
  });

  describe('Edge cases', () => {
    it('should handle schema with no properties', () => {
      const schema: JSONSchema = {
        type: 'object',
      };

      const mockSql = createMockSql(new Map([['SELECT * FROM empty', [{ id: 1 }]]]));

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'empty');

      expect(result).toEqual({});
    });

    it('should handle schema with empty properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {},
      };

      const mockSql = createMockSql(new Map([['SELECT * FROM empty', [{ id: 1 }]]]));

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'empty');

      expect(result).toEqual({});
    });

    it('should return empty array when array table does not exist', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      // Mock SQL that throws for array table query
      const mockSql: SqlExecutor = {
        exec(query: string): Iterable<Record<string, unknown>> {
          if (query.includes('posts_tags')) {
            throw new Error('Table does not exist');
          }
          return [{ id: 1 }];
        },
      };

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        tags: [],
      });
    });

    it('should handle array with no items schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          data: {
            type: 'array',
            // No items defined
          },
        },
      };

      const mockSql = createMockSql(new Map([['SELECT * FROM test', [{ id: 1 }]]]));

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'test');

      expect(result).toEqual({
        id: 1,
        data: [],
      });
    });

    it('should handle mixed strategies', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          metadata: {
            type: 'object',
            properties: {
              key: { type: 'string' },
            },
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      // Use precise mock that differentiates between main table and array table queries
      const mockSql: SqlExecutor = {
        exec(query: string): Iterable<Record<string, unknown>> {
          if (query.includes('posts_tags')) {
            return [
              { id: 1, posts_id: 1, index: 0, value: 'tag1' },
              { id: 2, posts_id: 1, index: 1, value: 'tag2' },
            ];
          }
          if (query.includes('SELECT * FROM posts')) {
            return [{ id: 1, metadata: JSON.stringify({ key: 'value' }) }];
          }
          return [];
        },
      };

      // JSON for nested objects, table for arrays
      const generator = new SelectGenerator(schema, {
        nestedObjectStrategy: 'json',
        arrayStrategy: 'table',
      });
      const result = generator.readFirst(mockSql, 'posts');

      expect(result).toEqual({
        id: 1,
        metadata: { key: 'value' },
        tags: ['tag1', 'tag2'],
      });
    });
  });

  describe('Complex schemas', () => {
    it('should handle a realistic workflow output schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: { type: 'string' },
          completed: { type: 'boolean' },
          metadata: {
            type: 'object',
            properties: {
              startedAt: { type: 'integer' },
              finishedAt: { type: 'integer' },
            },
          },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                stepId: { type: 'string' },
                success: { type: 'boolean' },
                output: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                    score: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          [
            'SELECT * FROM workflow LIMIT 1',
            [
              {
                id: 1,
                status: 'completed',
                completed: 1,
                metadata_startedAt: 1000,
                metadata_finishedAt: 2000,
              },
            ],
          ],
          [
            'SELECT * FROM workflow_results',
            [
              {
                id: 1,
                workflow_id: 1,
                index: 0,
                stepId: 'step-1',
                success: 1,
                output_value: 'result-1',
                output_score: 0.95,
              },
              {
                id: 2,
                workflow_id: 1,
                index: 1,
                stepId: 'step-2',
                success: 0,
                output_value: 'result-2',
                output_score: 0.5,
              },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'workflow');

      expect(result).toEqual({
        status: 'completed',
        completed: true,
        metadata: {
          startedAt: 1000,
          finishedAt: 2000,
        },
        results: [
          {
            stepId: 'step-1',
            success: true,
            output: {
              value: 'result-1',
              score: 0.95,
            },
          },
          {
            stepId: 'step-2',
            success: false,
            output: {
              value: 'result-2',
              score: 0.5,
            },
          },
        ],
      });
    });

    it('should handle schema with arrays inside nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          config: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              features: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM apps LIMIT 1', [{ id: 1, config_name: 'MyApp' }]],
          [
            'SELECT * FROM apps_config_features',
            [
              { id: 1, apps_id: 1, index: 0, value: 'feature1' },
              { id: 2, apps_id: 1, index: 1, value: 'feature2' },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'apps');

      expect(result).toEqual({
        id: 1,
        config: {
          name: 'MyApp',
          features: ['feature1', 'feature2'],
        },
      });
    });
  });

  describe('Default options', () => {
    it('should use flatten strategy for nested objects by default', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([['SELECT * FROM test', [{ id: 1, nested_value: 'flattened' }]]]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'test');

      expect(result).toEqual({
        nested: {
          value: 'flattened',
        },
      });
    });

    it('should use table strategy for arrays by default', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const mockSql = createMockSql(
        new Map([
          ['SELECT * FROM test LIMIT 1', [{ id: 1 }]],
          [
            'SELECT * FROM test_items',
            [
              { id: 1, test_id: 1, index: 0, value: 'item1' },
              { id: 2, test_id: 1, index: 1, value: 'item2' },
            ],
          ],
        ]),
      );

      const generator = new SelectGenerator(schema);
      const result = generator.readFirst(mockSql, 'test');

      expect(result).toEqual({
        items: ['item1', 'item2'],
      });
    });

    it('should use empty string for arrayTablePrefix by default', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const execSpy = vi.fn().mockImplementation((query: string) => {
        if (query.includes('test_items')) {
          return [{ id: 1, test_id: 1, index: 0, value: 'item1' }];
        }
        return [{ id: 1 }];
      });

      const mockSql: SqlExecutor = { exec: execSpy };

      const generator = new SelectGenerator(schema);
      generator.readFirst(mockSql, 'test');

      // Verify the query uses test_items (no prefix)
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('test_items'),
        expect.anything(),
      );
    });
  });
});