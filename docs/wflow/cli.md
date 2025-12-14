# wflow CLI

The `wflow` CLI provides commands for checking, validating, executing, and testing workflow files.

## Installation

```bash
pnpm add -g @wonder/wflow-cli
# or
npm install -g @wonder/wflow-cli
```

---

## Commands

### check

Check files for errors and warnings. This is the primary command for CI pipelines and pre-commit hooks.

```bash
wflow check                       # Check all wflow files in current directory
wflow check ./workflows/          # Check specific directory
wflow check ./my.wflow            # Check specific file
wflow check ./workflows/ ./tasks/ # Check multiple paths
```

**Options:**

| Option            | Description                               |
| ----------------- | ----------------------------------------- |
| `--strict`        | Treat warnings as errors (exit code 1)    |
| `--format <type>` | Output format: `pretty` (default), `json` |
| `--quiet`         | Only output on errors (suppress warnings) |
| `--no-color`      | Disable colored output                    |

**Exit Codes:**

| Code | Meaning                        |
| ---- | ------------------------------ |
| 0    | Success (no errors)            |
| 1    | Errors found                   |
| 2    | Invalid arguments or I/O error |

**Examples:**

```bash
# CI pipeline usage
wflow check --strict --format json

# Pre-commit hook
wflow check --quiet

# Check and fail on any issue
wflow check ./workflows/ --strict
```

**Output (pretty format):**

```
$ wflow check ./workflows/

  workflows/ideation.wflow
    ✗ error  Line 45: Path '$.state.ideaz' does not exist. Did you mean '$.state.ideas'?
    ⚠ warn   Line 72: Node 'cleanup' is not reachable from initial node

  workflows/pipeline.wflow
    ✓ No issues

  tasks/generate.task
    ⚠ warn   Line 23: Task version 2 is available (currently using v1)

Found 1 error and 2 warnings in 3 files
```

**Output (JSON format):**

```json
{
  "files": [
    {
      "path": "workflows/ideation.wflow",
      "errors": [
        {
          "line": 45,
          "column": 12,
          "severity": "error",
          "code": "INVALID_PATH",
          "message": "Path '$.state.ideaz' does not exist",
          "suggestion": "Did you mean '$.state.ideas'?"
        }
      ],
      "warnings": [
        {
          "line": 72,
          "column": 4,
          "severity": "warning",
          "code": "UNREACHABLE_NODE",
          "message": "Node 'cleanup' is not reachable from initial node"
        }
      ]
    }
  ],
  "summary": {
    "files": 3,
    "errors": 1,
    "warnings": 2
  }
}
```

---

### validate

Deep validation including schema resolution and cross-file references. More thorough than `check` but requires network access for remote schemas.

```bash
wflow validate                    # Validate all files in current directory
wflow validate ./workflows/       # Validate specific directory
wflow validate ./my.wflow         # Validate specific file
wflow validate --strict           # Treat warnings as errors
```

**Options:**

| Option      | Description                   |
| ----------- | ----------------------------- |
| `--strict`  | Treat warnings as errors      |
| `--offline` | Skip remote schema resolution |

---

### run

Execute a workflow with provided input.

```bash
wflow run ./ideation.wflow --input '{"topic": "AI", "count": 3}'
wflow run ./ideation.wflow --input-file ./input.json
wflow run ./ideation.wflow --watch          # Re-run on file changes
wflow run ./ideation.wflow --dry-run        # Validate without executing
```

**Options:**

| Option              | Description                           |
| ------------------- | ------------------------------------- |
| `--input <json>`    | Inline JSON input                     |
| `--input-file <f>`  | Read input from JSON file             |
| `--run-file <f>`    | Use a `.run` configuration file       |
| `--watch`           | Re-run on file changes                |
| `--dry-run`         | Validate without executing            |
| `--timeout <ms>`    | Override workflow timeout             |
| `--env <key=value>` | Set environment variable (repeatable) |

**Exit Codes:**

| Code | Meaning                         |
| ---- | ------------------------------- |
| 0    | Workflow completed successfully |
| 1    | Workflow failed                 |
| 2    | Invalid arguments               |
| 3    | Timeout                         |

---

### test

Run `.test` files.

```bash
wflow test                        # Run all .test files
wflow test ./tests/               # Run tests in directory
wflow test ./ideation.test        # Run specific test file
wflow test --filter "happy_path"  # Run tests matching pattern
wflow test --tags ci              # Run tests with specific tags
wflow test --coverage             # Generate coverage report
wflow test --update-snapshots     # Update snapshot files
wflow test --watch                # Re-run on file changes
```

**Options:**

| Option                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `--filter <pattern>`   | Run tests matching pattern               |
| `--tags <tags>`        | Run tests with specific tags (comma-sep) |
| `--coverage`           | Generate coverage report                 |
| `--update-snapshots`   | Update snapshot files                    |
| `--watch`              | Re-run on file changes                   |
| `--fail-fast`          | Stop on first failure                    |
| `--parallel`           | Run tests in parallel                    |
| `--max-concurrent <n>` | Max parallel tests (default: 4)          |
| `--timeout <ms>`       | Test timeout (default: 30000)            |

**Test Output:**

```
$ wflow test ./tests/ideation.test

  ideation-tests
    ✓ generates_correct_count (234ms)
    ✓ handles_empty_topic (12ms)
    ✓ task_generates_ideas (156ms)

  3 passing (402ms)
  0 failing

  Coverage:
    Nodes:    100% (3/3)
    Branches:  75% (3/4)
    Actions:  100% (2/2)
```

**Watch Mode:**

```
$ wflow test --watch

  Watching for changes...

  [12:34:56] File changed: workflows/ideation.wflow
  [12:34:56] Re-running affected tests...

    ✓ generates_correct_count (234ms)
    ✓ handles_empty_topic (12ms)

  2 passing (246ms)
```

---

### export

Export workflow definitions to other formats.

```bash
wflow export ./ideation.wflow --format json    # Export as JSON
wflow export ./ideation.wflow --format ts      # Generate TypeScript SDK code
wflow export ./ideation.wflow --format diagram # Generate Mermaid diagram
```

**Options:**

| Option            | Description                            |
| ----------------- | -------------------------------------- |
| `--format <type>` | Output format: `json`, `ts`, `diagram` |
| `--output <file>` | Write to file instead of stdout        |

---

### init

Initialize new projects or scaffold new files.

```bash
wflow init                        # Initialize new project
wflow init workflow my-workflow   # Create new workflow from template
wflow init task my-task           # Create new task from template
wflow init action my-action       # Create new action from template
wflow init test my-test           # Create new test file from template
```

**Templates:**

The `init` command creates files from built-in templates with sensible defaults:

```bash
$ wflow init workflow ideation

Created workflows/ideation.wflow

  workflow: ideation
  version: 1
  description: TODO

  input_schema:
    type: object
    properties: {}

  ...
```

---

### lsp

Start the language server for editor integration.

```bash
wflow lsp                         # Start LSP server on stdio
wflow lsp --tcp 5007              # Start LSP server on TCP port
```

This is typically invoked by VS Code or other editors automatically.

---

## Configuration

### Project Configuration

Create a `wflow.config.yaml` in your project root:

```yaml
# wflow.config.yaml

# Directories to scan for workflow files
include:
  - ./workflows
  - ./tasks
  - ./actions

# Patterns to exclude
exclude:
  - ./workflows/deprecated/**
  - ./**/*.draft.wflow

# Default command options
check:
  strict: false
  format: pretty

test:
  coverage: true
  parallel: true
  timeout_ms: 30000

# Schema registry
schemas:
  library: https://schemas.wonder.dev/library/
  project: ./schemas/
```

### Environment Variables

| Variable          | Description                         |
| ----------------- | ----------------------------------- |
| `WFLOW_CONFIG`    | Path to config file                 |
| `WFLOW_NO_COLOR`  | Disable colored output              |
| `WFLOW_LOG_LEVEL` | Log level: debug, info, warn, error |

---

## Integration

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
- name: Check workflow files
  run: wflow check --strict --format json > wflow-report.json

- name: Run workflow tests
  run: wflow test --coverage --fail-fast
```

### Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: wflow-check
        name: Check wflow files
        entry: wflow check --quiet
        language: system
        files: \.(wflow|task|action|test)$
```

### VS Code Integration

The CLI's LSP server powers the VS Code extension. Install `wflow-vscode` for full IDE support including:

- Real-time diagnostics
- Autocomplete
- Hover documentation
- Go to definition
- Find all references
