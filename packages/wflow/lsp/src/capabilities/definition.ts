import { escapeRegex } from '@wonder/wflow';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Definition, DefinitionParams } from 'vscode-languageserver/node';
import { Location } from 'vscode-languageserver/node';
import type { DocumentManager } from '../document-manager';

/**
 * Get word range at a position in a line
 */
function getWordRangeAtPosition(
  line: string,
  character: number,
): { start: number; end: number } | null {
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

/**
 * Handle go-to-definition requests
 */
export function handleDefinition(
  params: DefinitionParams,
  document: TextDocument,
  documentManager: DocumentManager,
): Definition | null {
  const uri = document.uri;
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[params.position.line];
  if (!line) return null;

  const wordRange = getWordRangeAtPosition(line, params.position.character);
  if (!wordRange) return null;

  const word = line.substring(wordRange.start, wordRange.end);

  // Check if it's an import reference
  const imports = documentManager.getImports(uri);
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
  const wflowDoc = documentManager.getAsWorkflow(uri);
  if (wflowDoc?.nodes?.[word]) {
    // Find the line where this node is defined
    const nodeDefLine = lines.findIndex((l) => {
      const regex = new RegExp(`^\\s{2}${escapeRegex(word)}\\s*:`);
      return regex.test(l);
    });
    if (nodeDefLine !== -1) {
      const nodeLine = lines[nodeDefLine];
      const charStart = nodeLine.indexOf(word);
      return Location.create(uri, {
        start: { line: nodeDefLine, character: charStart },
        end: { line: nodeDefLine, character: charStart + word.length },
      });
    }
  }

  return null;
}
