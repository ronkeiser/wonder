import type { Reference } from './types.js';

/**
 * Valid characters for reference names and library/project identifiers
 * Allows lowercase letters, numbers, and hyphens (kebab-case)
 */
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Check if a string is a valid reference name component
 */
export function isValidName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/**
 * Parse a reference string into a structured Reference
 *
 * Parsing rules:
 * - `name` (no prefix, no slash) → workspace scope
 * - `library/name` (no prefix, has slash) → standard library
 * - `$library/name` ($ prefix) → workspace library
 * - `@project/name` (@ prefix) → project
 *
 * @throws Error if the reference format is invalid
 */
export function parseReference(ref: string): Reference {
  if (!ref || typeof ref !== 'string') {
    throw new Error(`Invalid reference: expected non-empty string, got ${typeof ref}`);
  }

  const trimmed = ref.trim();

  // Workspace library: $library/name
  if (trimmed.startsWith('$')) {
    const rest = trimmed.slice(1);
    const slashIndex = rest.indexOf('/');

    if (slashIndex === -1) {
      throw new Error(
        `Invalid workspace library reference "${ref}": expected format $library/name`,
      );
    }

    const library = rest.slice(0, slashIndex);
    const name = rest.slice(slashIndex + 1);

    if (!isValidName(library)) {
      throw new Error(
        `Invalid workspace library reference "${ref}": library name "${library}" must be kebab-case`,
      );
    }

    if (!isValidName(name)) {
      throw new Error(
        `Invalid workspace library reference "${ref}": definition name "${name}" must be kebab-case`,
      );
    }

    return { scope: 'workspaceLibrary', library, name };
  }

  // Project: @project/name
  if (trimmed.startsWith('@')) {
    const rest = trimmed.slice(1);
    const slashIndex = rest.indexOf('/');

    if (slashIndex === -1) {
      throw new Error(`Invalid project reference "${ref}": expected format @project/name`);
    }

    const project = rest.slice(0, slashIndex);
    const name = rest.slice(slashIndex + 1);

    if (!isValidName(project)) {
      throw new Error(
        `Invalid project reference "${ref}": project name "${project}" must be kebab-case`,
      );
    }

    if (!isValidName(name)) {
      throw new Error(
        `Invalid project reference "${ref}": definition name "${name}" must be kebab-case`,
      );
    }

    return { scope: 'project', project, name };
  }

  // Check for slash to distinguish standard library from workspace
  const slashIndex = trimmed.indexOf('/');

  if (slashIndex !== -1) {
    // Standard library: library/name
    const library = trimmed.slice(0, slashIndex);
    const name = trimmed.slice(slashIndex + 1);

    if (!isValidName(library)) {
      throw new Error(
        `Invalid standard library reference "${ref}": library name "${library}" must be kebab-case`,
      );
    }

    if (!isValidName(name)) {
      throw new Error(
        `Invalid standard library reference "${ref}": definition name "${name}" must be kebab-case`,
      );
    }

    return { scope: 'standardLibrary', library, name };
  }

  // Workspace: just a name
  if (!isValidName(trimmed)) {
    throw new Error(`Invalid workspace reference "${ref}": name must be kebab-case`);
  }

  return { scope: 'workspace', name: trimmed };
}

/**
 * Format a Reference back into a string
 */
export function formatReference(ref: Reference): string {
  switch (ref.scope) {
    case 'workspace':
      return ref.name;
    case 'standardLibrary':
      return `${ref.library}/${ref.name}`;
    case 'workspaceLibrary':
      return `$${ref.library}/${ref.name}`;
    case 'project':
      return `@${ref.project}/${ref.name}`;
  }
}

/**
 * Format a Reference with its definition type for use as a unique key
 *
 * This is necessary because different definition types (e.g., workflow vs task)
 * can have the same reference name. The file extension determines the type.
 *
 * Format: `type:reference` (e.g., `workflow:core/context-assembly-passthrough`)
 */
export function formatTypedReference(ref: Reference, definitionType: string): string {
  return `${definitionType}:${formatReference(ref)}`;
}

/**
 * Check if two references are equal
 */
export function referencesEqual(a: Reference, b: Reference): boolean {
  if (a.scope !== b.scope) return false;

  switch (a.scope) {
    case 'workspace':
      return a.name === (b as typeof a).name;
    case 'standardLibrary':
      return (
        a.library === (b as typeof a).library && a.name === (b as typeof a).name
      );
    case 'workspaceLibrary':
      return (
        a.library === (b as typeof a).library && a.name === (b as typeof a).name
      );
    case 'project':
      return (
        a.project === (b as typeof a).project && a.name === (b as typeof a).name
      );
  }
}

/**
 * Try to parse a reference, returning null instead of throwing on invalid input
 */
export function tryParseReference(ref: string): Reference | null {
  try {
    return parseReference(ref);
  } catch {
    return null;
  }
}
