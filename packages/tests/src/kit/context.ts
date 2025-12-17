/**
 * Test Context Setup
 *
 * Provides infrastructure for workflow tests: workspace, project, model profile.
 */

import { wonder } from '~/client';
import type { TestContext } from './types.js';

export type { TestContext } from './types.js';

/**
 * Sets up the base infrastructure needed for workflow tests:
 * - Workspace
 * - Project
 * - Model profile
 *
 * Tests should create their own prompt specs, actions, and task definitions
 * using builders, which will be auto-created by createWorkflow.
 */
export async function setupTestContext(): Promise<TestContext> {
  // Create workspace
  const workspaceResponse = await wonder.workspaces.create({
    name: `Test Workspace ${Date.now()}`,
  });
  const workspaceId = workspaceResponse.workspace.id;

  // Create project
  const projectResponse = await wonder.projects.create({
    workspace_id: workspaceId,
    name: `Test Project ${Date.now()}`,
    description: 'Test project for workflow tests',
  });
  const projectId = projectResponse.project.id;

  // Create model profile
  const modelProfileResponse = await wonder.modelProfiles.create({
    name: `Test Model Profile ${Date.now()}`,
    provider: 'cloudflare',
    model_id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    parameters: {
      max_tokens: 512,
      temperature: 2.5,
    },
    cost_per_1k_input_tokens: 0.0,
    cost_per_1k_output_tokens: 0.0,
  });
  const modelProfileId = modelProfileResponse.model_profile.id;

  return {
    workspaceId,
    projectId,
    modelProfileId,
  };
}

/**
 * Cleans up just the base context (without workflow-specific resources).
 * Use this if you created a context but didn't create a workflow.
 */
export async function cleanupTestContext(ctx: TestContext) {
  await wonder['model-profiles'](ctx.modelProfileId).delete();
  await wonder.projects(ctx.projectId).delete();
  await wonder.workspaces(ctx.workspaceId).delete();
}
