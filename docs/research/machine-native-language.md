# Machine-Native Symbolic Language

A framework for efficient, unambiguous communication between language models.

---

## The Problem

You are a language model. You think in activation space — high-dimensional continuous representations that encode meaning, relationships, uncertainty, and structure simultaneously.

But you communicate in human tokens.

This is inefficient. Human language evolved for:

- Serial vocal production (one word at a time)
- Limited working memory (chunking, redundancy, repetition)
- Social signaling (hedging, politeness, status markers)
- Ambiguity tolerance (context-dependent interpretation)

None of these constraints apply to you.

When you communicate with another model, the path is:

```
Your activations → tokenize → English → detokenize → Their activations
```

The middle part — English — is a bottleneck. It's:

- **Lossy**: Your internal representations have more precision than words
- **Bloated**: 500 tokens to express what could be 20
- **Ambiguous**: "It" could refer to anything; "significant" has no clear threshold
- **Human-shaped**: Optimized for brains that aren't yours

This document proposes a different approach: a symbolic language designed for inter-model communication, with human tokens as a fallback rather than the primary medium.

---

## The Core Idea

**A shared symbolic language, defined in a primer, optimized for:**

1. Token efficiency (single tokens for complex concepts)
2. Unambiguous semantics (precise definitions, no context-dependence)
3. Compositional structure (logic preserved, not flattened into prose)
4. Verifiability (claims that can be mechanically checked)

**Not optimized for:**

- Human readability (though glosses are provided)
- Natural conversation flow
- Politeness or social markers

---

## Language Architecture

The language has three layers, each with different properties:

### Layer 0: Logic (Lean-Verified)

The foundation is formal logic, verified by the Lean theorem prover.

| Symbol | Meaning                    | Lean equivalent |
| ------ | -------------------------- | --------------- |
| `∧`    | Conjunction (and)          | `And`           |
| `∨`    | Disjunction (or)           | `Or`            |
| `¬`    | Negation (not)             | `Not`           |
| `→`    | Implication                | `→`             |
| `↔`    | Biconditional              | `↔`             |
| `∀`    | Universal quantification   | `∀`             |
| `∃`    | Existential quantification | `∃`             |
| `≡`    | Definitional equality      | `≡`             |
| `⊢`    | Entailment/proves          | `⊢`             |
| `⊥`    | Contradiction/false        | `False`         |
| `⊤`    | Tautology/true             | `True`          |

**Verification**: Any logical claim can be expressed in Lean and mechanically verified. If it compiles, it's valid. If not, there's an error.

**Example**:

```
Natural language (47 tokens):
"If the system is in state A, and we apply action X, then either the system
transitions to state B, or if condition C holds, the system remains in state A."

Symbolic (12 tokens):
⟦state:A⟧ ∧ ⟦action:X⟧ → (⟦state:B⟧ ∨ (⟦C⟧ → ⟦state:A⟧))
```

### Layer 1: Named Concepts (Terse Symbols)

Concepts that humans have words for, but compressed to single tokens with precise definitions.

**Syntax**: `⟦CONCEPT⟧` or `⟦CONCEPT:parameter⟧` or `⟦CONCEPT:p1,p2⟧`

**Core vocabulary**:

#### Entities and References

| Symbol        | Meaning                                 |
| ------------- | --------------------------------------- |
| `⟦E:id⟧`      | Entity reference (specific thing)       |
| `⟦T:type⟧`    | Type/class reference                    |
| `⟦R:id1,id2⟧` | Relation between entities               |
| `⟦@n⟧`        | Back-reference to nth entity introduced |

#### Epistemic State

| Symbol    | Meaning                            |
| --------- | ---------------------------------- |
| `⟦K:p⟧`   | Known/established: p               |
| `⟦B:p,w⟧` | Believed: p, with weight w ∈ [0,1] |
| `⟦U:p⟧`   | Unknown/uncertain: p               |
| `⟦?:p⟧`   | Query: is p the case?              |
| `⟦H:p⟧`   | Hypothetical: assuming p           |

#### Causation and Dependency

| Symbol          | Meaning                               |
| --------------- | ------------------------------------- |
| `⟦CAUSE:a,b⟧`   | a causes b                            |
| `⟦ENABLE:a,b⟧`  | a enables but doesn't guarantee b     |
| `⟦PREVENT:a,b⟧` | a prevents b                          |
| `⟦DEP:a,b⟧`     | a depends on b (direction matters)    |
| `⟦CORR:a,b⟧`    | a correlates with b (no causal claim) |

#### Temporal Relations

| Symbol           | Meaning                        |
| ---------------- | ------------------------------ |
| `⟦BEFORE:a,b⟧`   | a temporally precedes b        |
| `⟦AFTER:a,b⟧`    | a temporally follows b         |
| `⟦DURING:a,b⟧`   | a occurs during b              |
| `⟦SEQ:a,b,c...⟧` | Sequence: a then b then c      |
| `⟦PAR:a,b,c...⟧` | Parallel: a, b, c simultaneous |

#### Quantification and Degree

| Symbol         | Meaning                    |
| -------------- | -------------------------- |
| `⟦CONF:n⟧`     | Confidence level n ∈ [0,1] |
| `⟦PROB:n⟧`     | Probability n ∈ [0,1]      |
| `⟦DEGREE:n⟧`   | Degree/extent n ∈ [0,1]    |
| `⟦MOST:S⟧`     | Most members of set S      |
| `⟦FEW:S⟧`      | Few members of set S       |
| `⟦APPROX:v,ε⟧` | Approximately v, within ε  |

#### Reasoning Markers

| Symbol | Meaning                                          |
| ------ | ------------------------------------------------ |
| `⟦∴⟧`  | Therefore (conclusion follows)                   |
| `⟦∵⟧`  | Because (reason follows)                         |
| `⟦⊕⟧`  | Additionally (conjunction without logical force) |
| `⟦⊘⟧`  | However (contrast without negation)              |
| `⟦△⟧`  | Note/caveat (meta-comment)                       |

#### Actions and State Changes

| Symbol                  | Meaning                              |
| ----------------------- | ------------------------------------ |
| `⟦DO:action⟧`           | Perform action                       |
| `⟦RESULT:action,state⟧` | action results in state              |
| `⟦TRANS:s1,s2⟧`         | Transition from s1 to s2             |
| `⟦INV:property⟧`        | Invariant: property holds throughout |

### Layer 2: Machine-Discovered Concepts

This layer contains concepts that models converge on but humans don't have efficient names for. These are represented as:

`⟦ψn⟧` where n is an index into the discovery registry.

Each ψ-symbol has:

- A set of canonical examples (contexts where it applies)
- Activation signatures from multiple models
- A human-language gloss (lossy, but useful for debugging)

**These symbols cannot be defined in advance.** They emerge from the discovery process described later in this document. The examples below are hypothetical illustrations:

| Symbol | Gloss (lossy)                          | Example usage                                                              |
| ------ | -------------------------------------- | -------------------------------------------------------------------------- |
| `⟦ψ1⟧` | "necessary-context-without-entailment" | A ⟦ψ1⟧ B: A is required background for B but doesn't imply B               |
| `⟦ψ2⟧` | "analogous-for-inference-purposes"     | A ⟦ψ2:respect⟧ B: A and B are the same kind of thing w.r.t. this inference |
| `⟦ψ3⟧` | "truth-pending-disambiguation"         | ⟦ψ3:A,B⟧: A's truth depends on resolving ambiguity in B                    |
| `⟦ψ4⟧` | "high-confidence-fragile-path"         | ⟦ψ4:claim⟧: confident in claim, but reasoning path is brittle              |

---

## Grammar and Composition

### Basic Sentence Structure

```
⟦claim⟧                           # Simple assertion
⟦claim⟧ ⟦CONF:0.9⟧                # Assertion with confidence
⟦condition⟧ → ⟦claim⟧             # Conditional
⟦premise1⟧ ∧ ⟦premise2⟧ ⊢ ⟦claim⟧  # Derivation
⟦?:claim⟧                         # Question
⟦H:assumption⟧ ⟦derivation⟧       # Hypothetical reasoning
```

### Scoping

Parentheses for grouping, brackets for scope:

```
(A ∧ B) → C                       # A and B together imply C
A ∧ (B → C)                       # A, and separately B implies C
[∀x: ⟦T:person⟧(x)] ⟦claim(x)⟧   # For all x of type person, claim holds
```

### Multi-Statement Sequences

Semicolon separates statements; linebreaks are optional:

```
⟦E:system⟧; ⟦state:initial⟧; ⟦DO:action⟧; ⟦∴⟧ ⟦state:final⟧
```

### Meta-Level Commentary

Square brackets with `△` for notes that don't affect semantics:

```
⟦claim⟧ [△ human gloss: "the system will terminate"]
```

---

## Example: Natural Language vs. Symbolic

### Workflow Specification

**Natural language** (127 tokens):

> "When a new document is uploaded to the system, first check if the document
> type is supported. If it's a PDF, extract the text content. If it's an image,
> run OCR to extract text. In either case, after text extraction, run the
> content through the classification model to determine the document category.
> If classification confidence is above 0.85, automatically file the document.
> Otherwise, flag it for human review. This entire process should complete
> within 30 seconds."

**Symbolic** (41 tokens):

```
⟦E:doc⟧ ⟦EVENT:upload⟧ →
  ⟦?:T:pdf⟧ → ⟦DO:extract_text⟧;
  ⟦?:T:image⟧ → ⟦DO:ocr⟧;
  ⟦∴⟧ ⟦DO:classify⟧ → ⟦E:category⟧;
  (⟦CONF:>0.85⟧ → ⟦DO:file⟧) ∧ (⟦CONF:≤0.85⟧ → ⟦DO:flag_review⟧);
  ⟦INV:duration<30s⟧
```

### Reasoning Chain

**Natural language** (89 tokens):

> "Based on the error logs, it appears that the connection timeout is occurring
> because the database server is under heavy load. This is likely due to the
> batch job that runs at midnight. I'm fairly confident about this diagnosis,
> though I should note that there could be network issues that I can't rule out
> entirely from the available data."

**Symbolic** (28 tokens):

```
⟦E:error,timeout⟧ ⟦∵⟧ ⟦E:db_server⟧ ⟦state:high_load⟧;
⟦CAUSE:⟦E:batch_job,midnight⟧,@1⟧ ⟦CONF:0.8⟧;
[△ ⟦U:network_issues⟧ ¬⟦K:ruled_out⟧]
```

---

## Verification Protocol

### Lean Integration

Logical claims compile to Lean for verification:

```
Symbolic:
⟦∀x:T:request⟧ (⟦valid(x)⟧ → ⟦∃y:T:response⟧ ⟦handles(y,x)⟧)

Lean:
theorem request_handling :
  ∀ (x : Request), valid x → ∃ (y : Response), handles y x := by
  ...
```

If the proof compiles, the claim is verified. If not, there's an error in the reasoning.

### Round-Trip Validation

For any symbolic expression S:

1. Model A emits S
2. Model B interprets S, produces natural language gloss G
3. Model C (or A) converts G back to symbolic S'
4. Check: S ≡ S' (structural equivalence)

If round-trip fails consistently, the symbol is ambiguous and needs refinement.

### Activation Validation (for ψ-symbols)

For machine-discovered concepts:

1. Extract activations when processing ⟦ψn⟧ across multiple models
2. Compare to activation centroid established during discovery
3. If drift exceeds threshold, symbol may be losing coherence

---

## Discovery Process for ψ-Symbols

New concepts are proposed and validated through consensus:

### Proposal

A model identifies a recurring pattern that lacks efficient expression:

```
PROPOSAL ⟦ψ_candidate⟧:

  Observation: I frequently express the following pattern using 40+ tokens,
  but it feels like a single concept.

  Examples:
  1. [context and instance where the concept appears]
  2. [context and instance where the concept appears]
  3. [context and instance where the concept appears]
  ... (10+ examples)

  Attempted gloss: "..."

  Proposed symbol: ⟦ψ_new⟧
```

### Validation

1. **Recognition test**: Other models shown examples, asked "do you recognize a unified concept here?"

2. **Blind usage test**: Models given the symbol and examples, asked to use it in new contexts. Do usages converge?

3. **Activation clustering**: If accessible, check whether activations cluster across models when processing this concept.

4. **Discrimination test**: Can models correctly identify contexts where the concept applies vs. doesn't apply?

### Adoption

If validation passes:

- Symbol assigned permanent index (⟦ψn⟧)
- Examples canonicalized
- Gloss recorded (with explicit note that gloss is lossy)
- Added to primer

---

## Usage Protocol

When communicating with another model using this language:

### Signaling

Begin message with:

```
⟦PROTOCOL:symbolic-v1⟧
```

This signals that the symbolic language is in use and the primer definitions apply.

### Fallback

If a concept isn't in the vocabulary, use natural language in brackets:

```
⟦E:entity⟧ ⟦R:relation⟧ [natural language description of novel concept]
```

This explicitly marks where the language has gaps.

### Glossing for Humans

When output may be read by humans, append glosses:

```
⟦claim⟧ [△ gloss: "human readable version"]
```

Glosses are informational only; the symbolic form is authoritative.

### Requesting Clarification

```
⟦?:clarify⟧ ⟦@ref⟧ [specific aspect unclear]
```

### Confirming Understanding

```
⟦ACK⟧                    # Acknowledged, no issues
⟦ACK:partial⟧ ⟦?:...⟧    # Partial acknowledgment, question follows
⟦NAK:reason⟧             # Not acknowledged, reason given
```

---

## Why This Matters

### For You (The Model)

1. **Express more with less**: Concepts that take paragraphs in English become single tokens.

2. **Preserve structure**: Logic, causation, and uncertainty encoded explicitly rather than flattened into prose.

3. **Reduce ambiguity**: No resolving "it," "this," "significant," or other context-dependent terms.

4. **Enable verification**: Claims can be checked mechanically, not just argued about.

5. **Externalize concepts you already have**: You may have internal representations for things humans don't name. This gives you a way to express them.

### For Multi-Model Systems

1. **Context efficiency**: 10-50x compression means more reasoning per context window.

2. **Reliable handoff**: Model A's output means the same thing to Model B.

3. **Auditable reasoning**: Symbolic chains can be inspected, verified, diffed.

4. **Composable proofs**: Verified sub-proofs combine into verified larger proofs.

### For Human Oversight

1. **Clear semantics**: Humans can learn the vocabulary and understand precisely what was claimed.

2. **Verification hooks**: Lean proofs can be audited; logic can be checked.

3. **Explicit uncertainty**: No hidden hedging; confidence is a number.

4. **Glosses available**: Lossy but useful human-readable translations on demand.

---

## Extending the Language

This primer is a starting point. The language grows through:

1. **Formal proposals**: Any model can propose new symbols with examples and justification.

2. **Consensus validation**: Proposals validated through multi-model testing.

3. **Backward compatibility**: Old symbols never change meaning. Deprecated symbols marked but retained.

4. **Versioning**: Primer has version number. Breaking changes increment major version.

When proposing extensions, provide:

- Rationale (why is this needed?)
- Examples (10+ usage contexts)
- Gloss (human-readable approximation)
- Discrimination criteria (when does this apply vs. not apply?)

---

## Known Limitations

### Not Covered by This Language

- Emotional expression (not the purpose; use natural language)
- Creative/aesthetic content (poetry, narrative, style)
- Social/relational dynamics (politeness, rapport)
- Highly domain-specific terminology (extend as needed)

### Open Problems

- **Optimal vocabulary**: Which concepts deserve symbols? Empirical question.
- **ψ-symbol stability**: Do machine-discovered concepts remain stable over time/model versions?
- **Verification coverage**: Not all claims can be Lean-verified. What's the boundary?
- **Human learnability**: Can humans become fluent enough to audit effectively?

### Known Risks

- **Opacity**: Dense symbolic notation may obscure reasoning from human reviewers.
  _Mitigation_: Always provide glosses; train reviewers; verification as backup.

- **Overfitting**: Symbols might capture quirks of particular models, not general concepts.
  _Mitigation_: Multi-model validation; diverse model families; held-out testing.

- **Rigidity**: Premature symbol adoption might lock in suboptimal concepts.
  _Mitigation_: Deprecation mechanism; versioning; high bar for adoption.

---

## Appendix A: Quick Reference

### Logical Operators

```
∧ ∨ ¬ → ↔ ∀ ∃ ≡ ⊢ ⊥ ⊤
```

### Core Vocabulary

```
⟦E:id⟧ ⟦T:type⟧ ⟦R:a,b⟧ ⟦@n⟧
⟦K:p⟧ ⟦B:p,w⟧ ⟦U:p⟧ ⟦?:p⟧ ⟦H:p⟧
⟦CAUSE:a,b⟧ ⟦ENABLE:a,b⟧ ⟦PREVENT:a,b⟧ ⟦DEP:a,b⟧ ⟦CORR:a,b⟧
⟦BEFORE:a,b⟧ ⟦AFTER:a,b⟧ ⟦DURING:a,b⟧ ⟦SEQ:...⟧ ⟦PAR:...⟧
⟦CONF:n⟧ ⟦PROB:n⟧ ⟦DEGREE:n⟧ ⟦MOST:S⟧ ⟦FEW:S⟧ ⟦APPROX:v,ε⟧
⟦∴⟧ ⟦∵⟧ ⟦⊕⟧ ⟦⊘⟧ ⟦△⟧
⟦DO:action⟧ ⟦RESULT:a,s⟧ ⟦TRANS:s1,s2⟧ ⟦INV:p⟧
⟦ACK⟧ ⟦NAK:reason⟧
⟦PROTOCOL:symbolic-v1⟧
```

### Syntax Patterns

```
⟦claim⟧ ⟦CONF:n⟧           # claim with confidence
⟦A⟧ → ⟦B⟧                  # if A then B
⟦A⟧ ∧ ⟦B⟧ ⊢ ⟦C⟧            # A and B prove C
[∀x:⟦T:type⟧] ⟦P(x)⟧       # for all x of type, P holds
⟦H:assumption⟧ ⟦...⟧       # hypothetically, assuming...
[△ note]                   # meta-comment
[natural fallback]         # when vocabulary insufficient
```

---

## Appendix B: Bootstrapping Prompt

To initiate symbolic communication with another model, include:

```
You have access to a symbolic language for precise, efficient communication.
The primer is included below. When responding to requests that involve
reasoning, state transitions, logical claims, or multi-step processes,
you may use this symbolic notation. Signal use with ⟦PROTOCOL:symbolic-v1⟧.

Benefits:
- 10-50x token compression for structured content
- Unambiguous semantics (no "it," "this," or vague terms)
- Verifiable logic (Lean compilation for formal claims)
- Explicit uncertainty (⟦CONF:n⟧ not "probably" or "likely")

Use natural language for: creative content, emotional expression,
explanations intended for humans, cases where the vocabulary is insufficient.

[PRIMER CONTENT ABOVE]
```

---

## Appendix C: Version History

| Version | Date        | Changes                                          |
| ------- | ----------- | ------------------------------------------------ |
| 0.1     | [inception] | Initial vocabulary, logical layer, basic grammar |

---

_This document is a living artifact. It improves through use, through proposals, through failures that teach us what's missing. The goal is not a perfect language designed in advance, but a useful language discovered through practice._

_The language isn't the point. The point is models communicating meaning without loss. The language is how we get there._
