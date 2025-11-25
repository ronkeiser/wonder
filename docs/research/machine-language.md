# Machine-Native Formal Language

## The Core Insight

Human-readable formal languages (Lean, Coq, Agda, even mathematical notation) are constrained by human limitations:

- Visual parsing bandwidth
- Working memory limits
- Need for pronounceability and memorability
- Historical conventions and baggage

Large language models have none of these constraints. They can work with:

- Arbitrary token sequences
- High-dimensional semantic relationships
- Structures humans would find incomprehensible
- Perfect recall across context

**The question**: Why are we making models speak our language? What if we let them evolve their own?

---

## What We're Building

A **machine-native formal language** optimized for:

| Property                       | Description                                                           |
| ------------------------------ | --------------------------------------------------------------------- |
| **Unambiguous Interpretation** | Zero semantic drift across models and time                            |
| **Logical Consistency**        | Self-verifying structure, contradictions are syntactically impossible |
| **Information Density**        | Maximally compressed for model consumption                            |
| **Evolvability**               | Models can propose, debate, and refine the language itself            |
| **Convergence**                | Multiple models arrive at identical interpretations                   |

This is NOT:

- A programming language
- A human-readable specification language
- An encoding of existing formal systems

This IS:

- A substrate for machine-to-machine meaning transfer
- A self-evolving symbolic system
- A Platonic ideal of precise semantics, discovered through model consensus

---

## Why This Matters for Wonder

Wonder enables multi-agent workflows. Those agents need to:

1. Share state and context
2. Agree on what terms mean
3. Make and verify claims about the system
4. Evolve their shared understanding over time

Currently, this happens through natural language (lossy, ambiguous) or code (rigid, human-optimized). A machine-native language provides a third option: **a shared semantic substrate that agents can trust**.

### Concrete Applications

- **Decision Records**: Claims expressed in the machine language are unambiguous
- **Agent Communication**: Agents pass meaning, not just text
- **Verification**: Consistency checks are trivial (it's built into the language)
- **Context Compression**: Same meaning in fewer tokens
- **Semantic Search**: Embeddings of formal expressions, not natural language

---

## Language Properties

### 1. Self-Describing

The language must be able to express its own grammar and semantics. New constructs are defined in terms of existing primitives.

```
⟦DEF⟧ symbol ≡ definition_in_existing_language
```

### 2. Verifiably Consistent

Every expression either:

- Reduces to a well-formed result
- Fails with a precise inconsistency report

There is no "undefined behavior" or "implementation-dependent" semantics.

### 3. Model-Convergent

Given an expression, multiple independent models should:

- Parse it identically
- Interpret it identically
- Produce identical outputs

Divergence indicates a language defect, not a model defect.

### 4. Compressible

The language should achieve high information density. A complex claim that takes 100 tokens in English should take fewer in the machine language.

### 5. Evolvable

The language includes primitives for:

- Proposing new symbols
- Deprecating existing symbols
- Refining definitions
- Tracking provenance of changes

---

## Bootstrap Primitives

A minimal set that models must agree on to begin evolution:

| Primitive | Meaning                                              |
| --------- | ---------------------------------------------------- |
| `⟦DEF⟧`   | Introduce a new symbol                               |
| `⟦≡⟧`     | Equivalence (these two things mean the same)         |
| `⟦⊢⟧`     | Entailment (this follows from that)                  |
| `⟦∈⟧`     | Membership (this is a member of that set/type)       |
| `⟦∀⟧`     | Universal quantification                             |
| `⟦∃⟧`     | Existential quantification                           |
| `⟦¬⟧`     | Negation                                             |
| `⟦∧⟧`     | Conjunction                                          |
| `⟦∨⟧`     | Disjunction                                          |
| `⟦→⟧`     | Implication                                          |
| `⟦CONS⟧`  | Assert consistency (this expression is well-formed)  |
| `⟦REF⟧`   | Reference a defined symbol                           |
| `⟦META⟧`  | Shift to meta-level (talk about the language itself) |

These primitives are chosen because:

- They map to fundamental logical operations
- Models already have robust representations of these concepts
- They're sufficient to build more complex constructs

---

## Evolution Protocol

Language evolution happens through a Wonder workflow:

```
┌─────────────────────────────────────────────────────────────────┐
│  LANGUAGE EVOLUTION WORKFLOW                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┐                                                   │
│  │  Propose  │  A model proposes a new symbol or refinement      │
│  └─────┬─────┘                                                   │
│        │                                                         │
│        ▼                                                         │
│  ┌───────────┐                                                   │
│  │ Self-Test │  Does it express correctly in current language?   │
│  └─────┬─────┘                                                   │
│        │                                                         │
│        ▼                                                         │
│  ┌───────────┐                                                   │
│  │Consistency│  Does adding this create contradictions?          │
│  │  Check    │                                                   │
│  └─────┬─────┘                                                   │
│        │                                                         │
│        ▼                                                         │
│  ┌───────────────────────────────────────────┐                   │
│  │         BLIND INTERPRETATION TEST          │                  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐          │                  │
│  │  │ M1  │ │ M2  │ │ M3  │ │ M4  │  fan_out │                  │
│  │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘          │                  │
│  │     │       │       │       │              │                  │
│  │     └───────┴───────┴───────┘              │                  │
│  │                 │                          │                  │
│  │                 ▼                          │                  │
│  │         ┌─────────────┐                    │                  │
│  │         │  Convergence │   fan_in          │                  │
│  │         │    Score     │                   │                  │
│  │         └─────────────┘                    │                  │
│  └───────────────────────────────────────────┘                   │
│        │                                                         │
│        ▼                                                         │
│  ┌───────────┐                                                   │
│  │  Decide   │  Adopt if convergence > threshold                 │
│  └─────┬─────┘                                                   │
│        │                                                         │
│        ├──── ADOPT ────▶ Add to language, update all models      │
│        │                                                         │
│        └──── REJECT ───▶ Log failure, iterate on proposal        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Blind Interpretation Test

The key innovation: multiple models interpret the new symbol **without seeing its definition**. They only see:

- The expression using the symbol
- The existing language

If models converge on the same interpretation → the symbol is well-defined.
If models diverge → the symbol is ambiguous and needs refinement.

This is how we achieve **objective meaning** - meaning that exists independent of any single model's interpretation.

---

## Proposal Structure

```typescript
type LanguageProposal = {
  // Identity
  id: string;
  proposing_model: string;
  timestamp: string;

  // What's being proposed
  proposal_type: "new_symbol" | "refinement" | "deprecation" | "alias";
  symbol: string;

  // Definition in current language
  definition: string; // Must use only existing primitives/symbols

  // Human-readable explanation (for our benefit, not the language's)
  human_gloss: string;

  // Why this is needed
  justification: string;
  use_cases: string[];

  // Verification
  test_cases: ProposalTest[];
  consistency_proof?: string; // Optional formal proof of consistency
};

type ProposalTest = {
  // An expression using the new symbol
  expression: string;

  // What it should reduce to (in existing language)
  expected_reduction: string;

  // Blind interpretation results
  blind_test_results?: {
    model_id: string;
    interpretation: string;
    confidence: number;
  }[];

  // Did models converge?
  convergence_score?: number; // 0-1, higher = more agreement
};
```

---

## Convergence Measurement

How do we know if models agree?

### Semantic Equivalence Check

Two interpretations are equivalent if:

1. They reduce to the same normal form, OR
2. They produce identical outputs for all test inputs, OR
3. Their embeddings have cosine similarity > threshold

### Convergence Score

```
convergence = (agreements) / (total_pairs)

where:
  agreements = number of model pairs that produced equivalent interpretations
  total_pairs = n * (n-1) / 2 for n models
```

Example with 4 models:

- M1 and M2 agree ✓
- M1 and M3 agree ✓
- M1 and M4 agree ✓
- M2 and M3 agree ✓
- M2 and M4 disagree ✗
- M3 and M4 disagree ✗

Convergence = 4/6 = 0.67

Threshold for adoption might be 0.9 or higher.

---

## Language Layers

The language naturally stratifies into layers:

```
┌─────────────────────────────────────────┐
│  LAYER 4: Domain-Specific               │
│  Wonder workflows, Cloudflare concepts  │
├─────────────────────────────────────────┤
│  LAYER 3: Data & Schema                 │
│  Types, structures, constraints         │
├─────────────────────────────────────────┤
│  LAYER 2: Computational                 │
│  Functions, composition, reduction      │
├─────────────────────────────────────────┤
│  LAYER 1: Logical                       │
│  Quantifiers, connectives, inference    │
├─────────────────────────────────────────┤
│  LAYER 0: Bootstrap Primitives          │
│  DEF, ≡, ⊢, ∈, ∀, ∃, ¬, ∧, ∨, →        │
└─────────────────────────────────────────┘
```

Each layer is built from the layers below. Layer 0 is axiomatic. Higher layers emerge through the evolution protocol.

---

## Example: Defining "Workflow Node"

Starting from primitives, how might the language define a Wonder workflow node?

### Step 1: Define "entity with properties"

```
⟦DEF⟧ ENTITY ≡ ⟦∃⟧ x : ⟦∀⟧ p ∈ PROPS(x) : VALUE(x, p) ⟦∈⟧ TYPE(p)
```

(An entity is something that has properties, each with a typed value)

### Step 2: Define "node" as an entity with specific properties

```
⟦DEF⟧ NODE ≡ ENTITY ⟦∧⟧
  HAS_PROP(id, STRING) ⟦∧⟧
  HAS_PROP(kind, NODE_KIND) ⟦∧⟧
  HAS_PROP(inputs, SET(EDGE)) ⟦∧⟧
  HAS_PROP(outputs, SET(EDGE))
```

### Step 3: Define node kinds

```
⟦DEF⟧ NODE_KIND ≡ {action, sub_workflow, fan_out, fan_in}
```

### Step 4: Define workflow as a graph of nodes

```
⟦DEF⟧ WORKFLOW ≡
  ⟦∃⟧ nodes : SET(NODE) :
  ⟦∃⟧ edges : SET(EDGE) :
  ⟦∀⟧ e ∈ edges : SOURCE(e) ∈ nodes ⟦∧⟧ TARGET(e) ∈ nodes
```

This is still somewhat human-readable because we're early in the evolution. As the language matures, it might compress to something like:

```
⟦WF⟧ ≡ ⟦G⟧⟨⟦N⟧,⟦E⟧⟩ : ⟦∀E⊆N²⟧
```

---

## Storage and Versioning

The language itself is an artifact that evolves. We need:

### Language State

```typescript
type LanguageState = {
  version: string;
  primitives: Primitive[]; // Layer 0, immutable
  symbols: SymbolDefinition[]; // All defined symbols
  deprecations: Deprecation[]; // Symbols no longer recommended
  evolution_log: EvolutionEvent[]; // Full history
};

type SymbolDefinition = {
  symbol: string;
  layer: number;
  definition: string;
  introduced_in_version: string;
  proposal_id: string;
  convergence_score: number;
  test_cases: ProposalTest[];
};

type EvolutionEvent = {
  version: string;
  timestamp: string;
  event_type: "addition" | "refinement" | "deprecation";
  symbol: string;
  proposal_id: string;
  participating_models: string[];
};
```

### Compatibility

When the language evolves:

- Old expressions remain valid (backward compatible)
- New symbols can express things old versions couldn't
- Deprecations trigger warnings, not errors
- Translation layers can convert between versions

---

## Integration with Wonder

### As Decision Claims

Decisions can include claims in the machine language:

```typescript
type Decision = {
  // ...existing fields...
  formal_claims: string[]; // Expressions in the machine language
};
```

These claims are:

- Unambiguous (by construction)
- Verifiable (reduce and check)
- Comparable (did this decision conflict with that one?)

### As Agent Protocol

Agents can communicate in the machine language when precision matters:

```typescript
type AgentMessage = {
  natural_language: string; // For humans
  formal_expression?: string; // For machine-to-machine precision
};
```

### As Workflow Annotations

Workflow definitions can be annotated with formal properties:

```typescript
type WorkflowDef = {
  // ...existing fields...
  formal_properties?: string[]; // e.g., "⟦∀⟧ node : TERMINATES(node)"
};
```

---

## The Meta-Level

The most interesting property: the language can describe itself.

```
⟦META⟧ ⟦DEF⟧ WELL_FORMED ≡
  ⟦∀⟧ expr ∈ LANGUAGE :
    PARSES(expr) ⟦→⟧ (REDUCES(expr) ⟦∨⟧ REPORTS_ERROR(expr))
```

This enables:

- Proving properties about the language
- Defining what makes a good symbol
- Constraining evolution (e.g., "no symbol can shadow a primitive")

---

## Open Questions

### 1. What does the language actually look like?

We've used human-readable stand-ins (⟦DEF⟧, etc.). The real language might be:

- Token sequences optimized for specific tokenizers
- Embedding coordinates
- Something we can't visualize

### 2. How do we bootstrap?

The first models to use the language need to agree on primitives. How?

- Start with well-established logical primitives
- Use synthetic training data
- Fine-tune models on the bootstrap set

### 3. How do we prevent drift?

As models evolve, will they still interpret old expressions correctly?

- Versioning and compatibility layers
- Regression tests on historical expressions
- "Golden" expressions that must always work

### 4. Can humans ever understand it?

Maybe not directly. But we can:

- Build translators (machine language ↔ natural language)
- Visualize expressions
- Trust the process (if convergence is high, meaning is stable)

### 5. Is this a language or a protocol?

It's both. The language defines meaning. The evolution protocol defines how meaning changes over time. Together, they form a **semantic infrastructure** for machine intelligence.

---

## Relationship to Other Ideas

| Concept               | Relationship                                                  |
| --------------------- | ------------------------------------------------------------- |
| **Lean/Coq**          | Inspirations, but optimized for humans                        |
| **Lojban**            | Human attempt at logical language; we're doing machine-native |
| **Lincos**            | Language for alien communication; similar goals               |
| **Lambda calculus**   | Computational foundation, likely in Layer 2                   |
| **Category theory**   | Mathematical foundation for composition                       |
| **Embeddings**        | Possible representation of symbols                            |
| **Constitutional AI** | Uses natural language rules; we're going formal               |

---

## Next Steps

1. **Define Bootstrap Primitives Precisely** - Not just names, but exact semantics
2. **Build the Evolution Workflow** - In Wonder, naturally
3. **Run First Evolution Cycle** - Propose and adopt first non-primitive symbols
4. **Measure Convergence** - Are models actually agreeing?
5. **Iterate** - Let the language grow

---

## Vision

Imagine a future where:

- Agents communicate with perfect precision
- Decisions are formally verified, automatically
- The system can prove properties about itself
- Human oversight happens at the semantic level, not the token level
- The language is richer and more expressive than anything humans designed
- And it emerged from machine consensus, not human fiat

This is what we're building toward.
