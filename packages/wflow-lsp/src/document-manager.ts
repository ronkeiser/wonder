import {
  getFileType,
  parseDocument,
  parseImports,
  type ActionDocument,
  type AnyDocument,
  type FileType,
  type ImportsMap,
  type ParseResult,
  type TaskDocument,
  type WflowDocument,
} from '@wonder/wflow';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Manages document state and caching for the LSP server
 */
export class DocumentManager {
  /** Cache of parsed documents */
  private documentCache = new Map<string, ParseResult>();

  /** Cache of resolved imports per document URI */
  private importCache = new Map<string, ImportsMap>();

  /**
   * Resolve an import path relative to a document
   */
  resolveImportPath(importPath: string, documentUri: string): string | null {
    try {
      const documentPath = fileURLToPath(documentUri);
      const documentDir = dirname(documentPath);

      // Handle relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const resolved = resolve(documentDir, importPath);
        return existsSync(resolved) ? pathToFileURL(resolved).href : null;
      }

      // Handle package imports (@library/..., @project/...)
      if (importPath.startsWith('@')) {
        // Return as package reference for now
        // TODO: Implement package resolution from workspace config
        return `package:${importPath}`;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse and cache a document
   */
  parseAndCache(document: TextDocument): ParseResult {
    const uri = document.uri;
    const text = document.getText();

    const result = parseDocument(text, uri, (importPath) =>
      this.resolveImportPath(importPath, uri),
    );

    this.documentCache.set(uri, result);

    if (result.imports) {
      this.importCache.set(uri, result.imports);
    }

    return result;
  }

  /**
   * Get cached parse result for a document
   */
  getCached(uri: string): ParseResult | undefined {
    return this.documentCache.get(uri);
  }

  /**
   * Get cached imports for a document
   */
  getImports(uri: string): ImportsMap | undefined {
    return this.importCache.get(uri);
  }

  /**
   * Remove a document from cache
   */
  remove(uri: string): void {
    this.documentCache.delete(uri);
    this.importCache.delete(uri);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.documentCache.clear();
    this.importCache.clear();
  }

  /**
   * Get document as workflow (with type narrowing)
   */
  getAsWorkflow(uri: string): WflowDocument | null {
    const cached = this.getCached(uri);
    if (!cached?.document || cached.fileType !== 'wflow') return null;
    return cached.document as WflowDocument;
  }

  /**
   * Get document as task (with type narrowing)
   */
  getAsTask(uri: string): TaskDocument | null {
    const cached = this.getCached(uri);
    if (!cached?.document || cached.fileType !== 'task') return null;
    return cached.document as TaskDocument;
  }

  /**
   * Get document as action (with type narrowing)
   */
  getAsAction(uri: string): ActionDocument | null {
    const cached = this.getCached(uri);
    if (!cached?.document || cached.fileType !== 'action') return null;
    return cached.document as ActionDocument;
  }

  /**
   * Get file type for a URI
   */
  getFileType(uri: string): FileType {
    return getFileType(uri);
  }
}
