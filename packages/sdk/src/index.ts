/**
 * Wonder SDK - Type-safe client for the Wonder API
 */

import { APIClient } from './client';
import { ModelProfilesResource } from './resources/model-profiles';
import { ProjectsResource } from './resources/projects';
import { WorkspacesResource } from './resources/workspaces';

export type * from './generated/schema';

export class WonderClient {
  public readonly workspaces: WorkspacesResource;
  public readonly projects: ProjectsResource;
  public readonly modelProfiles: ModelProfilesResource;

  constructor(
    baseUrl: string = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev',
  ) {
    const apiClient = new APIClient(baseUrl);
    this.workspaces = new WorkspacesResource(apiClient);
    this.projects = new ProjectsResource(apiClient);
    this.modelProfiles = new ModelProfilesResource(apiClient);
  }
}

export const client = new WonderClient();
