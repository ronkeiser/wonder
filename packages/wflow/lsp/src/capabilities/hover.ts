import {
  type ImportsMap,
  type JSONSchemaProperty,
  type NodeDecl,
  type ResolvedImport,
  type WflowDocument,
  escapeRegex,
  getSchemaPropertyAtPath,
} from '@wonder/wflow';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Hover, HoverParams } from 'vscode-languageserver/node';
import { MarkupKind } from 'vscode-languageserver/node';
import type { DocumentManager } from '../document-manager';

/**
 * Get word range at a position in a line
 */
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

/**
 * Create hover content for a node
 */
function createNodeHover(nodeRef: string, node: NodeDecl, imports?: ImportsMap): Hover {
  const lines: string[] = [];

  lines.push(`### Node: \`${nodeRef}\``);
  if (node.name) {
    lines.push(`**${node.name}**`);
  }
  lines.push('');

  if (node.task_id) {
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

/**
 * Create hover content for an import
 */
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

/**
 * Create hover content for a JSONPath
 */
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

  const pathParts = pathRest.split('.');
  const current = getSchemaPropertyAtPath(schema, pathParts);

  if (!current) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${fullPath}**\n\n_Property not found in schema_`,
      },
    };
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

/**
 * Handle hover requests
 */
export function handleHover(
  params: HoverParams,
  document: TextDocument,
  documentManager: DocumentManager,
): Hover | null {
  const uri = document.uri;
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[params.position.line];
  if (!line) return null;

  const wordRange = getWordRangeAtPosition(line, params.position.character);
  if (!wordRange) return null;

  const word = line.substring(wordRange.start, wordRange.end);

  // Get imports
  const imports = documentManager.getImports(uri);

  // Check if hovering over an import alias
  if (imports) {
    const imp = imports.byAlias.get(word);
    if (imp) {
      const isTaskIdRef = line.includes('task_id:');
      const isActionIdRef = line.includes('action_id:');
      const isImportDef = line.match(new RegExp(`^\\s*${escapeRegex(word)}\\s*:`));

      if (isTaskIdRef || isActionIdRef || isImportDef) {
        return createImportHover(imp);
      }
    }
  }

  // For workflows, check if hovering over a node ref
  const wflowDoc = documentManager.getAsWorkflow(uri);
  if (wflowDoc?.nodes?.[word]) {
    return createNodeHover(word, wflowDoc.nodes[word], imports);
  }

  // Check if hovering over a JSONPath ($.input.*, $.state.*)
  const jsonPathMatch = word.match(/^\$\.(input|state)\.(.+)$/);
  if (jsonPathMatch && wflowDoc) {
    const [, schemaType, pathRest] = jsonPathMatch;
    const schema = schemaType === 'input' ? wflowDoc.input_schema : wflowDoc.context_schema;
    return createPathHover(word, pathRest, schema, schemaType);
  }

  // Check if hovering over a context path (state.*, output.*)
  const contextPathMatch = word.match(/^(state|output)\.(.+)$/);
  if (contextPathMatch && wflowDoc) {
    const [, schemaType, pathRest] = contextPathMatch;
    const schema = schemaType === 'state' ? wflowDoc.context_schema : wflowDoc.output_schema;
    return createPathHover(word, pathRest, schema, schemaType);
  }

  return null;
}
