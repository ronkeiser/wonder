/**
 * Portal action.
 *
 * Moves an element to a different location in the DOM,
 * typically to the body for floating elements.
 */

import type { ActionReturn } from 'svelte/action';

export type PortalTarget = HTMLElement | string;

export interface PortalOptions {
	/** Target container. Can be an element or a CSS selector. Default: 'body' */
	target?: PortalTarget;
	/** Whether the portal is enabled. Default: true */
	enabled?: boolean;
}

/**
 * Resolve a portal target to an element.
 */
function resolveTarget(target: PortalTarget): HTMLElement | null {
	if (typeof target === 'string') {
		return document.querySelector(target);
	}
	return target;
}

/**
 * Svelte action for portaling an element to a different DOM location.
 *
 * Useful for floating elements (dropdowns, dialogs, tooltips) that need
 * to escape overflow:hidden containers or z-index stacking contexts.
 *
 * @example
 * ```svelte
 * <script>
 *   import { portal } from './actions/portal';
 * </script>
 *
 * <!-- This div will be moved to document.body -->
 * <div use:portal>
 *   Dropdown content
 * </div>
 *
 * <!-- Portal to a specific container -->
 * <div use:portal={{ target: '#modal-root' }}>
 *   Modal content
 * </div>
 * ```
 */
export function portal(
	node: HTMLElement,
	options: PortalOptions = {}
): ActionReturn<PortalOptions> {
	let { target = 'body', enabled = true } = options;

	// Store original parent for potential restoration
	const originalParent = node.parentElement;
	const originalNextSibling = node.nextSibling;

	function moveToPortal() {
		if (!enabled) return;

		const container = resolveTarget(target);
		if (!container) {
			console.warn(`Portal target not found: ${target}`);
			return;
		}

		// Move node to target
		container.appendChild(node);
	}

	function restoreOriginalPosition() {
		if (!originalParent) return;

		if (originalNextSibling) {
			originalParent.insertBefore(node, originalNextSibling);
		} else {
			originalParent.appendChild(node);
		}
	}

	// Initial move
	moveToPortal();

	return {
		update(newOptions: PortalOptions) {
			const wasEnabled = enabled;
			const oldTarget = target;

			target = newOptions.target ?? 'body';
			enabled = newOptions.enabled ?? true;

			// Handle enable/disable
			if (wasEnabled && !enabled) {
				restoreOriginalPosition();
			} else if (!wasEnabled && enabled) {
				moveToPortal();
			} else if (enabled && oldTarget !== target) {
				// Target changed, move to new location
				moveToPortal();
			}
		},

		destroy() {
			// Remove from portal target
			node.remove();
		},
	};
}
