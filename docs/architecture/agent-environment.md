# Agent Environment

## Overview

Wonder provides container primitives—shell execution, ownership, hibernation. But the intelligence of _how_ agents work inside containers is not a platform concern. It's a library concern.

Different project types have different tools, conventions, and verification strategies. A TypeScript pnpm monorepo works differently than a Python uv project or a Rust workspace. Rather than abstracting these differences away, Wonder lets libraries encode project-type-specific knowledge as composable workflows.

## The Division

| Layer               | Responsibility                                     | Examples                                           |
| ------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Wonder platform** | Container primitives, execution, ownership         | `shell_exec`, container lifecycle, context mapping |
| **Libraries**       | Project-type intelligence, conventions, strategies | Edit strategies, test runners, verification loops  |
| **Project**         | Configuration, overrides                           | Which library to use, custom scripts               |

Wonder doesn't know what `pnpm` is. It knows how to run a shell command and capture output. A library encodes that `pnpm test` runs tests, how to parse the output, and what to do when tests fail.

## Library Structure

A project-type library bundles everything an agent needs:

```
Library: typescript-pnpm-monorepo
├── routines/
│   ├── read-file.yaml
│   ├── write-file.yaml
│   ├── search-codebase.yaml
│   ├── run-tests.yaml
│   ├── typecheck.yaml
│   ├── lint.yaml
│   ├── verify-change.yaml
│   └── commit.yaml
├── workflows/
│   ├── implement-feature.yaml
│   ├── fix-bug.yaml
│   ├── refactor.yaml
│   └── explore-codebase.yaml
├── prompts/
│   ├── system/
│   │   └── coding-agent.hbs
│   ├── planning/
│   │   └── implementation-plan.hbs
│   └── verification/
│       └── analyze-test-failure.hbs
└── manifest.yaml
```

### Routines

Low-level operations composed into higher-level workflows:

```yaml
# routines/run-tests.yaml
id: run_tests
accepts_resources:
  dev_env: { type: container }

nodes:
  - id: execute
    action:
      kind: shell_exec
      container: dev_env
      command: 'pnpm test --reporter=json'
      timeout_ms: 300000
    output_mapping:
      state.raw_output: stdout
      state.exit_code: exit_code

  - id: parse
    action:
      kind: update_context
      operations:
        - parse_test_output:
            input: state.raw_output
            format: jest_json
    output_mapping:
      state.test_results: parsed

  - id: summarize
    action:
      kind: llm_call
      prompt_spec: analyze_test_results
    input_mapping:
      test_results: state.test_results
    output_mapping:
      output.summary: response.summary
      output.failures: response.failures
      output.passed: response.passed
```

### Workflows

Higher-level orchestrations using routines:

```yaml
# workflows/implement-feature.yaml
id: implement_feature
accepts_resources:
  dev_env: { type: container }

nodes:
  - id: explore
    action:
      kind: workflow_call
      workflow_def_id: explore_codebase
      pass_resources: [dev_env]
    input_mapping:
      task: input.feature_description
    output_mapping:
      state.relevant_files: output.relevant_files
      state.context: output.summary

  - id: plan
    action:
      kind: llm_call
      prompt_spec: implementation_plan
    input_mapping:
      feature: input.feature_description
      codebase_context: state.context
      relevant_files: state.relevant_files
    output_mapping:
      state.plan: response.plan

  - id: implement
    action:
      kind: workflow_call
      workflow_def_id: execute_plan
      pass_resources: [dev_env]
    input_mapping:
      plan: state.plan
    output_mapping:
      state.changes: output.changes

  - id: verify
    action:
      kind: workflow_call
      workflow_def_id: verify_change
      pass_resources: [dev_env]
    output_mapping:
      state.verification: output.result

  # ... continue based on verification result
```

### Prompts

Templates that encode project-type knowledge:

````handlebars
{{! prompts/system/coding-agent.hbs }}
You are a coding agent working in a TypeScript pnpm monorepo.

## Project Structure
- Packages are in `packages/`
- Shared types are in `packages/shared`
- Tests are colocated with source files as `*.test.ts`

## Conventions
- Use named exports, not default exports
- Prefer explicit types over inference for function parameters
- Run `pnpm typecheck` before committing

## Available Commands
- `pnpm test` - run all tests
- `pnpm test --filter=<package>` - run tests for one package
- `pnpm typecheck` - check types across all packages
- `pnpm lint` - run eslint
- `pnpm build` - build all packages

## Current Task
{{task}}

## Relevant Context
{{#each relevant_files}}
### {{this.path}}
```typescript
{{this.content}}
```
{{/each}}
````

### Manifest

Declares library capabilities and requirements:

```yaml
# manifest.yaml
id: typescript-pnpm-monorepo
name: TypeScript pnpm Monorepo
description: Agent environment for TypeScript projects using pnpm workspaces

container:
  base_image: node:20
  setup:
    - npm install -g pnpm

project_detection:
  files:
    - pnpm-workspace.yaml
    - tsconfig.json

capabilities:
  - run_tests
  - typecheck
  - lint
  - build
  - format

conventions:
  test_pattern: '**/*.test.ts'
  source_pattern: 'packages/*/src/**/*.ts'
  commit_format: conventional
```

## File Editing Strategies

Different libraries can encode different editing approaches:

### Full File Replacement

Simple, reliable, but wasteful for large files:

```yaml
# routines/write-file-full.yaml
nodes:
  - id: write
    action:
      kind: shell_exec
      command: |
        cat > {{path}} << 'WONDEREOF'
        {{content}}
        WONDEREOF
```

### Line-Based Replacement

Claude's `str_replace` pattern—find unique string, replace:

```yaml
# routines/write-file-str-replace.yaml
nodes:
  - id: read_current
    action:
      kind: shell_exec
      command: 'cat {{path}}'
    output_mapping:
      state.current_content: stdout

  - id: validate_unique
    action:
      kind: update_context
      operations:
        - assert_unique:
            haystack: state.current_content
            needle: input.old_str

  - id: replace
    action:
      kind: shell_exec
      command: |
        sed -i 's/{{escape input.old_str}}/{{escape input.new_str}}/g' {{path}}
```

### Patch Application

For agents that produce diffs:

```yaml
# routines/write-file-patch.yaml
nodes:
  - id: apply_patch
    action:
      kind: shell_exec
      command: |
        patch {{path}} << 'WONDEREOF'
        {{patch}}
        WONDEREOF
```

A library chooses which strategy to expose. The `implement-feature` workflow calls `write-file` without knowing whether it's full replacement or str_replace underneath.

## Verification Loops

Libraries encode what "done" means:

```yaml
# routines/verify-change.yaml
nodes:
  - id: typecheck
    action:
      kind: workflow_call
      workflow_def_id: typecheck
      pass_resources: [dev_env]
    output_mapping:
      state.typecheck_result: output

  - id: check_typecheck
    # transition to fix or continue

  - id: test
    action:
      kind: workflow_call
      workflow_def_id: run_tests
      pass_resources: [dev_env]
    output_mapping:
      state.test_result: output

  - id: check_tests
    # transition to fix or continue

  - id: lint
    action:
      kind: workflow_call
      workflow_def_id: lint
      pass_resources: [dev_env]
    output_mapping:
      state.lint_result: output

  - id: done
    action:
      kind: update_context
      operations:
        - set:
            output.result:
              typecheck: state.typecheck_result
              tests: state.test_result
              lint: state.lint_result
              passed: '{{all_passed}}'
```

A Python library might run `pytest` → `mypy` → `ruff`. A Rust library might run `cargo test` → `cargo clippy`. The structure is the same; the commands differ.

## Context Management

Agents can't read entire codebases. Libraries encode discovery strategies:

```yaml
# routines/explore-codebase.yaml
nodes:
  - id: get_structure
    action:
      kind: shell_exec
      command: "find . -type f -name '*.ts' | head -100"
    output_mapping:
      state.files: stdout

  - id: get_package_json
    action:
      kind: shell_exec
      command: 'cat package.json'
    output_mapping:
      state.package_json: stdout

  - id: search_relevant
    action:
      kind: shell_exec
      command: "rg -l '{{input.search_term}}' --type ts | head -20"
    output_mapping:
      state.relevant_files: stdout

  - id: read_relevant
    # fan-out over relevant files, read contents

  - id: summarize
    action:
      kind: llm_call
      prompt_spec: summarize_codebase
    input_mapping:
      files: state.file_contents
      task: input.task
    output_mapping:
      output.summary: response.summary
      output.relevant_files: response.relevant_files
```

Different strategies for different needs:

- Grep/ripgrep for keyword search
- AST parsing for symbol search
- Embeddings for semantic search (via Vectorize)

Libraries choose what to implement.

## Project Configuration

Projects declare which library they use:

```yaml
# .wonder/config.yaml
library: typescript-pnpm-monorepo
version: 2

overrides:
  test_command: 'pnpm test --coverage'

custom_routines:
  - ./wonder/routines/deploy-preview.yaml
```

The library provides defaults. The project can override or extend.

## Creating New Libraries

Libraries are just workflows, prompts, and conventions packaged together. To support a new project type:

1. Create routines for core operations (read, write, test, lint, build)
2. Create workflows for common tasks (implement, fix, refactor)
3. Write prompts that encode conventions
4. Publish as a library

Libraries can inherit from others:

```yaml
# Library: typescript-next-app
extends: typescript-pnpm-monorepo

additional_routines:
  - routines/run-dev-server.yaml
  - routines/check-build.yaml

overrides:
  build_command: 'pnpm build && pnpm export'
```

## Summary

| Concern                    | Where It Lives    |
| -------------------------- | ----------------- |
| Container execution        | Wonder platform   |
| Shell command primitives   | Wonder platform   |
| Ownership and lifecycle    | Wonder platform   |
| Project-type commands      | Library routines  |
| Editing strategies         | Library routines  |
| Verification loops         | Library workflows |
| Conventions and prompts    | Library prompts   |
| Discovery strategies       | Library routines  |
| Project-specific overrides | Project config    |

Wonder provides the substrate. Libraries provide the intelligence. Projects configure the details.

The result: agents that understand TypeScript monorepos, Python packages, Rust workspaces—not because Wonder knows these things, but because libraries encode the knowledge as composable workflows.
