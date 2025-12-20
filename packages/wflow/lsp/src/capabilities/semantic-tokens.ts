import { escapeRegex, type TaskDocument, type WflowDocument } from '@wonder/wflow';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SemanticTokens } from 'vscode-languageserver/node';
import { SemanticTokensBuilder, SemanticTokensLegend } from 'vscode-languageserver/node';
import type { DocumentManager } from '../document-manager';

// Semantic token types - map to VS Code's built-in token types
export const tokenTypes = ['function', 'class', 'variable', 'property'];
export const tokenModifiers = ['declaration', 'definition'];

export const legend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers,
};

interface Token {
  line: number;
  col: number;
  length: number;
  type: number;
  modifier: number;
}

/**
 * Handle semantic tokens request
 */
export function handleSemanticTokens(
  document: TextDocument,
  documentManager: DocumentManager,
): SemanticTokens {
  const uri = document.uri;
  const text = document.getText();
  const fileType = documentManager.getFileType(uri);
  const isWorkflow = fileType === 'wflow';
  const isTask = fileType === 'task';

  const cached = documentManager.getCached(uri);
  if (!cached?.document) return { data: [] };

  const tokens: Token[] = [];
  const lines = text.split('\n');

  // Get imports for this document
  const imports = documentManager.getImports(uri);
  const importAliases = imports ? new Set(imports.byAlias.keys()) : new Set<string>();

  if (isWorkflow) {
    collectWorkflowTokens(cached.document as WflowDocument, lines, importAliases, tokens);
  }

  if (isTask) {
    collectTaskTokens(cached.document as TaskDocument, lines, importAliases, tokens);
  }

  // Sort tokens by position (required by semantic tokens protocol)
  tokens.sort((a, b) => a.line - b.line || a.col - b.col);

  const builder = new SemanticTokensBuilder();
  for (const t of tokens) {
    builder.push(t.line, t.col, t.length, t.type, t.modifier);
  }

  return builder.build();
}

function collectWorkflowTokens(
  doc: WflowDocument,
  lines: string[],
  importAliases: Set<string>,
  tokens: Token[],
): void {
  const nodeRefs = new Set(Object.keys(doc.nodes || {}));
  const transitionRefs = new Set(Object.keys(doc.transitions || {}));

  let currentSection: 'none' | 'nodes' | 'transitions' | 'imports' | 'other' = 'none';

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const lineIndent = line.length - line.trimStart().length;

    // Highlight taskId values that are imports
    const taskIdMatch = trimmed.match(/^taskId:\s*(\S+)/);
    if (taskIdMatch && importAliases.has(taskIdMatch[1])) {
      const col = line.lastIndexOf(taskIdMatch[1]);
      tokens.push({ line: lineNum, col, length: taskIdMatch[1].length, type: 2, modifier: 0 });
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

    // Inside imports section
    if (currentSection === 'imports' && lineIndent === 2) {
      const keyMatch = trimmed.match(/^(\w+):/);
      if (keyMatch && importAliases.has(keyMatch[1])) {
        const col = line.indexOf(keyMatch[1]);
        tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 2, modifier: 1 });
      }
    }

    // Inside nodes section
    if (currentSection === 'nodes' && lineIndent === 2) {
      const keyMatch = trimmed.match(/^(\w+):/);
      if (keyMatch && nodeRefs.has(keyMatch[1])) {
        const col = line.indexOf(keyMatch[1]);
        tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 0, modifier: 1 });
      }
    }

    // Inside transitions section
    if (currentSection === 'transitions') {
      if (lineIndent === 2) {
        const keyMatch = trimmed.match(/^(\w+):/);
        if (keyMatch && transitionRefs.has(keyMatch[1])) {
          const col = line.indexOf(keyMatch[1]);
          tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 1, modifier: 1 });
        }
      }

      const nodeRefMatch = trimmed.match(/^(fromNodeRef|toNodeRef):\s*(\S+)/);
      if (nodeRefMatch && nodeRefs.has(nodeRefMatch[2])) {
        const col = line.lastIndexOf(nodeRefMatch[2]);
        tokens.push({ line: lineNum, col, length: nodeRefMatch[2].length, type: 0, modifier: 0 });
      }

      const siblingMatch = trimmed.match(/^siblingGroup:\s*(\S+)/);
      if (siblingMatch && transitionRefs.has(siblingMatch[1])) {
        const col = line.lastIndexOf(siblingMatch[1]);
        tokens.push({ line: lineNum, col, length: siblingMatch[1].length, type: 1, modifier: 0 });
      }
    }
  }
}

function collectTaskTokens(
  _doc: TaskDocument,
  lines: string[],
  importAliases: Set<string>,
  tokens: Token[],
): void {
  let inImports = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const lineIndent = line.length - line.trimStart().length;

    // Highlight actionId values that are imports
    const actionIdMatch = trimmed.match(/^actionId:\s*(\S+)/);
    if (actionIdMatch && importAliases.has(actionIdMatch[1])) {
      const col = line.lastIndexOf(actionIdMatch[1]);
      tokens.push({ line: lineNum, col, length: actionIdMatch[1].length, type: 2, modifier: 0 });
    }

    // Track imports section
    if (lineIndent === 0 && trimmed.startsWith('imports:')) {
      inImports = true;
      continue;
    }
    if (lineIndent === 0 && !trimmed.startsWith('#')) {
      inImports = false;
      continue;
    }

    // Highlight import alias definitions
    if (inImports && lineIndent === 2) {
      const keyMatch = trimmed.match(/^(\w+):/);
      if (keyMatch && importAliases.has(keyMatch[1])) {
        const col = line.indexOf(keyMatch[1]);
        tokens.push({ line: lineNum, col, length: keyMatch[1].length, type: 2, modifier: 1 });
      }
    }
  }
}
