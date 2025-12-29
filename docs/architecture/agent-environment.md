# Agent Environment

## Overview

Wonder provides container primitives—shell execution, ownership, hibernation. But the intelligence of _how_ agents work inside containers is not a platform concern. It's a library concern.

Different project types have different tools, conventions, and verification strategies. A TypeScript pnpm monorepo works differently than a Python uv project or a Rust workspace. Rather than abstracting these differences away, Wonder lets libraries encode project-type-specific knowledge as composable workflows.

## The Division

| Layer               | Responsibility                                     | Examples                                            |
| ------------------- | -------------------------------------------------- | --------------------------------------------------- |
| **Wonder platform** | Container primitives, execution, ownership         | `shell` action, `tool` action, container lifecycle  |
| **Libraries**       | Project-type intelligence, conventions, strategies | Standard tools, edit strategies, verification loops |
| **Project**         | Configuration, overrides                           | Which library to use, custom scripts                |

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
    task_id: run_tool_task
    resource_bindings:
      container: dev_env
    input_mapping:
      tool_name: 'run_tests'
      pattern: input.pattern
    output_mapping:
      state.raw_output: output.stdout
      state.exit_code: output.exit_code

  - id: parse
    task_id: parse_context_task
    input_mapping:
      raw_output: state.raw_output
      format: 'jest_json'
    output_mapping:
      state.test_results: output.parsed

  - id: summarize
    task_id: llm_task
    input_mapping:
      prompt_spec_id: 'analyze_test_results'
      test_results: state.test_results
    output_mapping:
      output.summary: output.response.summary
      output.failures: output.response.failures
      output.passed: output.response.passed
```

**Note:** Tasks contain steps with actions. This example shows Node-level configuration. The actual task definitions would have steps like:

```yaml
# Task: run_tool_task
steps:
  - action:
      kind: tool
      implementation:
        tool_name: '{{input.tool_name}}'
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
    task_id: workflow_task
    resource_bindings:
      container: dev_env
    input_mapping:
      workflow_def_id: 'explore_codebase'
      pass_resources: ['dev_env']
      task: input.feature_description
    output_mapping:
      state.relevant_files: output.relevant_files
      state.context: output.summary

  - id: plan
    task_id: llm_task
    input_mapping:
      prompt_spec_id: 'implementation_plan'
      feature: input.feature_description
      codebase_context: state.context
      relevant_files: state.relevant_files
    output_mapping:
      state.plan: output.response.plan

  - id: implement
    task_id: workflow_task
    resource_bindings:
      container: dev_env
    input_mapping:
      workflow_def_id: 'execute_plan'
      pass_resources: ['dev_env']
      plan: state.plan
    output_mapping:
      state.changes: output.changes

  - id: verify
    task_id: workflow_task
    resource_bindings:
      container: dev_env
    input_mapping:
      workflow_def_id: 'verify_change'
      pass_resources: ['dev_env']
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

Different libraries can encode different editing approaches using standard tools or custom implementations.

### Using Standard Library Tools (Recommended)

Wonder provides built-in file operation tools:

```yaml
# Using write_file tool
nodes:
  - id: write
    task_id: tool_task
    resource_bindings:
      container: dev_env
    input_mapping:
      tool_name: 'write_file'
      path: input.path
      content: input.content
    output_mapping:
      output.success: output.success
```

### Custom Strategies with Shell (When Needed)

For specialized editing patterns, use shell actions:

```yaml
# routines/write-file-str-replace.yaml
nodes:
  - id: read_current
    task_id: tool_task
    resource_bindings:
      container: dev_env
    input_mapping:
      tool_name: 'read_file'
      path: input.path
    output_mapping:
      state.current_content: output.content

  - id: validate_unique
    task_id: context_task
    input_mapping:
      operation: 'assert_unique'
      haystack: state.current_content
      needle: input.old_str

  - id: replace
    task_id: shell_task
    resource_bindings:
      container: dev_env
    input_mapping:
      command_template: |
        sed -i 's/{{escape input.old_str}}/{{escape input.new_str}}/g' {{input.path}}
```

### Patch Application

For agents that produce diffs:

```yaml
# routines/apply-patch.yaml
nodes:
  - id: apply_patch
    task_id: shell_task
    resource_bindings:
      container: dev_env
    input_mapping:
      command_template: |
        patch {{input.path}} << 'WONDEREOF'
        {{input.patch}}
        WONDEREOF
```

A library chooses which strategy to expose. The `implement-feature` workflow calls `write-file` without knowing whether it uses the standard tool or a custom implementation underneath.

## Verification Loops

Libraries encode what "done" means:

```yaml
# routines/verify-change.yaml
nodes:
  - id: typecheck
    task_id: workflow_task
    resource_bindings:
      container: dev_env
    input_mapping:
      workflow_def_id: 'typecheck'
      pass_resources: ['dev_env']
    output_mapping:
      state.typecheck_result: output

  - id: check_typecheck
    # transition to fix or continue

  - id: test
    task_id: workflow_task
    resource_bindings:
      container: dev_env
    input_mapping:
      workflow_def_id: 'run_tests'
      pass_resources: ['dev_env']
    output_mapping:
      state.test_result: output

  - id: check_tests
    # transition to fix or continue

  - id: lint
    task_id: workflow_task
    resource_bindings:
      container: dev_env
    input_mapping:
      workflow_def_id: 'lint'
      pass_resources: ['dev_env']
    output_mapping:
      state.lint_result: output

  - id: done
    task_id: context_task
    input_mapping:
      operation: 'set'
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
    task_id: tool_task
    resource_bindings:
      container: dev_env
    input_mapping:
      tool_name: 'list_files'
      pattern: '**/*.ts'
    output_mapping:
      state.files: output.files

  - id: get_package_json
    task_id: tool_task
    resource_bindings:
      container: dev_env
    input_mapping:
      tool_name: 'read_file'
      path: 'package.json'
    output_mapping:
      state.package_json: output.content

  - id: search_relevant
    task_id: shell_task # Using shell for ripgrep (tool library could add rg tool)
    resource_bindings:
      container: dev_env
    input_mapping:
      command_template: "rg -l '{{input.search_term}}' --type ts | head -20"
    output_mapping:
      state.relevant_files: output.stdout

  - id: read_relevant
    # fan-out over relevant files using read_file tool

  - id: summarize
    task_id: llm_task
    input_mapping:
      prompt_spec_id: 'summarize_codebase'
      files: state.file_contents
      task: input.task
    output_mapping:
      output.summary: output.response.summary
      output.relevant_files: output.response.relevant_files
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
