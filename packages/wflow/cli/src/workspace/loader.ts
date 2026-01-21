import { createHash } from 'node:crypto';
import { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  formatTypedReference,
  getFileType,
  parseDocument,
  parseWorkflow,
  STANDARD_LIBRARY_WORKSPACE_NAME,
  tryParseReference,
  type AnyDocument,
  type DefinitionType,
  type FileType,
  type PersonaDocument,
  type Reference,
  type TaskDocument,
  type ToolDocument,
  type WflowDocument,
  type Workspace,
  type WorkspaceConfig,
  type WorkspaceDefinition,
} from '@wonder/wflow';

/**
 * Map file extension to definition type
 */
function fileTypeToDefinitionType(fileType: FileType): DefinitionType | null {
  switch (fileType) {
    case 'wflow':
      return 'workflow';
    case 'task':
      return 'task';
    case 'action':
      return 'action';
    case 'tool':
      return 'tool';
    case 'persona':
      return 'persona';
    case 'model':
      return 'model';
    default:
      return null;
  }
}

/**
 * Fields excluded from content hash (same as server fingerprint.ts)
 *
 * Note: `name` is NOT excluded - it's user-facing content that should affect versioning.
 * The document-type identifier keys (workflow, task, etc.) map to `name` and are also included.
 */
const METADATA_FIELDS = new Set([
  'id',
  'version',
  'reference',
  'description',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'tags',
  'projectId',
  'libraryId',
  'project_id',
  'library_id',
  'autoversion',
  'contentHash',
  'content_hash',
  'imports', // Local-only field not sent to server
]);

/**
 * Recursively sort object keys for deterministic serialization
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Extract content fields, excluding metadata
 */
function extractContent(data: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!METADATA_FIELDS.has(key)) {
      content[key] = value;
    }
  }
  return content;
}

/**
 * Compute SHA-256 hash of document content (matching server fingerprint algorithm)
 */
export function computeContentHash(document: Record<string, unknown>): string {
  const content = extractContent(document);
  const sortedContent = sortObjectKeys(content);
  const jsonString = JSON.stringify(sortedContent);
  return createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

/**
 * Resolve an import alias or direct reference to a Reference
 *
 * @param value - Either an import alias (e.g., "passthrough_task") or a direct reference (e.g., "core/my-task")
 * @param imports - The imports section from the document
 * @param filePath - Absolute path to the document file (for resolving relative imports)
 * @returns A Reference if resolved, null otherwise
 */
function resolveToReference(
  value: string,
  imports: Record<string, string> | undefined,
  filePath: string,
): Reference | null {
  // First, try to parse as a direct reference (e.g., "core/my-task")
  const directRef = tryParseReference(value);
  if (directRef) return directRef;

  // If not a direct reference, try to resolve as an import alias
  if (!imports) return null;

  // Try both the original alias and camelCase version (since parser converts snake_case to camelCase)
  const camelAlias = value.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
  const relativePath = imports[value] ?? imports[camelAlias];

  if (!relativePath) return null;

  // Resolve the relative import path to an absolute path
  const fileDir = path.dirname(filePath);
  const importedFilePath = path.resolve(fileDir, relativePath);

  // Derive reference from the imported file path
  // Path like: .../libraries/core/context-assembly-passthrough.task
  // Reference: core/context-assembly-passthrough (standardLibrary scope)
  const pathParts = importedFilePath.split(path.sep);
  const librariesIndex = pathParts.indexOf('libraries');
  const projectsIndex = pathParts.indexOf('projects');

  if (librariesIndex !== -1 && librariesIndex < pathParts.length - 2) {
    const libraryName = pathParts[librariesIndex + 1];
    const fileName = pathParts[pathParts.length - 1];
    const baseName = fileName.replace(/\.[^.]+$/, ''); // Remove extension

    // Determine if this is standard library or workspace library
    // For now, assume standardLibrary (most common case for imports)
    // The validator will catch mismatches
    return { scope: 'standardLibrary', library: libraryName, name: baseName };
  }

  if (projectsIndex !== -1 && projectsIndex < pathParts.length - 2) {
    const projectName = pathParts[projectsIndex + 1];
    const fileName = pathParts[pathParts.length - 1];
    const baseName = fileName.replace(/\.[^.]+$/, '');

    return { scope: 'project', project: projectName, name: baseName };
  }

  return null;
}

/**
 * Extract dependencies from a parsed document
 *
 * This extracts references from fields that point to other definitions:
 * - PersonaDocument: toolIds, contextAssemblyWorkflowId, memoryExtractionWorkflowId
 * - ToolDocument: targetId
 * - WflowDocument: nodes[].taskId (resolves import aliases)
 * - TaskDocument: steps[].actionId (resolves import aliases)
 *
 * @param doc - The parsed document
 * @param fileType - The type of file (wflow, task, etc.)
 * @param filePath - Absolute path to the document file (for resolving relative imports)
 */
export function extractDependencies(
  doc: AnyDocument,
  fileType: FileType,
  filePath: string,
): Reference[] {
  const refs: Reference[] = [];
  const imports = (doc as { imports?: Record<string, string> }).imports;

  switch (fileType) {
    case 'persona': {
      const persona = doc as PersonaDocument;

      if (persona.toolIds) {
        for (const toolId of persona.toolIds) {
          const ref = tryParseReference(toolId);
          if (ref) refs.push(ref);
        }
      }

      if (persona.contextAssemblyWorkflowDefId) {
        const ref = tryParseReference(persona.contextAssemblyWorkflowDefId);
        if (ref) refs.push(ref);
      }

      if (persona.memoryExtractionWorkflowDefId) {
        const ref = tryParseReference(persona.memoryExtractionWorkflowDefId);
        if (ref) refs.push(ref);
      }

      if (persona.modelProfileId) {
        const ref = tryParseReference(persona.modelProfileId);
        if (ref) refs.push(ref);
      }
      break;
    }

    case 'tool': {
      const tool = doc as ToolDocument;

      if (tool.targetId) {
        const ref = tryParseReference(tool.targetId);
        if (ref) refs.push(ref);
      }
      break;
    }

    case 'wflow': {
      const wflow = doc as WflowDocument;

      if (wflow.nodes) {
        for (const node of Object.values(wflow.nodes)) {
          if (node.taskId) {
            const ref = resolveToReference(node.taskId, imports, filePath);
            if (ref) refs.push(ref);
          }
        }
      }
      break;
    }

    case 'task': {
      const task = doc as TaskDocument;

      if (task.steps) {
        for (const step of task.steps) {
          if (step.actionId) {
            const ref = resolveToReference(step.actionId, imports, filePath);
            if (ref) refs.push(ref);
          }
        }
      }
      break;
    }
  }

  return refs;
}

/**
 * Recursively find all definition files in a directory
 */
async function findDefinitionFiles(
  dir: string,
  rootDir: string,
  exclude: string[] = [],
): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const results: Array<{ absolutePath: string; relativePath: string }> = [];

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const name = entry.name as string;
    const absolutePath = path.join(dir, name);
    const relativePath = path.relative(rootDir, absolutePath);

    // Check excludes
    if (exclude.some((pattern) => relativePath.includes(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (name === 'node_modules' || name.startsWith('.')) {
        continue;
      }

      const subResults = await findDefinitionFiles(absolutePath, rootDir, exclude);
      results.push(...subResults);
    } else if (entry.isFile()) {
      const fileType = getFileType(name);
      const defType = fileTypeToDefinitionType(fileType);

      if (defType !== null) {
        results.push({ absolutePath, relativePath });
      }
    }
  }

  return results;
}

/**
 * Load workspace configuration from wflow.config.yaml
 */
async function loadWorkspaceConfig(rootPath: string): Promise<WorkspaceConfig | undefined> {
  const configPath = path.join(rootPath, 'wflow.config.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = parseYaml(content) as WorkspaceConfig;
    return config;
  } catch {
    return undefined;
  }
}

/**
 * Check if a directory is a workspace root
 *
 * A directory is considered a workspace if it has:
 * - wflow.config.yaml, OR
 * - Any of: personas/, agents/, libraries/, projects/
 */
export async function isWorkspaceRoot(dirPath: string): Promise<boolean> {
  const checks = ['wflow.config.yaml', 'personas', 'agents', 'libraries', 'projects'];

  for (const name of checks) {
    try {
      await fs.access(path.join(dirPath, name));
      return true;
    } catch {
      // Continue checking
    }
  }

  return false;
}

/**
 * Load a workspace from a directory
 *
 * Walks the directory structure, parses all definition files, and builds
 * a workspace with references and dependencies.
 */
export async function loadWorkspace(rootPath: string): Promise<Workspace> {
  const absoluteRoot = path.resolve(rootPath);

  // Load config if present
  const config = await loadWorkspaceConfig(absoluteRoot);
  const exclude = config?.exclude ?? [];

  // Check if this is the standard library workspace
  const isStandardLibrary = config?.name === STANDARD_LIBRARY_WORKSPACE_NAME;

  // Find all definition files in standard directories
  const standardDirs = ['personas', 'agents', 'libraries', 'projects'];
  const allFiles: Array<{ absolutePath: string; relativePath: string }> = [];

  for (const dir of standardDirs) {
    const dirPath = path.join(absoluteRoot, dir);
    const files = await findDefinitionFiles(dirPath, absoluteRoot, exclude);
    allFiles.push(...files);
  }

  // Parse each file and build definitions
  const definitions = new Map<string, WorkspaceDefinition>();

  for (const { absolutePath, relativePath } of allFiles) {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const fileType = getFileType(absolutePath);
    const definitionType = fileTypeToDefinitionType(fileType);

    if (definitionType === null) continue;

    // Use file-type-specific parser for workflows to normalize nodes format
    const parseResult = fileType === 'wflow'
      ? parseWorkflow(content, absolutePath)
      : parseDocument(content, absolutePath);

    if (parseResult.error || !parseResult.document) {
      // Skip files that fail to parse - validation will catch these
      continue;
    }

    // Determine reference from path
    const pathParts = relativePath.split(path.sep);
    const fileName = path.basename(absolutePath);
    const reference = deriveReference(pathParts, fileName, isStandardLibrary);

    if (!reference) continue;

    // Include definition type in key to avoid collisions between .task and .wflow with same name
    const refKey = formatTypedReference(reference, definitionType);
    const contentHash = computeContentHash(parseResult.document as Record<string, unknown>);
    const dependencies = extractDependencies(parseResult.document, fileType, absolutePath);

    definitions.set(refKey, {
      reference,
      filePath: absolutePath,
      definitionType,
      document: parseResult.document,
      contentHash,
      dependencies,
    });
  }

  return {
    root: absoluteRoot,
    definitions,
    config,
  };
}

/**
 * Derive a reference from path parts and filename
 *
 * @param pathParts - Path parts relative to workspace root
 * @param fileName - The file name including extension
 * @param isStandardLibrary - Whether this is the standard library workspace
 */
function deriveReference(
  pathParts: string[],
  fileName: string,
  isStandardLibrary: boolean,
): Reference | null {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  const rootDir = pathParts[0];

  if (rootDir === 'personas' || rootDir === 'agents') {
    // personas/name.persona or agents/name.agent
    return { scope: 'workspace', name: nameWithoutExt };
  }

  if (rootDir === 'libraries' && pathParts.length >= 3) {
    // libraries/mylib/name.ext
    const library = pathParts[1];
    // Standard library uses 'standardLibrary' scope, others use 'workspaceLibrary'
    if (isStandardLibrary) {
      return { scope: 'standardLibrary', library, name: nameWithoutExt };
    }
    return { scope: 'workspaceLibrary', library, name: nameWithoutExt };
  }

  if (rootDir === 'projects' && pathParts.length >= 3) {
    // projects/myproj/name.ext
    const project = pathParts[1];
    return { scope: 'project', project, name: nameWithoutExt };
  }

  return null;
}
