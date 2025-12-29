import type { Diagnostic as LSPDiagnostic } from 'vscode-languageserver/node';
import { DiagnosticSeverity as LSPDiagnosticSeverity } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  type WflowDocument,
  type TaskDocument,
  type ActionDocument,
  type JSONSchemaProperty,
  type ImportsMap,
  escapeRegex,
  buildGraph,
  detectCycles,
  analyzeDataFlow,
  findUnreachableNodes,
  extractPaths,
  findSimilarPaths,
  findUnknownProps,
  WORKFLOW_ALLOWED_PROPS,
  NODE_ALLOWED_PROPS,
  TRANSITION_ALLOWED_PROPS,
  CONDITION_ALLOWED_PROPS,
  FOREACH_ALLOWED_PROPS,
  SYNCHRONIZATION_ALLOWED_PROPS,
  MERGE_ALLOWED_PROPS,
  TASK_ALLOWED_PROPS,
  STEP_ALLOWED_PROPS,
  STEP_CONDITION_ALLOWED_PROPS,
  RETRY_ALLOWED_PROPS,
  ACTION_ALLOWED_PROPS,
  ACTION_EXECUTION_ALLOWED_PROPS,
  ACTION_RETRY_POLICY_ALLOWED_PROPS,
  ACTION_IDEMPOTENCY_ALLOWED_PROPS,
  IMPLEMENTATION_PROPS_BY_KIND,
  VALID_ACTION_KINDS,
  JSON_SCHEMA_ALLOWED_PROPS,
} from '@wonder/wflow';
import type { DocumentManager } from '../document-manager';

// =============================================================================
// Helper functions
// =============================================================================

function findLineContainingAfter(lines: string[], search: string, startLine: number): number {
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(search)) return i;
  }
  return -1;
}

function findStepLine(lines: string[], stepIndex: number, stepRef?: string): number {
  if (stepRef) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`^\\s*-?\\s*ref:\\s*${escapeRegex(stepRef)}`))) {
        return i;
      }
    }
  }
  let stepCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*-\s/)) {
      if (stepCount === stepIndex) return i;
      stepCount++;
    }
  }
  return 0;
}

function findTransitionFieldLine(lines: string[], value: string, _field: string): number {
  return lines.findIndex((line) => line.includes(value));
}

function findMappingLine(lines: string[], value: string): number {
  return lines.findIndex((line) => line.includes(value));
}

function validateUnknownProps(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
  lines: string[],
  diagnostics: LSPDiagnostic[],
  startLine: number = 0,
): void {
  const unknown = findUnknownProps(obj, allowed);
  for (const key of unknown) {
    let lineIndex = -1;
    for (let i = startLine; i < lines.length; i++) {
      const regex = new RegExp(`^\\s*${escapeRegex(key)}\\s*:`);
      if (regex.test(lines[i])) {
        lineIndex = i;
        break;
      }
    }
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(key);
      diagnostics.push({
        severity: LSPDiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + key.length },
        },
        message: `Unknown property '${key}' in ${context}. Allowed: ${[...allowed].join(', ')}`,
        source: 'wflow',
      });
    }
  }
}

function validateJsonSchema(
  schema: Record<string, unknown>,
  context: string,
  lines: string[],
  diagnostics: LSPDiagnostic[],
): void {
  validateUnknownProps(schema, JSON_SCHEMA_ALLOWED_PROPS, context, lines, diagnostics);

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propName, propSchema] of Object.entries(
      schema.properties as unknown as Record<string, unknown>,
    )) {
      if (propSchema && typeof propSchema === 'object') {
        validateJsonSchema(
          propSchema as unknown as Record<string, unknown>,
          `${context}.properties.${propName}`,
          lines,
          diagnostics,
        );
      }
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    validateJsonSchema(schema.items as unknown as Record<string, unknown>, `${context}.items`, lines, diagnostics);
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    validateJsonSchema(
      schema.additionalProperties as unknown as Record<string, unknown>,
      `${context}.additionalProperties`,
      lines,
      diagnostics,
    );
  }

  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(schema[combiner])) {
      (schema[combiner] as unknown[]).forEach((subSchema, idx) => {
        if (subSchema && typeof subSchema === 'object') {
          validateJsonSchema(
            subSchema as unknown as Record<string, unknown>,
            `${context}.${combiner}[${idx}]`,
            lines,
            diagnostics,
          );
        }
      });
    }
  }

  if (schema.not && typeof schema.not === 'object') {
    validateJsonSchema(schema.not as unknown as Record<string, unknown>, `${context}.not`, lines, diagnostics);
  }
}

function validateImports(imports: ImportsMap, lines: string[], diagnostics: LSPDiagnostic[]): void {
  for (const imp of imports.all) {
    if (!imp.resolvedUri) {
      const lineIndex = imp.line;
      const line = lines[lineIndex];
      const pathStart = line.indexOf(imp.path);

      diagnostics.push({
        severity: LSPDiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: pathStart },
          end: { line: lineIndex, character: pathStart + imp.path.length },
        },
        message: `Import path '${imp.path}' not found`,
        source: 'wflow',
      });
    } else if (imp.fileType === 'unknown' && !imp.resolvedUri.startsWith('package:')) {
      const lineIndex = imp.line;
      const line = lines[lineIndex];
      const pathStart = line.indexOf(imp.path);

      diagnostics.push({
        severity: LSPDiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: pathStart },
          end: { line: lineIndex, character: pathStart + imp.path.length },
        },
        message: `Import path '${imp.path}' has unknown file type. Expected .task, .action, or .wflow`,
        source: 'wflow',
      });
    }
  }
}

function validateUnusedImports(
  imports: ImportsMap,
  usedAliases: Set<string>,
  lines: string[],
  diagnostics: LSPDiagnostic[],
): void {
  for (const imp of imports.all) {
    if (!usedAliases.has(imp.alias)) {
      const lineIndex = imp.line;
      const line = lines[lineIndex];
      const aliasStart = line.indexOf(imp.alias);

      diagnostics.push({
        severity: LSPDiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: aliasStart },
          end: { line: lineIndex, character: aliasStart + imp.alias.length },
        },
        message: `Unused import '${imp.alias}'`,
        source: 'wflow',
      });
    }
  }
}

// =============================================================================
// Document validators
// =============================================================================

function validateTaskDocument(
  parsed: TaskDocument,
  lines: string[],
  diagnostics: LSPDiagnostic[],
  imports: ImportsMap,
): void {
  const usedImports = new Set<string>();

  validateUnknownProps(
    parsed as unknown as Record<string, unknown>,
    TASK_ALLOWED_PROPS,
    'task',
    lines,
    diagnostics,
  );

  if (parsed.inputSchema && typeof parsed.inputSchema === 'object') {
    validateJsonSchema(parsed.inputSchema as unknown as Record<string, unknown>, 'inputSchema', lines, diagnostics);
  }
  if (parsed.outputSchema && typeof parsed.outputSchema === 'object') {
    validateJsonSchema(parsed.outputSchema as unknown as Record<string, unknown>, 'outputSchema', lines, diagnostics);
  }

  if (parsed.retry && typeof parsed.retry === 'object') {
    validateUnknownProps(parsed.retry as unknown as Record<string, unknown>, RETRY_ALLOWED_PROPS, 'retry', lines, diagnostics);
  }

  const stepRefs = new Set<string>();
  if (Array.isArray(parsed.steps)) {
    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i];
      if (!step || typeof step !== 'object') continue;

      const stepStartLine = findStepLine(lines, i, step.ref);

      validateUnknownProps(
        step as unknown as Record<string, unknown>,
        STEP_ALLOWED_PROPS,
        `step[${i}]`,
        lines,
        diagnostics,
        stepStartLine,
      );

      if (step.actionId && typeof step.actionId === 'string') {
        const imp = imports.byAlias.get(step.actionId);
        if (imp) {
          usedImports.add(step.actionId);
          if (imp.fileType !== 'action' && imp.fileType !== 'unknown') {
            const lineIndex = findLineContainingAfter(lines, 'actionId:', stepStartLine);
            if (lineIndex !== -1) {
              const line = lines[lineIndex];
              const charIndex = line.indexOf(step.actionId);
              diagnostics.push({
                severity: LSPDiagnosticSeverity.Error,
                range: {
                  start: { line: lineIndex, character: charIndex },
                  end: { line: lineIndex, character: charIndex + step.actionId.length },
                },
                message: `Import '${step.actionId}' resolves to a ${imp.fileType} file, but actionId requires an action`,
                source: 'wflow',
              });
            }
          }
        } else if (!step.actionId.startsWith('@')) {
          const lineIndex = findLineContainingAfter(lines, 'actionId:', stepStartLine);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(step.actionId);
            const availableImports = [...imports.byAlias.keys()].filter((alias) => {
              const i = imports.byAlias.get(alias);
              return i?.fileType === 'action' || i?.fileType === 'unknown';
            });
            let message = `Action '${step.actionId}' is not imported.`;
            if (availableImports.length > 0) {
              message += ` Available actions: ${availableImports.join(', ')}`;
            } else {
              message += ` Add an import at the top of the file.`;
            }
            diagnostics.push({
              severity: LSPDiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + step.actionId.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }

      if (step.ref) {
        if (stepRefs.has(step.ref)) {
          const lineIndex = findLineContainingAfter(lines, `ref:`, stepStartLine);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(step.ref);
            diagnostics.push({
              severity: LSPDiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + step.ref.length },
              },
              message: `Duplicate step ref '${step.ref}'`,
              source: 'wflow',
            });
          }
        }
        stepRefs.add(step.ref);
      }

      if (step.condition && typeof step.condition === 'object') {
        validateUnknownProps(
          step.condition as unknown as Record<string, unknown>,
          STEP_CONDITION_ALLOWED_PROPS,
          `step[${i}].condition`,
          lines,
          diagnostics,
          stepStartLine,
        );
      }
    }
  }

  validateUnusedImports(imports, usedImports, lines, diagnostics);
}

function validateActionDocument(
  parsed: ActionDocument,
  lines: string[],
  diagnostics: LSPDiagnostic[],
  imports: ImportsMap,
): void {
  const usedImports = new Set<string>();

  validateUnknownProps(
    parsed as unknown as Record<string, unknown>,
    ACTION_ALLOWED_PROPS,
    'action',
    lines,
    diagnostics,
  );

  if (parsed.requires && typeof parsed.requires === 'object') {
    validateJsonSchema(parsed.requires as unknown as Record<string, unknown>, 'requires', lines, diagnostics);
  }
  if (parsed.produces && typeof parsed.produces === 'object') {
    validateJsonSchema(parsed.produces as unknown as Record<string, unknown>, 'produces', lines, diagnostics);
  }

  if (parsed.execution && typeof parsed.execution === 'object') {
    validateUnknownProps(
      parsed.execution as unknown as Record<string, unknown>,
      ACTION_EXECUTION_ALLOWED_PROPS,
      'execution',
      lines,
      diagnostics,
    );

    if (parsed.execution.retryPolicy && typeof parsed.execution.retryPolicy === 'object') {
      validateUnknownProps(
        parsed.execution.retryPolicy as unknown as Record<string, unknown>,
        ACTION_RETRY_POLICY_ALLOWED_PROPS,
        'execution.retryPolicy',
        lines,
        diagnostics,
      );
    }
  }

  if (parsed.idempotency && typeof parsed.idempotency === 'object') {
    validateUnknownProps(
      parsed.idempotency as unknown as Record<string, unknown>,
      ACTION_IDEMPOTENCY_ALLOWED_PROPS,
      'idempotency',
      lines,
      diagnostics,
    );
  }

  if (parsed.kind && parsed.implementation && typeof parsed.implementation === 'object') {
    const allowedProps = IMPLEMENTATION_PROPS_BY_KIND[parsed.kind];
    if (allowedProps) {
      validateUnknownProps(
        parsed.implementation as unknown as Record<string, unknown>,
        allowedProps,
        `implementation (kind: ${parsed.kind})`,
        lines,
        diagnostics,
      );
    }
  }

  if (parsed.kind && !VALID_ACTION_KINDS.includes(parsed.kind as typeof VALID_ACTION_KINDS[number])) {
    const lineIndex = lines.findIndex((line) => line.includes('kind:'));
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(parsed.kind);
      diagnostics.push({
        severity: LSPDiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + parsed.kind.length },
        },
        message: `Invalid action kind '${parsed.kind}'. Valid kinds: ${VALID_ACTION_KINDS.join(', ')}`,
        source: 'wflow',
      });
    }
  }

  validateUnusedImports(imports, usedImports, lines, diagnostics);
}

function validateWorkflowDocument(
  parsed: WflowDocument,
  lines: string[],
  diagnostics: LSPDiagnostic[],
  imports: ImportsMap,
): void {
  const usedImports = new Set<string>();

  validateUnknownProps(
    parsed as unknown as Record<string, unknown>,
    WORKFLOW_ALLOWED_PROPS,
    'workflow',
    lines,
    diagnostics,
  );

  if (parsed.inputSchema && typeof parsed.inputSchema === 'object') {
    validateJsonSchema(parsed.inputSchema as unknown as Record<string, unknown>, 'inputSchema', lines, diagnostics);
  }
  if (parsed.contextSchema && typeof parsed.contextSchema === 'object') {
    validateJsonSchema(parsed.contextSchema as unknown as Record<string, unknown>, 'contextSchema', lines, diagnostics);
  }
  if (parsed.outputSchema && typeof parsed.outputSchema === 'object') {
    validateJsonSchema(parsed.outputSchema as unknown as Record<string, unknown>, 'outputSchema', lines, diagnostics);
  }

  // Validate nodes
  for (const [nodeRef, node] of Object.entries(parsed.nodes || {})) {
    if (node && typeof node === 'object') {
      const nodeStartLine = lines.findIndex((line) => {
        const regex = new RegExp(`^\\s*${escapeRegex(nodeRef)}\\s*:`);
        return regex.test(line);
      });
      validateUnknownProps(
        node as unknown as Record<string, unknown>,
        NODE_ALLOWED_PROPS,
        `node '${nodeRef}'`,
        lines,
        diagnostics,
        nodeStartLine !== -1 ? nodeStartLine : 0,
      );

      if (node.taskId && typeof node.taskId === 'string') {
        const imp = imports.byAlias.get(node.taskId);
        if (imp) {
          usedImports.add(node.taskId);
          if (imp.fileType !== 'task' && imp.fileType !== 'unknown') {
            const lineIndex = findLineContainingAfter(lines, 'taskId:', nodeStartLine);
            if (lineIndex !== -1) {
              const line = lines[lineIndex];
              const charIndex = line.indexOf(node.taskId);
              diagnostics.push({
                severity: LSPDiagnosticSeverity.Error,
                range: {
                  start: { line: lineIndex, character: charIndex },
                  end: { line: lineIndex, character: charIndex + node.taskId.length },
                },
                message: `Import '${node.taskId}' resolves to a ${imp.fileType} file, but taskId requires a task`,
                source: 'wflow',
              });
            }
          }
        } else if (!node.taskId.startsWith('@')) {
          const lineIndex = findLineContainingAfter(lines, 'taskId:', nodeStartLine);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(node.taskId);
            const availableImports = [...imports.byAlias.keys()].filter((alias) => {
              const i = imports.byAlias.get(alias);
              return i?.fileType === 'task' || i?.fileType === 'unknown';
            });
            let message = `Task '${node.taskId}' is not imported.`;
            if (availableImports.length > 0) {
              message += ` Available tasks: ${availableImports.join(', ')}`;
            } else {
              message += ` Add an import at the top of the file.`;
            }
            diagnostics.push({
              severity: LSPDiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + node.taskId.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }
    }
  }

  // Validate transitions
  for (const [transitionRef, transition] of Object.entries(parsed.transitions || {})) {
    if (transition && typeof transition === 'object') {
      const transitionStartLine = lines.findIndex((line) => {
        const regex = new RegExp(`^\\s*${escapeRegex(transitionRef)}\\s*:`);
        return regex.test(line);
      });

      validateUnknownProps(
        transition as unknown as Record<string, unknown>,
        TRANSITION_ALLOWED_PROPS,
        `transition '${transitionRef}'`,
        lines,
        diagnostics,
        transitionStartLine !== -1 ? transitionStartLine : 0,
      );

      if (transition.condition && typeof transition.condition === 'object') {
        validateUnknownProps(
          transition.condition as unknown as Record<string, unknown>,
          CONDITION_ALLOWED_PROPS,
          `condition in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0,
        );
      }

      if (transition.foreach && typeof transition.foreach === 'object') {
        validateUnknownProps(
          transition.foreach as unknown as Record<string, unknown>,
          FOREACH_ALLOWED_PROPS,
          `foreach in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0,
        );
      }

      if (transition.synchronization && typeof transition.synchronization === 'object') {
        const sync = transition.synchronization as unknown as Record<string, unknown>;
        validateUnknownProps(
          sync,
          SYNCHRONIZATION_ALLOWED_PROPS,
          `synchronization in transition '${transitionRef}'`,
          lines,
          diagnostics,
          transitionStartLine !== -1 ? transitionStartLine : 0,
        );

        if (sync.merge && typeof sync.merge === 'object') {
          validateUnknownProps(
            sync.merge as unknown as Record<string, unknown>,
            MERGE_ALLOWED_PROPS,
            `merge in transition '${transitionRef}'`,
            lines,
            diagnostics,
            transitionStartLine !== -1 ? transitionStartLine : 0,
          );
        }
      }
    }
  }

  // Schema path validation
  const inputPaths = extractPaths(parsed.inputSchema, 'input');
  const contextPaths = extractPaths(parsed.contextSchema, 'state');
  const outputPaths = extractPaths(parsed.outputSchema, 'output');
  const readablePaths = new Set([...inputPaths, ...contextPaths]);
  const writablePaths = new Set([...contextPaths, ...outputPaths]);
  const nodeRefs = new Set(Object.keys(parsed.nodes || {}));
  const transitionRefs = new Set(Object.keys(parsed.transitions || {}));

  // Validate initialNodeRef
  if (parsed.initialNodeRef && !nodeRefs.has(parsed.initialNodeRef)) {
    const lineIndex = lines.findIndex((line) => line.includes('initial_node_ref:'));
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(parsed.initialNodeRef);
      diagnostics.push({
        severity: LSPDiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + parsed.initialNodeRef.length },
        },
        message: `Node '${parsed.initialNodeRef}' does not exist. Available nodes: ${[...nodeRefs].join(', ')}`,
        source: 'wflow',
      });
    }
  }

  // Validate inputMapping and outputMapping paths
  for (const [nodeRef, node] of Object.entries(parsed.nodes || {})) {
    if (!node) continue;

    if (node.inputMapping) {
      for (const [_taskInputKey, jsonPath] of Object.entries(node.inputMapping)) {
        if (typeof jsonPath !== 'string') continue;
        const pathMatch = jsonPath.match(/^\$\.(.+)$/);
        if (!pathMatch) continue;
        const path = pathMatch[1];

        if (!readablePaths.has(path)) {
          const lineIndex = findMappingLine(lines, jsonPath);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(jsonPath);
            const suggestions = findSimilarPaths(path, readablePaths);
            let message = `Path '${jsonPath}' does not exist in inputSchema or contextSchema.`;
            if (suggestions.length > 0) {
              message += ` Did you mean: ${suggestions.map((s) => `$.${s}`).join(', ')}?`;
            }
            diagnostics.push({
              severity: LSPDiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + jsonPath.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }
    }

    if (node.outputMapping) {
      for (const [contextPath, _taskOutputPath] of Object.entries(node.outputMapping)) {
        if (typeof contextPath !== 'string') continue;

        if (!writablePaths.has(contextPath)) {
          const lineIndex = findMappingLine(lines, contextPath);
          if (lineIndex !== -1) {
            const line = lines[lineIndex];
            const charIndex = line.indexOf(contextPath);
            const suggestions = findSimilarPaths(contextPath, writablePaths);
            let message = `Path '${contextPath}' does not exist in contextSchema or outputSchema.`;
            if (suggestions.length > 0) {
              message += ` Did you mean: ${suggestions.join(', ')}?`;
            }
            diagnostics.push({
              severity: LSPDiagnosticSeverity.Error,
              range: {
                start: { line: lineIndex, character: charIndex },
                end: { line: lineIndex, character: charIndex + contextPath.length },
              },
              message,
              source: 'wflow',
            });
          }
        }
      }
    }
  }

  // Validate transition node references
  for (const [_transitionRef, transition] of Object.entries(parsed.transitions || {})) {
    if (typeof transition !== 'object' || transition === null) continue;

    const fromNodeRef = transition.fromNodeRef;
    const toNodeRef = transition.toNodeRef;

    if (fromNodeRef && !nodeRefs.has(fromNodeRef)) {
      const lineIndex = findTransitionFieldLine(lines, fromNodeRef, 'fromNodeRef');
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        const charIndex = line.indexOf(fromNodeRef);
        diagnostics.push({
          severity: LSPDiagnosticSeverity.Error,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + fromNodeRef.length },
          },
          message: `Node '${fromNodeRef}' does not exist. Available nodes: ${[...nodeRefs].join(', ')}`,
          source: 'wflow',
        });
      }
    }

    if (toNodeRef !== null && toNodeRef !== undefined && !nodeRefs.has(toNodeRef)) {
      const lineIndex = findTransitionFieldLine(lines, toNodeRef, 'toNodeRef');
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        const charIndex = line.indexOf(toNodeRef);
        diagnostics.push({
          severity: LSPDiagnosticSeverity.Error,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + toNodeRef.length },
          },
          message: `Node '${toNodeRef}' does not exist. Available nodes: ${[...nodeRefs].join(', ')}`,
          source: 'wflow',
        });
      }
    }

    // Validate siblingGroup
    const sync = transition.synchronization as unknown as Record<string, unknown> | undefined;
    if (sync?.siblingGroup && typeof sync.siblingGroup === 'string') {
      if (!transitionRefs.has(sync.siblingGroup)) {
        const lineIndex = findMappingLine(lines, sync.siblingGroup);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(sync.siblingGroup);
          diagnostics.push({
            severity: LSPDiagnosticSeverity.Error,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + sync.siblingGroup.length },
            },
            message: `Transition '${sync.siblingGroup}' does not exist. siblingGroup must reference a fan-out transition. Available transitions: ${[...transitionRefs].join(', ') || 'none'}`,
            source: 'wflow',
          });
        }
      }
    }

    // Validate foreach.collection
    const foreach = transition.foreach as { collection?: string } | undefined;
    if (foreach?.collection && typeof foreach.collection === 'string') {
      if (!foreach.collection.startsWith('state.')) {
        const lineIndex = findMappingLine(lines, foreach.collection);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(foreach.collection);
          diagnostics.push({
            severity: LSPDiagnosticSeverity.Error,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + foreach.collection.length },
            },
            message: `foreach.collection '${foreach.collection}' must be a state path (e.g., 'state.items')`,
            source: 'wflow',
          });
        }
      } else if (!contextPaths.has(foreach.collection)) {
        const lineIndex = findMappingLine(lines, foreach.collection);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(foreach.collection);
          const suggestions = findSimilarPaths(foreach.collection, contextPaths);
          let message = `Path '${foreach.collection}' does not exist in contextSchema.`;
          if (suggestions.length > 0) {
            message += ` Did you mean: ${suggestions.join(', ')}?`;
          }
          diagnostics.push({
            severity: LSPDiagnosticSeverity.Error,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + foreach.collection.length },
            },
            message,
            source: 'wflow',
          });
        }
      }
    }
  }

  // Graph analysis
  const graph = buildGraph(parsed);
  const dataFlow = analyzeDataFlow(parsed, graph, inputPaths);

  // Unreachable nodes
  const unreachable = findUnreachableNodes(parsed, graph);
  for (const nodeRef of unreachable) {
    const lineIndex = lines.findIndex((line) => {
      const regex = new RegExp(`^\\s{2}${escapeRegex(nodeRef)}\\s*:`);
      return regex.test(line);
    });
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(nodeRef);
      diagnostics.push({
        severity: LSPDiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + nodeRef.length },
        },
        message: `Node '${nodeRef}' is unreachable from initial node '${parsed.initialNodeRef}'`,
        source: 'wflow',
      });
    }
  }

  // Cycle detection
  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    const firstNode = cycle[0];
    const lineIndex = lines.findIndex((line) => {
      const regex = new RegExp(`^\\s{2}${escapeRegex(firstNode)}\\s*:`);
      return regex.test(line);
    });
    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const charIndex = line.indexOf(firstNode);
      const cycleStr = cycle.join(' → ');
      diagnostics.push({
        severity: LSPDiagnosticSeverity.Error,
        range: {
          start: { line: lineIndex, character: charIndex },
          end: { line: lineIndex, character: charIndex + firstNode.length },
        },
        message: `Cycle detected: ${cycleStr}`,
        source: 'wflow',
      });
    }
  }

  // Data flow validation
  for (const [nodeRef, node] of Object.entries(parsed.nodes || {})) {
    if (!node?.inputMapping) continue;

    const available = dataFlow.availableWrites.get(nodeRef) || new Set();

    for (const [_taskInputKey, jsonPath] of Object.entries(node.inputMapping)) {
      if (typeof jsonPath !== 'string') continue;

      const pathMatch = jsonPath.match(/^\$\.state\.(.+)$/);
      if (!pathMatch) continue;

      const statePath = `state.${pathMatch[1]}`;

      if (!available.has(statePath)) {
        const lineIndex = findMappingLine(lines, jsonPath);
        if (lineIndex !== -1) {
          const line = lines[lineIndex];
          const charIndex = line.indexOf(jsonPath);

          const writers = dataFlow.writers.get(statePath) || [];
          let message: string;
          let severity: LSPDiagnosticSeverity;

          if (writers.length === 0) {
            message = `State path '${statePath}' is read but never written by any node.`;
            severity = LSPDiagnosticSeverity.Error;
          } else {
            const writerNames = writers.map((w) => w.nodeRef).join(', ');
            const conditionalWriters = writers.filter((w) => w.conditional);

            if (conditionalWriters.length > 0) {
              message = `State path '${statePath}' is written by '${writerNames}' via conditional transition - may not be available at runtime.`;
              severity = LSPDiagnosticSeverity.Warning;
            } else {
              message = `State path '${statePath}' is written by '${writerNames}' but not reachable from node '${nodeRef}'.`;
              severity = LSPDiagnosticSeverity.Error;
            }
          }

          diagnostics.push({
            severity,
            range: {
              start: { line: lineIndex, character: charIndex },
              end: { line: lineIndex, character: charIndex + jsonPath.length },
            },
            message,
            source: 'wflow',
          });
        }
      }
    }
  }

  validateUnusedImports(imports, usedImports, lines, diagnostics);
}

// =============================================================================
// Main export
// =============================================================================

/**
 * Validate a document and return diagnostics
 */
export function validateDocument(
  document: TextDocument,
  documentManager: DocumentManager,
): LSPDiagnostic[] {
  const uri = document.uri;
  const text = document.getText();
  const diagnostics: LSPDiagnostic[] = [];
  const lines = text.split('\n');

  // Parse and cache
  const result = documentManager.parseAndCache(document);

  if (result.error) {
    diagnostics.push({
      severity: LSPDiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: `YAML parse error: ${result.error.message}`,
      source: 'wflow',
    });
    return diagnostics;
  }

  if (!result.document) {
    return diagnostics;
  }

  // Validate imports
  validateImports(result.imports, lines, diagnostics);

  // Route to appropriate validator
  switch (result.fileType) {
    case 'task':
      validateTaskDocument(result.document as TaskDocument, lines, diagnostics, result.imports);
      break;
    case 'action':
      validateActionDocument(result.document as ActionDocument, lines, diagnostics, result.imports);
      break;
    case 'wflow':
      validateWorkflowDocument(result.document as WflowDocument, lines, diagnostics, result.imports);
      break;
  }

  return diagnostics;
}
