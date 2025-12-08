/**
 * Tests for generate-client.ts
 */

import { describe, expect, it } from 'vitest';
import {
  buildPathTemplate,
  generateCollectionObject,
  generateMethodSignature,
  generateRootClient,
  getMethodName,
} from '../scripts/generate-client';
import {
  buildRouteTree,
  NodeType,
  type PathDefinition,
  type RouteNode,
} from '../scripts/parse-paths';

describe('Task 2.1: getMethodName', () => {
  it('maps GET on collection to list', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'get')).toBe('list');
  });

  it('maps GET on parameter to get', () => {
    const node: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'get')).toBe('get');
  });

  it('maps POST on collection to create', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'post')).toBe('create');
  });

  it('maps POST on action to action name', () => {
    const node: RouteNode = {
      type: NodeType.Action,
      name: 'start',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'post')).toBe('start');
  });

  it('maps PUT to update', () => {
    const node: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'put')).toBe('update');
  });

  it('maps DELETE to delete', () => {
    const node: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'delete')).toBe('delete');
  });

  it('maps PATCH to patch', () => {
    const node: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: null,
    };
    expect(getMethodName(node, 'patch')).toBe('patch');
  });
});

describe('Task 2.2: buildPathTemplate', () => {
  it('builds simple collection path', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    expect(buildPathTemplate(node)).toBe('/api/workspaces');
  });

  it('builds path with parameter', () => {
    const parentNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: parentNode,
    };
    expect(buildPathTemplate(paramNode)).toBe('/api/workspaces/${id}');
  });

  it('builds path with action after parameter', () => {
    const collectionNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workflows',
      methods: [],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: collectionNode,
    };
    const actionNode: RouteNode = {
      type: NodeType.Action,
      name: 'start',
      methods: [],
      children: [],
      parent: paramNode,
    };
    expect(buildPathTemplate(actionNode)).toBe('/api/workflows/${id}/start');
  });

  it('builds nested resource path with multiple parameters', () => {
    const projectsNode: RouteNode = {
      type: NodeType.Collection,
      name: 'projects',
      methods: [],
      children: [],
      parent: null,
    };
    const projectIdNode: RouteNode = {
      type: NodeType.Param,
      name: 'project_id',
      methods: [],
      children: [],
      parent: projectsNode,
    };
    const workflowsNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workflows',
      methods: [],
      children: [],
      parent: projectIdNode,
    };
    const workflowIdNode: RouteNode = {
      type: NodeType.Param,
      name: 'workflow_id',
      methods: [],
      children: [],
      parent: workflowsNode,
    };
    expect(buildPathTemplate(workflowIdNode)).toBe(
      '/api/projects/${project_id}/workflows/${workflow_id}',
    );
  });

  it('uses correct parameter names in template', () => {
    const parentNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'workspace_id',
      methods: [],
      children: [],
      parent: parentNode,
    };
    expect(buildPathTemplate(paramNode)).toBe('/api/workspaces/${workspace_id}');
  });
});

describe('Task 2.3: generateMethodSignature', () => {
  it('collection method has no path params', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    const sig = generateMethodSignature(node, 'get');

    expect(sig.name).toBe('list');
    expect(sig.parameters).toHaveLength(1);
    expect(sig.parameters[0]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });
  });

  it('instance method has id parameter', () => {
    const collectionNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: collectionNode,
    };
    const sig = generateMethodSignature(paramNode, 'get');

    expect(sig.name).toBe('get');
    expect(sig.parameters).toHaveLength(2);
    expect(sig.parameters[0]).toEqual({
      name: 'id',
      type: 'string',
      optional: false,
    });
    expect(sig.parameters[1]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });
  });

  it('POST methods have body parameter', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    const sig = generateMethodSignature(node, 'post');

    expect(sig.name).toBe('create');
    expect(sig.parameters).toHaveLength(2);
    expect(sig.parameters[0]).toEqual({
      name: 'body',
      type: 'body',
      optional: false,
    });
    expect(sig.parameters[1]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });
  });

  it('PUT methods have body parameter', () => {
    const collectionNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [],
      children: [],
      parent: collectionNode,
    };
    const sig = generateMethodSignature(paramNode, 'put');

    expect(sig.name).toBe('update');
    expect(sig.parameters).toHaveLength(3);
    expect(sig.parameters[0]).toEqual({
      name: 'id',
      type: 'string',
      optional: false,
    });
    expect(sig.parameters[1]).toEqual({
      name: 'body',
      type: 'body',
      optional: false,
    });
    expect(sig.parameters[2]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });
  });

  it('all methods have optional options parameter', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [],
      children: [],
      parent: null,
    };

    const getSig = generateMethodSignature(node, 'get');
    expect(getSig.parameters[getSig.parameters.length - 1]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });

    const postSig = generateMethodSignature(node, 'post');
    expect(postSig.parameters[postSig.parameters.length - 1]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });
  });

  it('nested resources have multiple path params in correct order', () => {
    const projectsNode: RouteNode = {
      type: NodeType.Collection,
      name: 'projects',
      methods: [],
      children: [],
      parent: null,
    };
    const projectIdNode: RouteNode = {
      type: NodeType.Param,
      name: 'project_id',
      methods: [],
      children: [],
      parent: projectsNode,
    };
    const workflowsNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workflows',
      methods: [],
      children: [],
      parent: projectIdNode,
    };
    const workflowIdNode: RouteNode = {
      type: NodeType.Param,
      name: 'workflow_id',
      methods: [],
      children: [],
      parent: workflowsNode,
    };

    const sig = generateMethodSignature(workflowIdNode, 'get');

    expect(sig.parameters).toHaveLength(3);
    expect(sig.parameters[0]).toEqual({
      name: 'project_id',
      type: 'string',
      optional: false,
    });
    expect(sig.parameters[1]).toEqual({
      name: 'workflow_id',
      type: 'string',
      optional: false,
    });
    expect(sig.parameters[2]).toEqual({
      name: 'options',
      type: 'options',
      optional: true,
    });
  });
});

describe('Task 2.4: generateCollectionObject', () => {
  it('single method collection generates one method', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    };

    const obj = generateCollectionObject(node);

    expect(obj.name).toBe('workspaces');
    expect(obj.type).toBe('collection');
    expect(obj.methods).toHaveLength(1);
    expect(obj.methods![0].name).toBe('list');
    expect(obj.methods![0].verb).toBe('get');
    expect(obj.methods![0].path).toBe('/api/workspaces');
  });

  it('multiple methods generate multiple method properties', () => {
    const node: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }, { verb: 'post' }],
      children: [],
      parent: null,
    };

    const obj = generateCollectionObject(node);

    expect(obj.methods).toHaveLength(2);
    expect(obj.methods!.map((m) => m.name)).toContain('list');
    expect(obj.methods!.map((m) => m.name)).toContain('create');
  });

  it('child collections added as nested properties', () => {
    const childNode: RouteNode = {
      type: NodeType.Collection,
      name: 'projects',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    };
    const parentNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }],
      children: [childNode],
      parent: null,
    };
    childNode.parent = parentNode;

    const obj = generateCollectionObject(parentNode);

    expect(obj.children).toHaveLength(1);
    expect(obj.children![0].name).toBe('projects');
    expect(obj.children![0].type).toBe('collection');
  });

  it('parameter nodes generate parameter properties', () => {
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    };
    const collectionNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }],
      children: [paramNode],
      parent: null,
    };
    paramNode.parent = collectionNode;

    const obj = generateCollectionObject(collectionNode);

    expect(obj.children).toHaveLength(1);
    expect(obj.children![0].name).toBe('id');
    expect(obj.children![0].type).toBe('parameter');
  });

  it('verifies complete object structure', () => {
    const actionNode: RouteNode = {
      type: NodeType.Action,
      name: 'start',
      methods: [{ verb: 'post', operationId: 'startWorkflow' }],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [{ verb: 'get' }, { verb: 'delete' }],
      children: [actionNode],
      parent: null,
    };
    const collectionNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workflows',
      methods: [{ verb: 'post' }],
      children: [paramNode],
      parent: null,
    };

    paramNode.parent = collectionNode;
    actionNode.parent = paramNode;

    const obj = generateCollectionObject(collectionNode);

    // Collection level
    expect(obj.name).toBe('workflows');
    expect(obj.type).toBe('collection');
    expect(obj.methods).toHaveLength(1);
    expect(obj.methods![0].name).toBe('create');

    // Parameter level
    expect(obj.children).toHaveLength(1);
    const paramProp = obj.children![0];
    expect(paramProp.name).toBe('id');
    expect(paramProp.type).toBe('parameter');
    expect(paramProp.children).toHaveLength(1);

    // Instance methods
    const instanceObj = paramProp.children![0];
    expect(instanceObj.methods).toHaveLength(2);
    expect(instanceObj.methods!.map((m) => m.name)).toContain('get');
    expect(instanceObj.methods!.map((m) => m.name)).toContain('delete');

    // Action level
    expect(instanceObj.children).toHaveLength(1);
    const actionObj = instanceObj.children![0];
    expect(actionObj.name).toBe('start');
    expect(actionObj.methods![0].name).toBe('start');
  });
});

describe('Task 2.6: generateRootClient', () => {
  it('generates client with multiple root collections', () => {
    const workspacesNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }, { verb: 'post' }],
      children: [],
      parent: null,
    };
    const projectsNode: RouteNode = {
      type: NodeType.Collection,
      name: 'projects',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    };

    const client = generateRootClient([workspacesNode, projectsNode]);

    expect(client.collections).toHaveLength(2);
    expect(client.collections.map((c) => c.name)).toContain('workspaces');
    expect(client.collections.map((c) => c.name)).toContain('projects');
  });

  it('each collection has proper structure', () => {
    const workspacesNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    };

    const client = generateRootClient([workspacesNode]);

    expect(client.collections).toHaveLength(1);
    const workspace = client.collections[0];
    expect(workspace.name).toBe('workspaces');
    expect(workspace.type).toBe('collection');
    expect(workspace.methods).toHaveLength(1);
    expect(workspace.methods![0].name).toBe('list');
  });

  it('handles nested resources in root client', () => {
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [{ verb: 'get' }],
      children: [],
      parent: null,
    };
    const workspacesNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workspaces',
      methods: [{ verb: 'get' }],
      children: [paramNode],
      parent: null,
    };
    paramNode.parent = workspacesNode;

    const client = generateRootClient([workspacesNode]);

    const workspace = client.collections[0];
    expect(workspace.children).toHaveLength(1);
    expect(workspace.children![0].name).toBe('id');
    expect(workspace.children![0].type).toBe('parameter');
  });

  it('preserves all collection data through root client generation', () => {
    const actionNode: RouteNode = {
      type: NodeType.Action,
      name: 'start',
      methods: [{ verb: 'post' }],
      children: [],
      parent: null,
    };
    const paramNode: RouteNode = {
      type: NodeType.Param,
      name: 'id',
      methods: [{ verb: 'get' }],
      children: [actionNode],
      parent: null,
    };
    const workflowsNode: RouteNode = {
      type: NodeType.Collection,
      name: 'workflows',
      methods: [{ verb: 'post' }],
      children: [paramNode],
      parent: null,
    };
    paramNode.parent = workflowsNode;
    actionNode.parent = paramNode;

    const client = generateRootClient([workflowsNode]);

    const workflow = client.collections[0];
    expect(workflow.name).toBe('workflows');
    expect(workflow.methods![0].name).toBe('create');

    const param = workflow.children![0];
    expect(param.type).toBe('parameter');

    const instance = param.children![0];
    expect(instance.methods![0].name).toBe('get');

    const action = instance.children![0];
    expect(action.name).toBe('start');
    expect(action.methods![0].name).toBe('start');
  });
});

describe('Task 2.7: Integration test - Complete Wonder API generation', () => {
  it('generates complete client from Wonder API paths', () => {
    // Use paths from Task 1.6 integration test
    const paths: PathDefinition[] = [
      // Workspaces
      { path: '/api/workspaces', method: 'get', operationId: 'listWorkspaces' },
      { path: '/api/workspaces', method: 'post', operationId: 'createWorkspace' },
      { path: '/api/workspaces/{id}', method: 'get', operationId: 'getWorkspace' },
      { path: '/api/workspaces/{id}', method: 'delete', operationId: 'deleteWorkspace' },
      { path: '/api/workspaces/{id}', method: 'put', operationId: 'updateWorkspace' },

      // Workflows
      { path: '/api/workflows', method: 'post', operationId: 'createWorkflow' },
      { path: '/api/workflows/{id}', method: 'get', operationId: 'getWorkflow' },
      { path: '/api/workflows/{id}', method: 'delete', operationId: 'deleteWorkflow' },
      { path: '/api/workflows/{id}/start', method: 'post', operationId: 'startWorkflow' },

      // Actions
      { path: '/api/actions', method: 'post', operationId: 'createAction' },
      { path: '/api/actions/{id}', method: 'get', operationId: 'getAction' },
      { path: '/api/actions/{id}', method: 'delete', operationId: 'deleteAction' },
    ];

    // Parse paths into tree
    const tree = buildRouteTree(paths);

    // Generate client structure
    const client = generateRootClient(tree);

    // Verify all root resources present
    expect(client.collections).toHaveLength(3);
    const resourceNames = client.collections.map((c) => c.name);
    expect(resourceNames).toContain('workspaces');
    expect(resourceNames).toContain('workflows');
    expect(resourceNames).toContain('actions');

    // Verify workspaces structure
    const workspaces = client.collections.find((c) => c.name === 'workspaces')!;
    expect(workspaces.methods).toHaveLength(2);
    expect(workspaces.methods!.map((m) => m.name)).toContain('list');
    expect(workspaces.methods!.map((m) => m.name)).toContain('create');

    // Verify workspace instance methods
    expect(workspaces.children).toHaveLength(1);
    const workspaceParam = workspaces.children![0];
    expect(workspaceParam.type).toBe('parameter');
    const workspaceInstance = workspaceParam.children![0];
    expect(workspaceInstance.methods).toHaveLength(3);
    expect(workspaceInstance.methods!.map((m) => m.name)).toContain('get');
    expect(workspaceInstance.methods!.map((m) => m.name)).toContain('delete');
    expect(workspaceInstance.methods!.map((m) => m.name)).toContain('update');

    // Verify workflows with start action
    const workflows = client.collections.find((c) => c.name === 'workflows')!;
    expect(workflows.methods).toHaveLength(1);
    expect(workflows.methods![0].name).toBe('create');

    const workflowParam = workflows.children![0];
    const workflowInstance = workflowParam.children![0];
    expect(workflowInstance.methods).toHaveLength(2);
    expect(workflowInstance.methods!.map((m) => m.name)).toContain('get');
    expect(workflowInstance.methods!.map((m) => m.name)).toContain('delete');

    // Verify start action
    expect(workflowInstance.children).toHaveLength(1);
    const startAction = workflowInstance.children![0];
    expect(startAction.name).toBe('start');
    expect(startAction.methods![0].name).toBe('start');
    expect(startAction.methods![0].path).toBe('/api/workflows/${id}/start');

    // Verify path templates are correct
    expect(workspaces.methods![0].path).toBe('/api/workspaces');
    expect(workspaceInstance.methods![0].path).toBe('/api/workspaces/${id}');
    expect(workflows.methods![0].path).toBe('/api/workflows');
    expect(workflowInstance.methods![0].path).toBe('/api/workflows/${id}');

    // Verify method signatures
    const workspaceListSig = workspaces.methods![0].signature;
    expect(workspaceListSig.parameters).toHaveLength(1);
    expect(workspaceListSig.parameters[0].name).toBe('options');

    const workspaceCreateSig = workspaces.methods![1].signature;
    expect(workspaceCreateSig.parameters).toHaveLength(2);
    expect(workspaceCreateSig.parameters[0].name).toBe('body');
    expect(workspaceCreateSig.parameters[1].name).toBe('options');

    const workspaceGetSig = workspaceInstance.methods![0].signature;
    expect(workspaceGetSig.parameters).toHaveLength(2);
    expect(workspaceGetSig.parameters[0].name).toBe('id');
    expect(workspaceGetSig.parameters[1].name).toBe('options');

    const startActionSig = startAction.methods![0].signature;
    expect(startActionSig.parameters).toHaveLength(3);
    expect(startActionSig.parameters[0].name).toBe('id');
    expect(startActionSig.parameters[1].name).toBe('body');
    expect(startActionSig.parameters[2].name).toBe('options');
  });
});
