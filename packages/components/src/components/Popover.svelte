<script lang="ts">
	import type { Snippet } from 'svelte';
	import { generateId } from '../dom/id.js';
	import { portal } from '../actions/portal.js';
	import { clickOutside } from '../actions/clickOutside.js';
	import { escapeKeydown } from '../actions/escapeKeydown.js';
	import { createFloating, type Placement } from '../state/floating.svelte.js';

	type PopoverState = 'open' | 'closed';

	interface TriggerProps {
		'aria-haspopup': 'dialog';
		'aria-expanded': boolean;
		'aria-controls': string | undefined;
		onclick: () => void;
		'data-state': PopoverState;
	}

	interface ContentProps {
		id: string;
		role: 'dialog';
		'data-state': PopoverState;
	}

	let {
		open = $bindable(false),
		placement = 'bottom' as Placement,
		offset = 8,
		class: className,
		trigger,
		content,
	}: {
		open?: boolean;
		placement?: Placement;
		offset?: number;
		class?: string;
		trigger: Snippet<[TriggerProps]>;
		content: Snippet<[ContentProps]>;
	} = $props();

	const contentId = generateId('popover');

	// Track mounted state separately to allow exit animations
	let mounted = $state(false);
	let visible = $state(false);

	// Track trigger element for floating positioning
	let triggerEl: HTMLElement | null = $state(null);
	let contentEl: HTMLElement | null = $state(null);

	// Floating positioning instance
	let floatingInstance: ReturnType<typeof createFloating> | null = null;

	// Derived state for data attributes
	const dataState = $derived<PopoverState>(visible ? 'open' : 'closed');

	// Sync mounted/visible state with open prop
	$effect(() => {
		if (open) {
			mounted = true;
			requestAnimationFrame(() => {
				// Only set visible if still open (prevents stale RAF callbacks)
				if (open) {
					visible = true;
				}
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
				shift: { padding: offset },
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

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function getTriggerProps(): TriggerProps {
		return {
			'aria-haspopup': 'dialog',
			'aria-expanded': open,
			'aria-controls': open ? contentId : undefined,
			onclick: toggle,
			'data-state': dataState,
		};
	}

	function getContentProps(): ContentProps {
		return {
			id: contentId,
			role: 'dialog',
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

	// Disable pointer events during exit animation to prevent interference
	$effect(() => {
		if (contentEl) {
			contentEl.style.pointerEvents = open ? 'auto' : 'none';
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
			use:clickOutside={{ handler: close, reference: triggerEl }}
			use:escapeKeydown={{ handler: close }}
			ontransitionend={handleTransitionEnd}
			onanimationend={handleTransitionEnd}
			class={className}
			{...getContentProps()}
		>
			{@render content(getContentProps())}
		</div>
	</div>
{/if}
