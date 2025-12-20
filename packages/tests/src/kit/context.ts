/**
 * Test Context Setup
 *
 * Provides infrastructure for workflow tests: workspace, project, model profile.
 * Creates fresh resources for each test run to ensure isolation.
 */

import { wonder } from '~/client';
import type { TestContext } from './types';

export type { TestContext } from './types';

/**
 * Sets up the base infrastructure needed for workflow tests:
 * - Workspace (fresh for each test)
 * - Project (fresh for each test)
 * - Model profile (fresh for each test)
 */
export async function setupTestContext(): Promise<TestContext> {
  // Create a fresh workspace
  const { workspace } = await wonder.workspaces.create({
    name: `Test Workspace ${Date.now()}`,
  });

  // Create a fresh project in the workspace
  const { project } = await wonder.projects.create({
    workspaceId: workspace.id,
    name: `Test Project ${Date.now()}`,
  });

  // Create a fresh model profile
  const { modelProfile } = await wonder.modelProfiles.create({
    name: `Test Model Profile ${Date.now()}`,
    provider: 'cloudflare',
    modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    parameters: {
      maxTokens: 512,
      temperature: 2.5,
    },
    costPer1kInputTokens: 0.0,
    costPer1kOutputTokens: 0.0,
  });

  return {
    workspaceId: workspace.id,
    projectId: project.id,
    modelProfileId: modelProfile.id,
  };
}

/**
 * Cleans up the base context resources.
 */
export async function cleanupTestContext(ctx: TestContext) {
  try {
    await wonder['model-profiles'](ctx.modelProfileId).delete();
  } catch {
    // Ignore - may already be deleted
  }
  try {
    await wonder.projects(ctx.projectId).delete();
  } catch {
    // Ignore - may already be deleted
  }
  try {
    await wonder.workspaces(ctx.workspaceId).delete();
  } catch {
    // Ignore - may already be deleted
  }
}
