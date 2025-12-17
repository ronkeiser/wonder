import { describe, expect, it } from 'vitest';
import { CustomTypeRegistry } from '../src/custom-types.js';
import { DDLGenerator } from '../src/generators/ddl-generator.js';
import type { JSONSchema } from '../src/types.js';

describe('DDLGenerator', () => {
  describe('Basic table generation', () => {
    it('should generate simple table with scalar fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          active: { type: 'boolean' },
        },
        required: ['id', 'name'],
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('users');

      expect(ddl).toContain('CREATE TABLE users');
      expect(ddl).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
      // Note: required fields don't get NOT NULL - workflows write incrementally,
      // completeness is validated at read time, not write time
      expect(ddl).toContain('name TEXT');
      expect(ddl).toContain('active INTEGER');
    });

    it('should handle nullable fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', nullable: true },
        },
        required: ['email'],
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('users');

      expect(ddl).not.toContain('NOT NULL');
    });

    it('should handle all scalar types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          text: { type: 'string' },
          count: { type: 'integer' },
          price: { type: 'number' },
          flag: { type: 'boolean' },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('test');

      expect(ddl).toContain('text TEXT');
      expect(ddl).toContain('count INTEGER');
      expect(ddl).toContain('price REAL');
      expect(ddl).toContain('flag INTEGER');
    });
  });

  describe('Constraint generation', () => {
    it('should generate string length constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 20,
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('users');

      expect(ddl).toContain('CHECK');
      expect(ddl).toContain('length');
    });

    it('should generate number range constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: {
            type: 'integer',
            minimum: 0,
            maximum: 150,
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('users');

      expect(ddl).toContain('CHECK');
      expect(ddl).toContain('age >= 0');
      expect(ddl).toContain('age <= 150');
    });

    it('should generate enum constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'active', 'archived'],
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('users');

      expect(ddl).toContain('CHECK');
      expect(ddl).toContain('IN');
      expect(ddl).toContain("'pending'");
      expect(ddl).toContain("'active'");
      expect(ddl).toContain("'archived'");
    });

    it('should generate exclusive range constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          score: {
            type: 'number',
            exclusiveMinimum: 0,
            exclusiveMaximum: 100,
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('scores');

      expect(ddl).toContain('CHECK');
      expect(ddl).toContain('score > 0');
      expect(ddl).toContain('score < 100');
    });
  });

  describe('Nested objects', () => {
    it('should flatten nested objects by default', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('records');

      expect(ddl).toContain('user_name TEXT');
      expect(ddl).toContain('user_email TEXT');
    });

    it('should store nested objects as JSON when configured', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const ddl = generator.generateDDL('records');

      expect(ddl).toContain('metadata TEXT');
      expect(ddl).not.toContain('metadata_tags');
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
                  value: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('records');

      expect(ddl).toContain('level1_level2_value TEXT');
    });
  });

  describe('Array handling', () => {
    it('should create separate table for arrays by default', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('posts');

      expect(ddl).toContain('CREATE TABLE posts_tags');
      expect(ddl).toContain('posts_id INTEGER NOT NULL');
      expect(ddl).toContain('"index" INTEGER NOT NULL');
      expect(ddl).toContain('value TEXT');
      expect(ddl).toContain('FOREIGN KEY (posts_id) REFERENCES posts(id)');
    });

    it('should store arrays as JSON when configured', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        arrayStrategy: 'json',
      });
      const ddl = generator.generateDDL('posts');

      expect(ddl).toContain('tags TEXT');
      expect(ddl).not.toContain('CREATE TABLE posts_tags');
    });

    it('should handle array of objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
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

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('posts');

      expect(ddl).toContain('CREATE TABLE posts_comments');
      expect(ddl).toContain('author TEXT');
      expect(ddl).toContain('text TEXT');
    });

    it('should handle nested arrays', () => {
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
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('docs');

      expect(ddl).toContain('CREATE TABLE docs_sections');
      expect(ddl).toContain('CREATE TABLE docs_sections_items');
    });

    it('should use array table prefix when configured', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        arrayTablePrefix: 'arr_',
      });
      const ddl = generator.generateDDL('posts');

      expect(ddl).toContain('CREATE TABLE arr_posts_tags');
    });
  });

  describe('Custom types', () => {
    it('should use custom type SQL mapping', () => {
      const registry = new CustomTypeRegistry();
      registry.register('timestamp', {
        validate: (value: unknown) => typeof value === 'number' && value > 0,
        toSQL: () => ({
          type: 'INTEGER',
          constraints: ['CHECK (value > 0)'],
        }),
      });

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          createdAt: { type: 'timestamp' as any },
        },
      };

      const generator = new DDLGenerator(schema, registry);
      const ddl = generator.generateDDL('events');

      expect(ddl).toContain('createdAt INTEGER');
      expect(ddl).toContain('CHECK (value > 0)');
    });

    it('should fall back to base type if no SQL mapping', () => {
      const registry = new CustomTypeRegistry();
      registry.register('email', {
        validate: (value: unknown) => typeof value === 'string' && value.includes('@'),
      });

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'email' as any },
        },
      };

      const generator = new DDLGenerator(schema, registry);
      const ddl = generator.generateDDL('users');

      expect(ddl).toContain('email TEXT');
    });
  });

  describe('Table name methods', () => {
    it('should return all table names including array tables', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
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

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const tables = generator.getTableNames('posts');

      expect(tables).toEqual(['posts', 'posts_tags', 'posts_comments']);
    });

    it('should return only main table when arrays stored as JSON', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        arrayStrategy: 'json',
      });
      const tables = generator.getTableNames('posts');

      expect(tables).toEqual(['posts']);
    });
  });

  describe('Edge cases', () => {
    it('should throw error for non-object root schema', () => {
      const schema: JSONSchema = {
        type: 'string',
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());

      expect(() => generator.generateDDL('test')).toThrow(
        'DDL generation requires an object schema at root',
      );
    });

    it('should handle empty object schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {},
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('empty');

      expect(ddl).toContain('CREATE TABLE empty');
    });

    it('should handle schema with no properties', () => {
      const schema: JSONSchema = {
        type: 'object',
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('test');

      expect(ddl).toContain('CREATE TABLE test');
    });
  });

  describe('DDL formatting', () => {
    it('should format DDL with proper indentation', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('users');

      expect(ddl).toMatch(/CREATE TABLE users \(\n  /);
      expect(ddl).toMatch(/,\n  /);
      expect(ddl).toMatch(/\n\);$/);
    });

    it('should separate multiple tables with blank lines', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('posts');

      expect(ddl).toMatch(/\);\n\nCREATE TABLE posts_tags/);
    });
  });

  describe('Nested objects with JSON strategy', () => {
    it('should store nested objects as TEXT column with json strategy', () => {
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

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const ddl = generator.generateDDL('events');

      expect(ddl).toContain('metadata TEXT');
      expect(ddl).not.toContain('metadata_timestamp');
      expect(ddl).not.toContain('metadata_source');
    });

    it('should not flatten deeply nested objects with json strategy', () => {
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

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const ddl = generator.generateDDL('apps');

      expect(ddl).toContain('config TEXT');
      expect(ddl).not.toContain('config_database');
      expect(ddl).not.toContain('host');
      expect(ddl).not.toContain('port');
    });

    it('should handle mixed scalars and nested objects with json strategy', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          settings: {
            type: 'object',
            properties: {
              theme: { type: 'string' },
            },
          },
          active: { type: 'boolean' },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const ddl = generator.generateDDL('users');

      expect(ddl).toContain('name TEXT');
      expect(ddl).toContain('settings TEXT');
      expect(ddl).toContain('active INTEGER');
      expect(ddl).not.toContain('settings_theme');
    });

    it('should not add constraints to JSON columns', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              value: { type: 'string', minLength: 1, maxLength: 100 },
            },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const ddl = generator.generateDDL('items');

      expect(ddl).toContain('data TEXT');
      // Should not have CHECK constraints for JSON column
      expect(ddl).not.toContain('CHECK');
    });
  });

  describe('Type mapping edge cases', () => {
    it('should map null type to TEXT', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          nullableField: { type: 'null' },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry());
      const ddl = generator.generateDDL('test');

      expect(ddl).toContain('nullableField TEXT');
    });

    it('should map object type to TEXT when not using flatten strategy', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        nestedObjectStrategy: 'json',
      });
      const ddl = generator.generateDDL('test');

      expect(ddl).toContain('data TEXT');
    });

    it('should map array type to TEXT when using json strategy', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      const generator = new DDLGenerator(schema, new CustomTypeRegistry(), {
        arrayStrategy: 'json',
      });
      const ddl = generator.generateDDL('test');

      expect(ddl).toContain('items TEXT');
    });
  });
});
