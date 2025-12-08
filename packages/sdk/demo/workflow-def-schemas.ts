#!/usr/bin/env tsx
/**
 * Demo: Creating Workflow Definitions with Schema Builders
 *
 * This demonstrates:
 * - Using ergonomic schema builders (no need to import @wonder/context)
 * - Creating workflow definitions with typed schemas using builders
 * - Composing workflows with node(), transition(), and workflowDef() helpers
 */

import createClient from 'openapi-fetch';
import { createClient as createWonderClient } from '../src/generated/client.js';
import type { paths } from '../src/generated/schema.js';
import { node, schema, transition, workflowDef } from '../src/index.js';

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
    // Define typed schemas using builders
    // ============================================

    // Input schema: What the workflow accepts when started
    const inputSchema = schema.object(
      {
        topic: schema.string({ minLength: 1, maxLength: 200 }),
        format: schema.string({ enum: ['blog', 'article', 'tweet'] }),
        wordCount: schema.integer({ minimum: 100, maximum: 5000 }),
      },
      { required: ['topic', 'format'] },
    );

    // Output schema: What the workflow returns when complete
    const outputSchema = schema.object(
      {
        content: schema.string(),
        wordCount: schema.integer(),
        createdAt: schema.string(),
      },
      { required: ['content', 'wordCount', 'createdAt'] },
    );

    // Context schema: Shared state accessible across all nodes
    const contextSchema = schema.object(
      {
        apiKey: schema.string({ minLength: 1 }),
        userId: schema.string(),
        preferences: schema.object({
          tone: schema.string({ enum: ['formal', 'casual', 'technical'] }),
          language: schema.string({ pattern: '^[a-z]{2}$' }), // ISO 639-1 language code
        }),
      },
      { required: ['apiKey', 'userId'] },
    );

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
    // Create Workflow Definition using builders
    // ============================================
    console.log('3. Creating workflow definition with builders...\n');

    const workflow = workflowDef({
      name: 'Content Generation Pipeline',
      description: 'Generates content based on topic and format',
      project_id: project.id,
      input_schema: inputSchema,
      output_schema: outputSchema,
      context_schema: contextSchema,
      initial_node_ref: 'start',
      nodes: [
        node({
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
        }),
        node({
          ref: 'review',
          name: 'Review Content',
          action_id: 'review-content',
          action_version: 1,
          input_mapping: {
            content: '$.start.content',
          },
        }),
        node({
          ref: 'end',
          name: 'Finalize',
          action_id: 'finalize-content',
          action_version: 1,
          input_mapping: {
            content: '$.start.content',
            wordCount: '$.input.wordCount',
          },
        }),
      ],
      transitions: [
        transition({
          from_node_ref: 'start',
          to_node_ref: 'review',
          priority: 1,
          condition: {
            expression: '$.start.needsReview == true',
          },
        }),
        transition({
          from_node_ref: 'start',
          to_node_ref: 'end',
          priority: 2,
          condition: {
            expression: 'true',
          },
        }),
        transition({
          from_node_ref: 'review',
          to_node_ref: 'end',
          priority: 1,
          condition: {
            expression: 'true',
          },
        }),
      ],
      output_mapping: {
        content: '$.end.finalContent',
        wordCount: '$.end.actualWordCount',
        createdAt: '$.end.timestamp',
      },
    });

    const workflowDefResponse = await wonder['workflow-defs'].create(workflow);

    const createdWorkflow = workflowDefResponse?.workflow_def;
    console.log(`   Created workflow definition: ${createdWorkflow?.name}`);
    console.log(`   ID: ${createdWorkflow?.id}`);
    console.log(`   Version: ${createdWorkflow?.version}\n`);

    // ============================================
    // Demonstrate Schema Validation
    // ============================================
    console.log('4. Schema features:\n');

    console.log('   Input schema requires:');
    (inputSchema.required as string[] | undefined)?.forEach((field) => {
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
    // Complex Schema Example using builders
    // ============================================
    console.log('5. Advanced schema with arrays and nested objects:\n');

    const advancedInputSchema = schema.object(
      {
        tasks: schema.array(
          schema.object(
            {
              name: schema.string(),
              priority: schema.integer({ minimum: 1, maximum: 5 }),
              tags: schema.array(schema.string(), { uniqueItems: true }),
            },
            { required: ['name', 'priority'] },
          ),
          { minItems: 1, maxItems: 10 },
        ),
        metadata: schema.object({
          source: schema.string(),
          timestamp: schema.string(),
        }),
      },
      { required: ['tasks'] },
    );

    console.log('   Advanced schema structure:');
    console.log('   - Array of tasks (1-10 items)');
    console.log('   - Each task has name, priority (1-5), and optional tags');
    console.log('   - Tags array enforces uniqueItems');
    console.log('   - Optional metadata object with source and timestamp');
    console.log();

    const advancedWorkflow = workflowDef({
      name: 'Task Processing Pipeline',
      description: 'Processes batches of tasks with priorities',
      project_id: project.id,
      input_schema: advancedInputSchema,
      output_schema: schema.object(
        {
          processed: schema.integer(),
          results: schema.array(
            schema.object({
              taskName: schema.string(),
              status: schema.string({ enum: ['success', 'failed'] }),
            }),
          ),
        },
        { required: ['processed', 'results'] },
      ),
      initial_node_ref: 'process',
      nodes: [
        node({
          ref: 'process',
          name: 'Process Tasks',
          action_id: 'batch-processor',
          action_version: 1,
          input_mapping: {
            tasks: '$.input.tasks',
          },
        }),
      ],
      output_mapping: {
        processed: '$.process.count',
        results: '$.process.results',
      },
    });

    const advancedDefResponse = await wonder['workflow-defs'].create(advancedWorkflow);

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
