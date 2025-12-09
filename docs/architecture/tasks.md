### TaskDef

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;                   // ULID
  version: number;              // Incremental version
  name: string;
  description: string;

  // Ownership (exactly one)
  project_id: string | null;    // Local to project
  library_id: string | null;    // In reusable library

  tags: string[];               // Discovery/categorization

  input_schema: JSONSchema;     // Task input validation
  output_schema: JSONSchema;    // Task output validation

  retry: {
    max_attempts: number;
    backoff: "none" | "linear" | "exponential";
    initial_delay_ms: number;
    max_delay_ms: number | null;
  } | null;

  timeout_ms: number | null;    // Whole-task timeout

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)`

Linear sequence of steps executed by a single worker. Task state is in-memory only—no durable coordination.

**Constraints (platform-enforced):**

- No parallelism (steps execute sequentially)
- No sub-tasks (flat sequence only)
- No human gates (fully automated)
- Simple branching only (if/else, on_failure)

**Retry scope:** Entire task restarts from step 0 on retry. Individual step failures can abort, retry the task, or continue based on `on_failure`.

---

### Step

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;                   // ULID
  task_def_id: string;          // Composite FK
  task_def_version: number;

  ref: string;                  // Human-readable identifier (unique per task)
  ordinal: number;              // Execution order (0-indexed)

  action_id: string;            // FK → ActionDef
  action_version: number;

  input_mapping: object | null;   // Map task context → action input
  output_mapping: object | null;  // Map action output → task context

  on_failure: "abort" | "retry" | "continue";  // Default: abort

  condition: {
    if: string;                 // Expression evaluated against task context
    then: "continue" | "skip" | "succeed" | "fail";
    else: "continue" | "skip" | "succeed" | "fail";
  } | null;
}
```

**Primary Key:** `(task_def_id, task_def_version, id)`

Single action execution within a task. Steps execute in `ordinal` order.

**Task context:**

Steps read from and write to an in-memory context object:

```typescript
{
  input: { ... },       // Immutable, from Node's input_mapping
  state: { ... },       // Mutable, accumulates step outputs
  output: { ... }       // Set by final step(s), returned to Node
}
```

**Mappings:**

- `input_mapping`: Paths from task context → action input
- `output_mapping`: Paths from action output → task context

**on_failure behavior:**

| Value      | Behavior                                                     |
| ---------- | ------------------------------------------------------------ |
| `abort`    | Task fails immediately, returns error                        |
| `retry`    | Task restarts from step 0 (respects task-level retry config) |
| `continue` | Ignore failure, proceed to next step                         |

**Conditional execution:**

```typescript
condition: {
  if: "input.auto_format == true",
  then: "continue",
  else: "skip"
}
```

---

### Updated Node Schema

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  ref: string; // Human-readable identifier (unique per workflow)
  workflow_def_id: string; // Composite FK
  workflow_def_version: number;
  name: string;

  task_id: string; // FK → TaskDef
  task_version: number;

  input_mapping: object | null; // Map workflow context → task input
  output_mapping: object | null; // Map task output → workflow context
}
```

**Primary Key:** `(workflow_def_id, workflow_def_version, id)`

Nodes no longer reference ActionDef directly. Every node executes a TaskDef.

---

### Execution Flow

```
Coordinator (DO)
│
├─ Evaluates transitions, selects node
├─ Reads workflow context
├─ Applies node.input_mapping → task input
├─ Dispatches: { task_id, task_version, input }
│
▼
Worker
│
├─ Loads TaskDef + Steps (ordered by ordinal)
├─ Initializes in-memory context: { input, state: {}, output: {} }
├─ For each step:
│   ├─ Evaluate condition (skip if needed)
│   ├─ Apply step.input_mapping → action input
│   ├─ Execute action
│   ├─ Apply step.output_mapping → task context
│   └─ Handle failure (abort/retry/continue)
├─ On retry: reset context, restart from step 0
├─ On success: return context.output
│
▼
Coordinator (DO)
│
├─ Receives task result
├─ Applies node.output_mapping → workflow context
└─ Advances token, evaluates next transitions
```

---

### Summary: Updated Primitive Stack

| Primitive   | Contains           | Executes  |
| ----------- | ------------------ | --------- |
| WorkflowDef | Nodes, Transitions | —         |
| Node        | —                  | TaskDef   |
| TaskDef     | Steps              | —         |
| Step        | —                  | ActionDef |
| ActionDef   | —                  | (atomic)  |

Every execution path: WorkflowDef → Node → TaskDef → Step → ActionDef.
