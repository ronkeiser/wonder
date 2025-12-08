/**
 * Example usage of the generated SDK client
 */

import createClient from 'openapi-fetch';
import { createClient as createWonderClient } from './generated/client.js';
import type { paths } from './generated/schema.js';

// Create the base HTTP client with openapi-fetch
const baseClient = createClient<paths>({
  baseUrl: 'https://wonder-http.ron-keiser.workers.dev',
});

// Create the Wonder client with ergonomic methods
const client = createWonderClient(baseClient);

// Now you can use the client with the ergonomic API:

// Collection methods
// await client.workspaces.create({ name: 'My Workspace' });
// await client.workspaces.list({ limit: 10 });

// Instance methods (via callable syntax)
// const workspace = client.workspaces('workspace-id');
// await workspace.get();
// await workspace.update({ name: 'Updated Name' });
// await workspace.delete();

// Nested resources would work similarly:
// const project = client.projects('project-id');
// await project.workflows.list();
// await project.workflows.create({ name: 'My Workflow' });

export { client };
