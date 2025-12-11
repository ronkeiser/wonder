// Demo script for @wonder/schemas

import { CustomTypeRegistry, DDLGenerator, Validator } from '../src/index.js';
import type { JSONSchema } from '../src/types.js';

console.log('='.repeat(60));
console.log('🎯 @wonder/schemas Demo');
console.log('='.repeat(60));

// Define a schema for a blog post
const postSchema: JSONSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    content: { type: 'string', minLength: 10 },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    views: { type: 'integer', minimum: 0 },
    rating: { type: 'number', minimum: 0, maximum: 5 },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
    comments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          author: { type: 'string' },
          text: { type: 'string' },
          upvotes: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
  required: ['id', 'title', 'content', 'status'],
};

console.log('\n📋 Schema Definition:');
console.log(JSON.stringify(postSchema, null, 2));

// Demo 1: Validation with valid data
console.log('\n' + '='.repeat(60));
console.log('✅ Demo 1: Validating VALID data');
console.log('='.repeat(60));

const validPost = {
  id: 1,
  title: 'Getting Started with Wonder',
  content: 'This is a comprehensive guide to using Wonder workflows...',
  status: 'published',
  views: 1234,
  rating: 4.5,
  author: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  tags: ['tutorial', 'workflow', 'getting-started'],
  comments: [
    { author: 'Alice', text: 'Great article!', upvotes: 5 },
    { author: 'Bob', text: 'Very helpful', upvotes: 3 },
  ],
};

console.log('\nInput data:');
console.log(JSON.stringify(validPost, null, 2));

const validator1 = new Validator(postSchema, new CustomTypeRegistry());
const result1 = validator1.validate(validPost);

console.log(`\n✅ Validation result: ${result1.valid ? 'VALID' : 'INVALID'}`);
console.log(`Errors: ${result1.errors.length}`);

// Demo 2: Validation with invalid data
console.log('\n' + '='.repeat(60));
console.log('❌ Demo 2: Validating INVALID data');
console.log('='.repeat(60));

const invalidPost = {
  id: 'not-a-number', // Should be integer
  title: '', // Too short (minLength: 1)
  content: 'Short', // Too short (minLength: 10)
  status: 'pending', // Not in enum
  views: -100, // Below minimum (0)
  rating: 10, // Above maximum (5)
};

console.log('\nInput data:');
console.log(JSON.stringify(invalidPost, null, 2));

const validator2 = new Validator(postSchema, new CustomTypeRegistry(), {
  collectAllErrors: true,
});
const result2 = validator2.validate(invalidPost);

console.log(`\n❌ Validation result: ${result2.valid ? 'VALID' : 'INVALID'}`);
console.log(`Errors found: ${result2.errors.length}\n`);

result2.errors.forEach((err, i) => {
  console.log(`${i + 1}. Path: ${err.path}`);
  console.log(`   Message: ${err.message}`);
  console.log(`   Expected: ${err.expected}, Got: ${JSON.stringify(err.actual)}`);
});

// Demo 3: DDL Generation
console.log('\n' + '='.repeat(60));
console.log('🗄️  Demo 3: DDL Generation');
console.log('='.repeat(60));

const registry = new CustomTypeRegistry();
const generator = new DDLGenerator(postSchema, registry);

console.log('\nGenerated SQLite DDL:\n');
console.log(generator.generateDDL('posts'));

console.log('\n📊 Tables created:');
generator.getTableNames('posts').forEach((table, i) => {
  console.log(`  ${i + 1}. ${table}`);
});

// Demo 4: Custom Types
console.log('\n' + '='.repeat(60));
console.log('🎨 Demo 4: Custom Types with SQL Mapping');
console.log('='.repeat(60));

const customRegistry = new CustomTypeRegistry();
customRegistry.register('timestamp', {
  validate: (value: unknown) => typeof value === 'number' && value > 0,
  toSQL: () => ({
    type: 'INTEGER',
    constraints: ['CHECK (value > 0)'],
  }),
  description: 'Unix timestamp (milliseconds since epoch)',
});

const eventSchema: JSONSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', minLength: 1 },
    createdAt: { type: 'timestamp' as any },
    updatedAt: { type: 'timestamp' as any },
  },
  required: ['id', 'name', 'createdAt'],
};

console.log('\nSchema with custom types:');
console.log(JSON.stringify(eventSchema, null, 2));

const eventData = {
  id: 1,
  name: 'User Signup',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

console.log('\nValidating with custom type:');
const validator3 = new Validator(eventSchema, customRegistry);
const result3 = validator3.validate(eventData);
console.log(`Result: ${result3.valid ? '✅ VALID' : '❌ INVALID'}`);

console.log('\nGenerating DDL with custom type:');
const generator2 = new DDLGenerator(eventSchema, customRegistry);
console.log(generator2.generateDDL('events'));

// Demo 5: DDL Generation Options
console.log('\n' + '='.repeat(60));
console.log('⚙️  Demo 5: DDL Generation Options');
console.log('='.repeat(60));

console.log('\n--- Option 1: Arrays as JSON (instead of separate tables) ---');
const generator3 = new DDLGenerator(postSchema, registry, {
  arrayStrategy: 'json',
});
console.log(generator3.generateDDL('posts_json'));

console.log('\n--- Option 2: Nested objects as JSON (instead of flattened) ---');
const generator4 = new DDLGenerator(postSchema, registry, {
  nestedObjectStrategy: 'json',
  arrayStrategy: 'json',
});
console.log(generator4.generateDDL('posts_compact'));

console.log('\n' + '='.repeat(60));
console.log('✨ Demo Complete!');
console.log('='.repeat(60));
