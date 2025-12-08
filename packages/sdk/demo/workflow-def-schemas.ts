#!/usr/bin/env tsx
/**
 * Demo: Creating Workflow Definitions with Context Schemas
 *
 * This demonstrates:
 * - Importing SchemaType from @wonder/context for proper validation
 * - Creating workflow definitions with typed input/output/context schemas
 * - Type safety when defining recursive schema structures
 */

import type { SchemaType } from '@wonder/context';
import createClient from 'openapi-fetch';
import { createClient as createWonderClient } from '../src/generated/client.js';
import type { paths } from '../src/generated/schema.js';

const API_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

// Create base HTTP client
const baseClient = createClient<paths>({ baseUrl: API_URL });

// Create Wonder client
const wonder = createWonderClient(baseClient);

async function demo() {
  console.log('=== Workflow Definition with Schemas Demo ===\n');

  try {
    // ============================================
    // Get or create a workspace first
    // ============================================
    console.log('1. Getting workspace...\n');

    const workspacesResponse = await wonder.workspaces.list();
    let workspaceId = workspacesResponse?.workspaces?.[0]?.id;

    if (!workspaceId) {
      const createWsResponse = await wonder.workspaces.create({
        name: 'Demo Workspace',
        settings: { demo: true },
      });
      workspaceId = createWsResponse?.workspace?.id;
    }

    if (!workspaceId) {
      throw new Error('Failed to get or create workspace');
    }

    console.log(`   Using workspace: ${workspaceId}\n`);

    // ============================================
    // Define typed schemas using SchemaType
    // ============================================

    // Input schema: What the workflow accepts when started
    const inputSchema: SchemaType = {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
        },
        format: {
          type: 'string',
          enum: ['blog', 'article', 'tweet'],
        },
        wordCount: {
          type: 'integer',
          minimum: 100,
          maximum: 5000,
        },
      },
      required: ['topic', 'format'],
    };

    // Output schema: What the workflow returns when complete
    const outputSchema: SchemaType = {
      type: 'object',
      properties: {
        content: {
          type: 'string',
        },
        wordCount: {
          type: 'integer',
        },
        createdAt: {
          type: 'string',
        },
      },
      required: ['content', 'wordCount', 'createdAt'],
    };

    // Context schema: Shared state accessible across all nodes
    const contextSchema: SchemaType = {
      type: 'object',
      properties: {
        apiKey: {
          type: 'string',
          minLength: 1,
        },
        userId: {
          type: 'string',
        },
        preferences: {
          type: 'object',
          properties: {
            tone: {
              type: 'string',
              enum: ['formal', 'casual', 'technical'],
            },
            language: {
              type: 'string',
              pattern: '^[a-z]{2}$', // ISO 639-1 language code
            },
          },
        },
      },
      required: ['apiKey', 'userId'],
    };

    console.log('2. Creating project...\n');

    // First, create a project to associate the workflow def with
    const projectResponse = await wonder.projects.create({
      workspace_id: workspaceId,
      name: 'Content Generation',
      description: 'Automated content generation workflows',
    });
    const project = projectResponse?.project;
    console.log(`   Created project: ${project?.name} (${project?.id})\n`);

    if (!project?.id) {
      throw new Error('Failed to create project');
    }

    // ============================================
    // Create Workflow Definition with Schemas
    // ============================================
    console.log('3. Creating workflow definition with schemas...\n');

    const workflowDefResponse = await wonder['workflow-defs'].create({
      name: 'Content Generation Pipeline',
      description: 'Generates content based on topic and format',
      version: 1,
      project_id: project.id,

      // TypeScript validates these match SchemaType from @wonder/context
      input_schema: inputSchema,
      output_schema: outputSchema,
      context_schema: contextSchema,

      // Define the workflow structure
      initial_node_ref: 'start',
      nodes: [
        {
          ref: 'start',
          name: 'Generate Content',
          action_id: 'generate-content',
          action_version: 1,
          input_mapping: {
            topic: '$.input.topic',
            format: '$.input.format',
            wordCount: '$.input.wordCount',
            apiKey: '$.context.apiKey',
            tone: '$.context.preferences.tone',
          },
          output_mapping: {
            content: '$.response.content',
          },
        },
        {
          ref: 'review',
          name: 'Review Content',
          action_id: 'review-content',
          action_version: 1,
          input_mapping: {
            content: '$.start.content',
          },
        },
        {
          ref: 'end',
          name: 'Finalize',
          action_id: 'finalize-content',
          action_version: 1,
          input_mapping: {
            content: '$.start.content',
            wordCount: '$.input.wordCount',
          },
        },
      ],
      transitions: [
        {
          from_node_ref: 'start',
          to_node_ref: 'review',
          priority: 1,
          condition: {
            expression: '$.start.needsReview == true',
          },
        },
        {
          from_node_ref: 'start',
          to_node_ref: 'end',
          priority: 2,
          condition: {
            expression: 'true',
          },
        },
        {
          from_node_ref: 'review',
          to_node_ref: 'end',
          priority: 1,
          condition: {
            expression: 'true',
          },
        },
      ],
      output_mapping: {
        content: '$.end.finalContent',
        wordCount: '$.end.actualWordCount',
        createdAt: '$.end.timestamp',
      },
    });

    const workflowDef = workflowDefResponse?.workflow_def;
    console.log(`   Created workflow definition: ${workflowDef?.name}`);
    console.log(`   ID: ${workflowDef?.id}`);
    console.log(`   Version: ${workflowDef?.version}\n`);

    // ============================================
    // Demonstrate Schema Validation
    // ============================================
    console.log('4. Schema features:\n');

    console.log('   Input schema requires:');
    inputSchema.required?.forEach((field) => {
      console.log(`   - ${field}: ${inputSchema.properties?.[field]?.type}`);
    });
    console.log();

    console.log('   Context schema provides:');
    console.log(`   - apiKey (required): ${contextSchema.properties?.apiKey?.type}`);
    console.log(`   - userId (required): ${contextSchema.properties?.userId?.type}`);
    console.log(`   - preferences (optional): ${contextSchema.properties?.preferences?.type}`);
    console.log();

    console.log('   Type safety ensures:');
    console.log('   ✓ Recursive schema structures are properly typed');
    console.log('   ✓ All schema constraints are validated at compile time');
    console.log('   ✓ No loss of type information through API boundaries');
    console.log();

    // ============================================
    // Complex Schema Example
    // ============================================
    console.log('5. Advanced schema with arrays and nested objects:\n');

    const advancedInputSchema: SchemaType = {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              priority: { type: 'integer', minimum: 1, maximum: 5 },
              tags: {
                type: 'array',
                items: { type: 'string' },
                uniqueItems: true,
              },
            },
            required: ['name', 'priority'],
          },
          minItems: 1,
          maxItems: 10,
        },
        metadata: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
      required: ['tasks'],
    };

    console.log('   Advanced schema structure:');
    console.log('   - Array of tasks (1-10 items)');
    console.log('   - Each task has name, priority (1-5), and optional tags');
    console.log('   - Tags array enforces uniqueItems');
    console.log('   - Optional metadata object with source and timestamp');
    console.log();

    const advancedDefResponse = await wonder['workflow-defs'].create({
      name: 'Task Processing Pipeline',
      description: 'Processes batches of tasks with priorities',
      version: 1,
      project_id: project.id,
      input_schema: advancedInputSchema,
      output_schema: {
        type: 'object',
        properties: {
          processed: { type: 'integer' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                taskName: { type: 'string' },
                status: { type: 'string', enum: ['success', 'failed'] },
              },
            },
          },
        },
        required: ['processed', 'results'],
      },
      initial_node_ref: 'process',
      nodes: [
        {
          ref: 'process',
          name: 'Process Tasks',
          action_id: 'batch-processor',
          action_version: 1,
          input_mapping: {
            tasks: '$.input.tasks',
          },
        },
      ],
      output_mapping: {
        processed: '$.process.count',
        results: '$.process.results',
      },
    });

    console.log(`   Created advanced workflow: ${advancedDefResponse?.workflow_def?.name}\n`);

    console.log('✓ Demo complete!\n');
  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
    }
  }
}

// Run the demo
demo().catch(console.error);
