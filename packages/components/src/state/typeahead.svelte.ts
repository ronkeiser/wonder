/**
 * Typeahead search for lists and menus.
 *
 * Allows users to type characters to jump to matching items
 * in a list without opening a dropdown.
 */

export interface TypeaheadOptions {
	/** Function returning the text content of each item */
	getItems: () => string[];
	/** Callback when a match is found */
	onMatch: (index: number) => void;
	/** Time in ms before the search buffer resets. Default: 750 */
	resetMs?: number;
	/** Keys to ignore (in addition to modifiers). Default: [] */
	ignoreKeys?: string[];
}

export interface TypeaheadState {
	/** Handle keydown events for typeahead search */
	handleKeydown: (event: KeyboardEvent) => void;
	/** Reset the search buffer */
	reset: () => void;
	/** Current search buffer (for debugging/display) */
	readonly buffer: string;
}

/**
 * Create a typeahead search handler.
 *
 * Features:
 * - Accumulates typed characters into a search buffer
 * - Resets buffer after timeout
 * - Rapid succession of same letter cycles through matches
 * - Ignores modifier keys and non-printable characters
 *
 * @example
 * ```svelte
 * <script>
 *   import { createTypeahead } from './typeahead';
 *   import { createRovingFocus } from './keyboard';
 *
 *   const items = ['Apple', 'Banana', 'Cherry', 'Date'];
 *   let elements: HTMLElement[] = [];
 *
 *   const rovingFocus = createRovingFocus(() => elements);
 *   const typeahead = createTypeahead({
 *     getItems: () => items,
 *     onMatch: (index) => rovingFocus.setActiveIndex(index),
 *   });
 *
 *   function handleKeydown(event: KeyboardEvent) {
 *     typeahead.handleKeydown(event);
 *     rovingFocus.handleKeydown(event);
 *   }
 * </script>
 * ```
 */
export function createTypeahead(options: TypeaheadOptions): TypeaheadState {
	const { getItems, onMatch, resetMs = 750, ignoreKeys = [] } = options;

	let buffer = $state('');
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let prevMatchIndex = -1;

	function reset(): void {
		buffer = '';
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		// Ignore modifier keys
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		// Ignore non-printable keys
		if (event.key.length !== 1) return;

		// Ignore specified keys
		if (ignoreKeys.includes(event.key)) return;

		// Space is only meaningful if we're mid-search
		if (event.key === ' ' && buffer === '') return;

		// Reset timeout
		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => {
			buffer = '';
			prevMatchIndex = -1;
		}, resetMs);

		const items = getItems();
		const key = event.key.toLowerCase();

		// Rapid succession of same letter cycles through matches
		// This is standard behavior: typing "aaa" cycles through all items starting with "a"
		const shouldCycle = buffer.length === 0 || (buffer.length === 1 && buffer === key);

		buffer += key;

		if (shouldCycle && buffer.length === 1) {
			// Find next match after previous match index
			const searchStart = prevMatchIndex + 1;

			for (let i = 0; i < items.length; i++) {
				const index = (searchStart + i) % items.length;
				const item = items[index];

				if (item?.toLowerCase().startsWith(key)) {
					prevMatchIndex = index;
					onMatch(index);
					return;
				}
			}
		} else {
			// Normal prefix search from beginning
			const matchIndex = items.findIndex((item) => item?.toLowerCase().startsWith(buffer));

			if (matchIndex !== -1) {
				prevMatchIndex = matchIndex;
				onMatch(matchIndex);
			}
		}
	}

	return {
		handleKeydown,
		reset,
		get buffer() {
			return buffer;
		},
	};
}
