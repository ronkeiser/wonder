/**
 * Floating tree context for nested floating elements.
 *
 * Tracks parent/child relationships between floating elements (e.g., nested dropdowns)
 * and coordinates dismiss behavior so inner elements can handle events before outer ones.
 */

import { getContext, setContext } from 'svelte';

const FLOATING_TREE_KEY = Symbol('floating-tree');
const FLOATING_PARENT_ID_KEY = Symbol('floating-parent-id');

export interface FloatingNode {
	id: string;
	parentId: string | null;
}

export interface FloatingTreeEvents {
	on: (event: string, handler: (data?: unknown) => void) => () => void;
	emit: (event: string, data?: unknown) => void;
}

export interface FloatingTreeContext {
	/** All registered floating nodes */
	readonly nodes: FloatingNode[];
	/** Register a floating node */
	addNode: (node: FloatingNode) => void;
	/** Unregister a floating node */
	removeNode: (id: string) => void;
	/** Event emitter for cross-node communication */
	events: FloatingTreeEvents;
	/** Get all descendant nodes of a parent */
	getChildren: (parentId: string) => FloatingNode[];
	/** Check if a node is a descendant of another */
	isDescendant: (nodeId: string, ancestorId: string) => boolean;
}

/**
 * Create an event emitter for floating tree communication.
 * Used for events like 'dismiss', 'openchange', 'virtualfocus'.
 */
function createEventEmitter(): FloatingTreeEvents {
	const listeners = new Map<string, Set<(data?: unknown) => void>>();

	return {
		on(event: string, handler: (data?: unknown) => void) {
			if (!listeners.has(event)) {
				listeners.set(event, new Set());
			}
			listeners.get(event)!.add(handler);

			return () => {
				listeners.get(event)?.delete(handler);
			};
		},

		emit(event: string, data?: unknown) {
			listeners.get(event)?.forEach((fn) => fn(data));
		},
	};
}

/**
 * Create a floating tree context.
 * Should be called once at the root of your floating element hierarchy.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createFloatingTree, setFloatingTree } from './floatingTree';
 *
 *   const tree = createFloatingTree();
 *   setFloatingTree(tree);
 * </script>
 *
 * <slot />
 * ```
 */
export function createFloatingTree(): FloatingTreeContext {
	let nodes = $state<FloatingNode[]>([]);
	const events = createEventEmitter();

	function getChildren(parentId: string): FloatingNode[] {
		const children: FloatingNode[] = [];
		const visited = new Set<string>();

		function collectChildren(id: string) {
			for (const node of nodes) {
				if (node.parentId === id && !visited.has(node.id)) {
					visited.add(node.id);
					children.push(node);
					collectChildren(node.id);
				}
			}
		}

		collectChildren(parentId);
		return children;
	}

	function isDescendant(nodeId: string, ancestorId: string): boolean {
		let current = nodes.find((n) => n.id === nodeId);

		while (current?.parentId) {
			if (current.parentId === ancestorId) return true;
			current = nodes.find((n) => n.id === current!.parentId);
		}

		return false;
	}

	return {
		get nodes() {
			return nodes;
		},

		addNode(node: FloatingNode) {
			nodes = [...nodes, node];
		},

		removeNode(id: string) {
			nodes = nodes.filter((n) => n.id !== id);
		},

		events,
		getChildren,
		isDescendant,
	};
}

/**
 * Set the floating tree context for child components.
 */
export function setFloatingTree(tree: FloatingTreeContext): void {
	setContext(FLOATING_TREE_KEY, tree);
}

/**
 * Get the floating tree context from a parent component.
 * Returns undefined if no tree context exists.
 */
export function getFloatingTree(): FloatingTreeContext | undefined {
	return getContext<FloatingTreeContext | undefined>(FLOATING_TREE_KEY);
}

/**
 * Set the parent floating node ID for child floating elements.
 * Used to establish parent-child relationships in nested floating elements.
 */
export function setFloatingParentId(id: string): void {
	setContext(FLOATING_PARENT_ID_KEY, id);
}

/**
 * Get the parent floating node ID.
 * Returns null if this is a root-level floating element.
 */
export function getFloatingParentId(): string | null {
	return getContext<string | null>(FLOATING_PARENT_ID_KEY) ?? null;
}

/**
 * Register a floating node with the tree.
 * Call this in your floating component's initialization.
 *
 * @returns Cleanup function to call on destroy
 *
 * @example
 * ```svelte
 * <script>
 *   import { registerFloatingNode, setFloatingParentId } from './floatingTree';
 *   import { generateId } from './id';
 *
 *   const id = generateId('dropdown');
 *
 *   // Register this node with the tree
 *   const unregister = registerFloatingNode(id);
 *
 *   // Make this node the parent for any nested floating elements
 *   setFloatingParentId(id);
 *
 *   onDestroy(unregister);
 * </script>
 * ```
 */
export function registerFloatingNode(id: string): () => void {
	const tree = getFloatingTree();
	const parentId = getFloatingParentId();

	if (!tree) {
		// No tree context - this is a standalone floating element
		return () => {};
	}

	tree.addNode({ id, parentId });

	return () => {
		tree.removeNode(id);
	};
}
