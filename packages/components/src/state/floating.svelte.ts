/**
 * Floating UI wrapper with reactive updates.
 *
 * Provides positioning for popovers, dropdowns, tooltips, etc.
 * Wraps @floating-ui/dom with Svelte 5 reactivity.
 */

import {
	computePosition,
	autoUpdate,
	flip,
	offset,
	shift,
	arrow,
	size,
	type Placement,
	type Middleware,
	type MiddlewareData,
} from '@floating-ui/dom';

export type { Placement };

export interface FloatingOptions {
	/** Placement relative to reference element */
	placement?: Placement;
	/** Distance from reference element in pixels */
	offset?: number;
	/** Flip to opposite side if insufficient space */
	flip?: boolean;
	/** Shift along axis to stay in view */
	shift?: boolean | { padding?: number };
	/** Arrow element configuration */
	arrow?: { element: HTMLElement; padding?: number };
	/** Constrain size to available space */
	size?: {
		apply: (args: { availableWidth: number; availableHeight: number }) => void;
	};
}

export interface FloatingState {
	/** X position in pixels */
	x: number;
	/** Y position in pixels */
	y: number;
	/** Final computed placement (may differ from requested if flipped) */
	placement: Placement;
	/** Arrow X offset if arrow middleware used */
	arrowX: number | undefined;
	/** Arrow Y offset if arrow middleware used */
	arrowY: number | undefined;
	/** Raw middleware data for advanced use cases */
	middlewareData: MiddlewareData;
}

export interface FloatingInstance {
	/** Current positioning state */
	readonly state: FloatingState;
	/** Manually trigger a position update */
	update: () => Promise<void>;
	/** Clean up listeners and stop auto-updates */
	destroy: () => void;
}

/**
 * Create a floating positioning instance.
 *
 * Automatically updates position on scroll, resize, and DOM changes.
 * Returns reactive state that can be used in Svelte components.
 *
 * @example
 * ```svelte
 * <script>
 *   let reference: HTMLElement;
 *   let floating: HTMLElement;
 *   let instance: FloatingInstance | null = null;
 *
 *   $effect(() => {
 *     if (reference && floating) {
 *       instance = createFloating(reference, floating, { placement: 'bottom', offset: 8 });
 *       return () => instance?.destroy();
 *     }
 *   });
 * </script>
 *
 * <button bind:this={reference}>Trigger</button>
 * <div
 *   bind:this={floating}
 *   style="position: absolute; left: {instance?.state.x ?? 0}px; top: {instance?.state.y ?? 0}px;"
 * >
 *   Content
 * </div>
 * ```
 */
export function createFloating(
	reference: HTMLElement,
	floating: HTMLElement,
	options: FloatingOptions = {}
): FloatingInstance {
	let state = $state<FloatingState>({
		x: 0,
		y: 0,
		placement: options.placement ?? 'bottom',
		arrowX: undefined,
		arrowY: undefined,
		middlewareData: {},
	});

	const middleware: Middleware[] = [];

	// Order matters: offset, flip, shift, arrow, size
	if (options.offset !== undefined) {
		middleware.push(offset(options.offset));
	}

	if (options.flip !== false) {
		middleware.push(flip());
	}

	if (options.shift) {
		middleware.push(shift(typeof options.shift === 'object' ? options.shift : {}));
	}

	if (options.arrow) {
		middleware.push(arrow({ element: options.arrow.element, padding: options.arrow.padding }));
	}

	if (options.size) {
		middleware.push(
			size({
				apply: options.size.apply,
			})
		);
	}

	async function update() {
		const result = await computePosition(reference, floating, {
			placement: options.placement,
			middleware,
		});

		state = {
			x: result.x,
			y: result.y,
			placement: result.placement,
			arrowX: result.middlewareData.arrow?.x,
			arrowY: result.middlewareData.arrow?.y,
			middlewareData: result.middlewareData,
		};
	}

	const cleanup = autoUpdate(reference, floating, update);

	return {
		get state() {
			return state;
		},
		update,
		destroy: cleanup,
	};
}

/**
 * Apply floating position as inline styles.
 * Utility for common use case of absolutely positioned floating elements.
 */
export function applyFloatingStyles(
	element: HTMLElement,
	state: FloatingState,
	strategy: 'absolute' | 'fixed' = 'absolute'
): void {
	Object.assign(element.style, {
		position: strategy,
		left: `${state.x}px`,
		top: `${state.y}px`,
	});
}

/**
 * Apply arrow position as inline styles.
 * Call after applyFloatingStyles with the arrow element.
 */
export function applyArrowStyles(
	arrowElement: HTMLElement,
	state: FloatingState,
	arrowSize = 8
): void {
	const { arrowX, arrowY, placement } = state;

	const staticSide = {
		top: 'bottom',
		right: 'left',
		bottom: 'top',
		left: 'right',
	}[placement.split('-')[0]] as string;

	Object.assign(arrowElement.style, {
		position: 'absolute',
		left: arrowX != null ? `${arrowX}px` : '',
		top: arrowY != null ? `${arrowY}px` : '',
		[staticSide]: `${-arrowSize / 2}px`,
	});
}
