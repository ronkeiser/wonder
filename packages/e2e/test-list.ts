import { client } from './src/client.js';

async function testList() {
  // Create workspace and project first
  const { data: wsResp, error: wsErr } = await client.POST('/workspaces', {
    body: { name: 'Test List WS', settings: {} },
  });

  if (wsErr) {
    console.error('Workspace error:', wsErr);
    return;
  }

  const { data: projResp, error: projErr } = await client.POST('/projects', {
    body: {
      workspace_id: wsResp!.workspace_id,
      name: 'Test List Project',
    },
  });

  if (projErr) {
    console.error('Project error:', projErr);
    return;
  }

  // Create a workflow def
  const { data: wfDefResp } = await client.POST('/workflow-defs', {
    body: {
      name: 'Test WF',
      version: 1,
      owner: { type: 'project', id: projResp!.project_id },
      nodes: [],
    },
  });

  console.log('Created workflow def:', wfDefResp?.workflow_def_id);

  // List by owner - this is what we're testing
  const { data: listResp } = await client.GET('/workflow-defs/owner/{owner}', {
    params: { path: { owner: `project:${projResp!.project_id}` } },
  });

  console.log('\nList response type:', typeof listResp);
  console.log('List response keys:', Object.keys(listResp || {}));
  console.log('List response:', JSON.stringify(listResp, null, 2));

  // Cleanup
  await client.DELETE('/projects/{id}', {
    params: { path: { id: projResp!.project_id } },
  });
  await client.DELETE('/workspaces/{id}', {
    params: { path: { id: wsResp!.workspace_id } },
  });
}

testList().catch(console.error);
