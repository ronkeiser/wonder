<script lang="ts">
	import type { Snippet } from 'svelte';
	import { generateId } from '../dom/id.js';
	import { lockScroll, unlockScroll } from '../dom/scrollLock.js';
	import { focusTrap } from '../actions/focusTrap.js';
	import { portal } from '../actions/portal.js';
	import { escapeKeydown } from '../actions/escapeKeydown.js';

	interface TriggerProps {
		id: string;
		'aria-haspopup': 'dialog';
		'aria-expanded': boolean;
		'aria-controls': string;
		onclick: () => void;
		onkeydown: (event: KeyboardEvent) => void;
		'data-state': 'open' | 'closed';
	}

	interface OverlayProps {
		'aria-hidden': 'true';
		onclick: () => void;
		'data-state': 'open';
	}

	interface ContentProps {
		id: string;
		role: 'dialog';
		'aria-modal': 'true' | undefined;
		'aria-labelledby': string | undefined;
		'aria-describedby': string | undefined;
		'data-state': 'open';
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
			'data-state': open ? 'open' : 'closed',
		};
	}

	function getOverlayProps(): OverlayProps {
		return {
			'aria-hidden': 'true',
			onclick: handleOverlayClick,
			'data-state': 'open',
		};
	}

	function getContentProps(): ContentProps {
		return {
			id: ids.content,
			role: 'dialog',
			'aria-modal': modal ? 'true' : undefined,
			'aria-labelledby': labelledby,
			'aria-describedby': describedby,
			'data-state': 'open',
		};
	}
</script>

{#if trigger}
	{@render trigger(getTriggerProps())}
{/if}

{#if open}
	<div
		use:portal
		use:escapeKeydown={{ handler: handleEscape }}
	>
		{#if overlay}
			{@render overlay(getOverlayProps())}
		{/if}

		<div
			use:focusTrap={{ enabled: modal, modal, returnFocus: true }}
		>
			{@render content(getContentProps())}
		</div>
	</div>
{/if}
