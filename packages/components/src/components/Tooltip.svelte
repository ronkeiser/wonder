<script lang="ts">
	import type { Snippet } from 'svelte';
	import { generateId } from '../dom/id.js';
	import { portal } from '../actions/portal.js';
	import { createFloating, type Placement } from '../state/floating.svelte.js';

	type TooltipState = 'open' | 'closed';

	interface TriggerProps {
		'aria-describedby': string | undefined;
		onmouseenter: () => void;
		onmouseleave: () => void;
		onfocus: () => void;
		onblur: () => void;
		'data-state': TooltipState;
	}

	interface ContentProps {
		id: string;
		role: 'tooltip';
		'data-state': TooltipState;
	}

	let {
		open = $bindable(false),
		placement = 'top' as Placement,
		offset = 8,
		delay = 200,
		closeDelay = 0,
		class: className,
		trigger,
		content,
	}: {
		open?: boolean;
		placement?: Placement;
		offset?: number;
		delay?: number;
		closeDelay?: number;
		class?: string;
		trigger: Snippet<[TriggerProps]>;
		content: Snippet;
	} = $props();

	const contentId = generateId('tooltip');

	// Track mounted state separately to allow exit animations
	let mounted = $state(false);
	let visible = $state(false);

	// Timer refs for delayed show/hide
	let showTimer: ReturnType<typeof setTimeout> | null = null;
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	// Track trigger element for floating positioning
	let triggerEl: HTMLElement | null = $state(null);
	let contentEl: HTMLElement | null = $state(null);

	// Floating positioning instance
	let floatingInstance: ReturnType<typeof createFloating> | null = null;

	// Derived state for data attributes
	const dataState = $derived<TooltipState>(visible ? 'open' : 'closed');

	// Sync mounted/visible state with open prop
	$effect(() => {
		if (open) {
			mounted = true;
			requestAnimationFrame(() => {
				visible = true;
			});
		} else {
			visible = false;
		}
	});

	// Set up floating positioning when content mounts
	$effect(() => {
		if (triggerEl && contentEl && mounted) {
			floatingInstance = createFloating(triggerEl, contentEl, {
				placement,
				offset,
				flip: true,
				shift: { padding: 8 },
			});
			return () => {
				floatingInstance?.destroy();
				floatingInstance = null;
			};
		}
	});

	// Handle animation/transition end to unmount after closing
	function handleTransitionEnd() {
		if (!visible) {
			mounted = false;
		}
	}

	function clearTimers() {
		if (showTimer) {
			clearTimeout(showTimer);
			showTimer = null;
		}
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	function show() {
		clearTimers();
		if (delay > 0) {
			showTimer = setTimeout(() => {
				open = true;
			}, delay);
		} else {
			open = true;
		}
	}

	function hide() {
		clearTimers();
		if (closeDelay > 0) {
			hideTimer = setTimeout(() => {
				open = false;
			}, closeDelay);
		} else {
			open = false;
		}
	}

	function handleMouseEnter() {
		show();
	}

	function handleMouseLeave() {
		hide();
	}

	function handleFocus() {
		show();
	}

	function handleBlur() {
		hide();
	}

	function getTriggerProps(): TriggerProps {
		return {
			'aria-describedby': open ? contentId : undefined,
			onmouseenter: handleMouseEnter,
			onmouseleave: handleMouseLeave,
			onfocus: handleFocus,
			onblur: handleBlur,
			'data-state': dataState,
		};
	}

	function getContentProps(): ContentProps {
		return {
			id: contentId,
			role: 'tooltip',
			'data-state': dataState,
		};
	}

	// Apply floating styles directly to the content element
	$effect(() => {
		if (contentEl && floatingInstance) {
			const { x, y } = floatingInstance.state;
			contentEl.style.position = 'absolute';
			contentEl.style.left = `${x}px`;
			contentEl.style.top = `${y}px`;
		}
	});
</script>

<div bind:this={triggerEl} style="display: inline-block;">
	{@render trigger(getTriggerProps())}
</div>

{#if mounted}
	<div use:portal>
		<div
			bind:this={contentEl}
			ontransitionend={handleTransitionEnd}
			onanimationend={handleTransitionEnd}
			class={className}
			{...getContentProps()}
		>
			{@render content()}
		</div>
	</div>
{/if}
