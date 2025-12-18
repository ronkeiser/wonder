---
description: Example command showcasing all available frontmatter options
argument-hint: [action] [target] [flags]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read, Grep, Glob
model: claude-sonnet-4-20250514
disable-model-invocation: false
---

This is an example command demonstrating all available frontmatter options.

## Frontmatter Options Used:

1. **description** - Shown in `/help` output
2. **argument-hint** - Displayed during autocomplete: `[action] [target] [flags]`
3. **allowed-tools** - Restricts this command to only use git read operations and file reading
4. **model** - Uses Claude Sonnet for this command (faster, cheaper for simple tasks)
5. **disable-model-invocation** - When `true`, prevents Claude from calling this via SlashCommand tool

## Argument Variables:

- `$ARGUMENTS` = All arguments as a single string: "$ARGUMENTS"
- `$1` = First positional argument: "$1"
- `$2` = Second positional argument: "$2"
- `$3` = Third positional argument: "$3"

## Special Prefixes (use in prompts):

- `@filename` - Includes the contents of a file
- `!command` - Executes a bash command (requires allowed-tools to include that command)

## Context Variables:

- `$SELECTION` - Currently selected code in the IDE

$SELECTION