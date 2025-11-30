import type { CreateWorkflowDefRequest, WorkflowDef } from '../types/workflow-defs';

export class WorkflowDefsResource {
  constructor(private baseUrl: string) {}

  async create(
    request: CreateWorkflowDefRequest,
  ): Promise<{ workflow_def_id: string; workflow_def: WorkflowDef }> {
    const response = await fetch(`${this.baseUrl}/api/workflow-defs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create workflow def: ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { workflow_def_id: string; workflow_def: WorkflowDef };
  }

  async get(workflowDefId: string, version?: number): Promise<{ workflow_def: WorkflowDef }> {
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

  async listByOwner(owner: string): Promise<{ workflow_defs: WorkflowDef[] }> {
    const response = await fetch(`${this.baseUrl}/api/workflow-defs/owner/${owner}`);

    if (!response.ok) {
      throw new Error(`Failed to list workflow defs: ${response.statusText}`);
    }

    return (await response.json()) as { workflow_defs: WorkflowDef[] };
  }
}
