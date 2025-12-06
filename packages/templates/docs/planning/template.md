# Capability Planning Style Guide

## Structure

```
# Capability N: [Name]

**Goal:** [Describe the capability]

---

## Feature N.M: [Feature Name]

**Goal:** [Describe the feature]

### Task CN-FM-TK: [Task Name]

[Bullets describing what to build]

**Deliverable:** [The artifact this produces]

**Tests:**
- [Concrete test cases with inputs/outputs when possible]
- [Can be 2-10+ depending on task complexity]
```

---

## Guidelines

**Task naming:** `CN-FM-TK` format (e.g., C1-F1-T1)

**Scope:** Tasks are typically 20-100 LOC, broken into subtasks if larger

**Task descriptions:**

- Include key methods/classes/data structures
- Mention edge cases when relevant
- Include LOC estimates (e.g., "~50 LOC")

**Tests:**

- Concrete input → expected output when possible
- Some can be behavioral ("validates error handling")
- Quantity varies by task needs

**Summary section** includes:

- Total task count across features
- Estimated LOC for capability
- Dependencies between capabilities
- Validation strategy
- Next capability
