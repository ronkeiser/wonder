# .run — Workflow Run Configuration

A declarative format for defining workflow execution configurations. Files use the `.run` extension and are validated in real-time via the LSP.

## Motivation

Running a workflow requires more than just the workflow definition:

- **Project context** — Which project owns this workflow (permissions, quotas, billing)
- **Environment** — Development, staging, production
- **Input data** — The actual input to the workflow
- **Resource bindings** — Override default resource assignments
- **Execution options** — Timeouts, retry behavior, etc.

Rather than passing these as CLI flags, `.run` files provide:

- **Versionable configs** — Commit different configs for dev/staging/prod
- **LSP validation** — Real-time validation of workflow refs, input schemas
- **Reproducibility** — Same `.run` file = same execution (modulo external state)
- **Consistency** — Same pattern as `.wflow`, `.task`, `.action`, `.test`

---

## File Format

### Basic Structure

```yaml
# runs/ideation-dev.run

run: ideation-dev
description: Development run for ideation pipeline

# Workflow reference (relative path or package reference)
workflow: ./workflows/ideation-pipeline.wflow

# Project context (required)
project_id: proj_abc123
environment: development # development | staging | production

# Input data (must match workflow's input_schema)
input:
  topic: 'sustainable energy'
  count: 5

# Optional: Override resource bindings
resource_bindings:
  dev_env: container_xyz789

# Optional: Execution options
timeout_ms: 60000
priority: normal # low | normal | high
idempotency_key: 'ideation-{{date}}-{{input.topic}}'
```

### Full Schema

| Field               | Type     | Required | Description                                              |
| ------------------- | -------- | -------- | -------------------------------------------------------- |
| `run`               | string   | Yes      | Unique identifier for this run config                    |
| `description`       | string   | No       | Human-readable description                               |
| `workflow`          | string   | Yes      | Path to workflow (relative, `@library/`, or `@project/`) |
| `project_id`        | string   | Yes      | Project ID this run belongs to                           |
| `environment`       | string   | No       | Execution environment (default: `development`)           |
| `input`             | object   | Yes\*    | Input data matching workflow's `input_schema`            |
| `input_file`        | string   | No       | Path to JSON/YAML file containing input                  |
| `context`           | object   | No       | Initial context state (advanced)                         |
| `resource_bindings` | Record   | No       | Override workflow's default resource bindings            |
| `timeout_ms`        | number   | No       | Override workflow timeout                                |
| `priority`          | string   | No       | Execution priority (`low`, `normal`, `high`)             |
| `idempotency_key`   | string   | No       | Key for idempotent execution                             |
| `tags`              | string[] | No       | Tags for filtering/organization                          |
| `metadata`          | object   | No       | Arbitrary metadata passed through execution              |

\*`input` is required unless `input_file` is provided.

---

## Input Sources

### Inline Input

```yaml
input:
  topic: 'renewable energy'
  count: 10
  options:
    include_examples: true
```

### External File

```yaml
input_file: ./fixtures/large-input.json
```

### Templated Input

```yaml
input:
  topic: '{{env.TOPIC}}'
  count: '{{env.COUNT | default: 5}}'
  timestamp: '{{now}}'
```

Template variables:

- `{{env.VAR}}` — Environment variable
- `{{now}}` — Current ISO timestamp
- `{{date}}` — Current date (YYYY-MM-DD)
- `{{uuid}}` — Random UUID
- `{{file:path}}` — Contents of file

---

## Environment Variants

Use YAML anchors or separate files for environment-specific configs:

### Separate Files

```
runs/
  ideation-dev.run
  ideation-staging.run
  ideation-prod.run
```

### Environment Override Pattern

```yaml
# runs/ideation.run

run: ideation
workflow: ./workflows/ideation-pipeline.wflow
project_id: proj_abc123

# Base input
input:
  topic: 'test topic'
  count: 3

# Environment-specific overrides
environments:
  development:
    input:
      count: 1 # Faster iteration
    timeout_ms: 30000

  staging:
    input:
      count: 5
    timeout_ms: 60000

  production:
    input:
      count: 10
    timeout_ms: 300000
    priority: high
```

Run with: `wflow run ./ideation.run --env staging`

---

## Resource Bindings

Override which resources the workflow uses:

```yaml
# Workflow defines default bindings
# .run can override for this specific execution

resource_bindings:
  # Use a different container for this run
  dev_env: container_staging_xyz

  # Use a specific database
  database: db_replica_readonly
```

---

## Idempotency

Prevent duplicate executions:

```yaml
# Static key - only one execution ever
idempotency_key: "onboarding-user-123"

# Templated key - one per day per topic
idempotency_key: "ideation-{{date}}-{{input.topic}}"

# Templated with hash
idempotency_key: "process-{{hash:input}}"
```

---

## CLI Usage

```bash
# Run a configuration
wflow run ./runs/ideation-dev.run

# Run with environment override
wflow run ./runs/ideation.run --env production

# Dry run (validate without executing)
wflow run ./runs/ideation-dev.run --dry-run

# Override input inline
wflow run ./runs/ideation-dev.run --set input.count=10

# Watch mode (re-run on file changes)
wflow run ./runs/ideation-dev.run --watch

# Output format
wflow run ./runs/ideation-dev.run --output json
wflow run ./runs/ideation-dev.run --output table

# Async execution (returns run ID immediately)
wflow run ./runs/ideation-dev.run --async

# Follow execution logs
wflow run ./runs/ideation-dev.run --follow
```

---

## Validation Rules

The LSP validates `.run` files in real-time:

### 1. Workflow Reference

```yaml
workflow: ./workflows/typo.wflow  # ❌ Error: File not found
workflow: ./workflows/ideation.wflow  # ✓
```

### 2. Input Schema Match

```yaml
# If workflow expects: { topic: string, count: integer }
input:
  topic: 'energy'
  count: 'five' # ❌ Error: Expected integer, got string
  extra: true # ⚠️ Warning: Unknown property 'extra'
```

### 3. Project Validation

```yaml
project_id: proj_invalid # ❌ Error: Project not found (if connected)
```

### 4. Resource Bindings

```yaml
resource_bindings:
  unknown_resource: abc # ❌ Error: 'unknown_resource' not declared in workflow
```

---

## IDE Features

### Autocomplete

```yaml
workflow: ./workflows/| # Popup: available .wflow files

input: | # Popup: properties from workflow's input_schema

resource_bindings: | # Popup: resources declared in workflow
```

### Hover

```yaml
workflow: ./workflows/ideation.wflow
# ─────────────────────────────────────
# Workflow: ideation-pipeline
# Input: { topic: string, count: integer }
# Nodes: ideate → judge → rank
```

### Go to Definition

- Click workflow path → Jump to `.wflow` file
- Click `project_id` → Open project in dashboard (if available)

---

## Examples

### Minimal

```yaml
run: quick-test
workflow: ./hello.wflow
project_id: proj_abc123
input:
  name: 'World'
```

### With All Options

```yaml
run: full-ideation-prod
description: Production ideation run with all options

workflow: ./workflows/ideation-pipeline.wflow
project_id: proj_abc123
environment: production

input:
  topic: 'quantum computing applications'
  count: 20

resource_bindings:
  dev_env: container_prod_high_mem
  cache: redis_prod_cluster

timeout_ms: 600000
priority: high
idempotency_key: 'ideation-{{date}}-quantum'

tags:
  - research
  - high-priority

metadata:
  requested_by: 'research-team'
  ticket: 'JIRA-1234'
```

### CI/CD Pipeline

```yaml
# runs/ci-validation.run
run: ci-validation
workflow: ./workflows/data-pipeline.wflow
project_id: '{{env.PROJECT_ID}}'
environment: '{{env.CI_ENVIRONMENT}}'

input_file: ./fixtures/ci-test-data.json

timeout_ms: 120000
tags:
  - ci
  - automated
```

---

## Relation to Other File Types

| Extension | Purpose             | Execution                           |
| --------- | ------------------- | ----------------------------------- |
| `.wflow`  | Workflow definition | Graph structure, nodes, transitions |
| `.task`   | Task definition     | Steps, action references            |
| `.action` | Action definition   | Atomic execution unit               |
| `.test`  | Test definition     | Mocked execution, assertions        |
| `.run`    | Run configuration   | Real execution with project context |

**`.test`** = Test with mocks, no project needed  
**`.run`** = Real execution, project required

---

## Future Enhancements

- **Scheduled runs** — Cron syntax for recurring executions
- **Parameterized runs** — CLI prompts for missing input
- **Run templates** — Inheritance/composition of run configs
- **Secrets injection** — Reference project secrets in input
- **Approval gates** — Require approval before production runs
