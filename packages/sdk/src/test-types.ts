/**
 * Type checking playground - NOT a real test file
 * Open this in your editor to see autocomplete and type checking
 */

import type { SchemaType } from '@wonder/context';
import type { components } from './generated/schema';

// Extract types from generated schema
type WorkflowDef = components['schemas']['WorkflowDef'];

// Test: Can we create a WorkflowDef with proper types?
const workflow: WorkflowDef = {
  id: '123',
  name: 'Test Workflow',
  description: 'A test workflow',
  version: 1,
  project_id: 'proj-123',
  library_id: null,
  tags: ['test'],

  // These should be SchemaType, not Record<string, any>
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
    },
  },

  output_schema: {
    type: 'object',
    properties: {
      result: { type: 'string' },
    },
  },

  context_schema: {
    type: 'object',
    properties: {
      state: { type: 'string' },
    },
  },

  initial_node_id: 'node-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Hover over these in your editor to see the types!
const inputSchema = workflow.input_schema; // Should be SchemaType
const outputSchema = workflow.output_schema; // Should be SchemaType
const contextSchema = workflow.context_schema; // Should be SchemaType

console.log('Types working correctly!');
console.log('input_schema type:', typeof inputSchema);
