/**
 * Escape keydown action.
 *
 * Configurable escape key handling with support for nested
 * floating elements using the defer pattern.
 */

import type { ActionReturn } from 'svelte/action';
import { isWebKit } from '../dom/browser.js';

/**
 * Escape behavior options for nested floating elements.
 *
 * - 'close': Always close on Escape (stops propagation)
 * - 'ignore': Never close on Escape
 * - 'defer-otherwise-close': Let event propagate, close if not prevented by inner element
 * - 'defer-otherwise-ignore': Let event propagate, do nothing if not prevented
 */
export type EscapeBehavior = 'close' | 'ignore' | 'defer-otherwise-close' | 'defer-otherwise-ignore';

export interface EscapeKeydownOptions {
	/** Whether the action is enabled. Default: true */
	enabled?: boolean;
	/** Handler called when Escape should trigger close */
	handler: () => void;
	/** Escape behavior for nested elements. Default: 'close' */
	behavior?: EscapeBehavior;
}

/**
 * Svelte action for handling Escape key presses.
 *
 * Features:
 * - Configurable behavior for nested floating elements
 * - IME composition awareness (ignores Escape during composition)
 * - WebKit-specific composition end delay
 *
 * The defer pattern allows inner floating elements to handle
 * Escape before outer ones, enabling proper nested menu/dialog behavior.
 *
 * @example
 * ```svelte
 * <script>
 *   import { escapeKeydown } from './actions/escapeKeydown';
 *
 *   let open = $state(true);
 * </script>
 *
 * {#if open}
 *   <div use:escapeKeydown={{ handler: () => open = false }}>
 *     Dialog content
 *   </div>
 * {/if}
 * ```
 *
 * @example
 * ```svelte
 * <!-- Nested floating elements with defer pattern -->
 * <div use:escapeKeydown={{ handler: closeOuter, behavior: 'defer-otherwise-close' }}>
 *   Outer dialog
 *   <div use:escapeKeydown={{ handler: closeInner, behavior: 'close' }}>
 *     Inner dropdown (handles Escape first)
 *   </div>
 * </div>
 * ```
 */
export function escapeKeydown(
	node: HTMLElement,
	options: EscapeKeydownOptions
): ActionReturn<EscapeKeydownOptions> {
	let { enabled = true, handler, behavior = 'close' } = options;

	let isComposing = false;
	let compositionTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleCompositionStart() {
		isComposing = true;
	}

	function handleCompositionEnd() {
		// WebKit needs a small delay after compositionend
		if (compositionTimeout) {
			clearTimeout(compositionTimeout);
		}
		compositionTimeout = setTimeout(
			() => {
				isComposing = false;
			},
			isWebKit() ? 5 : 0
		);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!enabled) return;
		if (event.key !== 'Escape') return;
		if (isComposing) return;

		switch (behavior) {
			case 'close':
				// Immediately close and stop propagation
				event.preventDefault();
				event.stopPropagation();
				handler();
				break;

			case 'ignore':
				// Do nothing
				break;

			case 'defer-otherwise-close':
			case 'defer-otherwise-ignore':
				// Let event propagate first, then check if handled
				// Use requestAnimationFrame to check after all handlers have run
				requestAnimationFrame(() => {
					if (event.defaultPrevented) {
						// An inner element handled it
						return;
					}
					if (behavior === 'defer-otherwise-close') {
						handler();
					}
					// defer-otherwise-ignore does nothing
				});
				break;
		}
	}

	node.addEventListener('compositionstart', handleCompositionStart);
	node.addEventListener('compositionend', handleCompositionEnd);
	node.addEventListener('keydown', handleKeydown);

	return {
		update(newOptions: EscapeKeydownOptions) {
			enabled = newOptions.enabled ?? true;
			handler = newOptions.handler;
			behavior = newOptions.behavior ?? 'close';
		},

		destroy() {
			if (compositionTimeout) {
				clearTimeout(compositionTimeout);
			}
			node.removeEventListener('compositionstart', handleCompositionStart);
			node.removeEventListener('compositionend', handleCompositionEnd);
			node.removeEventListener('keydown', handleKeydown);
		},
	};
}
