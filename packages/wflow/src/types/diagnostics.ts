/**
 * Diagnostic severity levels
 */
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * Position in a document (0-indexed)
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * Range in a document
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * A diagnostic message (error, warning, etc.)
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  range: Range;
  message: string;
  source: string;
  code?: string | number;
  relatedInformation?: DiagnosticRelatedInformation[];
}

/**
 * Related information for a diagnostic
 */
export interface DiagnosticRelatedInformation {
  location: {
    uri: string;
    range: Range;
  };
  message: string;
}

/**
 * Result of document validation
 */
export interface ValidationResult {
  diagnostics: Diagnostic[];
  valid: boolean;
}
