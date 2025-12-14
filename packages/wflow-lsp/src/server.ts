import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { parse as parseYaml } from 'yaml';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
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
  let parsed: WflowDoc;
  try {
    parsed = parseYaml(text) as WflowDoc;
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

  // Check if hovering over a node ref
  if (parsed.nodes && parsed.nodes[word]) {
    const node = parsed.nodes[word];
    return createNodeHover(word, node);
  }

  // Check if hovering over a JSONPath ($.input.*, $.state.*)
  const jsonPathMatch = word.match(/^\$\.(input|state)\.(.+)$/);
  if (jsonPathMatch) {
    const [, schemaType, pathRest] = jsonPathMatch;
    const schema = schemaType === 'input' ? parsed.input_schema : parsed.context_schema;
    return createPathHover(word, pathRest, schema, schemaType);
  }

  // Check if hovering over a context path (state.*, output.*)
  const contextPathMatch = word.match(/^(state|output)\.(.+)$/);
  if (contextPathMatch) {
    const [, schemaType, pathRest] = contextPathMatch;
    const schema = schemaType === 'state' ? parsed.context_schema : parsed.output_schema;
    return createPathHover(word, pathRest, schema, schemaType);
  }

  return null;
});

function getWordRangeAtPosition(line: string, character: number): { start: number; end: number } | null {
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

function createNodeHover(nodeRef: string, node: NodeDecl): Hover {
  const lines: string[] = [];

  lines.push(`### Node: \`${nodeRef}\``);
  if (node.name) {
    lines.push(`**${node.name}**`);
  }
  lines.push('');

  if (node.task_id) {
    lines.push(`**Task:** \`${node.task_id}\` v${node.task_version || 1}`);
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

function createPathHover(
  fullPath: string,
  pathRest: string,
  schema: JSONSchemaProperty | undefined,
  schemaType: string
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
function analyzeDataFlow(doc: WflowDoc, graph: GraphAnalysis, inputPaths: Set<string>): DataFlowAnalysis {
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
  startLine: number = 0
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
  diagnostics: Diagnostic[]
): void {
  validateUnknownProps(schema, JSON_SCHEMA_ALLOWED_PROPS, context, lines, diagnostics);

  // Recursively validate nested properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propName, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (propSchema && typeof propSchema === 'object') {
        validateJsonSchema(propSchema as Record<string, unknown>, `${context}.properties.${propName}`, lines, diagnostics);
      }
    }
  }

  // Validate items schema (for arrays)
  if (schema.items && typeof schema.items === 'object') {
    validateJsonSchema(schema.items as Record<string, unknown>, `${context}.items`, lines, diagnostics);
  }

  // Validate additionalProperties if it's a schema object
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    validateJsonSchema(
      schema.additionalProperties as Record<string, unknown>,
      `${context}.additionalProperties`,
      lines,
      diagnostics
    );
  }

  // Validate allOf/anyOf/oneOf arrays
  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(schema[combiner])) {
      (schema[combiner] as unknown[]).forEach((subSchema, idx) => {
        if (subSchema && typeof subSchema === 'object') {
          validateJsonSchema(subSchema as Record<string, unknown>, `${context}.${combiner}[${idx}]`, lines, diagnostics);
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
  const diagnostics: Diagnostic[] = [];

  let parsed: WflowDoc;
  try {
    parsed = parseYaml(text) as WflowDoc;
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
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const lines = text.split('\n');

  // SCHEMA VALIDATION: Check for unknown properties
  validateUnknownProps(parsed as Record<string, unknown>, WORKFLOW_ALLOWED_PROPS, 'workflow', lines, diagnostics);

  // Validate JSON Schema properties in input_schema, context_schema, output_schema
  if (parsed.input_schema && typeof parsed.input_schema === 'object') {
    validateJsonSchema(parsed.input_schema as Record<string, unknown>, 'input_schema', lines, diagnostics);
  }
  if (parsed.context_schema && typeof parsed.context_schema === 'object') {
    validateJsonSchema(parsed.context_schema as Record<string, unknown>, 'context_schema', lines, diagnostics);
  }
  if (parsed.output_schema && typeof parsed.output_schema === 'object') {
    validateJsonSchema(parsed.output_schema as Record<string, unknown>, 'output_schema', lines, diagnostics);
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
        nodeStartLine !== -1 ? nodeStartLine : 0
      );
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
        transitionStartLine !== -1 ? transitionStartLine : 0
      );

      // Validate condition sub-object
      if (transition.condition && typeof transition.condition === 'object') {
        validateUnknownProps(
          transition.condition as Record<string, unknown>,
          CONDITION_ALLOWED_PROPS,
          `condition in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0
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
          transitionStartLine !== -1 ? transitionStartLine : 0
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
          transitionStartLine !== -1 ? transitionStartLine : 0
        );

        // Validate merge sub-object
        if (sync.merge && typeof sync.merge === 'object') {
          validateUnknownProps(
            sync.merge as Record<string, unknown>,
            MERGE_ALLOWED_PROPS,
            `merge in transition '${transitionRef}'`,
            lines,
            diagnostics,
            transitionStartLine !== -1 ? transitionStartLine : 0
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
    const lineIndex = findLineContaining(text, 'initial_node_ref:');
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

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

function findLineContaining(text: string, search: string): number {
  const lines = text.split('\n');
  return lines.findIndex((line) => line.includes(search));
}

function findTransitionFieldLine(lines: string[], value: string, field: string): number {
  return lines.findIndex((line) => line.includes(field) && line.includes(value));
}

function findMappingLine(lines: string[], value: string): number {
  return lines.findIndex((line) => line.includes(value));
}

documents.listen(connection);
connection.listen();
