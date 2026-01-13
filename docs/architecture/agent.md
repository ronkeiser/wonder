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
- Recent turns limit (how many turns to keep locally for context)

**Tools:**

- Tool IDs referencing library definitions
- Constraints (move budgets, allowed actions)

Tools are the LLM-facing interface. Each tool binds to an execution target (Task, Workflow, or Agent). When the LLM invokes a tool, the Conversation dispatches to the appropriate target.

```typescript
interface Persona {
  identity: { systemPrompt: string; modelProfileId: string; ... }
  memory: {
    contextAssemblyWorkflowId: string;
    memoryExtractionWorkflowId: string;
    recentTurnsLimit?: number;   // How many turns to keep in DO SQLite (default: 20)
  }
  tools: {
    toolIds: string[];           // References to Tool definitions in libraries
    constraints: AgentConstraints;
  }
}

interface AgentConstraints {
  maxMovesPerTurn?: number;      // Limits iterations before agent must respond
  // ... other constraints (allowed actions, budgets)
}
```

The `modelProfileId` references a ModelProfile, which bundles model selection with parameters (temperature, max tokens) and execution config. This allows personas to share model configurations and enables operational changes (model updates, cost tuning) without modifying persona definitions.

Personas live in libraries and can be shared across projects. When you create an agent, you either reference a persona from a library or define one inline.

## Tool

A tool is the **LLM-facing interface** to Wonder's execution primitives. Tools live in libraries alongside Workflows, Tasks, and Personas.

```typescript
interface Tool {
  id: string;
  name: string; // What the LLM sees
  description: string; // How the LLM understands when to use it
  inputSchema: JSONSchema; // What the LLM provides

  // Execution target
  targetType: 'task' | 'workflow' | 'agent';
  targetId: string;

  async?: boolean; // If true, dispatch and continue; results trigger new turn when ready

  // Agent-specific options
  invocationMode?: 'delegate' | 'loop_in'; // Only for agent targets. Default: 'delegate'

  // Optional input transformation
  inputMapping?: Record<string, string>;
}
```

**Why tools exist:** Tools let the LLM think in terms of actions—"search the codebase", "implement a feature", "ask the reviewer"—rather than internal primitives (Task, Workflow, Agent).

**Tool → Target binding:**

- `task` — Quick operations (search, retrieval, simple transformations)
- `workflow` — Orchestrated work (feature implementation, research pipelines)
- `agent` — Invoke another agent. Use `invocationMode: 'delegate'` for directed tasks, `'loop_in'` to add them to the conversation.

**Async execution:** When `async: true`, the agent dispatches to the target and immediately continues (or responds). The target runs in the background; when it completes, the result triggers a new turn. This works for any target type:

- **Tasks:** Useful for slow external APIs or fire-and-forget operations
- **Workflows:** Long-running pipelines like research or multi-step generation
- **Agents:** For `delegate` mode—"I asked @architect about it, I'll let you know when he responds." (For `loop_in`, async doesn't apply—the agent joins the conversation immediately.)

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
  targetType: 'workflow',
  targetId: 'workflow_implement_feature_v2',
  async: true  // Long-running, agent responds immediately
}

// Persona references tools by ID
{
  tools: {
    toolIds: ['tool_implement_feature', 'tool_search_code', 'tool_run_tests'],
    constraints: { ... }
  }
}
```

When the LLM invokes `implement_feature`, the Conversation:

1. Resolves `tool_implement_feature` from the library
2. Validates input against `inputSchema`
3. Applies `inputMapping` (if any)
4. Dispatches to `workflow_implement_feature_v2`
5. Returns the workflow result to the LLM

## Agent

An agent is **identity plus accumulated knowledge** — a persona combined with a memory corpus, scoped to one or more projects.

The agent isn't just a database record. It's the living repository of everything the agent has learned across all its conversations. Two agents with the same persona but different histories are fundamentally different—they've solved different problems, observed different patterns, learned different things about their codebases.

```typescript
interface Agent {
  id: string;
  projectIds: string[]; // 1 or more
  persona: Persona | { libraryId: string; version: string };
  // Memory corpus: D1 records + Vectorize embeddings + R2 overflow, all keyed by agent_id
}
```

**What constitutes an agent:**

- **D1 record** — The anchor: id, persona reference, project scope, metadata
- **Memory in D1** — Facts, decisions, patterns—structured knowledge keyed by `agent_id`
- **Embeddings in Vectorize** — Semantic search over memory content
- **Overflow in R2** — Large memory content exceeding 4KB

The persona defines how the agent behaves. The memory corpus _is_ what the agent knows. When you create an agent, you're creating an entity that will learn and remember across every conversation it participates in.

Scope determines what the agent can see (repos, artifacts, other agents) and what memory it accumulates. An Implementer might be scoped to a single project; an Executive might span multiple projects.

### The Agent Loop

The agent executes a fixed loop:

```
receive → assemble context → LLM decides → execute → extract memories → respond → wait → (loop)
```

This loop runs in **Conversation**, not in the agent itself. Each conversation has its own Conversation instance that:

- Handles WebSocket connections for real-time streaming
- Runs the turn loop (context assembly → LLM → execute → memory extraction)
- Makes LLM calls directly and streams responses to the client
- Dispatches tools to Executor (tasks), WorkflowCoordinator (workflows), or other Conversations (agent calls)
- Passes `agent_id` when dispatching memory operations

The agent is not an actor—it's the identity and memory that Conversation instances share. Multiple conversations with the same agent run in separate Conversations, all reading from and writing to the same memory corpus.

### Async Tool Execution

Some operations take minutes or hours—research pipelines, multi-step code generation, complex analysis, or waiting for another agent's response. When a tool has `async: true`, execution runs in the background so the conversation remains responsive.

For async tools:

- LLM decides to invoke a tool marked `async: true`
- Agent immediately responds: "I've started working on X..." or "I asked @architect, I'll let you know when he responds"
- Target executes in the background, linked to the turn
- The turn stays `active` while async work is pending
- When the async operation completes, the agent posts another message on the same turn
- The turn closes when all async work is done

**Turn lifecycle with async:**

```
User: "Research authentication patterns for our API"
  └─ Turn A starts (active)
     ├─ Agent: "I'll research that for you..." (immediate response)
     ├─ [async research workflow running]
     ├─ User: "Also, what's in the config file?" → Turn B starts
     │   └─ Agent: "Here's the config..." → Turn B completes
     ├─ [research workflow completes]
     └─ Agent: "Here's what I found about auth patterns..." → Turn A completes
```

**In-flight awareness:** Context assembly includes pending async operations across all active turns. If the user starts a new turn while work is in progress, the agent knows what's still running and can reference it.

**Key distinction:**

- **Persona** — Shareable configuration. Lives in libraries. No state.
- **Agent** — Instance with memory. Scoped to projects. Accumulates knowledge across conversations.
- **Workflow** — Authored control flow. For varying execution paths.

The agent _has_ a persona and _uses_ workflows, but is neither.

### Conversation

Conversation is the **actor that runs the agent loop for a single conversation**. It follows the same pattern as WorkflowCoordinator: receive messages, make decisions, dispatch work, wait for results.

| DO             | Receives                                         | Decides                         | Dispatches to                           |
| -------------- | ------------------------------------------------ | ------------------------------- | --------------------------------------- |
| WorkflowCoordinator  | Task results, subworkflow completions            | Graph traversal (deterministic) | Executor, WorkflowCoordinator, Conversation |
| Conversation | User messages, workflow completions, agent calls | Agent loop (LLM-driven)         | Executor, WorkflowCoordinator, Conversation |

**Conversation responsibilities:**

- Handles WebSocket connections and streams LLM responses to clients
- Runs the agent loop (context assembly → LLM → execute → memory extraction)
- Makes LLM calls directly (not dispatched as tasks)
- Dispatches context assembly and memory extraction workflows to Executor
- Dispatches tools to Executor (tasks), WorkflowCoordinator (workflows), or other Conversations (agent calls)
- Handles async workflow completions and triggers new turns
- Manages parallel turns within the conversation

Each conversation has exactly one Conversation. The DO loads the agent record to get the persona and project scope, and passes `agent_id` when dispatching memory operations.

When a workflow node dispatches to an agent, it routes to the Conversation for that conversation. The parent WorkflowCoordinator's token enters `waiting_for_agent` state. When the turn completes, the result flows back and the token resumes.

## Context Assembly

Context assembly is a **workflow hook** invoked before the LLM sees the user's message. It retrieves relevant context and produces a **provider-native LLM request**.

**What the workflow does:**

1. Fetches memories, artifacts, conversation history
2. Resolves tool definitions from the persona's `toolIds`
3. Constructs the complete LLM request in provider-native format (Anthropic, OpenAI, Gemini, etc.)

The workflow knows the provider from `modelProfileId` and outputs the exact request format that provider expects. The platform's `llm` action simply routes this to the appropriate API.

**Provider adapters:** Libraries targeting multiple providers can use adapter workflows. The context assembly workflow builds an intermediate representation, then calls an adapter (`adapter_anthropic`, `adapter_openai`, etc.) as a final step to produce the provider-native output. This is a library pattern, not a platform requirement—libraries targeting a single provider can skip the intermediate format entirely.

How the workflow assembles context is a library design choice. Some personas might use cheap deterministic retrieval (vector search, D1 queries, pattern matching). Others might use LLM calls to reason about what context is relevant. The platform provides the hook; libraries provide the strategy.

The LLM also has memory tools available during reasoning. When it recognizes it needs more context than was pre-fetched, it can search deeper.

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

**Accessing code:** The platform provides `repo.*` actions for common code operations (`tree`, `read`, `write`, `search`, `diff`). These are thin wrappers around standard tools, not language-aware. For specialized tooling (tree-sitter, language servers), use `shell.exec`.

### Indices

Context assembly retrieves **pointers**, not content itself. The LLM sees structured indices: "Here are the design decisions on file, here are the artifacts in this project, here are the modules in the codebase."

The index is a menu of available knowledge. The LLM knows _what exists_ and fetches details on demand.

Benefits:

- Cheap to assemble (metadata queries, not full content)
- LLM has a map rather than hoping relevant context was pre-fetched
- Different agents have different indices based on their role

**Indices are a library pattern, not a platform primitive.** The platform provides context assembly as a workflow hook and tools for fetching details (`memory.read`, `artifact.read`, `repo.read`). Libraries decide how to structure indices within the provider-native request—typically as part of the system prompt or as structured content in the message history.

Different personas need different indices. A code assistant might include file trees and symbol tables. A research agent might include source hierarchies and claim networks. How these appear in the final request depends on the provider format and library conventions.

## Memory Extraction

After turns complete, Conversation invokes the memory extraction workflow specified by the persona. The workflow receives the turn transcript and can use `memory.*` actions to read existing memory and write updates.

What the workflow does is a library design choice. The platform provides the hook and the primitives; libraries provide the strategy.

**Concurrency:** Memory extraction workflows are dispatched to Executor and write to shared infrastructure (D1/Vectorize). If two conversations with the same agent trigger memory extraction simultaneously, both workflows run and write to the same agent's memory. The `memory.*` actions handle this at the storage layer—D1 operations are atomic, and Vectorize handles concurrent writes. Workflows don't need special concurrency handling.

## Conversation

A conversation is a **multi-party collaboration space**. It groups participants, messages, and turns together, providing shared context for all participants.

| Field          | Purpose                                    |
| -------------- | ------------------------------------------ |
| `participants` | Users and agents in this conversation      |
| `status`       | `active`, `waiting`, `completed`, `failed` |

```typescript
interface Conversation {
  id: string;
  participants: Array<{ type: 'user'; userId: string } | { type: 'agent'; agentId: string }>;
  status: 'active' | 'waiting' | 'completed' | 'failed';
}
```

Conversations are not limited to user-agent pairs. Multiple agents can participate—a user might start a conversation with a manager agent, then the architect gets looped in, and now all three share context.

**Relationship to Conversation:** Each conversation has exactly one Conversation instance. When a message arrives, it routes to that Conversation, which:

- Runs a turn for the agent participant
- Stores new turns and messages (D1, for observability and UI)
- Tracks async workflows linked to this conversation
- Streams responses to the connected client

Note: The agent doesn't query the Messages table for context—it queries memory. See [Memory](#memory) for how conversation history relates to agent recall. However, conversation history _is_ available to looped-in agents during context assembly.

**Multiple conversations:** An agent can participate in many concurrent conversations. Each conversation has its own Conversation. Memory is shared across all conversations (the agent's accumulated knowledge), but conversation history is per-session.

**Async completion routing:** When an async operation completes, it carries conversation_id and turn_id. The completion routes to the appropriate Conversation, which continues the turn—the agent posts a new message with the results.

Conversations link to messages via Turn and Message entities.

## Turn

A turn is **one unit of agent work**—an input, the agent's processing, and responses. Each turn has exactly one triggering input and zero or more agent responses.

| Field                      | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `conversation_id`          | Parent conversation                                   |
| `caller`                   | Who initiated this turn (see below)                   |
| `input`                    | The triggering input (user message or caller's input) |
| `reply_to_message_id`      | Optional—if user replied to a specific agent message  |
| `status`                   | `active`, `completed`, `failed`                       |
| `context_assembly_run_id`  | Workflow run for context assembly                     |
| `memory_extraction_run_id` | Workflow run for memory extraction                    |
| `created_at`               | Timestamp                                             |
| `completed_at`             | When the turn closed (nullable while active)          |

**Caller:** A discriminated union identifying who initiated the turn:

```typescript
caller:
  | { type: 'user'; userId: string }
  | { type: 'workflow'; runId: string }
  | { type: 'agent'; agentId: string; turnId: string }
```

Every turn has a caller—users are callers too, not a special absence-of-caller case. For agent callers, `turnId` identifies which turn the calling agent was on, enabling result threading.

**Turn lifecycle:**

- A turn starts when the agent receives input (user message, workflow dispatch, or agent call)
- The turn stays `active` while the agent has pending async operations
- Agent messages accumulate on the turn as work completes
- The turn becomes `completed` when there's no pending work and the agent has responded
- Memory extraction runs when the turn completes

**Parallel turns:** Multiple turns can be active simultaneously. User asks for research (turn A), then asks an unrelated question (turn B) while research is running. Turn B completes quickly. Turn A stays active until its async work finishes. Each turn is a logically independent execution context.

**Threading with `reply_to`:** Users can reply to a specific agent message. The new turn carries `reply_to_message_id`, giving the agent context about what the user is responding to. This enables natural threading without forcing it—a plain message starts a new thread, a reply continues one.

Turns are the execution spine. They link the visible dialogue to the underlying workflow runs.

## Message

A message is a **user or agent utterance**. It's what you'd export as a transcript.

| Field             | Purpose                            |
| ----------------- | ---------------------------------- |
| `conversation_id` | Parent conversation                |
| `turn_id`         | Which turn this message belongs to |
| `role`            | `user` or `agent`                  |
| `content`         | The message content                |
| `created_at`      | Timestamp                          |

Each turn has exactly one user message (the trigger) and zero or more agent messages (responses as work completes). The `turn_id` link enables threading—UI can show which agent messages relate to which user input.

**Why separate entities?**

- **Threading**: Group agent messages by the user input that triggered them
- **Querying**: Find all turns where the agent invoked a workflow, or messages mentioning a topic
- **Linking**: Join turns to workflow runs for observability
- **Streaming/pagination**: Load messages incrementally for long conversations
- **Observability**: Turns capture execution details that don't belong in message content

## Context Isolation

Each agent maintains **isolated context by default**. When invoked via `delegate` mode, an agent sees only what was explicitly passed—no conversation history, no implicit context from the caller.

Consider a code development scenario:

- **Architect agent** — Sees requirements, design decisions, component boundaries
- **Developer agent** — Sees current task, relevant constraints, the code
- **Reviewer agent** — Sees code under review, standards, intent

Clean contexts mean each agent sees what's relevant to their role.

**When isolation breaks (intentionally):** The `loop_in` invocation mode explicitly grants conversation access. A looped-in agent becomes a participant and sees shared history. This is a deliberate choice by the caller—isolation is the default, context sharing is opt-in per invocation.

This keeps the common case simple (delegate with explicit input) while enabling richer collaboration when needed (loop in for discussion).

## Agent Invocation

Workflow nodes and other agents can invoke agents. Agent invocation is a **node-level dispatch**, not an action within a task.

| Node executes | Dispatches to  | Mechanism                      |
| ------------- | -------------- | ------------------------------ |
| Task          | Executor       | RPC to stateless worker        |
| Subworkflow   | WorkflowCoordinator  | DO-to-DO, waits for completion |
| Agent         | Conversation | DO-to-DO, waits for response   |

When dispatching to an agent:

- Parent token (or calling agent's turn) enters waiting state
- Conversation runs a turn with the provided input
- Response flows back to parent coordinator or calling agent
- Parent resumes with agent output

### Invocation Modes

How an agent is invoked determines what context it sees and how it participates:

**Delegate mode** (default): The invoked agent runs with clean context—only what was explicitly passed via input. It executes a single turn and returns results to the caller. The agent doesn't join the caller's conversation; it's a one-shot task.

```typescript
{
  targetType: 'agent',
  targetId: 'architect',
  invocationMode: 'delegate',  // default
  input: { question: "Does this violate our API patterns?" }
}
```

**Loop-in mode**: The invoked agent joins the conversation as a participant. It sees the conversation history, can respond multiple times, and stays in the conversation until explicitly removed. Use this when you want collaborative discussion rather than a directed task.

```typescript
{
  targetType: 'agent',
  targetId: 'architect',
  invocationMode: 'loop_in',
  input: { context: "We're discussing the auth redesign" }
}
```

The invocation mode can be set on the tool definition as a default, or overridden per-invocation. The calling agent (or workflow author) decides which mode fits the situation—are you giving orders to a subordinate, or bringing a peer into the room.

**Context access by mode:**

| Mode       | Sees conversation history | Becomes participant | Response destination      |
| ---------- | ------------------------- | ------------------- | ------------------------- |
| `delegate` | No (only explicit input)  | No                  | Caller only               |
| `loop_in`  | Yes                       | Yes                 | Conversation (all see it) |

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

**Choosing invocation modes:** The manager decides per-invocation whether to delegate or loop in:

- **Delegate** to the developer: "Implement this feature according to the spec." The developer works independently and returns results.
- **Loop in** the architect: "We're discussing a significant API change—join us." The architect sees the conversation, participates in the discussion, and stays engaged.
- **Delegate** to the reviewer: "Review this PR." The reviewer provides feedback without needing the full conversation history.

The same specialist agent might be delegated to in one situation and looped in another, depending on what the collaboration requires.

## Reasoning Strategies

Advanced reasoning patterns—tree-of-thought, debate, chain-of-verification—are workflows exposed as tools.

The LLM sees these as tools it can invoke. When a problem warrants deeper reasoning, the agent decides to invoke the appropriate strategy workflow. This keeps the agent loop simple while enabling sophisticated reasoning when needed.

**Influence levels:**

- **Tool description (light):** The workflow's name and description suggest when to use it. "Use for complex multi-step problems requiring exploration."

- **System prompt (medium):** Persona instructions can recommend strategies. "For architectural decisions, consider using the debate workflow to evaluate trade-offs."

- **User instruction (heavy):** Direct user guidance overrides defaults. "Think through this step by step" or "Use tree-of-thought for this problem."

The LLM ultimately decides, but that decision is shaped by these influences. No special primitive is needed—reasoning strategies are workflows, invoked like any other tool.

## Observability

Observability comes from events:

- `conversation_started`, `conversation_turn`, `conversation_ended`
- `workflow_started`, `workflow_completed`, `workflow_failed`
- `agent_call_started`, `agent_call_completed`

## Persistence Model

### D1 Entities

| Entity          | Purpose                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `personas`      | Shareable config — identity, behavior, tools (versioned, lives in libraries) |
| `tools`         | LLM-facing interface — binds name/description/schema to execution target     |
| `agents`        | Instance — persona ref + memory, scoped to projects                          |
| `conversations` | Session — status, accumulated context                                        |
| `turns`         | Execution record — links messages to workflow runs                           |
| `messages`      | Dialogue content — user and agent utterances                                 |
| `workflows`     | Definition — graph (versioned)                                               |
| `tasks`         | Definition — step sequences (versioned)                                      |
| `actions`       | Definition — atomic operations (versioned)                                   |
| `events`        | Execution log — full history                                                 |

### Durable Objects

| DO             | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| WorkflowCoordinator  | Workflow execution — graph traversal, token management, fan-in sync      |
| Conversation | Conversation handling — agent loop, WebSocket streaming, turn management |

## Context Assembly and Memory Extraction

These processes are **workflows**. With Workers RPC, workflow overhead is ~10-25ms per invocation—negligible against LLM latency of 500-2000ms.

Each persona references:

- `context_assembly_workflow_id` — invoked at the start of each turn
- `memory_extraction_workflow_id` — invoked at the end of each turn

Conversation dispatches these workflows to Executor, passing `agent_id` in the execution context so memory operations know which agent's memory to access.

These workflows get the same observability, composition, and versioning as any other workflow.

## Memory

Memory lives on the **Agent**. This is what makes agents "living instances"—they accumulate knowledge across conversations. The Persona defines the schema; the Agent owns the data.

**Memory is the agent's recall abstraction.** During context assembly and reasoning, the agent queries memory—not the Messages table, not the code directly. Memory is what the agent "knows."

### Memory vs Conversation History

Messages and Turns persist to D1 for observability and UI—so users can see transcripts and developers can debug. But the agent doesn't read the Messages table.

Instead, memory extraction decides what the agent remembers. This can include:

- **Turn references** — Pointers to recent turns, queryable by conversation_id and recency
- **Facts** — Distilled understanding extracted from turns
- **Episodes** — Consolidated summaries of past interactions

What counts as a memory is a library decision. The platform provides storage primitives; libraries define memory types and extraction strategies. A simple persona might store every turn as a memory. A sophisticated one might extract facts and discard raw turns after consolidation.

### Significance

Every memory has a `significance` score—an intrinsic measure of how important the memory is, independent of any particular query.

- **Significance** is intrinsic: "How important is this fact, period?"
- **Relevance** is contextual: "How related is this to the current query?"

Both factor into retrieval. Context assembly and memory search combine significance with semantic relevance to rank results. A moderately relevant but high-significance memory may rank above a highly relevant but low-significance one.

The platform provides `significance` as a first-class field in memory metadata. Memory extraction sets it when writing memories. Libraries decide how to weight significance against relevance in their retrieval logic.

### Memory Structure

The platform defines a fixed memory structure. Libraries decide _what_ to remember via extraction workflows and _how to query_ via assembly workflows, but they don't define the shape.

```typescript
interface Memory {
  id: string;
  agent_id: string;
  type: string; // Library-defined taxonomy (e.g., 'fact', 'decision', 'pattern')
  content: string; // Inline content (up to 4KB)
  content_ref?: string; // R2 key for content exceeding 4KB
  significance: number; // Intrinsic importance score
  metadata: Record<string, unknown>; // Flexible structured data
  created_at: string;
  updated_at: string;
}
```

When `content_ref` is set, `content` is empty and the actual content lives in R2. The `memory.read` action abstracts this—callers always get `content` populated, fetched from R2 transparently if needed.

The `type` field is an unconstrained string—libraries define their own taxonomy. A coding assistant might use `pattern`, `decision`, `bug_context`. A research agent might use `source`, `claim`, `contradiction`. The platform indexes on type for efficient queries but doesn't interpret it.

The `metadata` field provides flexibility for structured data without schema versioning. Libraries maintain their own conventions about what goes in metadata.

**Size guidance:** Memories should target ~1KB or less. Well-distilled facts and decisions are typically a few sentences (100-500 bytes). Memories up to 4KB are stored inline in D1; larger content spills to R2. If you're regularly hitting 4KB, consider whether the content belongs in an artifact instead.

### Storage

Memory lives in shared infrastructure, not in any DO's SQLite. This is necessary because:

1. **Executor writes memory** — Memory extraction runs as a workflow dispatched to Executor.
2. **Multiple Conversations** — Many conversations share one agent's memory, so it must be externally accessible.
3. **External queryability** — Memories may need to be queried across agents or from services outside Conversation.

Storage model:

- **D1** — Full memory records (all fields above). Content stored inline for memories under 4KB.
- **Vectorize** — Semantic search over memory content (embeddings generated on write).
- **R2** — Content overflow for memories exceeding 4KB.

The `memory.*` actions abstract storage details. Callers write and read content directly; the platform handles the D1/R2 split transparently based on size.

Memory doesn't use git semantics. Unlike artifacts (which are versioned documents with branching and merge), memories are written once, possibly updated or consolidated later, but not branched or versioned. The `memory.*` actions handle concurrent writes at the storage layer.

**No pruning.** Storage is cheap—D1 rows accumulate indefinitely. Significance governs recall priority, not retention.

The `memory` action kind handles operations atomically:

- `memory.write` — Store content (D1 inline or R2 if large), index metadata in D1, generate embedding in Vectorize
- `memory.search` — Query Vectorize, return matching memory refs
- `memory.read` — Fetch from D1 (transparently fetching from R2 if content_ref is set)

The `agent_id` is passed in execution context when Conversation dispatches memory workflows, so actions know which agent's memories to access.

### Lifecycle

Per-agent retention policies with consolidation:

- **Facts and decisions** persist until explicitly updated or contradicted
- **Episodic memories** consolidate into summaries over time
- Consolidation strategies are library-defined via memory extraction workflows

## Platform vs Library Boundary

The platform provides **dispatch plumbing**. Libraries provide **intelligence**.

**Platform responsibilities:**

- Conversation coordinates the agent loop (receive → decide → dispatch → wait → resume)
- Dispatch to execution targets (Executor for tasks, WorkflowCoordinator for workflows, Conversation for agents)
- Storage primitives (D1 for structured, Vectorize for semantic, R2 for archive)
- Event emission and observability

**Library responsibilities:**

- Context assembly workflows (what to retrieve, how to score, how to filter)
- Memory extraction workflows (what to remember, how to structure, when to consolidate)
- Tool definitions (LLM-facing interface to execution targets)
- Reasoning strategy workflows (tree-of-thought, debate, chain-of-verification)
- Persona definitions (system prompts, tool sets, memory configuration)

The platform calls the workflows the persona specifies. This keeps the platform simple and lets libraries encode domain-specific intelligence.

**Example:** Conversation calls `contextAssemblyWorkflowId` before every LLM call. A library provides `context_assembly_code_assistant_v2` that knows to retrieve recent code changes, relevant design decisions, and similar past conversations. The platform provides the hook; the library provides the strategy.

## Implementation Structure

The agent service follows the same patterns as the coordinator service.

### Service Layout

```
services/agent/
├── src/
│   ├── index.ts              # Conversation extends DurableObject
│   ├── types.ts              # ConversationContext, TurnPayload, TurnResult
│   │
│   ├── operations/           # State managers (DO SQLite only)
│   │   ├── turns.ts          # TurnManager - create, track async ops, link runs
│   │   ├── messages.ts       # MessageManager - append, query recent history
│   │   └── moves.ts          # MoveManager - iteration tracking within turns
│   │
│   ├── dispatch/             # Decision application
│   │   ├── index.ts          # buildConversationContext, dispatch entry
│   │   └── apply.ts          # applyDecisions
│   │
│   ├── streaming/            # WebSocket and LLM streaming
│   │   ├── websocket.ts      # WebSocket connection handling
│   │   └── llm.ts            # Direct LLM calls with streaming
│   │
│   └── planning/             # Decision logic (pure functions)
│       ├── context.ts        # Plan context assembly dispatch
│       ├── tools.ts          # Resolve tool definitions → LLM tool specs
│       ├── response.ts       # Interpret LLM output → decisions
│       └── extraction.ts     # Plan memory extraction dispatch
```

Memory operations (`memory.write`, `memory.read`, `memory.search`) are handled by workflows dispatched to Executor, which access D1/Vectorize/R2 directly. Conversation doesn't manage memory state locally—it dispatches memory extraction workflows and context assembly workflows that handle memory through actions.

### Conversation Class

```typescript
export class Conversation extends DurableObject<Env> {
  // WebSocket handling
  async fetch(request: Request): Promise<Response>; // Upgrades to WebSocket

  // Entry points (initiators)
  async startTurn(params: StartTurnParams): Promise<void>; // User message via WebSocket
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

|                        | `startTurn`                  | `startAgentCall`                             |
| ---------------------- | ---------------------------- | -------------------------------------------- |
| **Caller**             | User via WebSocket           | Parent coordinator or another conversation   |
| **Context**            | Conversation + user message  | Depends on invocation mode                   |
| **Result destination** | Streams to WebSocket client  | Callbacks to parent coordinator/conversation |
| **Conversation**       | Always within a conversation | `delegate`: none. `loop_in`: joins existing  |

For `delegate` mode, the agent sees only explicit input—no conversation context. For `loop_in` mode, the agent joins the caller's conversation as a participant and sees shared history.

### Decision Types

```typescript
type AgentDecision =
  // Turn lifecycle
  | { type: 'START_TURN'; conversationId: string; replyToMessageId?: string }
  | { type: 'COMPLETE_TURN'; turnId: string }
  | { type: 'FAIL_TURN'; turnId: string; error: unknown }

  // Message management
  | { type: 'APPEND_MESSAGE'; turnId: string; role: 'user' | 'agent'; content: string }

  // Capability dispatch (sync tools block, async tools don't)
  | { type: 'DISPATCH_TASK'; turnId: string; taskId: string; input: unknown; async: boolean }
  | {
      type: 'DISPATCH_WORKFLOW';
      turnId: string;
      workflowId: string;
      input: unknown;
      async: boolean;
    }
  | {
      type: 'DISPATCH_AGENT';
      turnId: string;
      agentId: string;
      input: unknown;
      mode: 'delegate' | 'loop_in';
      async: boolean;
    }

  // Async tracking
  | { type: 'TRACK_ASYNC_OPERATION'; turnId: string; operationId: string }
  | { type: 'ASYNC_OPERATION_COMPLETED'; turnId: string; operationId: string; result: unknown }

  // Sync tool waiting
  | { type: 'MARK_WAITING'; turnId: string; operationId: string }
  | { type: 'RESUME_FROM_TOOL'; turnId: string; operationId: string; result: unknown }

  // Memory
  | { type: 'WRITE_MEMORY'; key: string; value: unknown }
  | { type: 'UPDATE_MEMORY'; key: string; value: unknown };
```

### Turn Execution Flow

```
startTurn(conversationId, userMessage, replyToMessageId?)
  │
  ├─ START_TURN (status: active)
  ├─ APPEND_MESSAGE (user)
  │
  ├─ Run context assembly workflow → assembled context
  │   (includes pending async operations from other active turns)
  │
  ├─ Resolve tools from persona.tools.toolIds
  │
  ├─ LLM call with context + tools + history
  │   │
  │   ├─ If sync tool_use → dispatch and wait
  │   │   ├─ DISPATCH_*, MARK_WAITING
  │   │   ├─ (result arrives via callback)
  │   │   ├─ RESUME_FROM_TOOL
  │   │   └─ Continue LLM loop
  │   │
  │   ├─ If async tool_use → dispatch and continue
  │   │   ├─ DISPATCH_* (async: true), TRACK_ASYNC_OPERATION
  │   │   ├─ APPEND_MESSAGE (agent: "I'm working on X...")
  │   │   └─ Continue LLM loop (or end if no more sync work)
  │   │
  │   └─ If text response with no tool calls → agent is done for now
  │
  ├─ If pending async operations → turn stays active, wait for completions
  │
  └─ When async operation completes:
      ├─ ASYNC_OPERATION_COMPLETED
      ├─ LLM call with result in context
      ├─ APPEND_MESSAGE (agent: "Here's what I found...")
      ├─ If no more pending async → run memory extraction, COMPLETE_TURN
      └─ Otherwise → wait for remaining operations
```

**Parallel turns:** Multiple turns can be active simultaneously. Each turn tracks its own pending async operations. Context assembly sees all active turns so the agent has full awareness.

### Parallel to WorkflowCoordinator

| Aspect               | WorkflowCoordinator                           | Conversation                                  |
| -------------------- | --------------------------------------- | ----------------------------------------------- |
| **Instance scope**   | One workflow run                        | One conversation (multiple concurrent turns)    |
| **State management** | Tokens, context, transitions            | Turns, messages, async operations               |
| **Decision driver**  | Graph traversal (deterministic)         | LLM reasoning (non-deterministic)               |
| **Dispatches to**    | Executor, WorkflowCoordinator, Conversation | Executor, WorkflowCoordinator, Conversation         |
| **Callbacks from**   | Executor, child coordinators, agents    | Executor, coordinators, child conversations     |
| **Concurrency**      | Single workflow execution               | Parallel turns, each with sync/async operations |
| **LLM calls**        | Via dispatched tasks                    | Direct (with streaming to client)               |

The core pattern is identical: receive → decide → dispatch → wait → resume. The difference is what drives the "decide" step. Conversation also handles WebSocket connections and makes LLM calls directly for streaming.

### Turn Context and Moves

During a turn, context accumulates with each iteration of the agent loop. Every tool call, result, and reasoning output is recorded. This context must persist across dispatch → wait → resume cycles, so it lives in DO SQLite.

**Recent turns in DO SQLite:** Conversation keeps the last N turns locally (per `recentTurnsLimit`). This enables fast context assembly—no D1 query needed for recent history. Turns are also written to D1 for observability and UI, but the hot path reads from DO SQLite. Older turns roll off locally but persist in D1; if the agent needs something older, it goes through memory or explicit history tools.

The `moves` table records the sequence of events within a turn:

```typescript
interface Move {
  id: string;
  turn_id: string;
  sequence: number; // Order within the turn

  // What happened
  reasoning?: string; // LLM text output (user-facing, streamable)
  tool_call?: {
    tool_id: string;
    input: Record<string, unknown>;
  };
  tool_result?: Record<string, unknown>;

  // For debugging
  raw?: string; // Full LLM response

  created_at: string;
}
```

A move captures one iteration of the loop. The agent might emit reasoning ("Let me search for that..."), invoke a tool, and receive a result—all in one move. Or it might emit reasoning with no tool call, which means the turn is ending.

When the turn completes:

1. All moves become the input to memory extraction (the "turn transcript")
2. The turn record links to these moves for observability
3. The final move's reasoning becomes the agent response stored in the Messages table

## Conversation Lifecycle

Conversations stay open indefinitely by default. The `completed` status is triggered by explicit user action only—no timeouts. An idle conversation costs nothing (just D1 rows), and users may return after days or weeks to continue.

## Shell Operations and Branch Context

When agents invoke tools that execute shell commands, they need repo and branch context. This works the same way as workflows—the agent owns a branch.

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

1. Conversation dispatches to Executor with conversation context (conv_id, repo_id, branch)
2. Executor gets the conversation's ContainerDO (keyed by conv_id)
3. Executor calls `containerDO.exec(command, timeout)`
4. Command executes on the conversation's branch
5. Result returns to Conversation

Container and branch are implicit from conversation context. The ContainerDO stays warm via `sleepAfter` between commands.

### Multiple Conversations

Multiple conversations can operate on the same project concurrently:

```
Project: my-backend
├── wonder/conv-01HABC...   # Conversation A (refactoring auth)
├── wonder/conv-01HDEF...   # Conversation B (adding logging)
└── wonder/conv-01HGHI...   # Conversation C (fixing bugs)
```

Each conversation has isolated work. The agent commits to its branch; merging to main requires explicit user action or workflow completion with merge configured.

### Workflow-Initiated Agent Calls

When a workflow node invokes an agent (one-shot call, no conversation):

- The agent receives the parent workflow's branch context in input
- Shell operations use that branch
- No new branch is created

This allows agents to continue work in progress on a workflow's branch.

## Memory Workflow Contracts

Memory workflows use `memory.*` actions directly. The `agent_id` is provided automatically from execution context when Conversation dispatches these workflows.

### Context Assembly

**Input:**

- `conversation_id` — current conversation
- `user_message` — the triggering message
- `recent_turns` — last N turns from this conversation (from DO SQLite, per `recentTurnsLimit`)
- `model_profile` — resolved model profile (provider, model, parameters)
- `tool_definitions` — resolved tools from persona's `toolIds`

**Output:**

- Provider-native LLM request (e.g., Anthropic messages format, OpenAI chat completion format)

The `recent_turns` input provides raw conversational history without requiring the workflow to query for it. The workflow author decides how to use it—pass through directly, summarize, or ignore.

The workflow uses `memory.search`, `memory.read`, `artifact.search`, etc. to retrieve relevant information, then constructs the complete LLM request. The output goes directly to the `llm` action, which routes to the appropriate provider API based on `model_profile.provider`.

**Multi-provider support:** Libraries can use adapter workflows to translate from an intermediate format. The context assembly workflow builds a provider-agnostic representation, then calls `adapter_anthropic` or `adapter_openai` as a subworkflow to produce the final output. Single-provider libraries can skip this and build provider-native directly.

### Memory Extraction

**Input:**

- `turn_transcript` — what happened (user message, agent response, tool calls, results)

**Output:**

Side effects only—memory updates happen via `memory.write`, `memory.delete` actions during execution.

### Streaming

Conversation handles WebSocket connections and makes LLM calls directly, enabling real-time streaming:

- **WebSocket connection:** Browser clients connect to `/conversations/:id`, which upgrades to a WebSocket handled by Conversation
- **LLM streaming:** Conversation calls the LLM provider directly and streams tokens to the client as they arrive
- **Per-message streaming:** Each agent message streams independently; tool results appear as discrete messages
- **Async interleaving:** When async operations complete, results appear as new messages on the WebSocket, even if another stream is active

This design keeps streaming simple: Conversation owns the client connection and the LLM call, so there's no indirection or callback coordination for the real-time path.

## Error Handling

Errors in agent execution fall into two categories: **infrastructure errors** (transient failures that should retry invisibly) and **business errors** (meaningful failures the agent should reason about).

### Infrastructure vs Business Errors

| Error Type | Examples | Handling |
|------------|----------|----------|
| Infrastructure | Network timeout, rate limit, provider 5xx | Auto-retry with backoff, invisible to agent |
| Business | Tool returned error, agent couldn't complete task, validation failed | Surface to LLM for reasoning |

Infrastructure errors are handled by the platform. Business errors flow back to the agent as tool results with error information.

### Context Assembly Failure

Context assembly runs before every LLM call. On failure:

1. **Retry** — Infrastructure errors retry automatically (max 3 attempts, exponential backoff)
2. **Abort turn** — If retries exhausted, the turn fails with `FAIL_TURN`

No degraded mode. Context assembly is critical—an agent without retrieved context might hallucinate or give harmful answers. If we can't assemble context, we don't proceed.

The user sees an error message and can retry. The failure is logged with full details for debugging.

### Memory Extraction Failure

Memory extraction runs after the turn completes. The user already saw the response. On failure:

1. **Retry** — Infrastructure errors retry automatically (max 3 attempts)
2. **Log and continue** — If retries exhausted, log the failure, mark the turn with `memoryExtractionFailed: true`

Memory extraction failure doesn't retroactively fail the turn. The conversation succeeded from the user's perspective. However:

- The turn metadata records the failure
- Monitoring surfaces repeated extraction failures (indicates systemic issues)
- The agent's memory may have gaps, but this degrades gracefully over time

### Tool Dispatch Failures

When a tool (task, workflow, or agent) fails during execution, the error flows back to the LLM as a tool result:

```typescript
interface ToolResult {
  tool_call_id: string;
  success: boolean;
  result?: unknown;        // Present if success: true
  error?: {                // Present if success: false
    code: ToolErrorCode;
    message: string;
    retriable: boolean;
  };
}

type ToolErrorCode =
  | 'EXECUTION_FAILED'     // Tool ran but failed (task error, workflow failed)
  | 'TIMEOUT'              // Tool exceeded timeout
  | 'NOT_FOUND'            // Tool/workflow/agent doesn't exist
  | 'PERMISSION_DENIED'    // Agent lacks access
  | 'INVALID_INPUT'        // Input didn't match schema
  | 'AGENT_DECLINED'       // Delegated agent couldn't/wouldn't complete
  | 'INTERNAL_ERROR';      // Platform error (should be rare)
```

**Sync tools:** The agent is waiting. When the tool fails, the error appears in the next LLM call's context. The agent reasons about the failure and decides whether to retry, try an alternative, or respond to the user explaining the issue.

**Async tools:** The agent already responded. When the async operation fails:

1. The failure triggers a new LLM call on the same turn (turn is still `active`)
2. The agent sees the error in context
3. The agent posts a follow-up message: "The research I started earlier failed because..."

The agent always learns about async failures—they're never silently dropped.

### Delegated Agent Errors

When Agent A delegates to Agent B:

- A's turn enters `waiting` state
- B executes a turn with the provided input
- B's result (success or failure) flows back as a tool result

Agent errors use `AGENT_DECLINED` or `EXECUTION_FAILED`:

```typescript
// Agent B couldn't complete the task
{
  success: false,
  error: {
    code: 'AGENT_DECLINED',
    message: "I don't have enough context to review this code",
    retriable: false
  }
}

// Agent B crashed
{
  success: false,
  error: {
    code: 'EXECUTION_FAILED',
    message: "Turn failed during execution",
    retriable: true
  }
}
```

Agent A sees these as tool failures and reasons about them. "The reviewer couldn't complete the review—let me provide more context and try again."

### Retry Configuration

Retries are configured at multiple levels:

**Platform defaults (not configurable):**

| Operation | Max Attempts | Backoff | Timeout |
|-----------|--------------|---------|---------|
| Context assembly workflow | 3 | Exponential (100ms, 200ms, 400ms) | 30s |
| Memory extraction workflow | 3 | Exponential (100ms, 200ms, 400ms) | 30s |
| LLM call | 3 | Exponential (500ms, 1s, 2s) | 120s |

**Tool-level (configurable per tool definition):**

```typescript
interface Tool {
  // ... existing fields
  retry?: {
    maxAttempts: number;    // Default: 1 (no retry)
    backoffMs: number;      // Default: 1000
    timeoutMs: number;      // Default: 60000
  };
}
```

Tool retries are for infrastructure errors only. Business errors don't retry—they surface to the agent immediately.

### Turn State Machine

Turns have three terminal states:

| State | Meaning |
|-------|---------|
| `completed` | Turn finished successfully (may have metadata flags for minor issues) |
| `failed` | Turn could not complete (context assembly failed, unrecoverable error) |

The `completed` state can carry metadata about issues that didn't prevent completion:

```typescript
interface Turn {
  // ... existing fields
  status: 'active' | 'completed' | 'failed';
  issues?: {
    memoryExtractionFailed?: boolean;
    toolFailures?: number;  // Count of tools that returned errors
  };
}
```

This keeps the state machine simple (three states) while preserving information about what went wrong.

### Error Events

All errors emit events for observability:

- `turn.failed` — Turn could not complete
- `turn.completed` with `issues` — Turn completed with problems
- `tool.failed` — Tool returned an error (includes error details)
- `context_assembly.failed` — Context assembly couldn't complete
- `memory_extraction.failed` — Memory extraction couldn't complete

Events include full error details, enabling debugging and monitoring for systemic issues.
