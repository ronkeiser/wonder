import { extractPaths, type WflowDocument } from '@wonder/wflow';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, CompletionParams } from 'vscode-languageserver/node';
import { CompletionItemKind } from 'vscode-languageserver/node';
import type { DocumentManager } from '../document-manager';

/**
 * Handle completion requests
 */
export function handleCompletion(
  params: CompletionParams,
  document: TextDocument,
  documentManager: DocumentManager,
): CompletionItem[] {
  const uri = document.uri;
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[params.position.line];
  const linePrefix = line.substring(0, params.position.character);

  // Detect file type
  const fileType = documentManager.getFileType(uri);
  const isTask = fileType === 'task';
  const isAction = fileType === 'action';
  const isWorkflow = fileType === 'wflow';

  // Determine context based on line content and indentation
  const indent = line.length - line.trimStart().length;
  const trimmed = linePrefix.trim();

  // Get imports for this document
  const imports = documentManager.getImports(uri);

  // Top-level completions (indent 0)
  if (indent === 0 && !trimmed.includes(':')) {
    return getTopLevelCompletions(fileType);
  }

  // Action kind completions
  if (isAction && trimmed.startsWith('kind:')) {
    return getActionKindCompletions();
  }

  // action_id completions - suggest imported actions
  if (isTask && trimmed.match(/^action_id\s*:\s*/)) {
    if (imports) {
      const actionImports = imports.all.filter(
        (imp) => imp.fileType === 'action' || imp.fileType === 'unknown',
      );
      return actionImports.map((imp) => ({
        label: imp.alias,
        kind: CompletionItemKind.Reference,
        detail: imp.path,
      }));
    }
    return [];
  }

  // task_id completions - suggest imported tasks
  if (isWorkflow && trimmed.match(/^task_id\s*:\s*/)) {
    if (imports) {
      const taskImports = imports.all.filter(
        (imp) => imp.fileType === 'task' || imp.fileType === 'unknown',
      );
      return taskImports.map((imp) => ({
        label: imp.alias,
        kind: CompletionItemKind.Reference,
        detail: imp.path,
      }));
    }
    return [];
  }

  // Task-specific completions
  if (isTask) {
    return getTaskCompletions(lines, params.position.line, indent, trimmed);
  }

  // Workflow-specific completions
  if (isWorkflow) {
    const cached = documentManager.getCached(uri);
    const parsed = cached?.document as WflowDocument | undefined;
    return getWorkflowCompletions(parsed, lines, params.position.line, indent, trimmed, linePrefix);
  }

  return [];
}

function getTopLevelCompletions(fileType: string): CompletionItem[] {
  const baseItems: CompletionItem[] = [
    {
      label: 'imports',
      kind: CompletionItemKind.Keyword,
      insertText: 'imports:\n  ',
      detail: 'Import tasks, actions, or workflows',
    },
  ];

  if (fileType === 'task') {
    return [
      ...baseItems,
      { label: 'task', kind: CompletionItemKind.Keyword, insertText: 'task: ' },
      { label: 'version', kind: CompletionItemKind.Keyword, insertText: 'version: ' },
      { label: 'name', kind: CompletionItemKind.Keyword, insertText: 'name: ' },
      { label: 'description', kind: CompletionItemKind.Keyword, insertText: 'description: ' },
      { label: 'tags', kind: CompletionItemKind.Keyword, insertText: 'tags:\n  - ' },
      {
        label: 'input_schema',
        kind: CompletionItemKind.Keyword,
        insertText: 'input_schema:\n  type: object\n  properties:\n    ',
      },
      {
        label: 'output_schema',
        kind: CompletionItemKind.Keyword,
        insertText: 'output_schema:\n  type: object\n  properties:\n    ',
      },
      {
        label: 'steps',
        kind: CompletionItemKind.Keyword,
        insertText: 'steps:\n  - ref: \n    ordinal: 0\n    action_id: ',
      },
      {
        label: 'retry',
        kind: CompletionItemKind.Keyword,
        insertText: 'retry:\n  max_attempts: 3\n  backoff: exponential\n  initial_delay_ms: 1000',
      },
      { label: 'timeout_ms', kind: CompletionItemKind.Keyword, insertText: 'timeout_ms: ' },
    ];
  }

  if (fileType === 'action') {
    return [
      ...baseItems,
      { label: 'action', kind: CompletionItemKind.Keyword, insertText: 'action: ' },
      { label: 'version', kind: CompletionItemKind.Keyword, insertText: 'version: ' },
      { label: 'name', kind: CompletionItemKind.Keyword, insertText: 'name: ' },
      { label: 'description', kind: CompletionItemKind.Keyword, insertText: 'description: ' },
      { label: 'kind', kind: CompletionItemKind.Keyword, insertText: 'kind: ' },
      {
        label: 'requires',
        kind: CompletionItemKind.Keyword,
        insertText: 'requires:\n  type: object\n  properties:\n    ',
      },
      {
        label: 'produces',
        kind: CompletionItemKind.Keyword,
        insertText: 'produces:\n  type: object\n  properties:\n    ',
      },
      {
        label: 'implementation',
        kind: CompletionItemKind.Keyword,
        insertText: 'implementation:\n  ',
      },
      {
        label: 'execution',
        kind: CompletionItemKind.Keyword,
        insertText: 'execution:\n  timeout_ms: \n  retry_policy:\n    max_attempts: 3',
      },
      {
        label: 'idempotency',
        kind: CompletionItemKind.Keyword,
        insertText: 'idempotency:\n  key_template: \n  ttl_seconds: ',
      },
    ];
  }

  // Default: workflow
  return [
    ...baseItems,
    { label: 'workflow', kind: CompletionItemKind.Keyword, insertText: 'workflow: ' },
    { label: 'version', kind: CompletionItemKind.Keyword, insertText: 'version: ' },
    { label: 'description', kind: CompletionItemKind.Keyword, insertText: 'description: ' },
    {
      label: 'input_schema',
      kind: CompletionItemKind.Keyword,
      insertText: 'input_schema:\n  type: object\n  properties:\n    ',
    },
    {
      label: 'context_schema',
      kind: CompletionItemKind.Keyword,
      insertText: 'context_schema:\n  type: object\n  properties:\n    ',
    },
    {
      label: 'output_schema',
      kind: CompletionItemKind.Keyword,
      insertText: 'output_schema:\n  type: object\n  properties:\n    ',
    },
    { label: 'nodes', kind: CompletionItemKind.Keyword, insertText: 'nodes:\n  ' },
    { label: 'transitions', kind: CompletionItemKind.Keyword, insertText: 'transitions:\n  ' },
    {
      label: 'initial_node_ref',
      kind: CompletionItemKind.Keyword,
      insertText: 'initial_node_ref: ',
    },
    { label: 'timeout_ms', kind: CompletionItemKind.Keyword, insertText: 'timeout_ms: ' },
    { label: 'on_timeout', kind: CompletionItemKind.Keyword, insertText: 'on_timeout: ' },
  ];
}

function getActionKindCompletions(): CompletionItem[] {
  return [
    { label: 'llm', kind: CompletionItemKind.EnumMember, detail: 'LLM inference' },
    { label: 'mcp', kind: CompletionItemKind.EnumMember, detail: 'MCP tool call' },
    { label: 'http', kind: CompletionItemKind.EnumMember, detail: 'HTTP API call' },
    { label: 'tool', kind: CompletionItemKind.EnumMember, detail: 'Standard library tool' },
    { label: 'shell', kind: CompletionItemKind.EnumMember, detail: 'Shell command' },
    { label: 'workflow', kind: CompletionItemKind.EnumMember, detail: 'Sub-workflow' },
    { label: 'context', kind: CompletionItemKind.EnumMember, detail: 'Context transformation' },
    { label: 'vector', kind: CompletionItemKind.EnumMember, detail: 'Vector search' },
    { label: 'metric', kind: CompletionItemKind.EnumMember, detail: 'Emit metric' },
    { label: 'human', kind: CompletionItemKind.EnumMember, detail: 'Human approval' },
  ];
}

function getTaskCompletions(
  lines: string[],
  currentLine: number,
  indent: number,
  trimmed: string,
): CompletionItem[] {
  // Check if inside steps array
  let inSteps = false;
  for (let i = currentLine - 1; i >= 0; i--) {
    const prevLine = lines[i];
    if (prevLine.match(/^steps\s*:/)) {
      inSteps = true;
      break;
    }
    if (prevLine.match(/^\S/) && !prevLine.startsWith('#')) {
      break;
    }
  }

  if (inSteps && indent >= 4 && !trimmed.includes(':')) {
    return [
      { label: 'ref', kind: CompletionItemKind.Property, insertText: 'ref: ' },
      { label: 'ordinal', kind: CompletionItemKind.Property, insertText: 'ordinal: ' },
      { label: 'action_id', kind: CompletionItemKind.Property, insertText: 'action_id: ' },
      {
        label: 'action_version',
        kind: CompletionItemKind.Property,
        insertText: 'action_version: ',
      },
      {
        label: 'input_mapping',
        kind: CompletionItemKind.Property,
        insertText: 'input_mapping:\n      ',
      },
      {
        label: 'output_mapping',
        kind: CompletionItemKind.Property,
        insertText: 'output_mapping:\n      ',
      },
      { label: 'on_failure', kind: CompletionItemKind.Property, insertText: 'on_failure: ' },
      {
        label: 'condition',
        kind: CompletionItemKind.Property,
        insertText: 'condition:\n      if: \n      then: continue\n      else: skip',
      },
    ];
  }

  // on_failure value completions
  if (trimmed.startsWith('on_failure:')) {
    return [
      { label: 'abort', kind: CompletionItemKind.EnumMember, detail: 'Task fails immediately' },
      { label: 'retry', kind: CompletionItemKind.EnumMember, detail: 'Restart task from step 0' },
      { label: 'continue', kind: CompletionItemKind.EnumMember, detail: 'Ignore failure, proceed' },
    ];
  }

  // backoff value completions
  if (trimmed.startsWith('backoff:')) {
    return [
      { label: 'none', kind: CompletionItemKind.EnumMember },
      { label: 'linear', kind: CompletionItemKind.EnumMember },
      { label: 'exponential', kind: CompletionItemKind.EnumMember },
    ];
  }

  return [];
}

function getWorkflowCompletions(
  parsed: WflowDocument | undefined,
  lines: string[],
  currentLine: number,
  indent: number,
  trimmed: string,
  linePrefix: string,
): CompletionItem[] {
  if (!parsed) return [];

  // Extract valid paths from schemas
  const inputPaths = extractPaths(parsed.input_schema, 'input');
  const contextPaths = extractPaths(parsed.context_schema, 'state');
  const outputPaths = extractPaths(parsed.output_schema, 'output');
  const nodeRefs = Object.keys(parsed.nodes || {});
  const transitionRefs = Object.keys(parsed.transitions || {});

  // initial_node_ref value completions
  if (trimmed.startsWith('initial_node_ref:')) {
    return nodeRefs.map((ref) => ({
      label: ref,
      kind: CompletionItemKind.Reference,
    }));
  }

  // Detect which section we're in
  let inNodes = false;
  let inTransitions = false;
  for (let i = currentLine - 1; i >= 0; i--) {
    const prevLine = lines[i];
    if (prevLine.match(/^nodes\s*:/)) {
      inNodes = true;
      break;
    }
    if (prevLine.match(/^transitions\s*:/)) {
      inTransitions = true;
      break;
    }
    if (prevLine.match(/^\S/) && !prevLine.startsWith('#')) {
      break;
    }
  }

  // Node property completions
  if (inNodes && indent === 4 && !trimmed.includes(':')) {
    return [
      { label: 'name', kind: CompletionItemKind.Property, insertText: 'name: ' },
      { label: 'task_id', kind: CompletionItemKind.Property, insertText: 'task_id: ' },
      { label: 'task_version', kind: CompletionItemKind.Property, insertText: 'task_version: ' },
      {
        label: 'input_mapping',
        kind: CompletionItemKind.Property,
        insertText: 'input_mapping:\n      ',
      },
      {
        label: 'output_mapping',
        kind: CompletionItemKind.Property,
        insertText: 'output_mapping:\n      ',
      },
      {
        label: 'resource_bindings',
        kind: CompletionItemKind.Property,
        insertText: 'resource_bindings:\n      ',
      },
    ];
  }

  // Transition property completions
  if (inTransitions && indent === 4 && !trimmed.includes(':')) {
    return [
      { label: 'from_node_ref', kind: CompletionItemKind.Property, insertText: 'from_node_ref: ' },
      { label: 'to_node_ref', kind: CompletionItemKind.Property, insertText: 'to_node_ref: ' },
      { label: 'priority', kind: CompletionItemKind.Property, insertText: 'priority: ' },
      {
        label: 'condition',
        kind: CompletionItemKind.Property,
        insertText: 'condition:\n      type: ',
      },
      { label: 'spawn_count', kind: CompletionItemKind.Property, insertText: 'spawn_count: ' },
      {
        label: 'foreach',
        kind: CompletionItemKind.Property,
        insertText: 'foreach:\n      collection: \n      item_var: ',
      },
      {
        label: 'synchronization',
        kind: CompletionItemKind.Property,
        insertText: 'synchronization:\n      strategy: ',
      },
    ];
  }

  // from_node_ref / to_node_ref value completions
  if (trimmed.match(/^(from_node_ref|to_node_ref)\s*:\s*/)) {
    return nodeRefs.map((ref) => ({
      label: ref,
      kind: CompletionItemKind.Reference,
    }));
  }

  // sibling_group value completions
  if (trimmed.match(/^sibling_group\s*:\s*/)) {
    return transitionRefs.map((ref) => ({
      label: ref,
      kind: CompletionItemKind.Reference,
    }));
  }

  // JSONPath completions for input_mapping values
  if (trimmed.includes('"$.') || trimmed.endsWith('"$')) {
    const items: CompletionItem[] = [];
    for (const path of inputPaths) {
      items.push({
        label: `$.${path}`,
        kind: CompletionItemKind.Value,
        insertText: `$.${path}"`,
      });
    }
    for (const path of contextPaths) {
      items.push({
        label: `$.${path}`,
        kind: CompletionItemKind.Value,
        insertText: `$.${path}"`,
      });
    }
    return items;
  }

  // output_mapping key completions
  if (inNodes && indent === 6 && linePrefix.includes('output_mapping')) {
    const items: CompletionItem[] = [];
    for (const path of contextPaths) {
      items.push({
        label: path,
        kind: CompletionItemKind.Property,
        insertText: `"${path}": `,
      });
    }
    for (const path of outputPaths) {
      items.push({
        label: path,
        kind: CompletionItemKind.Property,
        insertText: `"${path}": `,
      });
    }
    return items;
  }

  // Context path completions
  if (trimmed.startsWith('"state.') || trimmed.startsWith('"output.')) {
    const items: CompletionItem[] = [];
    for (const path of contextPaths) {
      items.push({
        label: path,
        kind: CompletionItemKind.Property,
      });
    }
    for (const path of outputPaths) {
      items.push({
        label: path,
        kind: CompletionItemKind.Property,
      });
    }
    return items;
  }

  return [];
}
