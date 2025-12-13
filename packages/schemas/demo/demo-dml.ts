// Demo: INSERT/UPDATE operations with @wonder/schemas

import { CustomTypeRegistry, DDLGenerator, DMLGenerator } from '../src/index.js';
import type { JSONSchema } from '../src/types.js';

console.log('='.repeat(60));
console.log('💾 @wonder/schemas DML Demo (INSERT/UPDATE/DELETE)');
console.log('='.repeat(60));

// Define schema
const userSchema: JSONSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    username: { type: 'string', minLength: 3, maxLength: 20 },
    email: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
    active: { type: 'boolean' },
    profile: {
      type: 'object',
      properties: {
        bio: { type: 'string' },
        website: { type: 'string' },
      },
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['id', 'username', 'email'],
};

const registry = new CustomTypeRegistry();

// Demo 1: Generate DDL first
console.log('\n📋 Step 1: Create tables');
console.log('='.repeat(60));

const ddlGen = new DDLGenerator(userSchema, registry);
const ddl = ddlGen.generateDDL('users');
console.log(ddl);

// Demo 2: Generate INSERT statements
console.log('\n' + '='.repeat(60));
console.log('➕ Step 2: INSERT new user');
console.log('='.repeat(60));

const newUser = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  age: 28,
  active: true,
  profile: {
    bio: 'Software engineer and open source enthusiast',
    website: 'https://alice.dev',
  },
  tags: ['developer', 'typescript', 'cloudflare'],
};

console.log('\nData to insert:');
console.log(JSON.stringify(newUser, null, 2));

const dmlGen = new DMLGenerator(userSchema, registry);
const insertResult = dmlGen.generateInsert('users', newUser);

console.log('\n📝 Generated SQL statements:');
insertResult.statements.forEach((stmt, i) => {
  console.log(`\n${i + 1}. ${stmt}`);
  console.log(`   Values: ${JSON.stringify(insertResult.values[i])}`);
});

// Demo 3: Generate UPDATE statements
console.log('\n' + '='.repeat(60));
console.log('✏️  Step 3: UPDATE user');
console.log('='.repeat(60));

const updatedUser = {
  id: 1,
  username: 'alice',
  email: 'alice.new@example.com',
  age: 29,
  active: true,
  profile: {
    bio: 'Senior software engineer',
    website: 'https://alice.dev',
  },
  tags: ['developer', 'typescript', 'cloudflare', 'webassembly'],
};

console.log('\nUpdated data:');
console.log(JSON.stringify(updatedUser, null, 2));

const updateResult = dmlGen.generateUpdate('users', updatedUser, 'id = 1');

console.log('\n📝 Generated SQL statements:');
updateResult.statements.forEach((stmt, i) => {
  console.log(`\n${i + 1}. ${stmt}`);
  if (updateResult.values[i]) {
    console.log(`   Values: ${JSON.stringify(updateResult.values[i])}`);
  }
});

// Demo 4: Generate DELETE statements
console.log('\n' + '='.repeat(60));
console.log('🗑️  Step 4: DELETE user');
console.log('='.repeat(60));

const deleteStmts = dmlGen.generateDelete('users', 'id = 1');

console.log('\n📝 Generated SQL statements:');
deleteStmts.forEach((stmt, i) => {
  console.log(`\n${i + 1}. ${stmt}`);
});

// Demo 5: Alternative strategies
console.log('\n' + '='.repeat(60));
console.log('⚙️  Step 5: Arrays as JSON (simpler INSERTs)');
console.log('='.repeat(60));

const dmlGenJson = new DMLGenerator(userSchema, registry, {
  arrayStrategy: 'json',
  nestedObjectStrategy: 'json',
});

const insertResultJson = dmlGenJson.generateInsert('users', newUser);

console.log('\n📝 Generated SQL (compact):');
insertResultJson.statements.forEach((stmt, i) => {
  console.log(`\n${i + 1}. ${stmt}`);
  console.log(`   Values: ${JSON.stringify(insertResultJson.values[i])}`);
});

// Demo 6: Practical example - executing queries
console.log('\n' + '='.repeat(60));
console.log('🔧 Step 6: How to execute (pseudocode)');
console.log('='.repeat(60));

console.log(`
// Using D1 (Cloudflare Workers):
const { statements, values } = dmlGen.generateInsert('users', newUser);

// Replace {{PARENT_ID}} placeholder after first insert
const result = await db.prepare(statements[0])
  .bind(...values[0])
  .run();

const parentId = result.meta.last_row_id;

// Execute array inserts with actual parent ID
for (let i = 1; i < statements.length; i++) {
  const stmt = statements[i].replace('{{PARENT_ID}}', parentId.toString());
  await db.prepare(stmt)
    .bind(...values[i])
    .run();
}

// Or use a transaction:
await db.batch([
  db.prepare(statements[0]).bind(...values[0]),
  // ... handle parent ID reference
]);
`);

// Demo 7: Parameterized query template
console.log('\n' + '='.repeat(60));
console.log('🎯 Step 7: Reusable parameterized query');
console.log('='.repeat(60));

const parameterizedInsert = dmlGen.generateParameterizedInsert('users');
console.log('\nParameterized INSERT template:');
console.log(parameterizedInsert);

console.log('\nYou can reuse this prepared statement for multiple inserts.');

console.log('\n' + '='.repeat(60));
console.log('✨ DML Demo Complete!');
console.log('='.repeat(60));
