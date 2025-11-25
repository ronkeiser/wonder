# Workflow Editor UX

Design notes for the Wonder visual workflow editor.

---

## Core Interaction Model

The editor is **no-code**. Users build workflows by:

1. Dragging nodes onto a canvas
2. Connecting nodes with transitions
3. Configuring nodes via side panels
4. Defining inputs/outputs at the workflow level

---

## Workflow Setup

### New Workflow Dialog

- **Name**: Text field
- **Description**: Text area
- **Owner**: Project (default) or Library

### Workflow Settings Panel

**Input Parameters** (prompted when workflow runs):

| Name         | Type   | Default | Required | Description     |
| ------------ | ------ | ------- | -------- | --------------- |
| `task`       | Text   | —       | ✓        | What to work on |
| `num_judges` | Number | 5       |          | How many judges |

Inputs available in templates as `{{input.task}}`, `{{input.num_judges}}`.

**Output Schema**: What the workflow produces when complete.

---

## Node Configuration

Clicking a node opens its **Configuration Panel**:

### Basic Settings

- **Name**: Display name for the node
- **Action Type**: Dropdown (LLM Call, HTTP Request, Human Input, etc.)

### Action Configuration

Varies by action type. For **LLM Call**:

- **Model**: Dropdown of available model profiles
- **Prompt Template**: Handlebars template with autocomplete
- **Output Schema**: Define structure of LLM response

### Parallel Execution

- **Fan Out**: "First Match" or "All"
- **Branch Count**: Static number or `{{input.num_judges}}`
- **Fan In**: "Any", "All", or "M of N"
- **Joins Node**: Dropdown (which fan-out node's branches to collect)
- **Merge Config**: Source path, target path, strategy

### Visual Indicators

- `×N` badge: Node fans out to N parallel branches
- `⊕` badge: Node is a fan-in point (waits and merges)

---

## State Schema (Hybrid Inference)

A collapsible **State Schema** panel shows the shape of `Context.state`.

### Auto-Inference

Schema is inferred automatically from graph configuration:

| Trigger                   | Inference                                   |
| ------------------------- | ------------------------------------------- |
| Merge target set          | Add/update field at target path             |
| LLM output schema defined | Track as element type for downstream merges |
| Node deleted              | Mark field as potentially orphaned          |

**Example:**

```
User configures "Collect Ideas" node:
  merge.target = "state.ideas"
  merge.strategy = "append"

Upstream "Generate Ideas" output schema:
  { title: string, explanation: string }

→ System infers:
  context_schema.ideas = array<{ title: string, explanation: string }>
```

### Schema Panel Display

```
State Schema (auto-inferred)
─────────────────────────────
ideas        Idea[]       ← from "Collect Ideas" merge
votes        Vote[]       ← from "Collect Votes" merge
winner       Idea         ← from "Tally Winner" output

Types
─────
Idea   { title: string, explanation: string }
Vote   { judge_id: string, choice: number, rationale: string }
```

Each field shows:

- **Name and type**
- **Source**: Which node/merge defined it
- **Lock icon**: Click to prevent auto-updates
- **Edit icon**: Manual override

### User Overrides

Users can:

- **Edit type**: Fix incorrect inference
- **Lock field**: Prevent future inference from changing it
- **Add field**: Define fields before any node uses them
- **Delete field**: Remove orphaned fields (with warning if referenced)

### Validation

- Merge targets validated against schema
- Type mismatches highlighted in real-time
- Warnings for orphaned schema fields
- Autocomplete in templates uses schema

---

## Prompt Template Editor

For LLM Call nodes, the prompt template editor supports:

### Handlebars Syntax

```handlebars
You are evaluating ideas for:
{{input.task}}

{{#each state.ideas}}
  {{@index}}.
  {{this.title}}:
  {{this.explanation}}
{{/each}}

Vote for the best idea.
```

### Autocomplete

Typing `{{` triggers autocomplete with available paths:

- `input.*` — workflow inputs
- `state.*` — current state (from schema)
- `_branch.*` — branch context (when in fan-out)
- `artifacts.*` — artifact references

### Output Schema Definition

| Field       | Type   | Description            |
| ----------- | ------ | ---------------------- |
| `choice`    | Number | Index of chosen idea   |
| `rationale` | Text   | Explanation for choice |

This schema:

- Enables structured output from LLM
- Flows to downstream merge configurations
- Validates against downstream expectations

---

## Transitions

Connections between nodes are **transitions**.

### Basic Configuration

- **From Node**: Source (set by dragging)
- **To Node**: Target (set by dragging)
- **Priority**: Order of evaluation (lower = first)

### Conditions

**Structured** (no-code):

- Field comparisons: `state.score > 0.8`
- Existence checks: `state.winner exists`
- Set membership: `state.status in ["approved", "merged"]`
- Boolean combinators: AND, OR

**Expression** (advanced):

- Raw expression: `state.votes.filter(v => v.choice === 0).length > 2`
- Must declare reads: `["state.votes"]`

### Special: Foreach

Spawn a token for each item in a collection:

- **Collection**: `state.items`
- **Item Variable**: `item`

Each spawned token has `_branch.item` available.

---

## Composition: Sub-Workflows

Nodes can call other workflows via `workflow_call` action.

### Configuration

- **Workflow**: Dropdown of available workflows (project + library)
- **Version**: "Latest" or pinned version number
- **Input Mapping**: Map current context to sub-workflow inputs
- **Output Mapping**: Map sub-workflow outputs back to state

### Visual Indicator

Sub-workflow nodes show a "nested" icon. Click to "drill in" and see the sub-workflow graph (read-only unless it's a local workflow).

---

## Observability During Runs

### Live Tree View

```
▼ Review Open PRs (running)
  ├─ ✓ Fetch PRs (completed)
  ├─ ▼ Review PRs (3/10 completed)
  │   ├─ ✓ PR #1 (approved)
  │   ├─ ✓ PR #2 (changes requested)
  │   ├─ ▼ PR #3 (running)
  │   │   ├─ ✓ Analyze Scope
  │   │   ├─ ▼ Review Commits (2/5)
  │   │   │   ├─ ✓ Commit abc123
  │   │   │   ├─ ● Commit def456 (running)
  │   │   │   └─ ○ Commit ghi789 (pending)
  │   │   └─ ○ Consensus (pending)
  │   └─ ○ PR #4 (pending)
  └─ ○ Generate Summary (pending)
```

### Node Inspector

Click any node in a running/completed workflow to see:

- **Input**: What data it received
- **Output**: What it produced
- **Timing**: Start, end, duration
- **Errors**: If failed, error details

### Metrics Bar

- Tokens active: 47
- LLM calls: 234 / ~500 est.
- Spend: $12.34
- ETA: ~8 min

---

## Error Handling in UI

### Infrastructure Errors (Invisible)

Retries happen automatically per `ActionDef.execution.retry_policy`. User only sees final success or failure.

### Business Logic Errors (Workflow-Level)

When a node fails permanently:

- Node highlighted red in tree view
- Error details in inspector
- Transitions can route to error-handling nodes

### Stuck Workflows

Human input nodes waiting too long:

- Visual indicator: "Waiting for input (2 days)"
- Timeout warnings
- Manual intervention options: skip, cancel, reassign

---

## Implementation Notes

### Technology Choice: Svelte Flow

**Recommendation:** Use `@xyflow/svelte` (Svelte Flow) for the graph canvas.

**Why:**

- Native Svelte (not a React wrapper)
- Purpose-built for node-based editors
- Handles directed graphs, custom nodes/edges, zoom/pan, selection
- React Flow is battle-tested; Svelte port is maturing well
- Extensible—custom node components can contain complex UIs

**What Svelte Flow handles:**

- Node placement and connection
- Custom node appearance (badges, icons, action-specific styling)
- Custom edge appearance (condition labels, foreach indicators)
- Selection events → trigger side panel updates
- Minimap, controls, background grid

**What lives outside Svelte Flow (standard Svelte components):**

- Side panels (node config, state schema, prompt editor)
- Node palette (drag source)
- Structured condition builder
- Run tree view (hierarchical, not graph-based)

### Component Architecture

```
WorkflowEditor
├── LeftSidebar
│   ├── NodePalette (drag to add nodes)
│   └── StateSchemaPanel (auto-inferred, editable)
├── Canvas (Svelte Flow)
│   ├── Custom node types per action (LLMCallNode, HumanInputNode, etc.)
│   └── Custom edge type for transitions (condition labels)
└── RightSidebar
    └── ConfigPanel (contextual: node | edge | workflow settings)
```

### Custom Node Design

Each action type gets a node component. Common structure:

- Header: icon + label
- Badges: `×N` for fan-out, `⊕` for fan-in
- Preview slot: action-specific summary (model name, gate indicator, etc.)
- Handles: top (target) and bottom (source)

Sub-workflow nodes include a "drill in" button to navigate to the nested graph.

### Custom Edge Design

Transition edges show:

- Condition expression (abbreviated) as a label on the edge
- `∀` symbol for foreach transitions
- Priority number if multiple edges from same source

### Prompt Editor

For LLM Call nodes, use **CodeMirror 6** or **Monaco** with:

- Handlebars syntax highlighting
- Autocomplete for `{{input.*}}`, `{{state.*}}`, `{{_branch.*}}`
- Schema-aware: autocomplete paths come from inferred state schema

### Run Visualization

The live tree view is a **separate component** (not graph-based):

- Recursive Svelte component for hierarchical display
- Status icons: ✓ completed, ● running, ○ pending, ✗ failed, ⏸ waiting
- Progress indicators for fan-out nodes (3/10 completed)
- Click to inspect node input/output in side panel

### State Schema Inference

Schema inference runs reactively as the graph changes:

1. Walk graph to find all merge configurations
2. Trace upstream to find source node output schemas
3. Combine to infer `context.state` shape
4. Surface orphaned fields when nodes are deleted
5. Allow user locks/overrides that persist through inference updates
