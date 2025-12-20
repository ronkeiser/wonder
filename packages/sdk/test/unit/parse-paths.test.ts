/**
 * Tests for parse-paths.ts
 */

import { describe, expect, it } from 'vitest';
import {
  NodeType,
  buildRouteTree,
  classifySegment,
  parsePathSegments,
  type PathDefinition,
} from '../../scripts/parse-paths';

describe('Task 1.2: parsePathSegments', () => {
  it('parses simple path with /api/ prefix', () => {
    expect(parsePathSegments('/api/workspaces')).toEqual(['workspaces']);
  });

  it('parses path with parameter', () => {
    expect(parsePathSegments('/api/workspaces/{id}')).toEqual(['workspaces', '{id}']);
  });

  it('parses nested path', () => {
    expect(parsePathSegments('/api/projects/{projectId}/workflows')).toEqual([
      'projects',
      '{projectId}',
      'workflows',
    ]);
  });

  it('handles path without /api/ prefix', () => {
    expect(parsePathSegments('/workspaces')).toEqual(['workspaces']);
  });

  it('handles trailing slashes', () => {
    expect(parsePathSegments('/api/workspaces/')).toEqual(['workspaces']);
  });

  it('handles multiple slashes', () => {
    expect(parsePathSegments('//api//workspaces//')).toEqual(['workspaces']);
  });
});

describe('Task 1.3: classifySegment', () => {
  it('classifies collection segment', () => {
    expect(classifySegment('workspaces')).toBe(NodeType.Collection);
  });

  it('classifies parameter with curly braces', () => {
    expect(classifySegment('{id}')).toBe(NodeType.Param);
  });

  it('classifies parameter with colon', () => {
    expect(classifySegment(':workspaceId')).toBe(NodeType.Param);
  });

  it('classifies regular segment as collection (action detection happens in tree builder)', () => {
    // Actions can't be detected at this stage - need tree context
    expect(classifySegment('start')).toBe(NodeType.Collection);
  });
});

describe('Task 1.4: buildRouteTree', () => {
  it('builds tree for simple collection', () => {
    const paths: PathDefinition[] = [{ path: '/api/workspaces', method: 'get' }];
    const tree = buildRouteTree(paths);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    });
  });

  it('merges multiple HTTP methods on same path', () => {
    const paths: PathDefinition[] = [
      {
        path: '/api/workspaces',
        method: 'get',
        operationId: 'listWorkspaces',
        responses: { '200': {} },
      },
      {
        path: '/api/workspaces',
        method: 'post',
        operationId: 'createWorkspace',
        responses: { '201': {} },
      },
    ];
    const tree = buildRouteTree(paths);

    expect(tree).toHaveLength(1);
    expect(tree[0].methods).toHaveLength(2);
    expect(tree[0].methods).toContainEqual({
      verb: 'get',
      operationId: 'listWorkspaces',
      originalPath: '/api/workspaces',
      successStatusCode: '200',
    });
    expect(tree[0].methods).toContainEqual({
      verb: 'post',
      operationId: 'createWorkspace',
      originalPath: '/api/workspaces',
      successStatusCode: '201',
    });
  });

  it('builds tree with parameter nodes', () => {
    const paths: PathDefinition[] = [{ path: '/api/workspaces/{workspaceId}', method: 'get' }];
    const tree = buildRouteTree(paths);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('workspaces');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({
      type: NodeType.Param,
      name: 'workspaceId',
      methods: [{ verb: 'get' }],
      parent: tree[0],
    });
  });

  it('detects action nodes after parameters', () => {
    const paths: PathDefinition[] = [
      { path: '/api/workflows/{workflow_id}/start', method: 'post' },
    ];
    const tree = buildRouteTree(paths);

    expect(tree).toHaveLength(1);
    const workflowsNode = tree[0];
    expect(workflowsNode.name).toBe('workflows');

    const paramNode = workflowsNode.children[0];
    expect(paramNode.type).toBe(NodeType.Param);
    expect(paramNode.name).toBe('workflow_id');

    const actionNode = paramNode.children[0];
    expect(actionNode.type).toBe(NodeType.Action);
    expect(actionNode.name).toBe('start');
    expect(actionNode.methods).toContainEqual({
      verb: 'post',
      operationId: undefined,
      originalPath: '/api/workflows/{workflow_id}/start',
      successStatusCode: '200',
    });
  });

  it('builds nested resource tree', () => {
    const paths: PathDefinition[] = [
      { path: '/api/projects/{projectId}/workflows', method: 'get' },
      { path: '/api/projects/{projectId}/workflows/{workflow_id}', method: 'get' },
    ];
    const tree = buildRouteTree(paths);

    expect(tree).toHaveLength(1);
    const projectsNode = tree[0];
    expect(projectsNode.name).toBe('projects');

    const projectParamNode = projectsNode.children[0];
    expect(projectParamNode.type).toBe(NodeType.Param);

    const workflowsNode = projectParamNode.children[0];
    expect(workflowsNode.type).toBe(NodeType.Collection);
    expect(workflowsNode.name).toBe('workflows');
    expect(workflowsNode.methods).toHaveLength(1);

    const workflowParamNode = workflowsNode.children[0];
    expect(workflowParamNode.type).toBe(NodeType.Param);
    expect(workflowParamNode.name).toBe('workflow_id');
  });

  it('handles multiple root collections', () => {
    const paths: PathDefinition[] = [
      { path: '/api/workspaces', method: 'get' },
      { path: '/api/projects', method: 'get' },
    ];
    const tree = buildRouteTree(paths);

    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.name)).toContain('workspaces');
    expect(tree.map((n) => n.name)).toContain('projects');
  });
});

describe('Task 1.6: Integration test with Wonder API paths', () => {
  it('builds tree from realistic Wonder API structure', () => {
    // Sample paths from actual Wonder HTTP service
    const paths: PathDefinition[] = [
      // Workspaces
      { path: '/api/workspaces', method: 'get', operationId: 'listWorkspaces' },
      { path: '/api/workspaces', method: 'post', operationId: 'createWorkspace' },
      { path: '/api/workspaces/{id}', method: 'get', operationId: 'getWorkspace' },
      { path: '/api/workspaces/{id}', method: 'delete', operationId: 'deleteWorkspace' },
      { path: '/api/workspaces/{id}', method: 'put', operationId: 'updateWorkspace' },

      // Workflows (nested under workspaces)
      { path: '/api/workflows', method: 'post', operationId: 'createWorkflow' },
      { path: '/api/workflows/{id}', method: 'get', operationId: 'getWorkflow' },
      { path: '/api/workflows/{id}', method: 'delete', operationId: 'deleteWorkflow' },
      { path: '/api/workflows/{id}/start', method: 'post', operationId: 'startWorkflow' },

      // Actions
      { path: '/api/actions', method: 'post', operationId: 'createAction' },
      { path: '/api/actions/{id}', method: 'get', operationId: 'getAction' },
      { path: '/api/actions/{id}', method: 'delete', operationId: 'deleteAction' },

      // Projects
      { path: '/api/projects', method: 'get', operationId: 'listProjects' },
      { path: '/api/projects', method: 'post', operationId: 'createProject' },
      { path: '/api/projects/{id}', method: 'get', operationId: 'getProject' },

      // Model profiles
      { path: '/api/model-profiles', method: 'get', operationId: 'listModelProfiles' },
      { path: '/api/model-profiles', method: 'post', operationId: 'createModelProfile' },
      { path: '/api/model-profiles/{id}', method: 'get', operationId: 'getModelProfile' },

      // Logs
      { path: '/api/logs', method: 'get', operationId: 'getLogs' },
    ];

    const tree = buildRouteTree(paths);

    // Verify root collections
    expect(tree).toHaveLength(6); // workspaces, workflows, actions, projects, model-profiles, logs
    const rootNames = tree.map((n) => n.name);
    expect(rootNames).toContain('workspaces');
    expect(rootNames).toContain('workflows');
    expect(rootNames).toContain('actions');
    expect(rootNames).toContain('projects');
    expect(rootNames).toContain('model-profiles');
    expect(rootNames).toContain('logs');

    // Verify workspaces structure
    const workspacesNode = tree.find((n) => n.name === 'workspaces')!;
    expect(workspacesNode.type).toBe(NodeType.Collection);
    expect(workspacesNode.methods).toHaveLength(2); // GET, POST
    expect(workspacesNode.methods).toContainEqual({
      verb: 'get',
      operationId: 'listWorkspaces',
      originalPath: '/api/workspaces',
      successStatusCode: '200',
    });
    expect(workspacesNode.methods).toContainEqual({
      verb: 'post',
      operationId: 'createWorkspace',
      originalPath: '/api/workspaces',
      successStatusCode: '200',
    });

    // Verify workspace instance methods
    expect(workspacesNode.children).toHaveLength(1);
    const workspaceIdNode = workspacesNode.children[0];
    expect(workspaceIdNode.type).toBe(NodeType.Param);
    expect(workspaceIdNode.name).toBe('id');
    expect(workspaceIdNode.methods).toHaveLength(3); // GET, DELETE, PUT

    // Verify workflows structure
    const workflowsNode = tree.find((n) => n.name === 'workflows')!;
    expect(workflowsNode.type).toBe(NodeType.Collection);
    expect(workflowsNode.methods).toContainEqual({
      verb: 'post',
      operationId: 'createWorkflow',
      originalPath: '/api/workflows',
      successStatusCode: '200',
    });

    const workflowIdNode = workflowsNode.children[0];
    expect(workflowIdNode.type).toBe(NodeType.Param);
    expect(workflowIdNode.methods).toHaveLength(2); // GET, DELETE

    // Verify workflow action (start)
    expect(workflowIdNode.children).toHaveLength(1);
    const startActionNode = workflowIdNode.children[0];
    expect(startActionNode.type).toBe(NodeType.Action);
    expect(startActionNode.name).toBe('start');
    expect(startActionNode.methods).toContainEqual({
      verb: 'post',
      operationId: 'startWorkflow',
      originalPath: '/api/workflows/{id}/start',
      successStatusCode: '200',
    });

    // Verify logs (collection only, no instances)
    const logsNode = tree.find((n) => n.name === 'logs')!;
    expect(logsNode.type).toBe(NodeType.Collection);
    expect(logsNode.methods).toContainEqual({
      verb: 'get',
      operationId: 'getLogs',
      originalPath: '/api/logs',
      successStatusCode: '200',
    });
    expect(logsNode.children).toHaveLength(0);
  });
});
