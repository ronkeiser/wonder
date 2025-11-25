# Formal Decision Records

A system for encoding architectural decisions as verifiable logical claims.

---

## The Problem

Agents drift. They forget constraints. They contradict earlier decisions. "Just read the docs" doesn't scale—it's fuzzy, context-dependent, and agents can rationalize around it.

We need something closer to a **type system for decisions**—where violations are caught mechanically, not by "reading carefully."

---

## The Insight

Lean succeeds because it gives mathematicians a language that:

1. **Forces precision** — can't be vague
2. **Is mechanically checkable** — no hand-waving
3. **Composes** — small proofs build into large ones
4. **Has a kernel of trust** — tiny verified core

Many architectural decisions are actually **logical claims** that could be formalized:

```
"Retry config lives on ActionDef, not NodeDef"
```

Is really:

```
∀ node ∈ NodeDef: ¬∃ field "retry_policy" ∈ node
∧ ∃ field "retry_policy" ∈ ActionDef.execution
```

That's checkable against a TypeScript AST.

---

## Decision Structure

Each decision has:

- **Human description** — for understanding
- **Formal claims** — for checking

```typescript
type Decision = {
  id: string;
  title: string;
  description: string; // human-readable explanation

  // Formal constraints that can be checked
  claims: Claim[];

  // Provenance
  decided_at: string;
  decided_by: string; // human or "consensus_workflow_run_123"

  // Governance
  supersede_policy?: {
    requires_consensus: boolean;
    min_agents?: number;
    requires_human_approval?: boolean;
  };

  // Relationships
  depends_on?: string[]; // must be consistent with these
  supersedes?: string[]; // replaces these older decisions
};
```

---

## Claim Language

### Domain

Claims are about:

- **Type definitions** — what fields exist, their types
- **Instance constraints** — valid workflow graphs
- **Behavioral rules** — how things interact at runtime

### Primitives

```
// Types and fields
has_field(Type, field_name, field_type)
no_field(Type, field_name)
field_type(Type, field_name, expected_type)

// Relationships
references(TypeA.field, TypeB)
subset_of(SchemaA, SchemaB)
implements(TypeA, InterfaceB)

// Graph properties
reachable(node_a, node_b, via: transitions)
all_paths_through(workflow, node_set)
acyclic(workflow.transitions)

// Quantifiers
forall(x in Collection, predicate(x))
exists(x in Collection, predicate(x))
implies(condition, consequence)

// Set operations
in_set(value, set)
not_in_set(value, set)
```

### Claim Types

```typescript
type Claim =
  | FieldClaim
  | RelationClaim
  | QuantifierClaim
  | GraphClaim
  | CustomClaim;

type FieldClaim = {
  type: "has_field" | "no_field" | "field_type";
  target: string; // type name
  field: string; // field path (dot notation)
  expected?: string; // for field_type
};

type RelationClaim = {
  type: "references" | "subset_of" | "implements";
  source: string;
  target: string;
};

type QuantifierClaim = {
  type: "forall" | "exists";
  variable: string;
  collection: string;
  predicate: Claim;
};

type GraphClaim = {
  type: "reachable" | "all_paths_through" | "acyclic";
  scope: string; // workflow or type
  params: Record<string, string>;
};

type CustomClaim = {
  type: "custom";
  checker: string; // reference to checker function
  params: Record<string, unknown>;
};
```

---

## Example Decisions Formalized

### Decision: Retry config on ActionDef only

```typescript
{
  id: "retry-on-action",
  title: "Retry Configuration Location",
  description: "Retry config lives on ActionDef, not NodeDef. Actions define their execution behavior; nodes just reference actions.",
  claims: [
    { type: "no_field", target: "NodeDef", field: "retry_policy" },
    { type: "no_field", target: "NodeDef", field: "execution_override" },
    { type: "has_field", target: "ActionDef", field: "execution.retry_policy" }
  ]
}
```

### Decision: Sub-workflows are isolated

```typescript
{
  id: "subworkflow-isolation",
  title: "Sub-Workflow State Isolation",
  description: "Sub-workflows get fresh context. No implicit access to parent state.",
  claims: [
    { type: "no_field", target: "WorkflowCallImpl", field: "inherit_parent_state" },
    {
      type: "forall",
      variable: "wc",
      collection: "WorkflowCallImpl",
      predicate: {
        type: "field_default",
        target: "wc",
        field: "inherit_artifacts",
        expected: "false"
      }
    }
  ]
}
```

### Decision: Fan-in requires joins_node

```typescript
{
  id: "fan-in-requires-joins",
  title: "Fan-In Must Specify Source",
  description: "Nodes with fan_in 'all' or 'm_of_n' must specify which fan_out node they're joining.",
  claims: [
    {
      type: "forall",
      variable: "node",
      collection: "NodeDef",
      predicate: {
        type: "implies",
        condition: {
          type: "or",
          clauses: [
            { type: "field_equals", target: "node", field: "fan_in", value: "all" },
            { type: "field_exists", target: "node", field: "fan_in.m_of_n" }
          ]
        },
        consequence: {
          type: "field_exists", target: "node", field: "joins_node"
        }
      }
    }
  ]
}
```

### Decision: Analytics in events, not results

```typescript
{
  id: "analytics-in-events",
  title: "Analytics Data in Events Only",
  description: "WorkflowTaskResult.error contains only essential error info. Analytics (attempts, timing) come from events.",
  claims: [
    { type: "no_field", target: "WorkflowTaskResult.error", field: "attempts" },
    { type: "no_field", target: "WorkflowTaskResult.error", field: "timing_breakdown" },
    { type: "no_field", target: "WorkflowTaskResult.error", field: "last_attempt_at" },
    {
      type: "has_field",
      target: "WorkflowTaskResult.error",
      field: "code",
      expected: "string"
    },
    {
      type: "has_field",
      target: "WorkflowTaskResult.error",
      field: "message",
      expected: "string"
    },
    {
      type: "has_field",
      target: "WorkflowTaskResult.error",
      field: "retryable",
      expected: "boolean"
    }
  ]
}
```

---

## Verification Pipeline

### 1. Parse Decisions

Load all decisions from structured storage (not markdown).

### 2. Check Claims Against Reality

Claims are checked against:

| Claim Type           | Checked Against            |
| -------------------- | -------------------------- |
| Field claims         | TypeScript AST             |
| Instance constraints | Workflow definitions in D1 |
| Graph properties     | Workflow graph analysis    |
| Behavioral rules     | Runtime traces (harder)    |

```typescript
// Checker for "no_field"
function checkNoField(target: string, field: string): CheckResult {
  const ast = parseTypeScript("primitives.ts");
  const typeDef = findType(ast, target);
  const found = hasField(typeDef, field);
  return {
    passed: !found,
    claim: `${target} should not have field "${field}"`,
    evidence: found ? `Found field at ${location}` : null,
  };
}
```

### 3. Consistency Across Decisions

Detect contradictions between decisions:

```
Decision A: "All nodes must have an action_id"
  claim: forall node: node.action_id != null

Decision B: "Passthrough nodes have no action"
  claim: exists node: node.action_id == null

→ Contradiction detected!
```

Resolution options:

- Refine A: "All _executable_ nodes must have action_id"
- Supersede one decision (requires consensus)

### 4. Proofs for Changes

When someone proposes a change:

```
Proposed: Add "retry_override" to NodeDef

System checks against all decisions:
- Violates "retry-on-action" (claim: no_field NodeDef retry_*)

Result: BLOCKED

Options:
1. Withdraw change
2. Propose decision amendment (triggers consensus workflow)
```

---

## The LLM Role

LLMs are **translators**, not verifiers:

1. Human writes: "Retry config should be on actions, not nodes"
2. LLM proposes formal claims: `no_field(NodeDef, "retry_policy")`
3. Human reviews and approves
4. System verifies mechanically

LLMs can also:

- Suggest which decisions a change might affect
- Propose how to resolve contradictions
- Generate natural language explanations of formal claims
- Draft new decisions from conversation context

**But the checking is deterministic.**

---

## Governance: Changing Decisions

Decisions aren't immutable, but changes require rigor.

### Supersede Policy

Each decision declares how it can be changed:

```typescript
supersede_policy: {
  requires_consensus: true,   // must go through consensus workflow
  min_agents: 3,              // at least 3 agents must agree
  requires_human_approval: true  // human must sign off
}
```

### Amendment Workflow

1. Agent proposes amendment
2. System checks amendment doesn't contradict other decisions
3. If `requires_consensus`: trigger consensus workflow
   - Multiple agents review
   - Strong agreement required
4. If `requires_human_approval`: queue for human review
5. On approval: update decision, log provenance

### Provenance Chain

Every decision records its history:

```typescript
{
  id: "retry-on-action",
  version: 2,
  decided_at: "2025-11-25T...",
  decided_by: "consensus_run_456",
  supersedes: ["retry-on-action@v1"],
  amendment_reason: "Clarified that retry_policy path is execution.retry_policy"
}
```

---

## Integration Points

### CI Pipeline

```yaml
- name: Check Decision Compliance
  run: wonder decisions check
  # Fails build if any decision claims are violated
```

### Editor Integration

When editing `primitives.ts`:

- Real-time feedback on decision violations
- "This change would violate decision 'retry-on-action'"

### Agent Tools

MCP tools for the project agent:

```
check_decisions()        — verify all decisions against current state
propose_decision()       — create new decision with formal claims
amend_decision()         — modify existing decision (triggers governance)
explain_violation()      — why does this change violate decisions?
```

### Workflow Validation

Before saving a workflow:

- Check against instance-level decision claims
- "This workflow violates 'fan-in-requires-joins'"

---

## What's Checkable Now vs. Later

### Now (Deterministic)

- Field existence/absence on types (AST)
- Field types (AST)
- Required relationships between types (AST)
- Workflow graph structure (schema validation)
- Naming conventions (regex)

### Soon (With Tooling)

- Cross-type consistency
- Default value verification
- Exhaustive enum usage
- Behavioral contracts (with runtime instrumentation)

### Research (Needs Innovation)

- Semantic intent ("this is a coordination concern, not a data concern")
- Emergent properties ("this design scales to 10k workflows")
- Architectural style consistency

---

## As a Wonder Primitive

This system could be exposed to Wonder users:

- **DecisionDef** — like WorkflowDef, but for decisions
- **ClaimDef** — formal claims as first-class objects
- **Validation action** — check claims as a workflow step
- **Consensus workflow** — for decision governance

Users could define decisions about their _own_ workflows:

```
Decision: "All customer-facing workflows must have a human approval gate"

Claim: forall workflow where tag == "customer-facing":
  exists node in workflow.nodes where action.kind == "human_input"
```

---

## Summary

| Layer          | What                                | How                                 |
| -------------- | ----------------------------------- | ----------------------------------- |
| **Human**      | Writes decision in natural language | "Retry config on actions only"      |
| **LLM**        | Translates to formal claims         | `no_field(NodeDef, retry_policy)`   |
| **System**     | Verifies mechanically               | AST check, schema validation        |
| **Governance** | Controls changes                    | Consensus workflows, human approval |

Decisions become **living, verified documentation**—not prose that drifts from reality.
