/**
 * Keyboard navigation utilities.
 *
 * Provides roving tabindex management and direction-aware
 * arrow key navigation for lists and menus.
 */

export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface RovingFocusOptions {
	/** Navigation direction. Default: 'vertical' */
	orientation?: Orientation;
	/** Wrap around at ends. Default: true */
	loop?: boolean;
	/** Right-to-left layout. Default: false */
	rtl?: boolean;
}

export interface RovingFocusState {
	/** Currently active index */
	activeIndex: number;
	/** Set the active index and optionally focus the element */
	setActiveIndex: (index: number, focus?: boolean) => void;
	/** Handle keydown events for navigation */
	handleKeydown: (event: KeyboardEvent) => void;
	/** Update tabindex attributes on all items */
	updateTabIndices: () => void;
}

/**
 * Create a roving focus manager for keyboard navigation in lists/menus.
 *
 * Roving tabindex pattern:
 * - Only one element has tabindex="0" at a time
 * - All others have tabindex="-1"
 * - Arrow keys move focus and update tabindex
 *
 * @example
 * ```svelte
 * <script>
 *   import { createRovingFocus } from './keyboard';
 *
 *   let items: HTMLElement[] = [];
 *   const rovingFocus = createRovingFocus(() => items);
 *
 *   $effect(() => {
 *     rovingFocus.updateTabIndices();
 *   });
 * </script>
 *
 * <ul onkeydown={rovingFocus.handleKeydown}>
 *   {#each menuItems as item, i}
 *     <li bind:this={items[i]} tabindex={i === 0 ? 0 : -1}>
 *       {item.label}
 *     </li>
 *   {/each}
 * </ul>
 * ```
 */
export function createRovingFocus(
	getItems: () => HTMLElement[],
	options: RovingFocusOptions = {}
): RovingFocusState {
	const { orientation = 'vertical', loop = true, rtl = false } = options;

	let activeIndex = $state(0);

	function isDisabled(element: HTMLElement): boolean {
		return (
			element.hasAttribute('disabled') ||
			element.getAttribute('aria-disabled') === 'true' ||
			element.hasAttribute('data-disabled')
		);
	}

	function findNextIndex(current: number, direction: 1 | -1): number {
		const items = getItems();
		if (items.length === 0) return -1;

		let next = current + direction;
		const maxIterations = items.length;
		let iterations = 0;

		while (iterations < maxIterations) {
			if (loop) {
				if (next < 0) next = items.length - 1;
				if (next >= items.length) next = 0;
			} else {
				next = Math.max(0, Math.min(next, items.length - 1));
			}

			if (!isDisabled(items[next])) {
				return next;
			}

			next += direction;
			iterations++;
		}

		// All items disabled, return current
		return current;
	}

	function setActiveIndex(index: number, focus = true): void {
		const items = getItems();
		if (index < 0 || index >= items.length) return;

		activeIndex = index;
		updateTabIndices();

		if (focus) {
			items[index]?.focus();
		}
	}

	function updateTabIndices(): void {
		const items = getItems();
		items.forEach((item, i) => {
			item.tabIndex = i === activeIndex ? 0 : -1;
		});
	}

	function handleKeydown(event: KeyboardEvent): void {
		const items = getItems();
		if (items.length === 0) return;

		// Ignore if target is an input-like element (for combobox scenarios)
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			// Allow navigation keys to work in combobox input
			if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
				return;
			}
		}

		const isVertical = orientation === 'vertical' || orientation === 'both';
		const isHorizontal = orientation === 'horizontal' || orientation === 'both';

		let direction: 1 | -1 | null = null;
		let handled = false;

		switch (event.key) {
			case 'ArrowDown':
				if (isVertical) {
					direction = 1;
					handled = true;
				}
				break;

			case 'ArrowUp':
				if (isVertical) {
					direction = -1;
					handled = true;
				}
				break;

			case 'ArrowRight':
				if (isHorizontal) {
					direction = rtl ? -1 : 1;
					handled = true;
				}
				break;

			case 'ArrowLeft':
				if (isHorizontal) {
					direction = rtl ? 1 : -1;
					handled = true;
				}
				break;

			case 'Home':
				event.preventDefault();
				setActiveIndex(findNextIndex(-1, 1));
				return;

			case 'End':
				event.preventDefault();
				setActiveIndex(findNextIndex(items.length, -1));
				return;
		}

		if (direction !== null && handled) {
			event.preventDefault();
			const nextIndex = findNextIndex(activeIndex, direction);
			setActiveIndex(nextIndex);
		}
	}

	return {
		get activeIndex() {
			return activeIndex;
		},
		set activeIndex(value: number) {
			activeIndex = value;
		},
		setActiveIndex,
		handleKeydown,
		updateTabIndices,
	};
}

/**
 * Check if a keydown event is an IME composition event.
 * These should be ignored for keyboard navigation.
 */
export function isCompositionEvent(event: KeyboardEvent): boolean {
	// which === 229 indicates IME composition
	return event.which === 229 || event.isComposing;
}

/**
 * Get the navigation direction for a key based on orientation and RTL.
 * Returns null if the key is not a navigation key for the given orientation.
 */
export function getNavigationDirection(
	key: string,
	orientation: Orientation,
	rtl = false
): 1 | -1 | null {
	const isVertical = orientation === 'vertical' || orientation === 'both';
	const isHorizontal = orientation === 'horizontal' || orientation === 'both';

	switch (key) {
		case 'ArrowDown':
			return isVertical ? 1 : null;
		case 'ArrowUp':
			return isVertical ? -1 : null;
		case 'ArrowRight':
			return isHorizontal ? (rtl ? -1 : 1) : null;
		case 'ArrowLeft':
			return isHorizontal ? (rtl ? 1 : -1) : null;
		default:
			return null;
	}
}
