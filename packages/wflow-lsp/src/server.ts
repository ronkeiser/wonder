import { existsSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Definition,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  InitializeParams,
  InitializeResult,
  InsertTextFormat,
  Location,
  MarkupKind,
  ProposedFeatures,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { parse as parseYaml } from 'yaml';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Semantic token types - these map to VS Code's built-in token types
const tokenTypes = ['function', 'class', 'variable', 'property'];
const tokenModifiers = ['declaration', 'definition'];

const legend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers,
};

// Import resolution types
interface ResolvedImport {
  alias: string;
  path: string;
  resolvedUri: string | null; // null if file doesn't exist
  fileType: 'task' | 'action' | 'wflow' | 'unknown';
  line: number;
}

interface ImportsMap {
  byAlias: Map<string, ResolvedImport>;
  all: ResolvedImport[];
}

// Cache of resolved imports per document URI
const importCache = new Map<string, ImportsMap>();

// Resolve an import path relative to a document
function resolveImportPath(importPath: string, documentUri: string): string | null {
  try {
    const documentPath = fileURLToPath(documentUri);
    const documentDir = dirname(documentPath);

    // Handle relative imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const resolved = resolve(documentDir, importPath);
      return existsSync(resolved) ? pathToFileURL(resolved).href : null;
    }

    // Handle package imports (@library/..., @project/...)
    // TODO: Implement package resolution from workspace config
    // For now, just check if it looks like a package path
    if (importPath.startsWith('@')) {
      // Could resolve from workspace root or configured paths
      // For now, return the path as-is to indicate it's a valid package ref
      return `package:${importPath}`;
    }

    return null;
  } catch {
    return null;
  }
}

// Get file type from path
function getFileTypeFromPath(path: string): 'task' | 'action' | 'wflow' | 'unknown' {
  if (path.endsWith('.task')) return 'task';
  if (path.endsWith('.action')) return 'action';
  if (path.endsWith('.wflow')) return 'wflow';
  return 'unknown';
}

// Parse imports from a document
function parseImports(
  imports: Record<string, string> | undefined,
  documentUri: string,
  lines: string[],
): ImportsMap {
  const result: ImportsMap = {
    byAlias: new Map(),
    all: [],
  };

  if (!imports || typeof imports !== 'object') return result;

  for (const [alias, path] of Object.entries(imports)) {
    if (typeof path !== 'string') continue;

    // Find the line where this import is defined
    const line = lines.findIndex((l) => {
      const regex = new RegExp(`^\\s*${escapeRegex(alias)}\\s*:\\s*`);
      return regex.test(l);
    });

    const resolvedUri = resolveImportPath(path, documentUri);
    const fileType = getFileTypeFromPath(path);

    const resolved: ResolvedImport = {
      alias,
      path,
      resolvedUri,
      fileType,
      line: line !== -1 ? line : 0,
    };

    result.byAlias.set(alias, resolved);
    result.all.push(resolved);
  }

  return result;
}

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      completionProvider: {
        triggerCharacters: ['.', ':', '$', '"', '/'],
        resolveProvider: false,
      },
      semanticTokensProvider: {
        legend,
        full: true,
      },
      definitionProvider: true,
    },
  };
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

// Hover handler
connection.onHover((params): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  let parsed: WflowDoc | TaskDoc | ActionDoc;
  try {
    parsed = parseYaml(text) as WflowDoc | TaskDoc | ActionDoc;
  } catch {
    return null;
  }
  if (!parsed) return null;

  const position = params.position;
  const lines = text.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  // Get the word at cursor position
  const wordRange = getWordRangeAtPosition(line, position.character);
  if (!wordRange) return null;

  const word = line.substring(wordRange.start, wordRange.end);

  // Check if hovering over an import alias (in task_id or action_id)
  const imports = importCache.get(document.uri);
  if (imports) {
    const imp = imports.byAlias.get(word);
    if (imp) {
      // Check context - is this a task_id, action_id, or import definition?
      const isTaskIdRef = line.includes('task_id:');
      const isActionIdRef = line.includes('action_id:');
      const isImportDef = line.match(new RegExp(`^\\s*${escapeRegex(word)}\\s*:`));

      if (isTaskIdRef || isActionIdRef || isImportDef) {
        return createImportHover(imp);
      }
    }
  }

  // Check if hovering over a node ref (workflows only)
  const wflowDoc = parsed as WflowDoc;
  if (wflowDoc.nodes && wflowDoc.nodes[word]) {
    const node = wflowDoc.nodes[word];
    return createNodeHover(word, node, imports);
  }

  // Check if hovering over a JSONPath ($.input.*, $.state.*)
  const jsonPathMatch = word.match(/^\$\.(input|state)\.(.+)$/);
  if (jsonPathMatch) {
    const [, schemaType, pathRest] = jsonPathMatch;
    const wflow = parsed as WflowDoc;
    const schema = schemaType === 'input' ? wflow.input_schema : wflow.context_schema;
    return createPathHover(word, pathRest, schema, schemaType);
  }

  // Check if hovering over a context path (state.*, output.*)
  const contextPathMatch = word.match(/^(state|output)\.(.+)$/);
  if (contextPathMatch) {
    const [, schemaType, pathRest] = contextPathMatch;
    const wflow = parsed as WflowDoc;
    const schema = schemaType === 'state' ? wflow.context_schema : wflow.output_schema;
    return createPathHover(word, pathRest, schema, schemaType);
  }

  return null;
});

// Go-to-definition handler
connection.onDefinition((params): Definition | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[params.position.line];
  if (!line) return null;

  const wordRange = getWordRangeAtPosition(line, params.position.character);
  if (!wordRange) return null;

  const word = line.substring(wordRange.start, wordRange.end);

  // Check if it's an import reference
  const imports = importCache.get(document.uri);
  if (imports) {
    const imp = imports.byAlias.get(word);
    if (imp && imp.resolvedUri && !imp.resolvedUri.startsWith('package:')) {
      // Go to the imported file
      return Location.create(imp.resolvedUri, {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      });
    }
  }

  // Check if it's a node ref - go to its definition
  let parsed: WflowDoc;
  try {
    parsed = parseYaml(text) as WflowDoc;
  } catch {
    return null;
  }
  if (!parsed?.nodes) return null;

  // Is this word a node ref?
  if (parsed.nodes[word]) {
    // Find the line where this node is defined
    const nodeDefLine = lines.findIndex((l) => {
      const regex = new RegExp(`^\\s{2}${escapeRegex(word)}\\s*:`);
      return regex.test(l);
    });
    if (nodeDefLine !== -1) {
      const nodeLine = lines[nodeDefLine];
      const charStart = nodeLine.indexOf(word);
      return Location.create(document.uri, {
        start: { line: nodeDefLine, character: charStart },
        end: { line: nodeDefLine, character: charStart + word.length },
      });
    }
  }

  return null;
});

function getWordRangeAtPosition(
  line: string,
  character: number,
): { start: number; end: number } | null {
  // Extend word to include $, ., and alphanumeric/underscore (for JSONPath)
  const wordChars = /[\w$._-]/;

  let start = character;
  let end = character;

  while (start > 0 && wordChars.test(line[start - 1])) {
    start--;
  }
  while (end < line.length && wordChars.test(line[end])) {
    end++;
  }

  if (start === end) return null;
  return { start, end };
}

function createNodeHover(nodeRef: string, node: NodeDecl, imports?: ImportsMap): Hover {
  const lines: string[] = [];

  lines.push(`### Node: \`${nodeRef}\``);
  if (node.name) {
    lines.push(`**${node.name}**`);
  }
  lines.push('');

  if (node.task_id) {
    // Check if task_id is an imported alias
    const imp = imports?.byAlias.get(node.task_id);
    if (imp) {
      lines.push(`**Task:** \`${node.task_id}\` → \`${imp.path}\` v${node.task_version || 1}`);
    } else {
      lines.push(`**Task:** \`${node.task_id}\` v${node.task_version || 1}`);
    }
  }

  if (node.input_mapping && Object.keys(node.input_mapping).length > 0) {
    lines.push('');
    lines.push('**Input Mapping:**');
    for (const [key, value] of Object.entries(node.input_mapping)) {
      lines.push(`- \`${key}\` ← \`${value}\``);
    }
  }

  if (node.output_mapping && Object.keys(node.output_mapping).length > 0) {
    lines.push('');
    lines.push('**Output Mapping:**');
    for (const [contextPath, taskOutput] of Object.entries(node.output_mapping)) {
      lines.push(`- \`${contextPath}\` ← \`${taskOutput}\``);
    }
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: lines.join('\n'),
    },
  };
}

function createImportHover(imp: ResolvedImport): Hover {
  const lines: string[] = [];

  lines.push(`### Import: \`${imp.alias}\``);
  lines.push('');
  lines.push(`**Path:** \`${imp.path}\``);
  lines.push(`**Type:** ${imp.fileType}`);

  if (imp.resolvedUri) {
    if (imp.resolvedUri.startsWith('package:')) {
      lines.push(`**Status:** Package reference (${imp.resolvedUri.slice(8)})`);
    } else {
      lines.push(`**Status:** ✓ File exists`);
    }
  } else {
    lines.push(`**Status:** ✗ File not found`);
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: lines.join('\n'),
    },
  };
}

function createPathHover(
  fullPath: string,
  pathRest: string,
  schema: JSONSchemaProperty | undefined,
  schemaType: string,
): Hover | null {
  if (!schema) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${fullPath}**\n\n_No schema defined for ${schemaType}_`,
      },
    };
  }

  // Navigate to the property in the schema
  const pathParts = pathRest.split('.');
  let current: JSONSchemaProperty | undefined = schema;

  for (const part of pathParts) {
    if (!current?.properties?.[part]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${fullPath}**\n\n_Property not found in schema_`,
        },
      };
    }
    current = current.properties[part];
  }

  const lines: string[] = [];
  lines.push(`**${fullPath}**`);
  lines.push('');

  if (current.type) {
    lines.push(`**Type:** \`${current.type}\``);
  }

  if (current.type === 'object' && current.properties) {
    lines.push('');
    lines.push('**Properties:**');
    for (const [key, prop] of Object.entries(current.properties)) {
      lines.push(`- \`${key}\`: ${prop.type || 'any'}`);
    }
  }

  if (current.type === 'array' && current.items) {
    lines.push(`**Items:** \`${current.items.type || 'any'}\``);
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: lines.join('\n'),
    },
  };
}

// Completion handler
connection.onCompletion((params): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const uri = document.uri;
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[params.position.line];
  const linePrefix = line.substring(0, params.position.character);

  // Detect file type
  const isTask = uri.endsWith('.task');
  const isAction = uri.endsWith('.action');
  const isWorkflow = uri.endsWith('.wflow');

  // Determine context based on line content and indentation
  const indent = line.length - line.trimStart().length;
  const trimmed = linePrefix.trim();

  // Get imports for this document
  const imports = importCache.get(uri);

  // Top-level completions (indent 0)
  if (indent === 0 && !trimmed.includes(':')) {
    const baseItems: CompletionItem[] = [
      {
        label: 'imports',
        kind: CompletionItemKind.Keyword,
        insertText: 'imports:\n  ',
        detail: 'Import tasks, actions, or workflows',
      },
    ];

    if (isTask) {
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
    } else if (isAction) {
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
    } else {
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
  }

  // Action kind completions
  if (isAction && trimmed.startsWith('kind:')) {
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

  // Task step completions
  if (isTask) {
    // Inside steps array
    let inSteps = false;
    for (let i = params.position.line - 1; i >= 0; i--) {
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
        {
          label: 'continue',
          kind: CompletionItemKind.EnumMember,
          detail: 'Ignore failure, proceed',
        },
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
  }

  // Workflow-specific completions
  if (isWorkflow) {
    let parsed: WflowDoc;
    try {
      parsed = parseYaml(text) as WflowDoc;
    } catch {
      parsed = {} as WflowDoc;
    }

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
    for (let i = params.position.line - 1; i >= 0; i--) {
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

    // Node property completions (indent 4)
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

    // Transition property completions (indent 4)
    if (inTransitions && indent === 4 && !trimmed.includes(':')) {
      return [
        {
          label: 'from_node_ref',
          kind: CompletionItemKind.Property,
          insertText: 'from_node_ref: ',
        },
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

    // JSONPath completions for input_mapping values ($.input.* or $.state.*)
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

    // output_mapping key completions (state.* or output.*)
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

    // General output_mapping context path completions
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
  }

  return [];
});

// Semantic tokens handler - highlights node/transition refs and import aliases
connection.onRequest('textDocument/semanticTokens/full', (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };

  const text = document.getText();
  const uri = document.uri;
  const isWorkflow = uri.endsWith('.wflow');
  const isTask = uri.endsWith('.task');

  let parsed: WflowDoc | TaskDoc;
  try {
    parsed = parseYaml(text) as WflowDoc | TaskDoc;
  } catch {
    return { data: [] };
  }
  if (!parsed) return { data: [] };

  const tokens: Array<{
    line: number;
    col: number;
    length: number;
    type: number;
    modifier: number;
  }> = [];
  const lines = text.split('\n');

  // Get imports for this document
  const imports = importCache.get(uri);
  const importAliases = imports ? new Set(imports.byAlias.keys()) : new Set<string>();

  // For workflows, also highlight node/transition refs
  if (isWorkflow) {
    const wflowDoc = parsed as WflowDoc;

    // Collect all node refs and transition refs
    const nodeRefs = new Set(Object.keys(wflowDoc.nodes || {}));
    const transitionRefs = new Set(Object.keys(wflowDoc.transitions || {}));

    // Track which section we're in
    let currentSection: 'none' | 'nodes' | 'transitions' | 'imports' | 'other' = 'none';

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const lineIndent = line.length - line.trimStart().length;

      // Highlight task_id values that are imports
      const taskIdMatch = trimmed.match(/^task_id:\s*(\S+)/);
      if (taskIdMatch && importAliases.has(taskIdMatch[1])) {
        const col = line.lastIndexOf(taskIdMatch[1]);
        tokens.push({ line: lineNum, col, length: taskIdMatch[1].length, type: 2, modifier: 0 }); // variable
      }

      // Detect top-level section changes
      if (lineIndent === 0) {
        if (trimmed.startsWith('nodes:')) {
          currentSection = 'nodes';
        } else if (trimmed.startsWith('transitions:')) {
          currentSection = 'transitions';
        } else if (trimmed.startsWith('imports:')) {
          currentSection = 'imports';
        } else if (trimmed.startsWith('initial_node_ref:')) {
          // Highlight the value after initial_node_ref:
          const match = line.match(/initial_node_ref:\s*(\S+)/);
          if (match && nodeRefs.has(match[1])) {
            const col = line.indexOf(match[1]);
            tokens.push({ line: lineNum, col, length: match[1].length, type: 0, modifier: 0 });
          }
          currentSection = 'other';
        } else {
          currentSection = 'other';
        }
        continue;
      }

      // Inside imports section - highlight import aliases at indent level 2
      if (currentSection === 'imports' && lineIndent === 2) {
        const keyMatch = trimmed.match(/^(\w+):/);
        if (keyMatch && importAliases.has(keyMatch[1])) {
          const col = line.indexOf(keyMatch[1]);
          tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 2, modifier: 1 }); // variable, definition
        }
      }

      // Inside nodes section - highlight node definition keys at indent level 2
      if (currentSection === 'nodes' && lineIndent === 2) {
        const keyMatch = trimmed.match(/^(\w+):/);
        if (keyMatch && nodeRefs.has(keyMatch[1])) {
          const col = line.indexOf(keyMatch[1]);
          tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 0, modifier: 1 }); // definition
        }
      }

      // Inside transitions section
      if (currentSection === 'transitions') {
        // Transition definition keys at indent level 2
        if (lineIndent === 2) {
          const keyMatch = trimmed.match(/^(\w+):/);
          if (keyMatch && transitionRefs.has(keyMatch[1])) {
            const col = line.indexOf(keyMatch[1]);
            tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 1, modifier: 1 }); // definition
          }
        }

        // from_node_ref / to_node_ref values
        const nodeRefMatch = trimmed.match(/^(from_node_ref|to_node_ref):\s*(\S+)/);
        if (nodeRefMatch && nodeRefs.has(nodeRefMatch[2])) {
          const col = line.lastIndexOf(nodeRefMatch[2]);
          tokens.push({ line: lineNum, col, length: nodeRefMatch[2].length, type: 0, modifier: 0 });
        }

        // sibling_group value (transition ref)
        const siblingMatch = trimmed.match(/^sibling_group:\s*(\S+)/);
        if (siblingMatch && transitionRefs.has(siblingMatch[1])) {
          const col = line.lastIndexOf(siblingMatch[1]);
          tokens.push({ line: lineNum, col, length: siblingMatch[1].length, type: 1, modifier: 0 });
        }
      }
    }
  }

  // For tasks, highlight action_id imports
  if (isTask) {
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const lineIndent = line.length - line.trimStart().length;

      // Highlight action_id values that are imports
      const actionIdMatch = trimmed.match(/^action_id:\s*(\S+)/);
      if (actionIdMatch && importAliases.has(actionIdMatch[1])) {
        const col = line.lastIndexOf(actionIdMatch[1]);
        tokens.push({ line: lineNum, col, length: actionIdMatch[1].length, type: 2, modifier: 0 }); // variable
      }

      // Highlight import alias definitions
      if (lineIndent === 2 && trimmed.match(/^imports\s*:/)) {
        // We're in imports section
      }
    }

    // Also scan for import definitions
    let inImports = false;
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();
      const lineIndent = line.length - line.trimStart().length;

      if (lineIndent === 0 && trimmed.startsWith('imports:')) {
        inImports = true;
        continue;
      }
      if (lineIndent === 0 && !trimmed.startsWith('#')) {
        inImports = false;
        continue;
      }
      if (inImports && lineIndent === 2) {
        const keyMatch = trimmed.match(/^(\w+):/);
        if (keyMatch && importAliases.has(keyMatch[1])) {
          const col = line.indexOf(keyMatch[1]);
          tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 2, modifier: 1 }); // variable, definition
        }
      }
    }
  }

  // Sort tokens by position (required by semantic tokens protocol)
  tokens.sort((a, b) => a.line - b.line || a.col - b.col);

  const builder = new SemanticTokensBuilder();
  for (const t of tokens) {
    builder.push(t.line, t.col, t.length, t.type, t.modifier);
  }

  return builder.build();
});

interface TransitionDecl {
  // Note: 'ref' is NOT a field - the YAML map key IS the ref
  from_node_ref?: string;
  to_node_ref?: string | null;
  priority?: number;
  condition?: { type: string; expr?: string; definition?: object; reads?: string[] };
  spawn_count?: number;
  foreach?: { collection: string; item_var: string };
  synchronization?: object;
  loop_config?: object;
}

interface JSONSchemaProperty {
  type?: string;
  properties?: Record<string, JSONSchemaProperty>;
  items?: JSONSchemaProperty;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  additionalProperties?: boolean | JSONSchemaProperty;
}

interface NodeDecl {
  ref?: string;
  name?: string;
  task_id?: string;
  task_version?: number;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  resource_bindings?: Record<string, string>;
}

interface WflowDoc {
  imports?: Record<string, string>;
  workflow?: string;
  version?: number;
  description?: string;
  input_schema?: JSONSchemaProperty;
  context_schema?: JSONSchemaProperty;
  output_schema?: JSONSchemaProperty;
  nodes?: Record<string, NodeDecl>;
  transitions?: Record<string, TransitionDecl>;
  initial_node_ref?: string;
  timeout_ms?: number;
  on_timeout?: string;
}

// Allowed properties per primitive - based on primitives.md
const WORKFLOW_ALLOWED_PROPS = new Set([
  'imports',
  'workflow',
  'version',
  'description',
  'input_schema',
  'context_schema',
  'output_schema',
  'nodes',
  'transitions',
  'initial_node_ref',
  'timeout_ms',
  'on_timeout',
]);

const NODE_ALLOWED_PROPS = new Set([
  // Note: 'ref' is NOT allowed - the YAML map key IS the ref
  'name',
  'task_id',
  'task_version',
  'input_mapping',
  'output_mapping',
  'resource_bindings',
]);

const TRANSITION_ALLOWED_PROPS = new Set([
  // Note: 'ref' is NOT allowed - the YAML map key IS the ref
  'from_node_ref',
  'to_node_ref',
  'priority',
  'condition',
  'spawn_count',
  'foreach',
  'synchronization',
  'loop_config',
]);

const CONDITION_ALLOWED_PROPS = new Set(['type', 'expr', 'definition', 'reads']);

const FOREACH_ALLOWED_PROPS = new Set(['collection', 'item_var']);

const SYNCHRONIZATION_ALLOWED_PROPS = new Set([
  'strategy',
  'sibling_group',
  'timeout_ms',
  'on_timeout',
  'merge',
]);

const MERGE_ALLOWED_PROPS = new Set(['source', 'target', 'strategy']);

// TaskDef types
interface StepDecl {
  ref?: string;
  ordinal?: number;
  action_id?: string;
  action_version?: number;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  on_failure?: 'abort' | 'retry' | 'continue';
  condition?: {
    if: string;
    then: 'continue' | 'skip' | 'succeed' | 'fail';
    else: 'continue' | 'skip' | 'succeed' | 'fail';
  };
}

interface TaskDoc {
  imports?: Record<string, string>;
  task?: string;
  version?: number;
  name?: string;
  description?: string;
  tags?: string[];
  input_schema?: JSONSchemaProperty;
  output_schema?: JSONSchemaProperty;
  steps?: StepDecl[];
  retry?: {
    max_attempts: number;
    backoff: 'none' | 'linear' | 'exponential';
    initial_delay_ms: number;
    max_delay_ms?: number;
  };
  timeout_ms?: number;
}

// ActionDef types
type ActionKind =
  | 'llm'
  | 'mcp'
  | 'http'
  | 'tool'
  | 'shell'
  | 'workflow'
  | 'context'
  | 'vector'
  | 'metric'
  | 'human';

interface ActionDoc {
  imports?: Record<string, string>;
  action?: string;
  version?: number;
  name?: string;
  description?: string;
  kind?: ActionKind;
  implementation?: Record<string, unknown>;
  requires?: JSONSchemaProperty;
  produces?: JSONSchemaProperty;
  execution?: {
    timeout_ms?: number;
    retry_policy?: {
      max_attempts: number;
      backoff: 'none' | 'linear' | 'exponential';
      initial_delay_ms: number;
      max_delay_ms?: number;
      retryable_errors?: string[];
    };
  };
  idempotency?: {
    key_template: string;
    ttl_seconds?: number;
  };
}

// Allowed properties for TaskDef
const TASK_ALLOWED_PROPS = new Set([
  'imports',
  'task',
  'version',
  'name',
  'description',
  'tags',
  'input_schema',
  'output_schema',
  'steps',
  'retry',
  'timeout_ms',
]);

const STEP_ALLOWED_PROPS = new Set([
  'ref',
  'ordinal',
  'action_id',
  'action_version',
  'input_mapping',
  'output_mapping',
  'on_failure',
  'condition',
]);

const STEP_CONDITION_ALLOWED_PROPS = new Set(['if', 'then', 'else']);

const RETRY_ALLOWED_PROPS = new Set([
  'max_attempts',
  'backoff',
  'initial_delay_ms',
  'max_delay_ms',
]);

// Allowed properties for ActionDef
const ACTION_ALLOWED_PROPS = new Set([
  'imports',
  'action',
  'version',
  'name',
  'description',
  'kind',
  'implementation',
  'requires',
  'produces',
  'execution',
  'idempotency',
]);

const ACTION_EXECUTION_ALLOWED_PROPS = new Set(['timeout_ms', 'retry_policy']);

const ACTION_RETRY_POLICY_ALLOWED_PROPS = new Set([
  'max_attempts',
  'backoff',
  'initial_delay_ms',
  'max_delay_ms',
  'retryable_errors',
]);

const ACTION_IDEMPOTENCY_ALLOWED_PROPS = new Set(['key_template', 'ttl_seconds']);

// Kind-specific implementation properties
const IMPLEMENTATION_PROPS_BY_KIND: Record<string, Set<string>> = {
  llm: new Set(['prompt_spec_id', 'model_profile_id']),
  mcp: new Set(['mcp_server_id', 'tool_name']),
  http: new Set(['url_template', 'method', 'headers', 'body_template']),
  tool: new Set(['tool_name', 'tool_version']),
  shell: new Set(['command_template', 'working_dir', 'resource_name']),
  workflow: new Set([
    'workflow_def_id',
    'version',
    'inherit_artifacts',
    'pass_resources',
    'on_failure',
  ]),
  context: new Set(['updates']),
  vector: new Set(['vector_index_id', 'top_k', 'similarity_threshold']),
  metric: new Set(['metric_name', 'value', 'dimensions']),
  human: new Set(['prompt', 'timeout_ms', 'on_timeout']),
};

// JSON Schema allowed properties (subset we support)
const JSON_SCHEMA_ALLOWED_PROPS = new Set([
  'type',
  'properties',
  'items',
  'required',
  'enum',
  'const',
  'description',
  'default',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'additionalProperties',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  '$ref',
  'title',
  'examples',
  'nullable',
]);

// Graph analysis types
interface GraphAnalysis {
  adjacency: Map<string, string[]>; // node → successors
  predecessors: Map<string, string[]>; // node → predecessors
}

interface DataFlowAnalysis {
  // For each node, which state paths are guaranteed written before it executes
  availableWrites: Map<string, Set<string>>;
  // For each state path, which nodes write to it
  writers: Map<string, { nodeRef: string; conditional: boolean }[]>;
}

// Extract all valid paths from a JSON Schema
function extractPaths(schema: JSONSchemaProperty | undefined, prefix: string): Set<string> {
  const paths = new Set<string>();
  if (!schema) return paths;

  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);

      // Recurse into nested objects
      if (value.type === 'object' && value.properties) {
        for (const nested of extractPaths(value, path)) {
          paths.add(nested);
        }
      }
    }
  }

  return paths;
}

// Find similar paths for suggestions (simple Levenshtein-ish)
function findSimilarPaths(target: string, validPaths: Set<string>): string[] {
  const suggestions: string[] = [];
  const targetLower = target.toLowerCase();

  for (const path of validPaths) {
    const pathLower = path.toLowerCase();
    // Check if one contains the other, or they share a suffix
    if (pathLower.includes(targetLower) || targetLower.includes(pathLower)) {
      suggestions.push(path);
    } else if (path.split('.').pop() === target.split('.').pop()) {
      suggestions.push(path);
    }
  }

  return suggestions.slice(0, 3);
}

// Build graph from transitions
function buildGraph(doc: WflowDoc): GraphAnalysis {
  const adjacency = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  // Initialize all nodes
  for (const nodeRef of Object.keys(doc.nodes || {})) {
    adjacency.set(nodeRef, []);
    predecessors.set(nodeRef, []);
  }

  // Build edges from transitions (now a map)
  for (const transition of Object.values(doc.transitions || {})) {
    const from = transition.from_node_ref;
    const to = transition.to_node_ref;

    if (from && to && adjacency.has(from) && predecessors.has(to)) {
      adjacency.get(from)!.push(to);
      predecessors.get(to)!.push(from);
    }
  }

  return { adjacency, predecessors };
}

// Detect cycles using DFS - returns array of cycles found (each cycle is array of node refs)
function detectCycles(graph: GraphAnalysis): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    for (const successor of graph.adjacency.get(node) || []) {
      if (!visited.has(successor)) {
        dfs(successor);
      } else if (recursionStack.has(successor)) {
        // Found a cycle - extract the cycle from path
        const cycleStart = path.indexOf(successor);
        const cycle = path.slice(cycleStart);
        cycle.push(successor); // Complete the cycle
        cycles.push(cycle);
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  // Run DFS from each unvisited node
  for (const node of graph.adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

// Topological sort (Kahn's algorithm) - returns nodes in execution order
function topologicalSort(doc: WflowDoc, graph: GraphAnalysis): string[] {
  const inDegree = new Map<string, number>();
  const result: string[] = [];

  // Calculate in-degrees
  for (const nodeRef of Object.keys(doc.nodes || {})) {
    inDegree.set(nodeRef, (graph.predecessors.get(nodeRef) || []).length);
  }

  // Start with nodes that have no predecessors (in-degree 0)
  // But prefer initial_node_ref if it exists
  const queue: string[] = [];
  if (doc.initial_node_ref && inDegree.get(doc.initial_node_ref) === 0) {
    queue.push(doc.initial_node_ref);
  }
  for (const [nodeRef, degree] of inDegree) {
    if (degree === 0 && nodeRef !== doc.initial_node_ref) {
      queue.push(nodeRef);
    }
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const successor of graph.adjacency.get(node) || []) {
      const newDegree = inDegree.get(successor)! - 1;
      inDegree.set(successor, newDegree);
      if (newDegree === 0) {
        queue.push(successor);
      }
    }
  }

  return result;
}

// Analyze data flow - which paths are available at each node
function analyzeDataFlow(
  doc: WflowDoc,
  graph: GraphAnalysis,
  inputPaths: Set<string>,
): DataFlowAnalysis {
  const availableWrites = new Map<string, Set<string>>();
  const writers = new Map<string, { nodeRef: string; conditional: boolean }[]>();

  // Get topological order
  const order = topologicalSort(doc, graph);

  // Build transition lookup for checking conditions (now a map)
  const transitionMap = new Map<string, TransitionDecl[]>();
  for (const t of Object.values(doc.transitions || {})) {
    if (t.from_node_ref && t.to_node_ref) {
      const key = `${t.from_node_ref}->${t.to_node_ref}`;
      if (!transitionMap.has(key)) {
        transitionMap.set(key, []);
      }
      transitionMap.get(key)!.push(t);
    }
  }

  // Process nodes in topological order
  for (const nodeRef of order) {
    // Start with input paths (always available)
    const available = new Set<string>(inputPaths);

    const preds = graph.predecessors.get(nodeRef) || [];

    for (const pred of preds) {
      const predNode = doc.nodes?.[pred];
      if (!predNode?.output_mapping) continue;

      // Check if transition from pred to this node is conditional
      const transitionKey = `${pred}->${nodeRef}`;
      const transitions = transitionMap.get(transitionKey) || [];
      const isConditional = transitions.some((t) => t.condition !== undefined);

      // Add all writes from predecessor
      for (const contextPath of Object.keys(predNode.output_mapping)) {
        if (contextPath.startsWith('state.')) {
          // Only state paths propagate (not output paths)
          if (!isConditional) {
            available.add(contextPath);
          }
          // Track writer
          if (!writers.has(contextPath)) {
            writers.set(contextPath, []);
          }
          writers.get(contextPath)!.push({ nodeRef: pred, conditional: isConditional });
        }
      }

      // Also inherit what was available at predecessor
      const predAvailable = availableWrites.get(pred);
      if (predAvailable) {
        for (const path of predAvailable) {
          if (!isConditional) {
            available.add(path);
          }
        }
      }
    }

    availableWrites.set(nodeRef, available);
  }

  return { availableWrites, writers };
}

// Validate unknown properties against allowed set
function validateUnknownProps(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
  lines: string[],
  diagnostics: Diagnostic[],
  startLine: number = 0,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      // Search from startLine to find the right occurrence
      let lineIndex = -1;
      for (let i = startLine; i < lines.length; i++) {
        const regex = new RegExp(`^\\s*${escapeRegex(key)}\\s*:`);
        if (regex.test(lines[i])) {
          lineIndex = i;
          break;
        }
      }
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        const charIndex = line.indexOf(key);
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + key.length },
          },
          message: `Unknown property '${key}' in ${context}. Allowed: ${[...allowed].join(', ')}`,
          source: 'wflow',
        });
      }
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Recursively validate JSON Schema objects
function validateJsonSchema(
  schema: Record<string, unknown>,
  context: string,
  lines: string[],
  diagnostics: Diagnostic[],
): void {
  validateUnknownProps(schema, JSON_SCHEMA_ALLOWED_PROPS, context, lines, diagnostics);

  // Recursively validate nested properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propName, propSchema] of Object.entries(
      schema.properties as Record<string, unknown>,
    )) {
      if (propSchema && typeof propSchema === 'object') {
        validateJsonSchema(
          propSchema as Record<string, unknown>,
          `${context}.properties.${propName}`,
          lines,
          diagnostics,
        );
      }
    }
  }

  // Validate items schema (for arrays)
  if (schema.items && typeof schema.items === 'object') {
    validateJsonSchema(
      schema.items as Record<string, unknown>,
      `${context}.items`,
      lines,
      diagnostics,
    );
  }

  // Validate additionalProperties if it's a schema object
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    validateJsonSchema(
      schema.additionalProperties as Record<string, unknown>,
      `${context}.additionalProperties`,
      lines,
      diagnostics,
    );
  }

  // Validate allOf/anyOf/oneOf arrays
  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(schema[combiner])) {
      (schema[combiner] as unknown[]).forEach((subSchema, idx) => {
        if (subSchema && typeof subSchema === 'object') {
          validateJsonSchema(
            subSchema as Record<string, unknown>,
            `${context}.${combiner}[${idx}]`,
            lines,
            diagnostics,
          );
        }
      });
    }
  }

  // Validate not schema
  if (schema.not && typeof schema.not === 'object') {
    validateJsonSchema(schema.not as Record<string, unknown>, `${context}.not`, lines, diagnostics);
  }
}

function validateDocument(document: TextDocument): void {
  const text = document.getText();
  const uri = document.uri;
  const diagnostics: Diagnostic[] = [];

  // Detect file type from extension
  const isTask = uri.endsWith('.task');
  const isAction = uri.endsWith('.action');
  const isWorkflow = uri.endsWith('.wflow');

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (e) {
    const error = e as Error;
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: `YAML parse error: ${error.message}`,
      source: 'wflow',
    });
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
    return;
  }

  if (!parsed) {
    importCache.delete(uri);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const lines = text.split('\n');

  // Parse and cache imports
  const parsedDoc = parsed as { imports?: Record<string, string> };
  const imports = parseImports(parsedDoc.imports, uri, lines);
  importCache.set(uri, imports);

  // Validate imports exist
  validateImports(imports, lines, diagnostics);

  // Route to appropriate validator
  if (isTask) {
    validateTaskDocument(parsed as TaskDoc, lines, diagnostics, imports, uri);
  } else if (isAction) {
    validateActionDocument(parsed as ActionDoc, lines, diagnostics, imports);
  } else if (isWorkflow) {
    validateWorkflowDocument(parsed as WflowDoc, lines, diagnostics, imports, uri);
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Validate that all imports resolve to existing files
function validateImports(imports: ImportsMap, lines: string[], diagnostics: Diagnostic[]): void {
  for (const imp of imports.all) {
    if (!imp.resolvedUri) {
      const lineIndex = imp.line;
      const line = lines[lineIndex];
      const pathStart = line.indexOf(imp.path);

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: pathStart },
          end: { line: lineIndex, character: pathStart + imp.path.length },
        },
        message: `Import path '${imp.path}' not found`,
        source: 'wflow',
      });
    } else if (imp.fileType === 'unknown' && !imp.resolvedUri.startsWith('package:')) {
      // Warn if file type can't be determined
      const lineIndex = imp.line;
      const line = lines[lineIndex];
      const pathStart = line.indexOf(imp.path);

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: pathStart },
          end: { line: lineIndex, character: pathStart + imp.path.length },
        },
        message: `Import path '${imp.path}' has unknown file type. Expected .task, .action, or .wflow`,
        source: 'wflow',
      });
    }
  }
}

// Track used imports and report unused ones
function validateUnusedImports(
  imports: ImportsMap,
  usedAliases: Set<string>,
  lines: string[],
  diagnostics: Diagnostic[],
): void {
  for (const imp of imports.all) {
    if (!usedAliases.has(imp.alias)) {
      const lineIndex = imp.line;
      const line = lines[lineIndex];
      const aliasStart = line.indexOf(imp.alias);

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: aliasStart },
          end: { line: lineIndex, character: aliasStart + imp.alias.length },
        },
        message: `Unused import '${imp.alias}'`,
        source: 'wflow',
      });
    }
  }
}

function validateTaskDocument(
  parsed: TaskDoc,
  lines: string[],
  diagnostics: Diagnostic[],
  imports: ImportsMap,
  documentUri: string,
): void {
  const usedImports = new Set<string>();

  // SCHEMA VALIDATION: Check for unknown properties
  validateUnknownProps(
    parsed as Record<string, unknown>,
    TASK_ALLOWED_PROPS,
    'task',
    lines,
    diagnostics,
  );

  // Validate JSON Schema properties
  if (parsed.input_schema && typeof parsed.input_schema === 'object') {
    validateJsonSchema(
      parsed.input_schema as Record<string, unknown>,
      'input_schema',
      lines,
      diagnostics,
    );
  }
  if (parsed.output_schema && typeof parsed.output_schema === 'object') {
    validateJsonSchema(
      parsed.output_schema as Record<string, unknown>,
      'output_schema',
      lines,
      diagnostics,
    );
  }

  // Validate retry
  if (parsed.retry && typeof parsed.retry === 'object') {
    validateUnknownProps(
      parsed.retry as Record<string, unknown>,
      RETRY_ALLOWED_PROPS,
      'retry',
      lines,
      diagnostics,
    );
  }

  // Validate steps
  const stepRefs = new Set<string>();
  if (Array.isArray(parsed.steps)) {
    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i];
      if (!step || typeof step !== 'object') continue;

      // Find step start line
      const stepStartLine = findStepLine(lines, i, step.ref);

      validateUnknownProps(
        step as Record<string, unknown>,
        STEP_ALLOWED_PROPS,
        `step[${i}]`,
        lines,
        diagnostics,
        stepStartLine,
      );

      // Validate action_id reference
      if (step.action_id && typeof step.action_id === 'string') {
        const imp = imports.byAlias.get(step.action_id);
        if (imp) {
          usedImports.add(step.action_id);
          // Validate it's an action file
          if (imp.fileType !== 'action' && imp.fileType !== 'unknown') {
            const lineIndex = findLineContainingAfter(lines, 'action_id:', stepStartLine);
            if (lineIndex !== -1) {
              const line = lines[lineIndex];
              const charIndex = line.indexOf(step.action_id);
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: { line: lineIndex, character: charIndex },
                  end: { line: lineIndex, character: charIndex + step.action_id.length },
                },
                message: `Import '${step.action_id}' resolves to a ${imp.fileType} file, but action_id requires an action`,
                source: 'wflow',
              });
            }
          }
        } else if (!step.action_id.startsWith('@')) {
          // Not imported and not a package path - error
          const lineIndex = findLineContainingAfter(lines, 'action_id:', stepStartLine);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(step.action_id);
            const availableImports = [...imports.byAlias.keys()].filter((alias) => {
              const i = imports.byAlias.get(alias);
              return i?.fileType === 'action' || i?.fileType === 'unknown';
            });
            let message = `Action '${step.action_id}' is not imported.`;
            if (availableImports.length > 0) {
              message += ` Available actions: ${availableImports.join(', ')}`;
            } else {
              message += ` Add an import at the top of the file.`;
            }
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + step.action_id.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }

      // Track step refs for duplicate detection
      if (step.ref) {
        if (stepRefs.has(step.ref)) {
          const lineIndex = findLineContainingAfter(lines, `ref:`, stepStartLine);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(step.ref);
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + step.ref.length },
              },
              message: `Duplicate step ref '${step.ref}'`,
              source: 'wflow',
            });
          }
        }
        stepRefs.add(step.ref);
      }

      // Validate step condition
      if (step.condition && typeof step.condition === 'object') {
        validateUnknownProps(
          step.condition as Record<string, unknown>,
          STEP_CONDITION_ALLOWED_PROPS,
          `step[${i}].condition`,
          lines,
          diagnostics,
          stepStartLine,
        );
      }
    }
  }

  // Report unused imports
  validateUnusedImports(imports, usedImports, lines, diagnostics);
}

function validateActionDocument(
  parsed: ActionDoc,
  lines: string[],
  diagnostics: Diagnostic[],
  imports: ImportsMap,
): void {
  // Actions might import other actions for workflow kind, track usage
  const usedImports = new Set<string>();

  // SCHEMA VALIDATION: Check for unknown properties
  validateUnknownProps(
    parsed as Record<string, unknown>,
    ACTION_ALLOWED_PROPS,
    'action',
    lines,
    diagnostics,
  );

  // Validate JSON Schema properties
  if (parsed.requires && typeof parsed.requires === 'object') {
    validateJsonSchema(parsed.requires as Record<string, unknown>, 'requires', lines, diagnostics);
  }
  if (parsed.produces && typeof parsed.produces === 'object') {
    validateJsonSchema(parsed.produces as Record<string, unknown>, 'produces', lines, diagnostics);
  }

  // Validate execution
  if (parsed.execution && typeof parsed.execution === 'object') {
    validateUnknownProps(
      parsed.execution as Record<string, unknown>,
      ACTION_EXECUTION_ALLOWED_PROPS,
      'execution',
      lines,
      diagnostics,
    );

    // Validate retry_policy
    if (parsed.execution.retry_policy && typeof parsed.execution.retry_policy === 'object') {
      validateUnknownProps(
        parsed.execution.retry_policy as Record<string, unknown>,
        ACTION_RETRY_POLICY_ALLOWED_PROPS,
        'execution.retry_policy',
        lines,
        diagnostics,
      );
    }
  }

  // Validate idempotency
  if (parsed.idempotency && typeof parsed.idempotency === 'object') {
    validateUnknownProps(
      parsed.idempotency as Record<string, unknown>,
      ACTION_IDEMPOTENCY_ALLOWED_PROPS,
      'idempotency',
      lines,
      diagnostics,
    );
  }

  // Validate kind-specific implementation properties
  if (parsed.kind && parsed.implementation && typeof parsed.implementation === 'object') {
    const allowedProps = IMPLEMENTATION_PROPS_BY_KIND[parsed.kind];
    if (allowedProps) {
      validateUnknownProps(
        parsed.implementation as Record<string, unknown>,
        allowedProps,
        `implementation (kind: ${parsed.kind})`,
        lines,
        diagnostics,
      );
    }
  }

  // Validate kind is valid
  if (parsed.kind) {
    const validKinds = [
      'llm',
      'mcp',
      'http',
      'tool',
      'shell',
      'workflow',
      'context',
      'vector',
      'metric',
      'human',
    ];
    if (!validKinds.includes(parsed.kind)) {
      const lineIndex = lines.findIndex((line) => line.includes('kind:'));
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        const charIndex = line.indexOf(parsed.kind);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + parsed.kind.length },
          },
          message: `Invalid action kind '${parsed.kind}'. Valid kinds: ${validKinds.join(', ')}`,
          source: 'wflow',
        });
      }
    }
  }

  // Report unused imports
  validateUnusedImports(imports, usedImports, lines, diagnostics);
}

function validateWorkflowDocument(
  parsed: WflowDoc,
  lines: string[],
  diagnostics: Diagnostic[],
  imports: ImportsMap,
  documentUri: string,
): void {
  const usedImports = new Set<string>();

  // SCHEMA VALIDATION: Check for unknown properties
  validateUnknownProps(
    parsed as Record<string, unknown>,
    WORKFLOW_ALLOWED_PROPS,
    'workflow',
    lines,
    diagnostics,
  );

  // Validate JSON Schema properties in input_schema, context_schema, output_schema
  if (parsed.input_schema && typeof parsed.input_schema === 'object') {
    validateJsonSchema(
      parsed.input_schema as Record<string, unknown>,
      'input_schema',
      lines,
      diagnostics,
    );
  }
  if (parsed.context_schema && typeof parsed.context_schema === 'object') {
    validateJsonSchema(
      parsed.context_schema as Record<string, unknown>,
      'context_schema',
      lines,
      diagnostics,
    );
  }
  if (parsed.output_schema && typeof parsed.output_schema === 'object') {
    validateJsonSchema(
      parsed.output_schema as Record<string, unknown>,
      'output_schema',
      lines,
      diagnostics,
    );
  }

  // Validate node properties
  for (const [nodeRef, node] of Object.entries(parsed.nodes || {})) {
    if (node && typeof node === 'object') {
      // Find the line where this node starts (e.g., "  start:")
      const nodeStartLine = lines.findIndex((line) => {
        const regex = new RegExp(`^\\s*${escapeRegex(nodeRef)}\\s*:`);
        return regex.test(line);
      });
      validateUnknownProps(
        node as Record<string, unknown>,
        NODE_ALLOWED_PROPS,
        `node '${nodeRef}'`,
        lines,
        diagnostics,
        nodeStartLine !== -1 ? nodeStartLine : 0,
      );

      // Validate task_id reference against imports
      if (node.task_id && typeof node.task_id === 'string') {
        const imp = imports.byAlias.get(node.task_id);
        if (imp) {
          usedImports.add(node.task_id);
          // Validate it's a task file
          if (imp.fileType !== 'task' && imp.fileType !== 'unknown') {
            const lineIndex = findLineContainingAfter(lines, 'task_id:', nodeStartLine);
            if (lineIndex !== -1) {
              const line = lines[lineIndex];
              const charIndex = line.indexOf(node.task_id);
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: { line: lineIndex, character: charIndex },
                  end: { line: lineIndex, character: charIndex + node.task_id.length },
                },
                message: `Import '${node.task_id}' resolves to a ${imp.fileType} file, but task_id requires a task`,
                source: 'wflow',
              });
            }
          }
        } else if (!node.task_id.startsWith('@')) {
          // Not imported and not a package path - error
          const lineIndex = findLineContainingAfter(lines, 'task_id:', nodeStartLine);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(node.task_id);
            const availableImports = [...imports.byAlias.keys()].filter((alias) => {
              const i = imports.byAlias.get(alias);
              return i?.fileType === 'task' || i?.fileType === 'unknown';
            });
            let message = `Task '${node.task_id}' is not imported.`;
            if (availableImports.length > 0) {
              message += ` Available tasks: ${availableImports.join(', ')}`;
            } else {
              message += ` Add an import at the top of the file.`;
            }
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + node.task_id.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }
    }
  }

  // Validate transition properties
  for (const [transitionRef, transition] of Object.entries(parsed.transitions || {})) {
    if (transition && typeof transition === 'object') {
      // Find the line where this transition starts (e.g., "  start_to_process:")
      const transitionStartLine = lines.findIndex((line) => {
        const regex = new RegExp(`^\\s*${escapeRegex(transitionRef)}\\s*:`);
        return regex.test(line);
      });

      validateUnknownProps(
        transition as Record<string, unknown>,
        TRANSITION_ALLOWED_PROPS,
        `transition '${transitionRef}'`,
        lines,
        diagnostics,
        transitionStartLine !== -1 ? transitionStartLine : 0,
      );

      // Validate condition sub-object
      if (transition.condition && typeof transition.condition === 'object') {
        validateUnknownProps(
          transition.condition as Record<string, unknown>,
          CONDITION_ALLOWED_PROPS,
          `condition in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0,
        );
      }

      // Validate foreach sub-object
      if (transition.foreach && typeof transition.foreach === 'object') {
        validateUnknownProps(
          transition.foreach as Record<string, unknown>,
          FOREACH_ALLOWED_PROPS,
          `foreach in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0,
        );
      }

      // Validate synchronization sub-object
      if (transition.synchronization && typeof transition.synchronization === 'object') {
        const sync = transition.synchronization as Record<string, unknown>;
        validateUnknownProps(
          sync,
          SYNCHRONIZATION_ALLOWED_PROPS,
          `synchronization in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0,
        );

        // Validate merge sub-object
        if (sync.merge && typeof sync.merge === 'object') {
          validateUnknownProps(
            sync.merge as Record<string, unknown>,
            MERGE_ALLOWED_PROPS,
            `merge in transition '${transitionRef}'`,
            lines,
            diagnostics,
            transitionStartLine !== -1 ? transitionStartLine : 0,
          );
        }
      }
    }
  }

  // Build valid paths from schemas
  const inputPaths = extractPaths(parsed.input_schema, 'input');
  const contextPaths = extractPaths(parsed.context_schema, 'state');
  const outputPaths = extractPaths(parsed.output_schema, 'output');

  // All paths that can be READ ($.input.*, $.state.*)
  const readablePaths = new Set([...inputPaths, ...contextPaths]);

  // All paths that can be WRITTEN (state.*, output.*)
  const writablePaths = new Set([...contextPaths, ...outputPaths]);

  // Get defined node refs
  const nodeRefs = new Set(Object.keys(parsed.nodes || {}));

  // Validate initial_node_ref
  if (parsed.initial_node_ref && !nodeRefs.has(parsed.initial_node_ref)) {
    const lineIndex = lines.findIndex((line) => line.includes('initial_node_ref:'));
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(parsed.initial_node_ref);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + parsed.initial_node_ref.length },
        },
        message: `Node '${parsed.initial_node_ref}' does not exist. Available nodes: ${[...nodeRefs].join(', ')}`,
        source: 'wflow',
      });
    }
  }

  // Validate nodes
  for (const [nodeRef, node] of Object.entries(parsed.nodes || {})) {
    if (!node) continue;

    // Validate input_mapping values (JSONPath reads like $.input.topic, $.state.ideas)
    if (node.input_mapping) {
      for (const [taskInputKey, jsonPath] of Object.entries(node.input_mapping)) {
        if (typeof jsonPath !== 'string') continue;

        // Extract path from JSONPath ($.input.topic → input.topic)
        const pathMatch = jsonPath.match(/^\$\.(.+)$/);
        if (!pathMatch) continue;

        const path = pathMatch[1];

        if (!readablePaths.has(path)) {
          const lineIndex = findMappingLine(lines, jsonPath);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(jsonPath);
            const suggestions = findSimilarPaths(path, readablePaths);
            let message = `Path '${jsonPath}' does not exist in input_schema or context_schema.`;
            if (suggestions.length > 0) {
              message += ` Did you mean: ${suggestions.map((s) => `$.${s}`).join(', ')}?`;
            }
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + jsonPath.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }
    }

    // Validate output_mapping keys (context paths like state.greeting, output.result)
    if (node.output_mapping) {
      for (const [contextPath, taskOutputPath] of Object.entries(node.output_mapping)) {
        if (typeof contextPath !== 'string') continue;

        if (!writablePaths.has(contextPath)) {
          const lineIndex = findMappingLine(lines, contextPath);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(contextPath);
            const suggestions = findSimilarPaths(contextPath, writablePaths);
            let message = `Path '${contextPath}' does not exist in context_schema or output_schema.`;
            if (suggestions.length > 0) {
              message += ` Did you mean: ${suggestions.join(', ')}?`;
            }
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + contextPath.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }
    }
  }

  // Validate transitions reference existing nodes
  const transitions = parsed.transitions || {};

  // Collect all transition refs for sibling_group validation (now the keys)
  const transitionRefs = new Set<string>(Object.keys(transitions));

  for (const [transitionRef, transition] of Object.entries(transitions)) {
    if (typeof transition !== 'object' || transition === null) continue;

    const fromNodeRef = transition.from_node_ref;
    const toNodeRef = transition.to_node_ref;

    if (fromNodeRef && !nodeRefs.has(fromNodeRef)) {
      const lineIndex = findTransitionFieldLine(lines, fromNodeRef, 'from_node_ref');
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        const charIndex = line.indexOf(fromNodeRef);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + fromNodeRef.length },
          },
          message: `Node '${fromNodeRef}' does not exist. Available nodes: ${[...nodeRefs].join(', ')}`,
          source: 'wflow',
        });
      }
    }

    if (toNodeRef !== null && toNodeRef !== undefined && !nodeRefs.has(toNodeRef)) {
      const lineIndex = findTransitionFieldLine(lines, toNodeRef, 'to_node_ref');
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        const charIndex = line.indexOf(toNodeRef);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + toNodeRef.length },
          },
          message: `Node '${toNodeRef}' does not exist. Available nodes: ${[...nodeRefs].join(', ')}`,
          source: 'wflow',
        });
      }
    }

    // Validate sibling_group references a valid transition ref
    const sync = transition.synchronization as Record<string, unknown> | undefined;
    if (sync?.sibling_group && typeof sync.sibling_group === 'string') {
      if (!transitionRefs.has(sync.sibling_group)) {
        const lineIndex = findMappingLine(lines, sync.sibling_group);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(sync.sibling_group);
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + sync.sibling_group.length },
            },
            message: `Transition '${sync.sibling_group}' does not exist. sibling_group must reference a fan-out transition. Available transitions: ${[...transitionRefs].join(', ') || 'none'}`,
            source: 'wflow',
          });
        }
      }
    }

    // Validate foreach.collection is a valid state path
    const foreach = transition.foreach as { collection?: string; item_var?: string } | undefined;
    if (foreach?.collection && typeof foreach.collection === 'string') {
      // foreach.collection should be a state path like "state.items"
      if (!foreach.collection.startsWith('state.')) {
        const lineIndex = findMappingLine(lines, foreach.collection);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(foreach.collection);
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + foreach.collection.length },
            },
            message: `foreach.collection '${foreach.collection}' must be a state path (e.g., 'state.items')`,
            source: 'wflow',
          });
        }
      } else if (!contextPaths.has(foreach.collection)) {
        const lineIndex = findMappingLine(lines, foreach.collection);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(foreach.collection);
          const suggestions = findSimilarPaths(foreach.collection, contextPaths);
          let message = `Path '${foreach.collection}' does not exist in context_schema.`;
          if (suggestions.length > 0) {
            message += ` Did you mean: ${suggestions.join(', ')}?`;
          }
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + foreach.collection.length },
            },
            message,
            source: 'wflow',
          });
        }
      }
    }
  }

  // DATA FLOW ANALYSIS: Validate that reads are satisfied by predecessor writes
  const graph = buildGraph(parsed);
  const dataFlow = analyzeDataFlow(parsed, graph, inputPaths);

  // REACHABILITY ANALYSIS: Find unreachable nodes
  if (parsed.initial_node_ref && nodeRefs.has(parsed.initial_node_ref)) {
    const reachable = new Set<string>();
    const queue: string[] = [parsed.initial_node_ref];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      // Add all successors to the queue
      for (const successor of graph.adjacency.get(current) || []) {
        if (!reachable.has(successor)) {
          queue.push(successor);
        }
      }
    }

    // Report unreachable nodes
    for (const nodeRef of nodeRefs) {
      if (!reachable.has(nodeRef)) {
        // Find the line where this node is defined
        const lineIndex = lines.findIndex((line) => {
          const regex = new RegExp(`^\\s{2}${escapeRegex(nodeRef)}\\s*:`);
          return regex.test(line);
        });
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(nodeRef);
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + nodeRef.length },
            },
            message: `Node '${nodeRef}' is unreachable from initial node '${parsed.initial_node_ref}'`,
            source: 'wflow',
          });
        }
      }
    }
  }

  // CYCLE DETECTION: Find cycles in the workflow graph
  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    // Report error on the first node in the cycle
    const firstNode = cycle[0];
    const lineIndex = lines.findIndex((line) => {
      const regex = new RegExp(`^\\s{2}${escapeRegex(firstNode)}\\s*:`);
      return regex.test(line);
    });
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(firstNode);
      const cycleStr = cycle.join(' → ');
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + firstNode.length },
        },
        message: `Cycle detected: ${cycleStr}`,
        source: 'wflow',
      });
    }
  }

  for (const [nodeRef, node] of Object.entries(parsed.nodes || {})) {
    if (!node?.input_mapping) continue;

    const available = dataFlow.availableWrites.get(nodeRef) || new Set();

    for (const [_taskInputKey, jsonPath] of Object.entries(node.input_mapping)) {
      if (typeof jsonPath !== 'string') continue;

      // Extract path from JSONPath ($.state.ideas → state.ideas)
      const pathMatch = jsonPath.match(/^\$\.state\.(.+)$/);
      if (!pathMatch) continue; // Only check state reads (input reads are always available)

      const statePath = `state.${pathMatch[1]}`;

      // Check if this state path is available from predecessors
      if (!available.has(statePath)) {
        const lineIndex = findMappingLine(lines, jsonPath);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(jsonPath);

          // Find who writes this path (if anyone)
          const writers = dataFlow.writers.get(statePath) || [];
          let message: string;
          let severity: DiagnosticSeverity;

          if (writers.length === 0) {
            // No one writes this path - error
            message = `State path '${statePath}' is read but never written by any node.`;
            severity = DiagnosticSeverity.Error;
          } else {
            // Written but not by a predecessor
            const writerNames = writers.map((w) => w.nodeRef).join(', ');
            const conditionalWriters = writers.filter((w) => w.conditional);

            if (conditionalWriters.length > 0) {
              // Written via conditional transition - warning
              message = `State path '${statePath}' is written by '${writerNames}' via conditional transition - may not be available at runtime.`;
              severity = DiagnosticSeverity.Warning;
            } else {
              // Written by a non-predecessor - error
              message = `State path '${statePath}' is written by '${writerNames}' but not reachable from node '${nodeRef}'.`;
              severity = DiagnosticSeverity.Error;
            }
          }

          diagnostics.push({
            severity,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + jsonPath.length },
            },
            message,
            source: 'wflow',
          });
        }
      }
    }
  }

  // Report unused imports
  validateUnusedImports(imports, usedImports, lines, diagnostics);
}

function findLineContaining(text: string, search: string): number {
  const lines = text.split('\n');
  return lines.findIndex((line) => line.includes(search));
}

function findLineContainingAfter(lines: string[], search: string, startLine: number): number {
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(search)) return i;
  }
  return -1;
}

function findStepLine(lines: string[], stepIndex: number, stepRef?: string): number {
  // Try to find by ref first
  if (stepRef) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`^\\s*-?\\s*ref:\\s*${escapeRegex(stepRef)}`))) {
        return i;
      }
    }
  }
  // Fall back to finding the nth step (array item)
  let stepCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*-\s/)) {
      if (stepCount === stepIndex) return i;
      stepCount++;
    }
  }
  return 0;
}

function findTransitionFieldLine(lines: string[], value: string, field: string): number {
  return lines.findIndex((line) => line.includes(field) && line.includes(value));
}

function findMappingLine(lines: string[], value: string): number {
  return lines.findIndex((line) => line.includes(value));
}

documents.listen(connection);
connection.listen();
