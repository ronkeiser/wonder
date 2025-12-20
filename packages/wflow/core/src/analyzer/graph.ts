import type { TransitionDecl, WflowDocument } from '../types/ast.js';

/**
 * Graph analysis result
 */
export interface GraphAnalysis {
  /** node → successors */
  adjacency: Map<string, string[]>;
  /** node → predecessors */
  predecessors: Map<string, string[]>;
}

/**
 * Build graph from workflow transitions
 */
export function buildGraph(doc: WflowDocument): GraphAnalysis {
  const adjacency = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  // Initialize all nodes
  for (const nodeRef of Object.keys(doc.nodes || {})) {
    adjacency.set(nodeRef, []);
    predecessors.set(nodeRef, []);
  }

  // Build edges from transitions
  for (const transition of Object.values(doc.transitions || {})) {
    const from = transition.fromNodeRef;
    const to = transition.toNodeRef;

    if (from && to && adjacency.has(from) && predecessors.has(to)) {
      adjacency.get(from)!.push(to);
      predecessors.get(to)!.push(from);
    }
  }

  return { adjacency, predecessors };
}

/**
 * Detect cycles using DFS - returns array of cycles found
 */
export function detectCycles(graph: GraphAnalysis): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    for (const successor of graph.adjacency.get(node) || []) {
      if (!visited.has(successor)) {
        dfs(successor);
      } else if (recursionStack.has(successor)) {
        // Found a cycle - extract the cycle from path
        const cycleStart = path.indexOf(successor);
        const cycle = path.slice(cycleStart);
        cycle.push(successor); // Complete the cycle
        cycles.push(cycle);
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  // Run DFS from each unvisited node
  for (const node of graph.adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Topological sort (Kahn's algorithm) - returns nodes in execution order
 */
export function topologicalSort(doc: WflowDocument, graph: GraphAnalysis): string[] {
  const inDegree = new Map<string, number>();
  const result: string[] = [];

  // Calculate in-degrees
  for (const nodeRef of Object.keys(doc.nodes || {})) {
    inDegree.set(nodeRef, (graph.predecessors.get(nodeRef) || []).length);
  }

  // Start with nodes that have no predecessors (in-degree 0)
  // Prefer initial_node_ref if it exists
  const queue: string[] = [];
  if (doc.initial_node_ref && inDegree.get(doc.initial_node_ref) === 0) {
    queue.push(doc.initial_node_ref);
  }
  for (const [nodeRef, degree] of inDegree) {
    if (degree === 0 && nodeRef !== doc.initial_node_ref) {
      queue.push(nodeRef);
    }
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const successor of graph.adjacency.get(node) || []) {
      const newDegree = inDegree.get(successor)! - 1;
      inDegree.set(successor, newDegree);
      if (newDegree === 0) {
        queue.push(successor);
      }
    }
  }

  return result;
}

/**
 * Find all nodes reachable from a starting node
 */
export function findReachableNodes(graph: GraphAnalysis, startNode: string): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [startNode];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);

    for (const successor of graph.adjacency.get(current) || []) {
      if (!reachable.has(successor)) {
        queue.push(successor);
      }
    }
  }

  return reachable;
}

/**
 * Find unreachable nodes from initial node
 */
export function findUnreachableNodes(doc: WflowDocument, graph: GraphAnalysis): string[] {
  if (!doc.initial_node_ref) return [];

  const nodeRefs = new Set(Object.keys(doc.nodes || {}));
  if (!nodeRefs.has(doc.initial_node_ref)) return [];

  const reachable = findReachableNodes(graph, doc.initial_node_ref);

  return [...nodeRefs].filter((nodeRef) => !reachable.has(nodeRef));
}

/**
 * Build a map from transition key to transitions for quick lookup
 */
export function buildTransitionMap(doc: WflowDocument): Map<string, TransitionDecl[]> {
  const transitionMap = new Map<string, TransitionDecl[]>();

  for (const t of Object.values(doc.transitions || {})) {
    if (t.fromNodeRef && t.toNodeRef) {
      const key = `${t.fromNodeRef}->${t.toNodeRef}`;
      if (!transitionMap.has(key)) {
        transitionMap.set(key, []);
      }
      transitionMap.get(key)!.push(t);
    }
  }

  return transitionMap;
}
