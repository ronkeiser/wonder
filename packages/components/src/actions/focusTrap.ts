/**
 * Focus trap action.
 *
 * Traps focus within an element for modal dialogs,
 * preventing tab navigation from escaping.
 */

import type { ActionReturn } from 'svelte/action';
import {
	getTabbableElements,
	saveFocus,
	restoreFocus,
	resolveFocusTarget,
	enqueueFocus,
	type FocusTarget,
} from '../dom/focus.js';

export interface FocusTrapOptions {
	/** Whether the trap is enabled. Default: true */
	enabled?: boolean;
	/** Element to focus when trap activates. Default: first tabbable element */
	initialFocus?: FocusTarget;
	/** Whether to restore focus when trap deactivates. Default: true */
	returnFocus?: boolean;
	/** Whether to mark other elements as inert. Default: false */
	modal?: boolean;
}

/**
 * Create focus guard elements.
 * These are invisible tabbable elements at the start and end
 * of the trapped region that redirect focus back in.
 */
function createFocusGuard(): HTMLSpanElement {
	const guard = document.createElement('span');
	guard.tabIndex = 0;
	guard.setAttribute('aria-hidden', 'true');
	guard.setAttribute('data-focus-guard', '');
	guard.style.cssText = `
		position: fixed;
		top: 1px;
		left: 1px;
		width: 1px;
		height: 0;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	`.replace(/\s+/g, ' ');
	return guard;
}

/**
 * Mark sibling elements as inert for modal behavior.
 * Returns a cleanup function.
 */
function markOthersInert(trapElement: HTMLElement): () => void {
	const elementsToRestore: Element[] = [];

	// Walk through siblings and their children, marking them inert
	let sibling = document.body.firstElementChild;
	while (sibling) {
		if (sibling !== trapElement && !trapElement.contains(sibling)) {
			// Don't mark scripts, styles, or already inert elements
			if (
				sibling.tagName !== 'SCRIPT' &&
				sibling.tagName !== 'STYLE' &&
				!sibling.hasAttribute('inert')
			) {
				sibling.setAttribute('inert', '');
				sibling.setAttribute('aria-hidden', 'true');
				elementsToRestore.push(sibling);
			}
		}
		sibling = sibling.nextElementSibling;
	}

	return () => {
		elementsToRestore.forEach((el) => {
			el.removeAttribute('inert');
			el.removeAttribute('aria-hidden');
		});
	};
}

/**
 * Svelte action for trapping focus within an element.
 *
 * Features:
 * - Tab key interception to wrap focus
 * - Focus guards at boundaries
 * - Configurable initial focus
 * - Focus restoration on deactivate
 * - Optional modal behavior (marks others as inert)
 *
 * @example
 * ```svelte
 * <script>
 *   import { focusTrap } from './actions/focusTrap';
 *
 *   let open = $state(false);
 * </script>
 *
 * {#if open}
 *   <div use:focusTrap={{ returnFocus: true, modal: true }}>
 *     <button>First</button>
 *     <button>Second</button>
 *     <button onclick={() => open = false}>Close</button>
 *   </div>
 * {/if}
 * ```
 */
export function focusTrap(
	node: HTMLElement,
	options: FocusTrapOptions = {}
): ActionReturn<FocusTrapOptions> {
	let { enabled = true, initialFocus, returnFocus = true, modal = false } = options;

	let startGuard: HTMLSpanElement | null = null;
	let endGuard: HTMLSpanElement | null = null;
	let cleanupInert: (() => void) | null = null;

	function activate() {
		if (!enabled) return;

		// Save current focus for restoration
		if (returnFocus) {
			saveFocus();
		}

		// Create focus guards
		startGuard = createFocusGuard();
		endGuard = createFocusGuard();

		node.insertBefore(startGuard, node.firstChild);
		node.appendChild(endGuard);

		// Handle focus on guards — redirect focus back into the trap
		startGuard.addEventListener('focus', () => {
			const tabbables = getTabbableElements(node);
			const lastTabbable = tabbables[tabbables.length - 1];
			lastTabbable?.focus();
		});

		endGuard.addEventListener('focus', () => {
			const tabbables = getTabbableElements(node);
			const firstTabbable = tabbables[0];
			firstTabbable?.focus();
		});

		// Mark other elements as inert for modal behavior
		if (modal) {
			cleanupInert = markOthersInert(node);
		}

		// Set initial focus
		const focusTarget = initialFocus ? resolveFocusTarget(initialFocus, node) : null;
		if (focusTarget) {
			enqueueFocus(focusTarget);
		} else {
			// Focus first tabbable element
			const tabbables = getTabbableElements(node);
			if (tabbables.length > 0) {
				enqueueFocus(tabbables[0]);
			} else {
				// No tabbable elements, focus the container itself
				node.tabIndex = -1;
				enqueueFocus(node);
			}
		}
	}

	function deactivate() {
		// Remove focus guards
		startGuard?.remove();
		endGuard?.remove();
		startGuard = null;
		endGuard = null;

		// Restore inert state
		if (cleanupInert) {
			cleanupInert();
			cleanupInert = null;
		}

		// Restore focus
		if (returnFocus) {
			restoreFocus();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!enabled) return;
		if (event.key !== 'Tab') return;

		const tabbables = getTabbableElements(node);
		if (tabbables.length === 0) {
			event.preventDefault();
			return;
		}

		const firstTabbable = tabbables[0];
		const lastTabbable = tabbables[tabbables.length - 1];
		const activeElement = document.activeElement;

		// Wrap focus at boundaries
		if (event.shiftKey && activeElement === firstTabbable) {
			event.preventDefault();
			lastTabbable.focus();
		} else if (!event.shiftKey && activeElement === lastTabbable) {
			event.preventDefault();
			firstTabbable.focus();
		}
	}

	// Activate on mount
	activate();
	node.addEventListener('keydown', handleKeydown);

	return {
		update(newOptions: FocusTrapOptions) {
			const wasEnabled = enabled;
			enabled = newOptions.enabled ?? true;
			initialFocus = newOptions.initialFocus;
			returnFocus = newOptions.returnFocus ?? true;
			modal = newOptions.modal ?? false;

			// Handle enable/disable transitions
			if (wasEnabled && !enabled) {
				deactivate();
			} else if (!wasEnabled && enabled) {
				activate();
			}
		},

		destroy() {
			deactivate();
			node.removeEventListener('keydown', handleKeydown);
		},
	};
}
