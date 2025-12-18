/**
 * Test Context Setup
 *
 * Provides infrastructure for workflow tests: workspace, project, model profile.
 *
 * Uses a persistent workspace and project to enable workflow definition deduplication
 * across test runs. Set TEST_WORKSPACE_ID and TEST_PROJECT_ID environment variables
 * to use existing resources, or leave unset to auto-create persistent ones.
 */

import { wonder } from '~/client';
import type { TestContext } from './types';

export type { TestContext } from './types';

/** Fixed names for persistent test resources */
const TEST_WORKSPACE_NAME = 'Wonder Test Workspace';
const TEST_PROJECT_NAME = 'Wonder Test Project';
const TEST_MODEL_PROFILE_NAME = 'Wonder Test Model Profile';

/**
 * Find or create a workspace by name.
 */
async function getOrCreateWorkspace(): Promise<string> {
  // Check environment variable first
  if (process.env.TEST_WORKSPACE_ID) {
    return process.env.TEST_WORKSPACE_ID;
  }

  // List existing workspaces and find by name
  const { workspaces } = await wonder.workspaces.list();
  const existing = workspaces.find((w) => w.name === TEST_WORKSPACE_NAME);

  if (existing) {
    return existing.id;
  }

  // Create new workspace
  const { workspace } = await wonder.workspaces.create({
    name: TEST_WORKSPACE_NAME,
  });
  return workspace.id;
}

/**
 * Find or create a project by name within a workspace.
 */
async function getOrCreateProject(workspaceId: string): Promise<string> {
  // Check environment variable first
  if (process.env.TEST_PROJECT_ID) {
    return process.env.TEST_PROJECT_ID;
  }

  // List projects in workspace to find by name
  const { projects } = await wonder.workspaces(workspaceId).projects.list();
  const existing = projects.find((p) => p.name === TEST_PROJECT_NAME);

  if (existing) {
    return existing.id;
  }

  // Create new project
  const { project } = await wonder.projects.create({
    workspace_id: workspaceId,
    name: TEST_PROJECT_NAME,
    description: 'Persistent test project for workflow tests',
  });
  return project.id;
}

/**
 * Find or create a model profile by name.
 */
async function getOrCreateModelProfile(): Promise<string> {
  // Check environment variable first
  if (process.env.TEST_MODEL_PROFILE_ID) {
    return process.env.TEST_MODEL_PROFILE_ID;
  }

  // List existing model profiles and find by name
  const { model_profiles } = await wonder.modelProfiles.list();
  const existing = model_profiles.find((m) => m.name === TEST_MODEL_PROFILE_NAME);

  if (existing) {
    return existing.id;
  }

  // Create new model profile
  const { model_profile } = await wonder.modelProfiles.create({
    name: TEST_MODEL_PROFILE_NAME,
    provider: 'cloudflare',
    model_id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    parameters: {
      max_tokens: 512,
      temperature: 2.5,
    },
    cost_per_1k_input_tokens: 0.0,
    cost_per_1k_output_tokens: 0.0,
  });
  return model_profile.id;
}

/**
 * Sets up the base infrastructure needed for workflow tests:
 * - Workspace (persistent, reused across test runs)
 * - Project (persistent, reused across test runs)
 * - Model profile (persistent, reused across test runs)
 *
 * Uses get-or-create pattern to enable workflow definition deduplication.
 * Set environment variables to override:
 * - TEST_WORKSPACE_ID
 * - TEST_PROJECT_ID
 * - TEST_MODEL_PROFILE_ID
 */
export async function setupTestContext(): Promise<TestContext> {
  const workspaceId = await getOrCreateWorkspace();
  const projectId = await getOrCreateProject(workspaceId);
  const modelProfileId = await getOrCreateModelProfile();

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
