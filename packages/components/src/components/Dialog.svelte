<script lang="ts">
	import type { Snippet } from 'svelte';
	import { generateId } from '../dom/id.js';
	import { lockScroll, unlockScroll } from '../dom/scrollLock.js';
	import { focusTrap } from '../actions/focusTrap.js';
	import { portal } from '../actions/portal.js';
	import { escapeKeydown } from '../actions/escapeKeydown.js';

	type DialogState = 'open' | 'closed';

	interface TriggerProps {
		id: string;
		'aria-haspopup': 'dialog';
		'aria-expanded': boolean;
		'aria-controls': string;
		onclick: () => void;
		onkeydown: (event: KeyboardEvent) => void;
		'data-state': DialogState;
	}

	interface OverlayProps {
		'aria-hidden': 'true';
		onclick: () => void;
		onanimationend: () => void;
		ontransitionend: () => void;
		'data-state': DialogState;
	}

	interface ContentProps {
		id: string;
		role: 'dialog';
		'aria-modal': 'true' | undefined;
		'aria-labelledby': string | undefined;
		'aria-describedby': string | undefined;
		'data-state': DialogState;
	}

	let {
		open = $bindable(false),
		modal = true,
		closeOnOutsideClick = true,
		closeOnEscape = true,
		labelledby,
		describedby,
		trigger,
		overlay,
		content,
	}: {
		open?: boolean;
		modal?: boolean;
		closeOnOutsideClick?: boolean;
		closeOnEscape?: boolean;
		labelledby?: string;
		describedby?: string;
		trigger?: Snippet<[TriggerProps]>;
		overlay?: Snippet<[OverlayProps]>;
		content: Snippet<[ContentProps]>;
	} = $props();

	// IDs for ARIA relationships
	const ids = {
		trigger: generateId('dialog-trigger'),
		content: generateId('dialog-content'),
	};

	// Track mounted state separately to allow exit animations
	// mounted = element exists in DOM
	// visible = element should appear open (delayed by a frame for enter transition)
	let mounted = $state(false);
	let visible = $state(false);

	// Sync mounted/visible state with open prop
	$effect(() => {
		if (open) {
			// Mount first, then set visible after a frame to trigger enter transition
			mounted = true;
			requestAnimationFrame(() => {
				visible = true;
			});
		} else {
			// Set invisible immediately to trigger exit transition
			visible = false;
		}
	});

	// Derived state for data attributes
	const dataState = $derived<DialogState>(visible ? 'open' : 'closed');

	// Handle animation/transition end to unmount after closing
	function handleAnimationEnd() {
		if (!visible) {
			mounted = false;
		}
	}

	// Handle scroll lock
	$effect(() => {
		if (open && modal) {
			lockScroll();
			return () => unlockScroll();
		}
	});

	// Actions
	function openDialog() {
		open = true;
	}

	function closeDialog() {
		open = false;
	}

	function handleTriggerClick() {
		openDialog();
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openDialog();
		}
	}

	function handleOverlayClick() {
		if (closeOnOutsideClick) {
			closeDialog();
		}
	}

	function handleEscape() {
		if (closeOnEscape) {
			closeDialog();
		}
	}

	// Props builders
	function getTriggerProps(): TriggerProps {
		return {
			id: ids.trigger,
			'aria-haspopup': 'dialog',
			'aria-expanded': open,
			'aria-controls': ids.content,
			onclick: handleTriggerClick,
			onkeydown: handleTriggerKeydown,
			'data-state': dataState,
		};
	}

	function getOverlayProps(): OverlayProps {
		return {
			'aria-hidden': 'true',
			onclick: handleOverlayClick,
			onanimationend: handleAnimationEnd,
			ontransitionend: handleAnimationEnd,
			'data-state': dataState,
		};
	}

	function getContentProps(): ContentProps {
		return {
			id: ids.content,
			role: 'dialog',
			'aria-modal': modal ? 'true' : undefined,
			'aria-labelledby': labelledby,
			'aria-describedby': describedby,
			'data-state': dataState,
		};
	}
</script>

{#if trigger}
	{@render trigger(getTriggerProps())}
{/if}

{#if mounted}
	<div
		use:portal
		use:escapeKeydown={{ handler: handleEscape, enabled: open }}
	>
		{#if overlay}
			{@render overlay(getOverlayProps())}
		{/if}

		<div
			use:focusTrap={{ enabled: open && modal, modal, returnFocus: true }}
		>
			{@render content(getContentProps())}
		</div>
	</div>
{/if}
