/**
 * Click outside detection action.
 *
 * Uses dual-phase event listening (capture + bubble) to reliably
 * detect clicks outside an element, handling edge cases like
 * scrollbars, shadow DOM, and drag scenarios.
 */

import type { ActionReturn } from 'svelte/action';
import { contains, getTarget } from '../dom/focus.js';

export interface ClickOutsideOptions {
	/** Whether the action is enabled. Default: true */
	enabled?: boolean;
	/** Handler called when a click outside is detected */
	handler: (event: PointerEvent) => void;
	/** Elements or selectors to ignore (treat as "inside") */
	ignore?: (Element | string)[];
	/** Reference element to also treat as "inside" (e.g., the trigger) */
	reference?: Element | null;
}

/**
 * Detect if a click was on a scrollbar.
 * Accounts for RTL layouts where scrollbar is on the left.
 */
function isScrollbarClick(event: PointerEvent): boolean {
	const target = event.target as HTMLElement;
	if (!target || target === document.documentElement || target === document.body) {
		return false;
	}

	const style = getComputedStyle(target);
	const isRTL = style.direction === 'rtl';

	const canScrollY = target.scrollHeight > target.clientHeight;
	const canScrollX = target.scrollWidth > target.clientWidth;

	if (!canScrollX && !canScrollY) {
		return false;
	}

	// Check if click was in scrollbar area
	// Vertical scrollbar is on right (LTR) or left (RTL)
	const pressedVerticalScrollbar =
		canScrollY &&
		(isRTL
			? event.offsetX <= target.offsetWidth - target.clientWidth
			: event.offsetX > target.clientWidth);

	// Horizontal scrollbar is always at bottom
	const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;

	return pressedVerticalScrollbar || pressedHorizontalScrollbar;
}

/**
 * Check if an element matches any of the ignore patterns.
 */
function shouldIgnore(element: Element, ignore: (Element | string)[]): boolean {
	for (const pattern of ignore) {
		if (typeof pattern === 'string') {
			if (element.matches(pattern) || element.closest(pattern)) {
				return true;
			}
		} else if (contains(pattern, element)) {
			return true;
		}
	}
	return false;
}

/**
 * Svelte action for detecting clicks outside an element.
 *
 * Features:
 * - Dual-phase detection (capture + bubble) for reliability
 * - Scrollbar click detection (with RTL support)
 * - Shadow DOM support
 * - Drag scenario handling
 * - Configurable ignore patterns
 *
 * @example
 * ```svelte
 * <script>
 *   import { clickOutside } from './actions/clickOutside';
 *
 *   let open = $state(true);
 * </script>
 *
 * {#if open}
 *   <div use:clickOutside={{ handler: () => open = false }}>
 *     Dropdown content
 *   </div>
 * {/if}
 * ```
 */
export function clickOutside(
	node: HTMLElement,
	options: ClickOutsideOptions
): ActionReturn<ClickOutsideOptions> {
	let { enabled = true, handler, ignore = [], reference = null } = options;

	// Track if pointer started inside (for drag scenarios)
	let startedInside = false;

	function handlePointerDown(event: PointerEvent) {
		if (!enabled) return;

		const target = getTarget(event);
		if (!target) return;

		// Record if pointer started inside the element
		startedInside = contains(node, target) || (reference ? contains(reference, target) : false);
	}

	function handlePointerUp(event: PointerEvent) {
		if (!enabled) return;
		if (startedInside) {
			startedInside = false;
			return;
		}

		const target = getTarget(event);
		if (!target) return;

		// Check if click was inside the node
		if (contains(node, target)) return;

		// Check if click was on the reference element
		if (reference && contains(reference, target)) return;

		// Check ignore patterns
		if (shouldIgnore(target, ignore)) return;

		// Check for third-party injected elements (browser extensions)
		if (target.hasAttribute('data-floating-ui-inert')) return;

		// Check for scrollbar clicks
		if (isScrollbarClick(event)) return;

		handler(event);
	}

	// Use capture phase for pointerdown to catch it early
	document.addEventListener('pointerdown', handlePointerDown, { capture: true });
	document.addEventListener('pointerup', handlePointerUp);

	return {
		update(newOptions: ClickOutsideOptions) {
			enabled = newOptions.enabled ?? true;
			handler = newOptions.handler;
			ignore = newOptions.ignore ?? [];
			reference = newOptions.reference ?? null;
		},

		destroy() {
			document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			document.removeEventListener('pointerup', handlePointerUp);
		},
	};
}
