import { parse as parseYaml } from 'yaml';
import type {
  ActionDocument,
  AnyDocument,
  FileType,
  ModelDocument,
  NodeDecl,
  PersonaDocument,
  RunDocument,
  TaskDocument,
  TestDocument,
  ToolDocument,
  WflowDocument,
} from '../types/ast.js';

/**
 * Convert snake_case string to camelCase
 * Handles underscore followed by any alphanumeric character (e.g., cost_per_1k -> costPer1k)
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
}

/**
 * Recursively convert all snake_case keys in an object to camelCase
 * Preserves keys that are already camelCase or contain special characters
 */
function deepSnakeToCamel<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(deepSnakeToCamel) as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Convert snake_case keys but preserve $ref and other special keys
      const newKey = key.startsWith('$') || key.startsWith('_') ? key : snakeToCamel(key);
      result[newKey] = deepSnakeToCamel(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Resolved import information
 */
export interface ResolvedImport {
  alias: string;
  path: string;
  resolvedUri: string | null; // null if file doesn't exist
  fileType: FileType;
  line: number;
}

/**
 * Map of imports in a document
 */
export interface ImportsMap {
  byAlias: Map<string, ResolvedImport>;
  all: ResolvedImport[];
}

/**
 * Parse result with document and metadata
 */
export interface ParseResult<T extends AnyDocument = AnyDocument> {
  document: T | null;
  imports: ImportsMap;
  fileType: FileType;
  error?: Error;
}

/**
 * Get file type from path/URI
 */
export function getFileType(pathOrUri: string): FileType {
  if (pathOrUri.endsWith('.wflow')) return 'wflow';
  if (pathOrUri.endsWith('.task')) return 'task';
  if (pathOrUri.endsWith('.action')) return 'action';
  if (pathOrUri.endsWith('.test')) return 'test';
  if (pathOrUri.endsWith('.run')) return 'run';
  if (pathOrUri.endsWith('.persona')) return 'persona';
  if (pathOrUri.endsWith('.tool')) return 'tool';
  if (pathOrUri.endsWith('.model')) return 'model';
  return 'unknown';
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse imports from a document's imports section
 */
export function parseImports(
  imports: Record<string, string> | undefined,
  lines: string[],
  resolveImportPath?: (importPath: string) => string | null,
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

    const resolvedUri = resolveImportPath ? resolveImportPath(path) : null;
    const fileType = getFileType(path);

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

/**
 * Parse a YAML document
 */
export function parseDocument<T extends AnyDocument>(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<T> {
  const fileType = getFileType(uri);
  const lines = text.split('\n');

  try {
    const rawDocument = parseYaml(text) as T | null;

    if (!rawDocument) {
      return {
        document: null,
        imports: { byAlias: new Map(), all: [] },
        fileType,
      };
    }

    // Convert snake_case keys to camelCase for TypeScript consumption
    const document = deepSnakeToCamel(rawDocument);

    const imports = parseImports(
      (document as { imports?: Record<string, string> }).imports,
      lines,
      resolveImportPath,
    );

    return {
      document,
      imports,
      fileType,
    };
  } catch (e) {
    return {
      document: null,
      imports: { byAlias: new Map(), all: [] },
      fileType,
      error: e as Error,
    };
  }
}

/**
 * Parse a workflow document
 * Normalizes nodes from object format (YAML-friendly) to array format (API-compatible)
 * Preserves original node ref keys (they are user-defined identifiers, not schema keys)
 */
export function parseWorkflow(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<WflowDocument> {
  const fileType = getFileType(uri);
  const lines = text.split('\n');

  try {
    const rawDocument = parseYaml(text) as Record<string, unknown> | null;

    if (!rawDocument) {
      return {
        document: null,
        imports: { byAlias: new Map(), all: [] },
        fileType,
      };
    }

    // Extract original node refs BEFORE snake_to_camel conversion
    // Node refs are user-defined identifiers that should stay as-is
    const originalNodeRefs = rawDocument.nodes && typeof rawDocument.nodes === 'object' && !Array.isArray(rawDocument.nodes)
      ? Object.keys(rawDocument.nodes)
      : null;

    // Convert snake_case keys to camelCase
    const document = deepSnakeToCamel(rawDocument) as WflowDocument;

    // Normalize nodes from object to array, using original refs
    if (document.nodes && !Array.isArray(document.nodes) && originalNodeRefs) {
      const nodesObj = document.nodes as unknown as Record<string, Omit<NodeDecl, 'ref'>>;
      const convertedKeys = Object.keys(nodesObj);

      // Map converted keys back to original refs
      document.nodes = convertedKeys.map((convertedKey, index) => ({
        ref: originalNodeRefs[index], // Use original ref, not the camelCased one
        ...nodesObj[convertedKey],
      }));
    }

    const imports = parseImports(
      document.imports,
      lines,
      resolveImportPath,
    );

    return {
      document,
      imports,
      fileType,
    };
  } catch (e) {
    return {
      document: null,
      imports: { byAlias: new Map(), all: [] },
      fileType,
      error: e as Error,
    };
  }
}

/**
 * Parse a task document
 */
export function parseTask(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<TaskDocument> {
  return parseDocument<TaskDocument>(text, uri, resolveImportPath);
}

/**
 * Parse an action document
 */
export function parseAction(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<ActionDocument> {
  return parseDocument<ActionDocument>(text, uri, resolveImportPath);
}

/**
 * Parse a test document
 */
export function parseTest(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<TestDocument> {
  return parseDocument<TestDocument>(text, uri, resolveImportPath);
}

/**
 * Parse a run document
 */
export function parseRun(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<RunDocument> {
  return parseDocument<RunDocument>(text, uri, resolveImportPath);
}

/**
 * Parse a persona document
 */
export function parsePersona(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<PersonaDocument> {
  return parseDocument<PersonaDocument>(text, uri, resolveImportPath);
}

/**
 * Parse a tool document
 */
export function parseTool(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<ToolDocument> {
  return parseDocument<ToolDocument>(text, uri, resolveImportPath);
}

/**
 * Parse a model profile document
 */
export function parseModel(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<ModelDocument> {
  return parseDocument<ModelDocument>(text, uri, resolveImportPath);
}
