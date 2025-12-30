# Agents and Conversations

## Overview

Wonder has primitives for user-facing interaction:

- **Persona** — Shareable identity, behavior, and tool configuration
- **Agent** — Instance with persona + memory, scoped to one or more projects
- **Conversation** — A session with an agent
- **Turn** — One cycle of the agent loop
- **Message** — User or agent utterance

Personas define _who_ the LLM is. Agents are living instances that accumulate memory. Conversations are sessions where users interact with an agent. Workflows are orchestration logic that agents invoke to do work.

## Persona

A persona is **identity and behavior** — the shareable, versionable configuration that defines how an agent acts.

**Identity:**

- System prompt
- Behavioral instructions
- Model preferences

**Memory configuration:**

- Context assembly workflow (what to retrieve, how to score/filter)
- Memory extraction workflow (what to remember, how to structure)
- Store schema

**Tools:**

- Tool IDs referencing library definitions
- Constraints (budgets, allowed actions)

Tools are the LLM-facing interface. Each tool binds to an execution target (Task, Workflow, or Agent). When the LLM invokes a tool, the AgentDO dispatches to the appropriate target.

```typescript
interface Persona {
  identity: { systemPrompt: string; model: string; ... }
  memory: {
    contextAssemblyWorkflowId: string;
    memoryExtractionWorkflowId: string;
    storeSchema: MemoryStoreSchema;
  }
  tools: {
    toolIds: string[];           // References to Tool definitions in libraries
    constraints: AgentConstraints;
  }
}
```

Personas live in libraries and can be shared across projects. When you create an agent, you either reference a persona from a library or define one inline.

## Tool

A tool is the **LLM-facing interface** to Wonder's execution primitives. Tools live in libraries alongside Workflows, Tasks, and Personas.

```typescript
interface Tool {
  id: string;
  name: string;                // What the LLM sees
  description: string;         // How the LLM understands when to use it
  inputSchema: JSONSchema;     // What the LLM provides

  // Execution target (exactly one)
  taskId?: string;
  workflowId?: string;
  agentId?: string;

  // Optional input transformation
  inputMapping?: Record<string, string>;
}
```

**Why tools exist:** The LLM shouldn't think in terms of internal primitives (Task, Workflow, Agent). It thinks in terms of actions it can take: "search the codebase", "implement a feature", "ask the reviewer". Tools provide this abstraction layer.

**Tool → Target binding:**

- `taskId` — Quick operations (search, retrieval, simple transformations)
- `workflowId` — Orchestrated work (feature implementation, research pipelines)
- `agentId` — Delegation to another agent (get a second opinion, specialized expertise)

**Input mapping:** Transforms LLM-provided input to match the target's inputSchema. If omitted, input passes through directly.

**Example:**

```typescript
// Tool definition in library
{
  id: 'tool_implement_feature',
  name: 'implement_feature',
  description: 'Implement a new feature in the codebase. Use when the user asks for new functionality.',
  inputSchema: {
    type: 'object',
    properties: {
      feature: { type: 'string', description: 'What to implement' },
      branch: { type: 'string', description: 'Branch name for the work' }
    },
    required: ['feature']
  },
  workflowId: 'workflow_implement_feature_v2'
}

// Persona references tools by ID
{
  tools: {
    toolIds: ['tool_implement_feature', 'tool_search_code', 'tool_run_tests'],
    constraints: { ... }
  }
}
```

When the LLM invokes `implement_feature`, the AgentDO:

1. Resolves `tool_implement_feature` from the library
2. Validates input against `inputSchema`
3. Applies `inputMapping` (if any)
4. Dispatches to `workflow_implement_feature_v2`
5. Returns the workflow result to the LLM

## Agent

An agent is a **living instance** — a persona plus accumulated memory, scoped to one or more projects.

```typescript
interface Agent {
  projectIds: string[]; // 1 or more
  persona: Persona | { libraryId: string; version: string };
  // Memory lives here, not in persona
}
```

Scope determines what the agent can see (repos, artifacts, other agents) and what memory it accumulates. An Implementer might be scoped to a single project; an Executive might span multiple projects.

The agent executes a fixed loop:

```
receive → assemble context → LLM decides → execute → extract memories → respond → wait → (loop)
```

You don't author this control flow—it's the primitive's execution model. The persona configures what happens at each step.

### Async Workflow Execution

Some workflows take minutes or hours—research, multi-step code generation, complex analysis. The conversation shouldn't block.

For async workflows:

- LLM decides to invoke a long-running workflow with `async: true`
- Agent immediately responds: "I've started researching X, I'll let you know when it's done"
- Workflow runs in the background, linked to the conversation
- When complete, the workflow emits an event that triggers a new agent turn
- The agent sees the result in context and decides how to respond

**Turn triggers:**

- User message (normal)
- Async workflow completion (agent-initiated)

The agent loop stays the same regardless of trigger. The only difference is what initiates the turn.

**In-flight awareness:** Context assembly includes pending async workflows. If the user messages while work is in progress, the agent knows: "You asked about X—I'm still working on that research" or "Here's what I have so far."

**No special conversation state needed.** Async workflows are just workflow runs with a `conversation_id`. The AgentDO receives completion events and triggers new turns.

**Key distinction:**

- **Persona** — Shareable configuration. Lives in libraries. No state.
- **Agent** — Instance with memory. Scoped to projects. Accumulates knowledge across conversations.
- **Workflow** — Authored control flow. For varying execution paths.

The agent _has_ a persona and _uses_ workflows, but is neither.

### AgentDO

AgentDO is the **actor that coordinates the agent loop**. It follows the same pattern as CoordinatorDO: receive messages, make decisions, dispatch work, wait for results.

| DO            | Receives                                         | Decides                         | Dispatches to                    |
| ------------- | ------------------------------------------------ | ------------------------------- | -------------------------------- |
| CoordinatorDO | Task results, subworkflow completions            | Graph traversal (deterministic) | Executor, CoordinatorDO, AgentDO |
| AgentDO       | User messages, workflow completions, agent calls | Agent loop (LLM-driven)         | Executor, CoordinatorDO, AgentDO |

**AgentDO responsibilities:**

- Runs the agent loop (context assembly → LLM → execute → memory extraction)
- Manages memory (structured in DO SQLite, semantic via Vectorize)
- Dispatches tools to Executor (tasks), CoordinatorDO (workflows), or other AgentDOs (agent calls)
- Handles async workflow completions and triggers new turns
- Manages multiple concurrent conversations (keyed by conversation_id)

When a workflow node dispatches to an agent, the parent CoordinatorDO's token enters `waiting_for_agent` state. When the agent turn completes, the result flows back and the token resumes.

## Context Assembly

Context assembly is a **deterministic pre-LLM optimization pass**. Before the LLM sees the user's message, the agent retrieves relevant context to inform reasoning.

**What gets assembled:**

1. Identity (system prompt) — static
2. Retrieved memories — from long-term store
3. Conversation history — from current session
4. Current state — workflow results, etc.

**Key principle:** Context assembly is fast and deterministic. It uses pattern matching, vector search, and structured queries—not LLM calls. This keeps it cheap and tunable.

| Layer            | When                    | What                       | Tuning                   |
| ---------------- | ----------------------- | -------------------------- | ------------------------ |
| Context assembly | Before LLM sees message | Deterministic retrieval    | Workflow experimentation |
| LLM tool use     | During reasoning        | On-demand deeper retrieval | Prompt engineering       |

The LLM also has memory tools available. When it recognizes it needs more context than was pre-fetched, it can search deeper. Two layers, clear responsibilities: baseline retrieval guarantees relevant context; tool-driven retrieval handles edge cases.

### Knowledge Sources

The agent has access to multiple knowledge sources:

| Source               | Owned by     | What it contains                                                                             |
| -------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| Agent memory         | Agent        | The agent's understanding and experience—patterns observed, problems solved, learned context |
| Artifacts repo       | Project      | Project knowledge—decisions, designs, research. Shared, versioned.                           |
| Code repos           | Project      | The code itself. Source of truth for what exists.                                            |
| Conversation history | Conversation | Current session dialogue.                                                                    |

**Agent memory vs artifacts:** Agent memory is personal understanding. Artifacts are project documentation. "We decided to use JWT" might be both—an artifact (design doc) and an agent memory (so it remembers without fetching). But "this codebase's token refresh logic was tricky to debug" is agent memory only.

**Agent memory vs code:** The agent doesn't store copies of code structure. It stores _understanding about_ code—patterns, conventions, relationships, context about why things are the way they are. The code is the source of truth; agent memory is learned experience working with it.

### Indices

Context assembly retrieves **pointers** to content, not content itself. The LLM sees structured indices: "Here are the design decisions on file, here are the artifacts in this project, here are the modules in the codebase."

The index is a menu of available knowledge. The LLM knows _what exists_ without having all of it in context. When it needs details, it fetches from the index.

Benefits:

- Cheap to assemble (metadata queries, not full content)
- LLM has a map rather than hoping relevant context was pre-fetched
- Different agents have different indices based on their role

_Needs more exploration: Index structure, how indices are defined per persona, how LLM tools reference index entries._

## Memory Extraction

After turns complete, the agent updates memory:

1. Analyze what happened
2. Decide what's worth remembering
3. Structure it (facts, decisions, summaries)
4. Write to memory store
5. Detect contradictions with existing memories

Unlike context assembly, memory extraction typically involves LLM calls—deciding what's worth remembering requires judgment.

## Conversation

A conversation is a **session with an agent**. It groups messages and turns together, providing session context for the agent loop.

| Field      | Purpose                                    |
| ---------- | ------------------------------------------ |
| `agent_id` | Which agent this session belongs to        |
| `status`   | `active`, `waiting`, `completed`, `failed` |

**Relationship to AgentDO:** When a message arrives for a conversation, it routes to the AgentDO for that agent. The AgentDO runs a turn using the conversation_id to:

- Fetch conversation history for context assembly
- Store new turns and messages
- Track async workflows linked to this conversation

**Multiple conversations:** An agent can have many concurrent conversations. Memory is shared across all conversations (the agent's accumulated knowledge), but conversation history is per-session. Each turn includes the conversation_id so the AgentDO knows which session context to use.

**Async workflow routing:** When an async workflow completes, it carries the agent_id and conversation_id. The completion routes to the AgentDO, which starts a new turn in that specific conversation.

Conversations don't store messages directly—they're linked via Turn and Message entities.

## Turn

A turn is **one cycle of the agent loop**. It's the execution record for what happened between user input and agent response.

| Field                      | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `conversation_id`          | Parent conversation                        |
| `user_message_id`          | The triggering user message                |
| `agent_message_id`         | The resulting agent response               |
| `context_assembly_run_id`  | Workflow run for context assembly          |
| `action_workflow_run_id`   | Workflow run for delegated work (nullable) |
| `memory_extraction_run_id` | Workflow run for memory extraction         |
| `latency_ms`               | Total turn duration                        |
| `created_at`               | Timestamp                                  |

Turns are the execution spine. They link the visible dialogue to the underlying workflow runs.

## Message

A message is a **user or agent utterance**. It's what you'd export as a transcript.

| Field             | Purpose             |
| ----------------- | ------------------- |
| `conversation_id` | Parent conversation |
| `role`            | `user` or `agent`   |
| `content`         | The message content |
| `created_at`      | Timestamp           |

Messages are the user-facing content. Turns are the execution record. A turn typically contains one user message and one agent message, plus metadata about what happened in between.

**Why separate entities?**

- **Querying**: Find all turns where the agent invoked a workflow, or messages mentioning a topic
- **Linking**: Join turns to workflow runs for observability
- **Streaming/pagination**: Load messages incrementally for long conversations
- **Observability**: Turns capture execution details (latency, workflow runs) that don't belong in message content

## Context Isolation

Each agent maintains **isolated context by default**.

Consider a code development scenario:

- **Architect agent** — Sees requirements, design decisions, component boundaries
- **Developer agent** — Sees current task, relevant constraints, the code
- **Reviewer agent** — Sees code under review, standards, intent

Clean contexts mean each agent sees what's relevant to their role.

## Agent Invocation

Workflow nodes can execute agents, just like they execute tasks or subworkflows. Agent invocation is a **node-level dispatch**, not an action within a task.

| Node executes | Dispatches to | Mechanism                      |
| ------------- | ------------- | ------------------------------ |
| Task          | Executor      | RPC to stateless worker        |
| Subworkflow   | CoordinatorDO | DO-to-DO, waits for completion |
| Agent         | AgentDO       | DO-to-DO, waits for response   |

When a node dispatches to an agent:

- Parent token enters `waiting_for_agent` state
- AgentDO runs a turn with the provided input
- Response flows back to parent coordinator
- Parent token resumes with agent output

**Context isolation:** The invoked agent runs with clean context — only what was explicitly passed via input mapping. Response is explicit output, not shared state.

## The Manager Pattern

A common pattern for multi-agent collaboration:

```
Manager Agent (user-facing, owns coordination workflow)
    ↓ dispatches to
Architect Agent (design decisions)
Developer Agent (implementation)
Reviewer Agent (quality)
    ↓ results flow back to
Manager Agent (synthesizes, responds to user)
```

The manager is an agent with a workflow that dispatches to other agents with curated context.

## Reasoning Strategies

Advanced reasoning patterns—tree-of-thought, debate, chain-of-verification—are workflows exposed as tools.

The LLM sees these as tools it can invoke. When a problem warrants deeper reasoning, the agent decides to invoke the appropriate strategy workflow. This keeps the agent loop simple while enabling sophisticated reasoning when needed.

**Influence levels:**

- **Tool description (light):** The workflow's name and description suggest when to use it. "Use for complex multi-step problems requiring exploration."

- **System prompt (medium):** Persona instructions can recommend strategies. "For architectural decisions, consider using the debate workflow to evaluate trade-offs."

- **User instruction (heavy):** Direct user guidance overrides defaults. "Think through this step by step" or "Use tree-of-thought for this problem."

The LLM ultimately decides, but that decision is shaped by these influences. No special primitive needed—reasoning strategies are workflows, and the agent invokes them like any other tool.

## Observability

Workflow invocations don't have D1 records. Observability comes from events:

- `conversation_started`, `conversation_turn`, `conversation_ended`
- `workflow_started`, `workflow_completed`, `workflow_failed`
- `agent_call_started`, `agent_call_completed`

## Persistence Model

### D1 Entities

| Entity          | Purpose                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `personas`      | Shareable config — identity, behavior, tools (versioned, lives in libraries)        |
| `tools`         | LLM-facing interface — binds name/description/schema to execution target            |
| `agents`        | Instance — persona ref + memory, scoped to projects                                 |
| `conversations` | Session — status, accumulated context                                               |
| `turns`         | Execution record — links messages to workflow runs                                  |
| `messages`      | Dialogue content — user and agent utterances                                        |
| `workflows`     | Definition — graph (versioned)                                                      |
| `tasks`         | Definition — step sequences (versioned)                                             |
| `actions`       | Definition — atomic operations (versioned)                                          |
| `events`        | Execution log — full history                                                        |

### Durable Objects

| DO            | Purpose                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| CoordinatorDO | Workflow execution — graph traversal, token management, fan-in sync       |
| AgentDO       | Agent coordination — agent loop, memory management, conversation handling |

## Context Assembly and Memory Extraction

These processes are **workflows**. With Workers RPC, workflow overhead is ~10-25ms per invocation—negligible against LLM latency of 500-2000ms.

Each agent references:

- `context_assembly_workflow_id` — invoked at the start of each turn
- `memory_extraction_workflow_id` — invoked at the end of each turn

These workflows get the same observability, composition, and versioning as any other workflow. No special primitive needed.

## Memory

Memory lives on the **Agent**, not the Persona. This is what makes agents "living instances"—they accumulate knowledge across conversations.

### Storage

Three stores, different access patterns:

| Store      | Technology | Purpose                                              |
| ---------- | ---------- | ---------------------------------------------------- |
| Structured | D1         | Facts, decisions, relationships. Queryable by field. |
| Semantic   | Vectorize  | Episodic memories, summaries. Similarity search.     |
| Archive    | R2         | Raw episodes, large documents. Cold storage.         |

The Persona defines the schema (what fields, what types). The Agent owns the data.

Memory workflows (`context_assembly`, `memory_extraction`) have actions to read/write all three stores. The platform provides the primitives; workflows define the strategies.

### Lifecycle

Per-agent retention policies with consolidation:

- **Facts and decisions** persist until explicitly updated or contradicted
- **Episodic memories** consolidate into summaries over time
- Raw episodes archived to R2, summaries remain active
- Different agents can have different retention policies (configured in Persona)

## Platform vs Library Boundary

The platform provides **dispatch plumbing**. Libraries provide **intelligence**.

**Platform responsibilities:**

- AgentDO coordinates the agent loop (receive → decide → dispatch → wait → resume)
- Dispatch to execution targets (Executor for tasks, CoordinatorDO for workflows, AgentDO for agents)
- Storage primitives (D1 for structured, Vectorize for semantic, R2 for archive)
- Event emission and observability

**Library responsibilities:**

- Context assembly workflows (what to retrieve, how to score, how to filter)
- Memory extraction workflows (what to remember, how to structure, when to consolidate)
- Tool definitions (LLM-facing interface to execution targets)
- Reasoning strategy workflows (tree-of-thought, debate, chain-of-verification)
- Persona definitions (system prompts, tool sets, memory configuration)

The platform doesn't know *how* to assemble context or *what* to remember—it just calls the workflows the persona specifies. This keeps the platform simple and lets libraries encode domain-specific intelligence.

**Example:** The platform's AgentDO calls `contextAssemblyWorkflowId` before every LLM call. A library provides `context_assembly_code_assistant_v2` that knows to retrieve recent code changes, relevant design decisions, and similar past conversations. The platform provides the hook; the library provides the strategy.

## Implementation Structure

The agent service follows the same patterns as the coordinator service.

### Service Layout

```
services/agent/
├── src/
│   ├── index.ts              # AgentDO extends DurableObject
│   ├── types.ts              # AgentContext, TurnPayload, AgentResult
│   │
│   ├── operations/           # State managers (DO SQLite)
│   │   ├── conversations.ts  # ConversationManager - CRUD, status
│   │   ├── turns.ts          # TurnManager - create, link messages/runs
│   │   ├── messages.ts       # MessageManager - append, query history
│   │   └── memory.ts         # MemoryManager - structured store
│   │
│   ├── dispatch/             # Decision application
│   │   ├── index.ts          # buildAgentContext, dispatch entry
│   │   └── apply.ts          # applyDecisions
│   │
│   └── planning/             # Decision logic (pure functions)
│       ├── context.ts        # Plan context assembly decisions
│       ├── tools.ts          # Resolve tool definitions → LLM tool specs
│       ├── llm.ts            # Interpret LLM output → decisions
│       └── memory.ts         # Plan memory extraction decisions
```

### AgentDO Class

```typescript
export class AgentDO extends DurableObject<Env> {
  // Entry points (initiators)
  async startTurn(params: StartTurnParams): Promise<void>; // User/API initiated
  async startAgentCall(params: AgentCallParams): Promise<void>; // Workflow node initiated

  // Callbacks (from dispatched tools)
  async handleTaskResult(turnId: string, result: TaskResult): Promise<void>;
  async handleTaskError(turnId: string, error: unknown): Promise<void>;
  async handleWorkflowResult(turnId: string, output: unknown): Promise<void>;
  async handleWorkflowError(turnId: string, error: unknown): Promise<void>;
  async handleAgentResult(turnId: string, output: unknown): Promise<void>;
  async handleAgentError(turnId: string, error: unknown): Promise<void>;

  // Timeout handling
  async alarm(): Promise<void>;
}
```

**Entry point differences:**

|                        | `startTurn`                  | `startAgentCall`                   |
| ---------------------- | ---------------------------- | ---------------------------------- |
| **Caller**             | User via API                 | Parent coordinator                 |
| **Context**            | Conversation + user message  | Explicit input from parent         |
| **Result destination** | Streams to user / completes  | Callbacks to parent coordinator    |
| **Conversation**       | Always within a conversation | One-shot (no conversation context) |

### Decision Types

```typescript
type AgentDecision =
  // Turn lifecycle
  | { type: 'START_TURN'; conversationId: string; trigger: 'user' | 'workflow' | 'agent' }
  | { type: 'COMPLETE_TURN'; turnId: string; response: string }
  | { type: 'FAIL_TURN'; turnId: string; error: unknown }

  // Message management
  | { type: 'APPEND_MESSAGE'; conversationId: string; role: 'user' | 'agent'; content: string }

  // Capability dispatch
  | { type: 'DISPATCH_TASK'; turnId: string; taskId: string; input: unknown }
  | {
      type: 'DISPATCH_WORKFLOW';
      turnId: string;
      workflowId: string;
      input: unknown;
      async: boolean;
    }
  | { type: 'DISPATCH_AGENT'; turnId: string; agentId: string; input: unknown }

  // Waiting states
  | { type: 'MARK_WAITING_FOR_TASK'; turnId: string }
  | { type: 'MARK_WAITING_FOR_WORKFLOW'; turnId: string }
  | { type: 'MARK_WAITING_FOR_AGENT'; turnId: string }
  | { type: 'RESUME_FROM_TOOL'; turnId: string; result: unknown }

  // Memory
  | { type: 'WRITE_MEMORY'; key: string; value: unknown }
  | { type: 'UPDATE_MEMORY'; key: string; value: unknown };
```

### Turn Execution Flow

```
startTurn(conversationId, userMessage)
  │
  ├─ START_TURN
  ├─ APPEND_MESSAGE (user)
  │
  ├─ Run context assembly workflow → assembled context
  │
  ├─ Resolve tools from persona.tools.toolIds
  │
  ├─ LLM call with context + tools + history
  │   │
  │   ├─ If tool_use → dispatch to tool's target
  │   │   ├─ tool.taskId → DISPATCH_TASK, MARK_WAITING_FOR_TASK
  │   │   ├─ tool.workflowId → DISPATCH_WORKFLOW, MARK_WAITING_FOR_WORKFLOW
  │   │   └─ tool.agentId → DISPATCH_AGENT, MARK_WAITING_FOR_AGENT
  │   │
  │   └─ If text response → continue
  │
  ├─ (tool result arrives via callback)
  ├─ RESUME_FROM_TOOL
  ├─ Continue LLM loop until text response
  │
  ├─ Run memory extraction workflow
  ├─ WRITE_MEMORY (extracted facts)
  │
  ├─ APPEND_MESSAGE (agent)
  └─ COMPLETE_TURN
```

### Parallel to CoordinatorDO

| Aspect               | CoordinatorDO                                  | AgentDO                                                         |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| **Instance scope**   | One workflow run                               | One agent                                                       |
| **State management** | Tokens, context, transitions                   | Turns, messages, memory                                         |
| **Decision driver**  | Graph traversal (deterministic)                | LLM reasoning (non-deterministic)                               |
| **Dispatches to**    | Executor, CoordinatorDO, AgentDO               | Executor, CoordinatorDO, AgentDO                                |
| **Callbacks from**   | Executor, child coordinators, agents           | Executor, coordinators, child agents                            |
| **Waiting states**   | `waiting_for_subworkflow`, `waiting_for_agent` | `waiting_for_task`, `waiting_for_workflow`, `waiting_for_agent` |

The core pattern is identical: receive → decide → dispatch → wait → resume. The difference is what drives the "decide" step.

## Conversation Lifecycle

Conversations stay open indefinitely by default. The `completed` status is triggered by explicit user action only—no timeouts. An idle conversation costs nothing (just D1 rows), and users may return after days or weeks to continue.

## Shell Operations and Branch Context

When agents invoke tools that execute shell commands, they need repo and branch context. This works the same way as workflows—the agent owns a branch, not a container.

### Conversation Branch

At conversation start, a working branch is created:

```
Conversation created for agent scoped to project P
  → Branch: wonder/conv-{conversation_id} from project's default branch
  → Stored in conversation context
```

All shell operations during the conversation use this branch. The conversation has its own ContainerDO (keyed by conv_id) for shell execution.

### Tool Execution Context

When a tool invokes a task with shell actions:

1. AgentDO dispatches to Executor with conversation context (conv_id, repo_id, branch)
2. Executor gets the conversation's ContainerDO (keyed by conv_id)
3. Executor calls `containerDO.exec(command, timeout)`
4. Command executes on the conversation's branch
5. Result returns to AgentDO

The tool definition doesn't specify container or branch—that's implicit from the conversation context. The ContainerDO stays warm via `sleepAfter` between commands.

### Multiple Conversations

Multiple conversations can operate on the same project concurrently:

```
Project: my-backend
├── wonder/conv-01HABC...   # Conversation A (refactoring auth)
├── wonder/conv-01HDEF...   # Conversation B (adding logging)
└── wonder/conv-01HGHI...   # Conversation C (fixing bugs)
```

Each conversation has isolated work. Merging is a user decision, not automatic. The agent can commit to its branch, but merging to main requires explicit user action or workflow completion with merge configured.

### Workflow-Initiated Agent Calls

When a workflow node invokes an agent (one-shot call, no conversation):

- The agent receives the parent workflow's branch context in input
- Shell operations use that branch
- No new branch is created

This allows agents to continue work in progress on a workflow's branch.

## Memory Workflow Contracts

Memory workflows are pure decision logic. They receive data and return decisions—AgentDO handles all actual storage operations.

### Context Assembly

**Input:**
- Conversation history (recent turns)
- User message
- Pre-fetched memory samples (optional optimization)

**Output:**
- Assembled context to send to LLM

The workflow decides what context is relevant. It doesn't read from storage directly—AgentDO provides the inputs and uses the output.

### Memory Extraction

**Input:**
- Turn transcript (user message, agent response, tool calls)
- Current memory state (relevant facts)

**Output:**
- List of memory operations to perform

```typescript
type MemoryOperation =
  | { op: 'write'; store: 'structured' | 'semantic'; key: string; value: unknown }
  | { op: 'update'; store: 'structured'; key: string; value: unknown }
  | { op: 'delete'; store: 'structured' | 'semantic'; key: string }
  | { op: 'archive'; key: string };
```

AgentDO invokes the workflow, receives the operations, and applies them to its own storage.

### Why This Model

- **No special action types needed** — memory workflows use standard actions (llm, context)
- **Testable** — workflows are pure functions (input → output)
- **AgentDO owns storage** — no workflows reaching into agent state
- **Matches coordinator pattern** — planning returns decisions, dispatch applies them
