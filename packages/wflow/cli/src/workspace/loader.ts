import { createHash } from 'node:crypto';
import { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  formatReference,
  getFileType,
  parseDocument,
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
    default:
      return null;
  }
}

/**
 * Compute SHA-256 hash of file content
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Extract dependencies from a parsed document
 *
 * This extracts references from fields that point to other definitions:
 * - PersonaDocument: toolIds, contextAssemblyWorkflowId, memoryExtractionWorkflowId
 * - ToolDocument: targetId
 * - WflowDocument: nodes[].taskId
 * - TaskDocument: steps[].actionId
 */
export function extractDependencies(doc: AnyDocument, fileType: FileType): Reference[] {
  const refs: Reference[] = [];

  switch (fileType) {
    case 'persona': {
      const persona = doc as PersonaDocument;

      if (persona.toolIds) {
        for (const toolId of persona.toolIds) {
          const ref = tryParseReference(toolId);
          if (ref) refs.push(ref);
        }
      }

      if (persona.contextAssemblyWorkflowId) {
        const ref = tryParseReference(persona.contextAssemblyWorkflowId);
        if (ref) refs.push(ref);
      }

      if (persona.memoryExtractionWorkflowId) {
        const ref = tryParseReference(persona.memoryExtractionWorkflowId);
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
            const ref = tryParseReference(node.taskId);
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
            const ref = tryParseReference(step.actionId);
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

    const parseResult = parseDocument(content, absolutePath);

    if (parseResult.error || !parseResult.document) {
      // Skip files that fail to parse - validation will catch these
      continue;
    }

    // Determine reference from path
    const pathParts = relativePath.split(path.sep);
    const fileName = path.basename(absolutePath);
    const reference = deriveReference(pathParts, fileName);

    if (!reference) continue;

    const refKey = formatReference(reference);
    const contentHash = computeContentHash(content);
    const dependencies = extractDependencies(parseResult.document, fileType);

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
 */
function deriveReference(pathParts: string[], fileName: string): Reference | null {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  const rootDir = pathParts[0];

  if (rootDir === 'personas' || rootDir === 'agents') {
    // personas/name.persona or agents/name.agent
    return { scope: 'workspace', name: nameWithoutExt };
  }

  if (rootDir === 'libraries' && pathParts.length >= 3) {
    // libraries/mylib/name.ext
    const library = pathParts[1];
    return { scope: 'workspaceLibrary', library, name: nameWithoutExt };
  }

  if (rootDir === 'projects' && pathParts.length >= 3) {
    // projects/myproj/name.ext
    const project = pathParts[1];
    return { scope: 'project', project, name: nameWithoutExt };
  }

  return null;
}
