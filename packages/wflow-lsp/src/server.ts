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

interface WflowDoc {
  workflow?: string;
  nodes?: Record<string, unknown>;
  transitions?: TransitionDecl[];
  initial_node_ref?: string;
}

function validateDocument(document: TextDocument): void {
  const text = document.getText();
  const diagnostics: Diagnostic[] = [];

  let parsed: WflowDoc;
  try {
    parsed = parseYaml(text) as WflowDoc;
  } catch (e) {
    // YAML parse error
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

  // Get defined node refs (keys in nodes map)
  const nodeRefs = new Set(Object.keys(parsed.nodes || {}));

  // Validate initial_node_ref
  if (parsed.initial_node_ref && !nodeRefs.has(parsed.initial_node_ref)) {
    const lineIndex = findLineContaining(text, 'initial_node_ref:');
    if (lineIndex !== -1) {
      const line = text.split('\n')[lineIndex];
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

  // Validate transitions reference existing nodes
  const transitions = parsed.transitions || [];
  const lines = text.split('\n');

  for (const transition of transitions) {
    if (typeof transition !== 'object' || transition === null) continue;

    const fromNodeRef = transition.from_node_ref;
    const toNodeRef = transition.to_node_ref;

    // Check 'from_node_ref' exists
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

    // Check 'to_node_ref' exists (null is valid for terminal transitions)
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
  // Find lines that have both the field name and the value
  return lines.findIndex((line) => line.includes(field) && line.includes(value));
}

documents.listen(connection);
connection.listen();
