/** Type definitions for workflow definitions */

// Database entity types
export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  version: number;
  project_id: string | null;
  library_id: string | null;
  tags: string[] | null;
  input_schema: object;
  output_schema: object;
  output_mapping: object | null;
  context_schema: object | null;
  initial_node_id: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type Node = {
  id: string;
  ref: string;
  workflow_def_id: string;
  workflow_def_version: number;
  name: string;
  task_id: string | null;
  task_version: number | null;
  input_mapping: object | null;
  output_mapping: object | null;
  resource_bindings: Record<string, string> | null;
  // No branching logic - nodes only execute tasks
};

export type Transition = {
  id: string;
  ref: string | null;
  workflow_def_id: string;
  workflow_def_version: number;
  from_node_id: string;
  to_node_id: string;
  priority: number;
  condition: object | null;
  spawn_count: number | null;
  sibling_group: string | null;
  foreach: object | null;
  synchronization: object | null;
  loop_config: object | null;
};
