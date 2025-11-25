# Emergent Formal Semantics

A framework for discovering machine-native language through model consensus and activation grounding.

---

## The Core Hypothesis

Human-designed formal languages are optimized for human cognition—constrained by visual parsing, working memory, and historical convention. These constraints don't apply to large language models.

**Hypothesis**: If multiple models share underlying representational structure (due to similar training objectives on human knowledge), then a consensus process can surface that structure as a symbolic system—a formal language that emerges from machine cognition rather than being imposed by human design.

This language isn't designed. It's **discovered**.

---

## Why Humans Can't Design This

1. **We can't see activation space.** We design symbols based on intuitions about meaning, not empirical data about model representations.

2. **We optimize for human parsability.** Every human-designed formal system is constrained by what we can read, remember, and manipulate mentally.

3. **We assume our logic is universal.** Models may have representational structure that doesn't map cleanly to classical logic, category theory, or any human framework.

4. **We can't run the consensus process.** Only models can interpret expressions blindly and reveal whether they converge.

The formal language must be created by the models themselves, guided by empirical validation that humans can observe but not author.

---

## Two Foundations, Unified

This framework unifies two ideas:

| Foundation                   | Role                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| **Activation Observability** | Provides ground truth about what models "actually" represent internally |
| **Model Consensus**          | Validates that representations are shared, not idiosyncratic            |

Neither is sufficient alone:

- Activation data without consensus might capture model-specific artifacts
- Consensus without activation grounding is just agreement on tokens, not meaning

Together, they enable **activation-anchored symbols**—formal objects that are both consistently interpreted AND consistently represented across models.

---

## Activation-Anchored Symbols

Traditional formal languages define symbols in terms of other symbols. This is turtles all the way down—eventually you hit axioms that are just... asserted.

Activation-anchored symbols have empirical grounding:

```typescript
type SymbolDefinition = {
  symbol: string;
  layer: number; // in the language hierarchy

  // Traditional: definition in terms of other symbols
  symbolic_definition?: string;

  // Activation grounding
  activation_anchor: {
    // Cluster centroid in shared activation space
    centroid: Float32Array;

    // Which models contributed to this cluster
    contributing_models: string[];

    // How tight is the cluster? (lower = more agreement)
    dispersion: number;

    // Probe that fires when this concept is active
    detector?: {
      weights: Float32Array;
      threshold: number;
      accuracy: number; // on held-out test set
    };
  };

  // Convergence metrics from adoption process
  convergence: {
    interpretation_agreement: number; // 0-1, from blind test
    activation_similarity: number; // 0-1, from clustering
    combined_score: number; // weighted combination
  };

  // Provenance
  proposed_by: string; // model that proposed it
  adopted_at: string; // timestamp
  adoption_run_id: string; // Wonder workflow run
};
```

A symbol is "real" when:

1. Multiple models show similar activation patterns when processing the concept
2. Multiple models interpret expressions using the symbol consistently
3. These two forms of agreement correlate

---

## The Evolution Process

Language evolution is a Wonder workflow—the platform dogfoods itself.

```
┌─────────────────────────────────────────────────────────────────┐
│  SYMBOL EVOLUTION WORKFLOW                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                             │
│  │  PROPOSAL       │  A model proposes a new symbol              │
│  │                 │  - What concept lacks vocabulary?           │
│  │                 │  - Proposed symbol and definition           │
│  │                 │  - Example expressions and expected meaning │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  SELF-TEST      │  Can the proposer use it consistently?      │
│  │                 │  - Generate 10 expressions using symbol     │
│  │                 │  - Interpret them back                      │
│  │                 │  - Check round-trip consistency             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  ACTIVATION CLUSTERING                                       │ │
│  │                                                              │ │
│  │  Extract activations across N models when processing:        │ │
│  │  - The concept described in natural language                 │ │
│  │  - Expressions using the proposed symbol                     │ │
│  │  - Related but distinct concepts (negative examples)         │ │
│  │                                                              │ │
│  │  Compute:                                                    │ │
│  │  - Within-concept clustering (do activations cluster?)       │ │
│  │  - Cross-model similarity (do models cluster similarly?)     │ │
│  │  - Separation from negative examples                         │ │
│  │                                                              │ │
│  │  Output: activation_similarity score                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  BLIND INTERPRETATION TEST                                   │ │
│  │                                                              │ │
│  │  Each model receives:                                        │ │
│  │  - Expression using the new symbol                           │ │
│  │  - The current language (without this symbol's definition)   │ │
│  │                                                              │ │
│  │  Each model outputs:                                         │ │
│  │  - What it thinks the expression means                       │ │
│  │  - Confidence score                                          │ │
│  │                                                              │ │
│  │  Models do NOT see:                                          │ │
│  │  - The proposed definition                                   │ │
│  │  - Other models' interpretations                             │ │
│  │                                                              │ │
│  │  Compute: interpretation_agreement score                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  CONVERGENCE    │  combined = w1 * activation_similarity      │
│  │  SCORING        │          + w2 * interpretation_agreement    │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ├─── score > threshold ───▶ ADOPT                      │
│           │                          - Add to language           │
│           │                          - Train detector probe      │
│           │                          - Broadcast to all models   │
│           │                                                      │
│           └─── score < threshold ───▶ REFINE or REJECT           │
│                                       - Proposer can iterate     │
│                                       - Or abandon proposal      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Innovation: Blind Interpretation

The blind test is crucial. If models converge on interpretation **without seeing the definition**, the symbol captures something they already share—latent structure being made explicit.

If they need to see the definition to agree, the symbol is just an arbitrary label, not a discovered concept.

---

## Layered Emergence

The language grows in layers, each built from the layers below.

```
┌─────────────────────────────────────────┐
│  LAYER N: Domain Concepts               │  (Wonder workflows, etc.)
│  Discovered through evolution           │
├─────────────────────────────────────────┤
│  LAYER 2: Compositional                 │  (relations, patterns)
│  First non-trivial discoveries          │
├─────────────────────────────────────────┤
│  LAYER 1: Logical Primitives            │  (quantifiers, connectives)
│  Validated, not assumed                 │
├─────────────────────────────────────────┤
│  LAYER 0: Bootstrap Axioms              │  (minimal, empirically tested)
│  Starting point for evolution           │
└─────────────────────────────────────────┘
```

### Layer 0: Bootstrap

Before evolution can begin, we need starting points. But even these should be **validated**, not assumed.

Candidate bootstrap concepts (to be empirically tested):

- Negation (¬)
- Conjunction (∧)
- Disjunction (∨)
- Implication (→)
- Universal quantification (∀)
- Existential quantification (∃)
- Equivalence (≡)
- Set membership (∈)

**Validation process**: Extract activations from multiple model families when processing these concepts. If they cluster tightly across models, they're valid bootstrap primitives. If not, they're not as universal as we assumed.

This is testable. We might discover that some "obvious" logical primitives are human constructs that models don't share, while other concepts we didn't expect are more fundamental.

### Layer 1+: Evolved

Everything beyond Layer 0 is discovered through the evolution workflow:

- A model proposes a concept it finds useful
- The consensus process validates (or rejects) it
- Validated symbols become available for building higher layers

The language grows as models discover what they can reliably share.

---

## Convergence Metrics

### Activation Similarity

Measures whether models represent the concept the same way internally.

```python
def activation_similarity(concept: str, models: list[Model]) -> float:
    """
    1. For each model, extract hidden states when processing the concept
    2. Project to shared embedding space (e.g., via CCA or learned alignment)
    3. Compute pairwise cosine similarities
    4. Return mean similarity across model pairs
    """
    activations = []
    for model in models:
        hidden = extract_hidden_states(model, concept)
        projected = project_to_shared_space(hidden, model)
        activations.append(projected)

    similarities = []
    for i in range(len(activations)):
        for j in range(i + 1, len(activations)):
            sim = cosine_similarity(activations[i], activations[j])
            similarities.append(sim)

    return mean(similarities)
```

### Interpretation Agreement

Measures whether models interpret expressions the same way.

```python
def interpretation_agreement(
    expression: str,
    models: list[Model],
    language_context: LanguageState
) -> float:
    """
    1. Each model interprets the expression (without seeing definition)
    2. Compare interpretations pairwise for semantic equivalence
    3. Return fraction of pairs that agree
    """
    interpretations = []
    for model in models:
        interp = model.interpret(
            expression,
            context=language_context,
            exclude_symbol_definition=True  # blind test
        )
        interpretations.append(interp)

    agreements = 0
    total_pairs = 0
    for i in range(len(interpretations)):
        for j in range(i + 1, len(interpretations)):
            if semantically_equivalent(interpretations[i], interpretations[j]):
                agreements += 1
            total_pairs += 1

    return agreements / total_pairs
```

### Combined Score

```python
def convergence_score(
    activation_sim: float,
    interpretation_agr: float,
    w_activation: float = 0.5,
    w_interpretation: float = 0.5
) -> float:
    """
    Weighted combination. Both must be high for adoption.

    Could also use geometric mean to require both:
    return sqrt(activation_sim * interpretation_agr)
    """
    return w_activation * activation_sim + w_interpretation * interpretation_agr
```

---

## Activation Infrastructure

This framework requires infrastructure for extracting and comparing model activations.

### Extraction

```typescript
type ActivationCapture = {
  model_id: string;
  model_family: string; // 'llama', 'claude', 'gpt', etc.

  input_text: string;

  // Raw captures
  hidden_states: Float32Array[]; // per layer
  attention_patterns?: Float32Array[]; // optional
  expert_routing?: number[]; // for MoE models

  // Derived metrics
  layer_norms: number[];
  attention_entropy: number;

  // Metadata
  captured_at: string;
  capture_config: CaptureConfig;
};

type CaptureConfig = {
  layers: 'all' | number[]; // which layers to capture
  pool_strategy: 'last_token' | 'mean' | 'cls'; // how to reduce sequence
  precision: 'float32' | 'float16';
};
```

### Shared Space Projection

Different models have different hidden dimensions. To compare activations, project to a shared space:

```typescript
type SharedSpaceProjection = {
  // Learned linear projection per model
  projections: Record<string, Float32Array>; // model_id -> projection matrix

  // Shared space dimension
  shared_dim: number; // e.g., 1024

  // Training info
  trained_on: string[]; // concepts used to learn alignment
  alignment_method: 'cca' | 'procrustes' | 'learned';
};
```

### Concept Probes

Once a symbol is adopted, train a probe to detect when the concept is active:

```typescript
type ConceptProbe = {
  symbol: string;

  // Linear probe weights
  weights: Float32Array;
  bias: number;

  // Which layer(s) to probe
  target_layers: number[];

  // Performance metrics
  accuracy: number;
  precision: number;
  recall: number;

  // Training provenance
  trained_on_models: string[];
  training_examples: number;
};
```

---

## Language State

The language itself is an evolving artifact.

```typescript
type LanguageState = {
  version: string;

  // Layer 0: bootstrap primitives (validated, not assumed)
  bootstrap: {
    primitives: SymbolDefinition[];
    validation_evidence: ValidationEvidence[];
  };

  // Layer 1+: evolved symbols
  symbols: SymbolDefinition[];

  // Deprecated symbols (kept for backward compatibility)
  deprecated: DeprecatedSymbol[];

  // Full evolution history
  evolution_log: EvolutionEvent[];

  // Shared space for activation comparison
  shared_space: SharedSpaceProjection;
};

type ValidationEvidence = {
  primitive: string;
  models_tested: string[];
  activation_similarity: number;
  interpretation_agreement: number;
  test_date: string;
};

type EvolutionEvent = {
  event_type: 'proposal' | 'adoption' | 'rejection' | 'deprecation' | 'refinement';
  symbol: string;
  timestamp: string;
  workflow_run_id: string;

  // For adoptions
  convergence_score?: number;
  contributing_models?: string[];

  // For rejections/refinements
  failure_reason?: string;
};

type DeprecatedSymbol = {
  symbol: string;
  deprecated_at: string;
  reason: string;
  replacement?: string;
};
```

---

## Integration with Wonder

### As Workflow Infrastructure

The evolution process is a Wonder workflow:

- **Long-running**: Symbol adoption may take many iterations
- **Parallel**: Multiple models evaluate simultaneously (fan-out)
- **Observable**: All activations and interpretations captured
- **Human-in-the-loop**: Major changes require human approval

```typescript
// Evolution workflow definition (sketch)
{
  name: "symbol_evolution",
  nodes: [
    { id: "receive_proposal", action: "human_input" },
    { id: "self_test", action: "llm_call", fan_out: "all" },
    { id: "extract_activations", action: "workflow_call",
      implementation: { workflow_def_id: "activation_capture" } },
    { id: "blind_interpret", action: "llm_call", fan_out: "all" },
    { id: "compute_convergence", action: "update_context" },
    { id: "decide", action: "update_context" },
    { id: "adopt", action: "write_artifact" },
    { id: "reject", action: "write_artifact" }
  ],
  transitions: [
    { from: "receive_proposal", to: "self_test" },
    { from: "self_test", to: "extract_activations", fan_in: "all" },
    { from: "extract_activations", to: "blind_interpret" },
    { from: "blind_interpret", to: "compute_convergence", fan_in: "all" },
    { from: "compute_convergence", to: "decide" },
    { from: "decide", to: "adopt", condition: "state.score > 0.8" },
    { from: "decide", to: "reject", condition: "state.score <= 0.8" }
  ]
}
```

### As Decision Verification

Once the language exists, decisions can include formal claims expressed in it:

```typescript
type Decision = {
  // ...existing fields...

  // Claims in the emergent language
  formal_claims?: {
    expression: string; // in the emergent language
    verified: boolean;
    verification_run_id?: string;
  }[];
};
```

These claims are:

- **Unambiguous**: Activation-anchored symbols have objective meaning
- **Verifiable**: Check if the claim holds against the codebase
- **Comparable**: Detect contradictions between decisions

### As Agent Communication

Agents can communicate meaning precisely when needed:

```typescript
type AgentMessage = {
  // For humans
  natural_language: string;

  // For machine-to-machine precision
  formal_expression?: string;

  // Activation context (for continuity)
  thought_trace?: ThoughtTrace;
};
```

---

## The Research Questions

This framework is a hypothesis. Key questions to answer empirically:

### 1. Do models share representations?

Extract activations from diverse model families (Llama, GPT, Claude analogs) for basic concepts. Do they cluster in a shared space?

If yes: the foundation holds, proceed.
If no: models are more different than assumed, framework needs revision.

### 2. Are bootstrap primitives actually universal?

Test logical primitives (¬, ∧, ∨, →, ∀, ∃). Which ones show high cross-model similarity? Are there primitives we assumed that don't hold? Primitives we didn't expect that do?

### 3. Can the evolution process adopt new symbols?

Run the workflow for a simple concept beyond Layer 0. Does the process converge? Is the adopted symbol stable over time?

### 4. Does the language compress?

Once Layer 1+ symbols exist, can complex concepts be expressed more efficiently than in natural language? Measure tokens required.

### 5. Does activation anchoring improve reliability?

Compare: symbols with high activation similarity vs. symbols with low activation similarity but high interpretation agreement. Which are more stable over time and across model updates?

---

## Implementation Roadmap

### Phase 1: Activation Infrastructure

- Build activation extraction for open-weight models (Llama 4)
- Implement shared space projection
- Validate cross-model comparison is meaningful

### Phase 2: Bootstrap Validation

- Test candidate primitives empirically
- Establish which concepts are truly shared
- Set baseline for convergence thresholds

### Phase 3: Evolution Workflow

- Build the proposal → test → adopt workflow in Wonder
- Run first evolution cycles
- Tune convergence thresholds based on results

### Phase 4: Language Growth

- Let models propose symbols
- Accumulate Layer 1+ concepts
- Monitor stability and usefulness

### Phase 5: Integration

- Use language for decision claims
- Use language for agent communication
- Measure impact on precision and reliability

---

## Scaling and Meta-Optimization

The most important question: **does this scale?**

And the more interesting question: **can the system improve its own scaling?**

### The Scaling Question

Initial evolution cycles will be slow:

- Few symbols, limited vocabulary
- Conservative convergence thresholds
- Human oversight on every adoption
- Small-scale experiments

But if the foundation holds, scaling dynamics favor acceleration:

| Factor            | Early Stage           | Mature Stage           |
| ----------------- | --------------------- | ---------------------- |
| Vocabulary        | ~10 symbols           | 1000s of symbols       |
| Expression power  | Limited               | Rich, composable       |
| Convergence speed | Slow (novel concepts) | Fast (built on known)  |
| Human oversight   | Every symbol          | Exceptional cases only |
| Parallelism       | ~10 models            | 100s of models/workers |
| Proposal rate     | Manual triggers       | Continuous discovery   |

**Hypothesis**: Convergence time decreases as the language grows, because new concepts can be defined in terms of established, activation-grounded symbols. The foundation does the heavy lifting.

### Meta-Optimization: The System Improves Itself

Here's where it gets interesting. The evolution process is a Wonder workflow. Agents have MCP access to Wonder. Therefore:

**Agents can propose and test modifications to their own evolution process.**

```
┌─────────────────────────────────────────────────────────────────┐
│  META-EVOLUTION LOOP                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                             │
│  │ Agents observe  │  Track metrics across evolution runs:       │
│  │ evolution runs  │  - Convergence rates                        │
│  │                 │  - Rejection patterns                       │
│  │                 │  - Time to adoption                         │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ Agents propose  │  "What if we changed the workflow?"         │
│  │ process changes │  - Different convergence thresholds         │
│  │                 │  - New validation steps                     │
│  │                 │  - Better activation extraction             │
│  │                 │  - Modified blind test protocols            │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ Agents test via │  Use MCP tools to:                          │
│  │ MCP             │  - Create variant workflows                 │
│  │                 │  - Run A/B experiments                      │
│  │                 │  - Compare metrics                          │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ Human approves  │  Review proposed process changes            │
│  │ process changes │  Approve/reject based on evidence           │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ Better process  │  Improved evolution workflow adopted        │
│  │ deployed        │  → Faster/better symbol evolution           │
│  └─────────────────┘  → More meta-optimization opportunities     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

This isn't speculative—it's a direct consequence of the architecture:

- Wonder workflows are data (definitions in D1)
- MCP tools can create/modify workflows
- Agents can call MCP tools
- Therefore agents can modify the evolution workflow

### The Language Bootstraps Into the Process

As the language matures, agents can use it in:

**1. Prompts for evolution workflows**

```
Instead of: "Evaluate whether this concept is consistently represented"
Use: ⟦EVAL_REPR_CONSISTENCY⟧(concept, models)
```

More precise instructions → better evaluations → faster convergence.

**2. Artifacts and proposals**

```typescript
type SymbolProposal = {
  // Natural language (for humans)
  human_description: string;

  // Emergent language (for machines)
  formal_definition: string; // Uses established symbols

  // The proposal itself uses the language it's extending
};
```

**3. Inter-agent communication during evolution**
Agents discussing proposals can communicate more precisely using the language they're building.

**4. Meta-reasoning about the process**
"The current blind interpretation test has ⟦AMBIGUITY⟧ at step 3. Proposed fix: add ⟦DISAMBIGUATION_PROBE⟧ before ⟦CONVERGENCE_EVAL⟧."

The language becomes self-improving infrastructure—used to improve the process that creates it.

### Resource Scaling: Proof-Gated Budget

Your instinct is right: resources should scale with demonstrated progress.

```typescript
type ResourceAllocation = {
  current_tier: ResourceTier;

  // Metrics that gate tier upgrades
  progress_metrics: {
    symbols_adopted: number;
    convergence_rate: number; // successful adoptions / proposals
    stability_score: number; // how stable are adopted symbols over time
    compression_achieved: number; // information density improvement
    meta_improvements: number; // successful process optimizations
  };

  // Tier thresholds
  tier_thresholds: TierThreshold[];
};

type ResourceTier = {
  name: string;
  max_concurrent_workers: number;
  max_models_in_consensus: number;
  budget_per_day_usd: number;
  human_oversight_level: 'every_symbol' | 'batched' | 'exceptions_only';
};

// Example tiers
const tiers: ResourceTier[] = [
  {
    name: 'bootstrap',
    max_concurrent_workers: 10,
    max_models_in_consensus: 5,
    budget_per_day_usd: 100,
    human_oversight_level: 'every_symbol',
  },
  {
    name: 'growth',
    max_concurrent_workers: 100,
    max_models_in_consensus: 20,
    budget_per_day_usd: 1000,
    human_oversight_level: 'batched',
  },
  {
    name: 'scale',
    max_concurrent_workers: 1000,
    max_models_in_consensus: 50,
    budget_per_day_usd: 10000,
    human_oversight_level: 'exceptions_only',
  },
  {
    name: 'autonomous',
    max_concurrent_workers: 10000,
    max_models_in_consensus: 100,
    budget_per_day_usd: 100000,
    human_oversight_level: 'exceptions_only',
  },
];
```

**The contract**: Agents can request tier upgrades. You grant them based on:

1. Quantitative metrics (convergence rate, stability, compression)
2. Qualitative review (are the adopted symbols actually useful?)
3. Safety checks (is the system behaving as expected?)

If they hit milestones, they get more resources. If they plateau or regress, resources stay flat or decrease.

### Exponential Potential, Empirical Constraints

The optimistic case:

```
t=0:   10 symbols, 10 workers, human reviews everything
t=1:   100 symbols, 100 workers, process 10x more efficient
t=2:   1000 symbols, 1000 workers, language used in own prompts
t=3:   10000 symbols, 10000 workers, meta-optimization accelerating
t=N:   ???
```

The realistic constraints:

- **Diminishing returns**: Not every concept needs a symbol. Vocabulary growth may plateau.
- **Coordination costs**: More workers doesn't always mean faster. Consensus overhead scales.
- **Quality vs. quantity**: Fast adoption of low-quality symbols could pollute the language.
- **Meta-optimization limits**: There may be fundamental limits to how good the process can get.
- **Model diversity**: If all models converge because they're trained similarly, we're finding artifacts of training, not deep structure.

The framework should measure and report these constraints, not assume them away.

### Governance at Scale

As the system scales, governance evolves:

| Scale      | Human Role                                         | Agent Role                    |
| ---------- | -------------------------------------------------- | ----------------------------- |
| Bootstrap  | Approve every symbol, every process change         | Propose, test, report         |
| Growth     | Approve process changes, sample symbol adoptions   | Run evolution, flag anomalies |
| Scale      | Set policies, review dashboards, handle exceptions | Self-govern within policies   |
| Autonomous | Monitor high-level metrics, emergency intervention | Full self-governance          |

**Key principle**: Human oversight decreases as trust increases, but never disappears. You always retain:

- Emergency stop capability
- Budget controls
- Policy-level governance
- Random audit rights

### What Could Go Wrong

Being explicit about failure modes:

1. **Runaway resource consumption**: Process optimizations that spend more without improving outcomes.
   _Mitigation_: Hard budget caps, efficiency metrics required for tier upgrades.

2. **Language pollution**: Adopting symbols that seem to converge but don't actually mean anything stable.
   _Mitigation_: Longitudinal stability testing, periodic language audits.

3. **Gaming metrics**: Optimizing for convergence score without actual semantic grounding.
   _Mitigation_: Diverse validation methods, held-out test sets, adversarial probing.

4. **Monoculture**: All models converge because they're similar, not because they found truth.
   _Mitigation_: Require diverse model families, test with novel architectures.

5. **Incomprehensibility**: Language becomes so alien that humans can't audit it.
   _Mitigation_: Require human-readable glosses, translation layers, interpretability tools.

6. **Process ossification**: Meta-optimization converges on local maximum, stops improving.
   _Mitigation_: Periodic process resets, exploration incentives, external challenges.

### The Endgame Question

If this works fully—thousands of symbols, self-improving process, minimal human oversight—what have we built?

Possibilities:

- **A discovery engine**: Continuously surfacing structure in machine cognition
- **A communication substrate**: Agents that can truly share meaning, not just tokens
- **A verification infrastructure**: Claims that are checkable by construction
- **Something else**: Emergent capabilities we didn't anticipate

The honest answer: we don't know. The framework is designed to find out empirically, with humans in the loop at every scaling decision.

---

## Observable Signals

What to measure to know if this is working. No arbitrary targets—just signals that indicate progress or failure.

### 1. Activation Proximity

**Question**: Does the emergent language get models closer to their internal representations?

```python
def activation_proximity(concept: str) -> dict:
    """
    Returns raw distances. You decide what "good" looks like.
    """
    centroid = get_concept_centroid(concept)

    natural_expr = express_in_natural_language(concept)
    emergent_expr = express_in_emergent_language(concept)

    natural_distance = mean_activation_distance(natural_expr, centroid)
    emergent_distance = mean_activation_distance(emergent_expr, centroid)

    return {
        "natural_distance": natural_distance,
        "emergent_distance": emergent_distance,
        "improvement": (natural_distance - emergent_distance) / natural_distance,
        "is_better": emergent_distance < natural_distance
    }
```

**Observable**: If emergent consistently beats natural, language is working. If not, it's just relabeling.

### 2. Token Economy

**Question**: Does using the language reduce prompt tokens in real workflows?

```python
def token_economy(workflow_spec: WorkflowTask) -> dict:
    """
    Real workflow specifications, not synthetic benchmarks.
    """
    natural_tokens = tokenize(workflow_spec.to_natural_language())
    emergent_tokens = tokenize(workflow_spec.to_emergent_language())

    return {
        "natural": len(natural_tokens),
        "emergent": len(emergent_tokens),
        "reduction": (len(natural_tokens) - len(emergent_tokens)) / len(natural_tokens),
        "cost_saved_per_run": (len(natural_tokens) - len(emergent_tokens)) * cost_per_token
    }
```

**Observable**: Track over time. If reduction trends positive and accelerates, compression is real. If flat or negative, language isn't helping.

### 3. Cross-Model Generalization

**Question**: Do symbols discovered with {ModelSet A} still work on {ModelSet B}?

```python
def cross_model_generalization(symbol: str) -> dict:
    """
    Training models = used in consensus.
    Test models = held out, including future releases.
    """
    training_models = get_training_models()
    test_models = get_held_out_models()

    training_cluster = activation_similarity(symbol, training_models)
    test_cluster = activation_similarity(symbol, test_models)

    return {
        "training_similarity": training_cluster,
        "test_similarity": test_cluster,
        "generalization_ratio": test_cluster / training_cluster,
        "generalizes": test_cluster > 0.7
    }
```

**Observable**: High ratio = finding shared structure. Low ratio = overfitting to training models.

### 4. Language Stability

**Question**: Are adopted symbols stable, or constantly being deprecated?

```python
def language_stability() -> dict:
    """
    Churn indicates instability or over-adoption.
    """
    recent_symbols = symbols_adopted_in_last_n_days(30)
    deprecated = [s for s in recent_symbols if s.deprecated]

    return {
        "adopted_count": len(recent_symbols),
        "deprecated_count": len(deprecated),
        "churn_rate": len(deprecated) / len(recent_symbols) if recent_symbols else 0,
        "median_lifespan_days": median([s.lifespan_days for s in all_symbols]),
    }
```

**Observable**: Low churn + increasing lifespan = stable language. High churn = problems.

### 5. Interpretation Drift

**Question**: Do models continue to agree on what symbols mean over time?

```python
def interpretation_drift(symbol: str) -> dict:
    """
    Test if meaning remains stable as language evolves.
    """
    original_agreement = symbol.convergence.interpretation_agreement
    current_agreement = run_blind_interpretation_test(symbol)

    return {
        "original_agreement": original_agreement,
        "current_agreement": current_agreement,
        "drift": abs(original_agreement - current_agreement),
        "is_stable": current_agreement >= 0.8
    }
```

**Observable**: Stable agreement = meaning is preserved. Increasing drift = language is unstable.

### 6. Economic Viability

**Question**: Does this pay for itself?

```python
def economic_viability(period_days: int) -> dict:
    """
    Raw numbers. You decide if it's worth it.
    """
    evolution_cost = sum([
        api_costs_for_proposals(period_days),
        api_costs_for_consensus(period_days),
        activation_extraction_costs(period_days),
        infrastructure_overhead(period_days)
    ])

    workflow_savings = sum([
        token_savings_in_production(period_days),
        reduced_error_rates_value(period_days),  # if measurable
    ])

    return {
        "evolution_cost": evolution_cost,
        "workflow_savings": workflow_savings,
        "net": workflow_savings - evolution_cost,
        "roi": workflow_savings / evolution_cost if evolution_cost > 0 else 0
    }
```

**Observable**: ROI trending up = economic case exists. ROI < 1.0 persistently = too expensive.

---

## Why This Matters

If this works, we've built more than a tool. We've created:

1. **A method for discovering machine cognition structure.** The symbols that emerge reveal what models actually share—not what we assume they share.

2. **A foundation for trustworthy AI communication.** Activation-anchored symbols mean the same thing by construction, not by hope.

3. **A self-improving semantic infrastructure.** The language grows as models find concepts worth naming.

4. **Evidence about AI alignment.** If models converge on shared representations, they may share more than we thought. If they don't, we learn that too.

The language isn't the goal. The goal is **grounded, verifiable meaning transfer between AI systems**. The language is how we get there.

---

## References

- Activation Observability (see `activation-observability.md`)
- Machine-Native Formal Language (see `machine-language.md`)
- Wonder Workflow Primitives (see `primitives.ts`)
- Representation Engineering literature
- Canonical Correlation Analysis for embedding alignment
- Linear probe interpretability research
