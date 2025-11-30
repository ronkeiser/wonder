/**
 * Minimal SDK for Wonderful Workflow API
 *
 * Note on WebSocket lifecycle:
 * WebSockets keep the Node.js event loop alive even after close() is called.
 * In CLI scripts, explicitly call process.exit() after consuming all events.
 * This is expected behavior - WebSockets maintain connections for bidirectional
 * communication and don't auto-terminate.
 */

// Project types
export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  settings: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  workspace_id: string;
  name: string;
  description?: string;
  settings?: unknown;
}

// Action types
export interface Action {
  id: string;
  name: string;
  action_kind: 'llm_call' | 'mcp_tool' | 'http_request' | 'js_function' | 'subworkflow';
  config: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateActionRequest {
  name: string;
  action_kind: 'llm_call' | 'mcp_tool' | 'http_request' | 'js_function' | 'subworkflow';
  config: unknown;
}

// PromptSpec types
export interface PromptSpec {
  id: string;
  name: string;
  template_language: 'handlebars' | 'jinja2';
  system_template: string | null;
  user_template: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptSpecRequest {
  name: string;
  template_language: 'handlebars' | 'jinja2';
  system_template?: string;
  user_template: string;
}

// ModelProfile types
export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  parameters: unknown;
  execution_config: unknown | null;
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
}

export interface CreateModelProfileRequest {
  name: string;
  provider: string;
  model_id: string;
  parameters?: unknown;
  execution_config?: unknown;
  cost_per_1k_input_tokens?: number;
  cost_per_1k_output_tokens?: number;
}

// WorkflowDef types
export interface WorkflowDef {
  id: string;
  owner: string;
  name: string;
  description: string;
  version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowDefRequest {
  owner: string;
  name: string;
  description?: string;
  nodes: Array<{
    local_id: string;
    action_id: string;
    produces: unknown;
    on_early_complete?: 'cancel' | 'continue';
  }>;
  transitions: Array<{
    from_node: string;
    to_node: string;
    condition?: unknown;
  }>;
}

// Workflow types
export interface Workflow {
  id: string;
  project_id: string;
  workflow_def_id: string;
  workflow_def_version: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowRequest {
  project_id: string;
  workflow_def_id: string;
  workflow_def_version?: number;
  name: string;
  description?: string;
}

export interface WorkflowInput {
  workflow_id: string;
  input: Record<string, unknown>;
}

export interface WorkflowEvent {
  kind:
    | 'workflow_started'
    | 'workflow_completed'
    | 'workflow_failed'
    | 'node_started'
    | 'node_completed'
    | 'node_failed'
    | 'token_spawned'
    | 'token_merged'
    | 'token_cancelled'
    | 'subworkflow_started'
    | 'subworkflow_completed'
    | 'artifact_created'
    | 'context_updated';
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowStartResponse {
  workflow_run_id: string;
  durable_object_id: string;
}

export class WonderfulClient {
  constructor(private baseUrl: string) {}

  // Projects

  async createProject(
    request: CreateProjectRequest,
  ): Promise<{ project_id: string; project: Project }> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    return (await response.json()) as { project_id: string; project: Project };
  }

  async getProject(projectId: string): Promise<{ project: Project }> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`);

    if (!response.ok) {
      throw new Error(`Failed to get project: ${response.statusText}`);
    }

    return (await response.json()) as { project: Project };
  }

  async deleteProject(projectId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.statusText}`);
    }

    return (await response.json()) as { success: boolean };
  }

  // Actions

  async createAction(request: CreateActionRequest): Promise<{ action_id: string; action: Action }> {
    const response = await fetch(`${this.baseUrl}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create action: ${response.statusText}`);
    }

    return (await response.json()) as { action_id: string; action: Action };
  }

  async getAction(actionId: string): Promise<{ action: Action }> {
    const response = await fetch(`${this.baseUrl}/api/actions/${actionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get action: ${response.statusText}`);
    }

    return (await response.json()) as { action: Action };
  }

  // Prompt Specs

  async createPromptSpec(
    request: CreatePromptSpecRequest,
  ): Promise<{ prompt_spec_id: string; prompt_spec: PromptSpec }> {
    const response = await fetch(`${this.baseUrl}/api/prompt-specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create prompt spec: ${response.statusText}`);
    }

    return (await response.json()) as { prompt_spec_id: string; prompt_spec: PromptSpec };
  }

  async getPromptSpec(promptSpecId: string): Promise<{ prompt_spec: PromptSpec }> {
    const response = await fetch(`${this.baseUrl}/api/prompt-specs/${promptSpecId}`);

    if (!response.ok) {
      throw new Error(`Failed to get prompt spec: ${response.statusText}`);
    }

    return (await response.json()) as { prompt_spec: PromptSpec };
  }

  // Model Profiles

  async listModelProfiles(filters?: { provider?: string }): Promise<{ profiles: ModelProfile[] }> {
    const url = new URL(`${this.baseUrl}/api/model-profiles`);
    if (filters?.provider) {
      url.searchParams.set('provider', filters.provider);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to list model profiles: ${response.statusText}`);
    }

    return (await response.json()) as { profiles: ModelProfile[] };
  }

  async getModelProfile(modelProfileId: string): Promise<{ profile: ModelProfile }> {
    const response = await fetch(`${this.baseUrl}/api/model-profiles/${modelProfileId}`);

    if (!response.ok) {
      throw new Error(`Failed to get model profile: ${response.statusText}`);
    }

    return (await response.json()) as { profile: ModelProfile };
  }

  async createModelProfile(
    request: CreateModelProfileRequest,
  ): Promise<{ model_profile_id: string; model_profile: ModelProfile }> {
    const response = await fetch(`${this.baseUrl}/api/model-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create model profile: ${response.statusText}`);
    }

    return (await response.json()) as { model_profile_id: string; model_profile: ModelProfile };
  }

  // Workflow Definitions

  async createWorkflowDef(
    request: CreateWorkflowDefRequest,
  ): Promise<{ workflow_def_id: string; workflow_def: WorkflowDef }> {
    const response = await fetch(`${this.baseUrl}/api/workflow-defs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create workflow def: ${response.statusText}`);
    }

    return (await response.json()) as { workflow_def_id: string; workflow_def: WorkflowDef };
  }

  async getWorkflowDef(
    workflowDefId: string,
    version?: number,
  ): Promise<{ workflow_def: WorkflowDef }> {
    const url = new URL(`${this.baseUrl}/api/workflow-defs/${workflowDefId}`);
    if (version !== undefined) {
      url.searchParams.set('version', version.toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to get workflow def: ${response.statusText}`);
    }

    return (await response.json()) as { workflow_def: WorkflowDef };
  }

  async listWorkflowDefsByOwner(owner: string): Promise<{ workflow_defs: WorkflowDef[] }> {
    const response = await fetch(`${this.baseUrl}/api/workflow-defs/owner/${owner}`);

    if (!response.ok) {
      throw new Error(`Failed to list workflow defs: ${response.statusText}`);
    }

    return (await response.json()) as { workflow_defs: WorkflowDef[] };
  }

  // Workflows

  async createWorkflow(
    request: CreateWorkflowRequest,
  ): Promise<{ workflow_id: string; workflow: Workflow }> {
    const response = await fetch(`${this.baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create workflow: ${response.statusText}`);
    }

    return (await response.json()) as { workflow_id: string; workflow: Workflow };
  }

  async getWorkflow(workflowId: string): Promise<{ workflow: Workflow }> {
    const response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}`);

    if (!response.ok) {
      throw new Error(`Failed to get workflow: ${response.statusText}`);
    }

    return (await response.json()) as { workflow: Workflow };
  }

  // Workflow Execution

  /**
   * Start a workflow and return the run ID and DO ID
   */
  async startWorkflow(input: WorkflowInput): Promise<WorkflowStartResponse> {
    const response = await fetch(`${this.baseUrl}/api/workflows/${input.workflow_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.input),
    });

    if (!response.ok) {
      throw new Error(`Failed to start workflow: ${response.statusText}`);
    }

    return (await response.json()) as WorkflowStartResponse;
  }

  /**
   * Stream workflow events via WebSocket
   * Returns an async iterator of events
   */
  async *streamEvents(durableObjectId: string): AsyncGenerator<WorkflowEvent> {
    const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/api/coordinator/${durableObjectId}/stream`);

    const messageQueue: WorkflowEvent[] = [];
    const resolvers: Array<(value: IteratorResult<WorkflowEvent>) => void> = [];
    let closed = false;
    let error: Error | null = null;

    ws.addEventListener('message', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as WorkflowEvent;

      // Check if workflow is complete
      const isComplete = data.kind === 'workflow_completed';

      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: data, done: false });
      } else {
        messageQueue.push(data);
      }

      // Mark as closed after workflow completes
      // The generator will exit after yielding this final event
      if (isComplete) {
        closed = true;
      }
    });

    ws.addEventListener('error', () => {
      error = new Error('WebSocket error');
      closed = true;
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined as any, done: true });
      }
    });

    ws.addEventListener('close', () => {
      closed = true;
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined as any, done: true });
      }
    });

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('Failed to connect')));
    });

    try {
      while (!closed) {
        if (error) throw error;

        if (messageQueue.length > 0) {
          const event = messageQueue.shift()!;
          yield event;
          if (closed) break;
        } else {
          // Wait for next message
          const result = await new Promise<IteratorResult<WorkflowEvent>>((resolve) => {
            resolvers.push(resolve);
          });

          if (result.done) break;

          yield result.value;
          if (closed) break;
        }
      }
    } finally {
      // Close WebSocket if still open
      // Note: WebSocket keeps Node.js event loop alive even after close() is called
      // In CLI scripts, use process.exit() after the async generator completes
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  /**
   * Start a workflow and stream all events
   * Convenience method that combines startWorkflow and streamEvents
   */
  async *executeWorkflow(input: WorkflowInput): AsyncGenerator<WorkflowEvent> {
    const { durable_object_id } = await this.startWorkflow(input);
    yield* this.streamEvents(durable_object_id);
  }
}
