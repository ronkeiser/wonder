import { parse as parseYaml } from 'yaml';
import type {
  ActionDocument,
  AnyDocument,
  FileType,
  RunDocument,
  TaskDocument,
  TestDocument,
  WflowDocument,
} from '../types/ast.js';

/**
 * Convert snake_case string to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
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
 */
export function parseWorkflow(
  text: string,
  uri: string,
  resolveImportPath?: (importPath: string) => string | null,
): ParseResult<WflowDocument> {
  return parseDocument<WflowDocument>(text, uri, resolveImportPath);
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
