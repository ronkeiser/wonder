import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  InitializeParams,
  InitializeResult,
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
    },
  };
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

interface TransitionDecl {
  ref?: string;
  from_node_ref?: string;
  to_node_ref?: string | null;
  priority?: number;
}

interface JSONSchemaProperty {
  type?: string;
  properties?: Record<string, JSONSchemaProperty>;
  items?: JSONSchemaProperty;
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
  input_schema?: JSONSchemaProperty;
  context_schema?: JSONSchemaProperty;
  output_schema?: JSONSchemaProperty;
  nodes?: Record<string, NodeDecl>;
  transitions?: TransitionDecl[];
  initial_node_ref?: string;
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
  const transitions = parsed.transitions || [];

  for (const transition of transitions) {
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
