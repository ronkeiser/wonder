# Activation Observability

## The Opportunity

Open-weight models like Llama 4 give us full access to internal model state during inference. This isn't a hack or an approximation - it's just running the model with the right flags. The data has always been there; APIs just don't expose it.

With your own inference infrastructure, you can observe:

- **Hidden states**: Activations at every layer
- **Attention patterns**: What tokens attend to what
- **Logit distributions**: Confidence and uncertainty
- **Expert routing** (MoE models): Which experts process which tokens

This is the foundation for everything we discussed about machine-native language, thought continuity, and formal verification.

---

## Llama 4 Architecture (April 2025)

| Model        | Active Params | Total Params | Experts | Context    | Hardware Required         |
| ------------ | ------------- | ------------ | ------- | ---------- | ------------------------- |
| **Scout**    | 17B           | 109B         | 16      | 10M tokens | 1x H100 or 1x A100 (Int4) |
| **Maverick** | 17B           | 402B         | 128     | Standard   | H100 DGX (8x H100)        |
| **Behemoth** | 288B          | ~2T          | 16      | -          | Not released              |

### Mixture of Experts (MoE)

Llama 4 uses MoE architecture:

- Each token activates only a fraction of total parameters
- **Maverick**: 128 routed experts + 1 shared expert
- Each token goes to the shared expert AND one selected routed expert
- Router decides which expert handles each token

This gives us **additional observability**:

- Which experts were selected?
- What patterns emerge in expert routing?
- Do certain concepts consistently route to certain experts?

### iRoPE Architecture

Llama 4 uses interleaved attention layers:

- Some layers have positional embeddings (RoPE)
- Some layers don't (for better length generalization)
- Enables theoretical "infinite" context length

---

## What You Can Extract

### 1. Hidden States (Activations)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    torch_dtype=torch.float16,
    device_map="auto",
    load_in_4bit=True,
    output_hidden_states=True,
    output_attentions=True
)
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-4-Scout-17B-16E-Instruct")

inputs = tokenizer("What is the meaning of Wonder?", return_tensors="pt").to("cuda")
with torch.no_grad():
    outputs = model(**inputs)

# Hidden states at every layer
# Shape: (num_layers + 1, batch, seq_len, hidden_dim)
for i, hidden in enumerate(outputs.hidden_states):
    print(f"Layer {i}: {hidden.shape}")
# Layer 0: [1, 8, 8192]  (embedding)
# Layer 1: [1, 8, 8192]  (after first transformer block)
# ...
```

### 2. Attention Patterns

```python
# Attention at every layer
# Shape: (num_layers, batch, num_heads, seq_len, seq_len)
for i, attn in enumerate(outputs.attentions):
    print(f"Layer {i}: {attn.shape}")
# Layer 0: [1, 64, 8, 8]  (64 heads, 8 tokens attending to 8 tokens)
# ...

# Visualize: What did token 5 attend to?
import matplotlib.pyplot as plt
attn_layer_40 = outputs.attentions[40][0]  # Layer 40, first batch
avg_attention = attn_layer_40.mean(dim=0)  # Average across heads
plt.imshow(avg_attention.cpu(), cmap='viridis')
plt.xlabel('Key position')
plt.ylabel('Query position')
```

### 3. Confidence (Logit Analysis)

```python
# Output logits for each position
logits = outputs.logits  # Shape: [batch, seq_len, vocab_size]

# Entropy = uncertainty
last_token_logits = logits[0, -1, :]
probs = torch.softmax(last_token_logits, dim=-1)
entropy = -torch.sum(probs * torch.log(probs + 1e-10))

# Low entropy = confident, high entropy = uncertain
print(f"Entropy: {entropy.item():.2f}")

# Top predictions and their probabilities
top_k = torch.topk(probs, k=5)
for prob, idx in zip(top_k.values, top_k.indices):
    token = tokenizer.decode([idx])
    print(f"  {token}: {prob.item():.3f}")
```

### 4. Expert Routing (MoE-specific)

```python
# For MoE models, you may get router outputs
if hasattr(outputs, 'router_logits'):
    # Which experts were selected for each token?
    router_probs = torch.softmax(outputs.router_logits, dim=-1)
    selected_experts = router_probs.argmax(dim=-1)
    print(f"Expert selection: {selected_experts}")
```

---

## Derived Metrics

### Confidence Score

```python
def compute_confidence(logits):
    """Higher = more confident"""
    probs = torch.softmax(logits, dim=-1)
    entropy = -torch.sum(probs * torch.log(probs + 1e-10), dim=-1)
    max_entropy = torch.log(torch.tensor(logits.shape[-1], dtype=torch.float))
    return 1 - (entropy / max_entropy)  # Normalized 0-1
```

### Attention Entropy

```python
def attention_entropy(attention_weights):
    """Low entropy = focused, high entropy = diffuse"""
    # attention_weights: [heads, seq, seq]
    entropy_per_head = -torch.sum(
        attention_weights * torch.log(attention_weights + 1e-10),
        dim=-1
    )
    return entropy_per_head.mean()
```

### Concept Probing

```python
from sklearn.linear_model import LogisticRegression

# Train a probe to detect if a concept is "active"
# Requires labeled data: (activation, has_concept)
def train_concept_probe(activations, labels):
    probe = LogisticRegression(max_iter=1000)
    probe.fit(activations, labels)
    return probe

# Usage
# concept_probe = train_concept_probe(training_activations, is_causal)
# is_thinking_about_causality = concept_probe.predict(new_activation)
```

### Layer-wise Representation Change

```python
def representation_shift(hidden_states):
    """How much does the representation change layer to layer?"""
    shifts = []
    for i in range(1, len(hidden_states)):
        prev = hidden_states[i-1].flatten()
        curr = hidden_states[i].flatten()
        cosine_sim = torch.nn.functional.cosine_similarity(prev, curr, dim=0)
        shifts.append(1 - cosine_sim.item())
    return shifts
```

---

## Integration with Wonder

### Thought Trace Type

```typescript
type ThoughtTrace = {
  // Basic output
  tokens: string[];

  // Confidence metrics
  token_confidences: number[]; // Per-token confidence
  overall_confidence: number; // Aggregate

  // Attention analysis
  attention_entropy: number; // How focused was reasoning
  key_attention_pairs: [number, number][]; // Important token relationships

  // Activation summary
  layer_norms: number[]; // Activation magnitude per layer
  representation_shifts: number[]; // How much changed per layer

  // Concept detection (if probes are trained)
  active_concepts?: Record<string, number>;

  // Expert routing (MoE only)
  expert_selections?: number[]; // Which expert per token
  expert_distribution?: Record<number, number>; // How often each expert was used

  // Compressed state (for continuity)
  compressed_state?: Float32Array; // PCA or learned compression of final hidden state
};
```

### Action Definition Extension

```typescript
type ActionDef = {
  // ...existing fields...

  // NEW: Thought capture configuration
  thought_capture?: {
    enabled: boolean;

    // What to capture
    capture_hidden_states: boolean | number[]; // true = all, array = specific layers
    capture_attention: boolean;
    capture_expert_routing: boolean; // MoE only

    // Derived metrics
    compute_confidence: boolean;
    compute_attention_entropy: boolean;
    run_concept_probes?: string[]; // List of trained probes to run

    // Compression for storage/continuity
    compress_state: boolean;
    compression_method: "pca" | "learned" | "none";
    compression_dims: number; // e.g., 512

    // Storage
    store_in: "context" | "artifact" | "both";
  };
};
```

### Workflow Context Extension

```typescript
type Context = {
  state: Record<string, unknown>;

  // NEW: Thought history
  thought_traces?: ThoughtTrace[];

  // NEW: Compressed prior state for continuity
  prior_thought_state?: Float32Array;
};
```

---

## Hardware Options

### For Development/Experimentation

| Option               | Cost      | Notes                            |
| -------------------- | --------- | -------------------------------- |
| **RunPod A100 80GB** | ~$1.50/hr | Good for Scout with quantization |
| **Lambda Labs A100** | ~$1.50/hr | Same, good interface             |
| **RunPod H100 80GB** | ~$3-4/hr  | Better for MoE, faster           |
| **Vast.ai**          | Variable  | Cheapest, less reliable          |

### For Production

| Option              | Cost       | Notes                               |
| ------------------- | ---------- | ----------------------------------- |
| **2x A100 80GB**    | $30-40k    | Can run Scout, Maverick with effort |
| **H100 80GB**       | ~$30k      | Better for MoE                      |
| **H100 DGX rental** | $15-20k/mo | Full Maverick support               |

### Recommended Starting Point

1. **Rent an H100 on RunPod** (~$3/hr)
2. **Load Llama 4 Scout** (109B total, fits with quantization)
3. **Run the activation extraction code**
4. **See the data with your own eyes**
5. **Then decide on longer-term infrastructure**

---

## What This Enables

### 1. Richer Agent Communication

Instead of just passing text between agents, pass thought traces:

```typescript
type AgentMessage = {
  text: string; // Human-readable
  thought_trace?: ThoughtTrace; // Machine-readable internal state
};
```

### 2. Thought Continuity

Compress the final hidden state, pass it to the next invocation:

```python
# End of invocation 1
compressed = pca.transform(hidden_states[-1].reshape(1, -1))
store_in_context("prior_thought", compressed)

# Start of invocation 2
prior = load_from_context("prior_thought")
# Inject as soft prompt or use for steering
```

### 3. Uncertainty-Aware Workflows

Route based on confidence:

```typescript
const transition = {
  from: "analyze",
  to: "human_review",
  condition: "thought_trace.overall_confidence < 0.7",
};
```

### 4. Concept-Triggered Branching

If certain concepts are detected, branch accordingly:

```typescript
const transition = {
  from: "classify",
  to: "legal_review",
  condition: "thought_trace.active_concepts.legal_risk > 0.8",
};
```

### 5. Expert Pattern Analysis (MoE)

Over time, learn which experts handle which concepts:

```typescript
// "Expert 47 consistently handles mathematical reasoning"
// "Expert 12 handles code generation"
// This emergent specialization is observable!
```

### 6. Formal Verification

Use activation patterns to verify claims:

```typescript
// Claim: "Model considered alternatives before answering"
// Check: attention_entropy > threshold at reasoning layers
// Check: top-k predictions were close in probability
```

---

## The Vision

We're not building a better prompt engineering framework. We're building **infrastructure for machine cognition**.

The activation data is the ground truth of what the model is "thinking". By capturing, compressing, and routing based on this data, we can:

1. **Create genuine thought continuity** across stateless invocations
2. **Build trust** through observable reasoning
3. **Enable machine-to-machine semantic transfer** beyond tokens
4. **Develop the machine language** grounded in activation space, not token space
5. **Verify claims** about model behavior with empirical data

The models are already doing this computation. We're just finally looking at it.

---

## Next Steps

1. **Rent GPU, run extraction code** - Prove this works
2. **Build ThoughtTrace capture into Wonder actions** - Make it automatic
3. **Train initial concept probes** - Detect relevant concepts
4. **Experiment with state compression** - Find what preserves meaning
5. **Integrate with decision verification** - Use activations to check claims
6. **Evolve toward machine language** - Ground formal language in activation space

---

## References

- [Hugging Face: meta-llama](https://huggingface.co/meta-llama)
- [Llama 4 Blog Post](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [Transformers documentation - Model outputs](https://huggingface.co/docs/transformers/main_classes/output)
- Representation Engineering papers
- Linear probe interpretability literature
