/** Transform helpers for graph domain discriminated unions */

export type WorkflowDefOwner =
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string };

export type FanIn = 'any' | 'all' | { m_of_n: number };

export function toWorkflowDefOwner(owner_type: string, owner_id: string): WorkflowDefOwner {
  return owner_type === 'project'
    ? { type: 'project', project_id: owner_id }
    : { type: 'library', library_id: owner_id };
}

export function fromWorkflowDefOwner(owner: WorkflowDefOwner): {
  owner_type: string;
  owner_id: string;
} {
  return {
    owner_type: owner.type,
    owner_id: owner.type === 'project' ? owner.project_id : owner.library_id,
  };
}

export function toFanIn(fan_in_json: string): FanIn {
  if (fan_in_json === 'any' || fan_in_json === 'all') {
    return fan_in_json;
  }
  return JSON.parse(fan_in_json);
}

export function fromFanIn(fan_in: FanIn): string {
  if (fan_in === 'any' || fan_in === 'all') {
    return fan_in;
  }
  return JSON.stringify(fan_in);
}
