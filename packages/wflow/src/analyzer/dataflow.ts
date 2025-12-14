import type { WflowDocument } from '../types/ast.js';
import { buildGraph, buildTransitionMap, topologicalSort, type GraphAnalysis } from './graph.js';

/**
 * Writer information for a state path
 */
export interface PathWriter {
  nodeRef: string;
  conditional: boolean;
}

/**
 * Data flow analysis result
 */
export interface DataFlowAnalysis {
  /** For each node, which state paths are guaranteed written before it executes */
  availableWrites: Map<string, Set<string>>;
  /** For each state path, which nodes write to it */
  writers: Map<string, PathWriter[]>;
}

/**
 * Analyze data flow in a workflow
 *
 * Tracks which state paths are available (written) at each node based on
 * the execution order and output_mappings of predecessor nodes.
 */
export function analyzeDataFlow(
  doc: WflowDocument,
  graph: GraphAnalysis,
  inputPaths: Set<string>,
): DataFlowAnalysis {
  const availableWrites = new Map<string, Set<string>>();
  const writers = new Map<string, PathWriter[]>();

  // Get topological order
  const order = topologicalSort(doc, graph);

  // Build transition lookup for checking conditions
  const transitionMap = buildTransitionMap(doc);

  // Process nodes in topological order
  for (const nodeRef of order) {
    // Start with input paths (always available)
    const available = new Set<string>(inputPaths);

    const preds = graph.predecessors.get(nodeRef) || [];

    for (const pred of preds) {
      const predNode = doc.nodes?.[pred];
      if (!predNode?.output_mapping) continue;

      // Check if transition from pred to this node is conditional
      const transitionKey = `${pred}->${nodeRef}`;
      const transitions = transitionMap.get(transitionKey) || [];
      const isConditional = transitions.some((t) => t.condition !== undefined);

      // Add all writes from predecessor
      for (const contextPath of Object.keys(predNode.output_mapping)) {
        if (contextPath.startsWith('state.')) {
          // Only state paths propagate (not output paths)
          if (!isConditional) {
            available.add(contextPath);
          }
          // Track writer
          if (!writers.has(contextPath)) {
            writers.set(contextPath, []);
          }
          writers.get(contextPath)!.push({ nodeRef: pred, conditional: isConditional });
        }
      }

      // Also inherit what was available at predecessor
      const predAvailable = availableWrites.get(pred);
      if (predAvailable) {
        for (const path of predAvailable) {
          if (!isConditional) {
            available.add(path);
          }
        }
      }
    }

    availableWrites.set(nodeRef, available);
  }

  return { availableWrites, writers };
}

/**
 * Check if a state path is available for reading at a specific node
 */
export function isPathAvailable(
  dataFlow: DataFlowAnalysis,
  nodeRef: string,
  path: string,
): boolean {
  const available = dataFlow.availableWrites.get(nodeRef);
  return available?.has(path) ?? false;
}

/**
 * Get information about who writes a specific path
 */
export function getPathWriters(dataFlow: DataFlowAnalysis, path: string): PathWriter[] {
  return dataFlow.writers.get(path) || [];
}

/**
 * Run full data flow analysis on a workflow document
 */
export function runDataFlowAnalysis(doc: WflowDocument, inputPaths: Set<string>): DataFlowAnalysis {
  const graph = buildGraph(doc);
  return analyzeDataFlow(doc, graph, inputPaths);
}
