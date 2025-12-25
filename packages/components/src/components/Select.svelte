<script lang="ts">
	import type { Snippet } from 'svelte';
	import { generateId } from '../dom/id.js';
	import { createFloating, type Placement } from '../state/floating.svelte.js';
	import { createRovingFocus } from '../state/keyboard.svelte.js';
	import { createTypeahead } from '../state/typeahead.svelte.js';
	import { clickOutside } from '../actions/clickOutside.js';
	import { escapeKeydown } from '../actions/escapeKeydown.js';

	export interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface TriggerProps {
		id: string;
		role: 'combobox';
		'aria-haspopup': 'listbox';
		'aria-expanded': boolean;
		'aria-controls': string;
		'aria-activedescendant': string | undefined;
		'aria-disabled': boolean | undefined;
		tabindex: number;
		onclick: () => void;
		onkeydown: (event: KeyboardEvent) => void;
		'data-state': 'open' | 'closed';
		'data-disabled': true | undefined;
	}

	interface OptionProps {
		id: string;
		role: 'option';
		'aria-selected': boolean;
		'aria-disabled': boolean | undefined;
		tabindex: -1;
		onclick: () => void;
		onpointerenter: () => void;
		'data-highlighted': true | undefined;
		'data-selected': true | undefined;
		'data-disabled': true | undefined;
	}

	interface ListboxProps {
		id: string;
		role: 'listbox';
		'aria-labelledby': string;
		'data-state': 'open';
		style: string;
	}

	let {
		value = $bindable<string | undefined>(undefined),
		options,
		open = $bindable(false),
		disabled = false,
		placement = 'bottom-start' as Placement,
		onchange,
		trigger,
		listbox,
		option,
	}: {
		value?: string;
		options: SelectOption[];
		open?: boolean;
		disabled?: boolean;
		placement?: Placement;
		onchange?: (value: string) => void;
		trigger: Snippet<[TriggerProps, SelectOption | undefined]>;
		listbox: Snippet<[ListboxProps, Snippet]>;
		option: Snippet<[OptionProps, SelectOption, boolean]>;
	} = $props();

	// IDs for ARIA relationships
	const ids = {
		trigger: generateId('select-trigger'),
		listbox: generateId('select-listbox'),
		option: (index: number) => `${ids.listbox}-option-${index}`,
	};

	// Element refs
	let triggerEl: HTMLElement | null = $state(null);
	let listboxEl: HTMLElement | null = $state(null);
	let optionEls: HTMLElement[] = $state([]);

	// Highlighted index for keyboard navigation
	let highlightedIndex = $state(-1);

	// Floating positioning
	let floatingInstance: ReturnType<typeof createFloating> | null = $state(null);

	$effect(() => {
		if (open && triggerEl && listboxEl) {
			floatingInstance = createFloating(triggerEl, listboxEl, {
				placement,
				offset: 4,
				flip: true,
				shift: { padding: 8 },
			});
			return () => floatingInstance?.destroy();
		}
	});

	// Roving focus for keyboard navigation
	const rovingFocus = createRovingFocus(
		() => optionEls.filter((_, i) => !options[i]?.disabled),
		{ orientation: 'vertical', loop: true }
	);

	// Typeahead for type-to-select
	const typeahead = createTypeahead({
		getItems: () => options.map((o) => o.label),
		onMatch: (index) => {
			if (!options[index]?.disabled) {
				highlightedIndex = index;
				optionEls[index]?.scrollIntoView({ block: 'nearest' });
			}
		},
	});

	// Computed values
	const selectedOption = $derived(options.find((o) => o.value === value));
	const selectedIndex = $derived(options.findIndex((o) => o.value === value));

	// Actions
	function openSelect() {
		if (disabled) return;
		open = true;
		// Highlight selected option or first option
		highlightedIndex = selectedIndex >= 0 ? selectedIndex : 0;
	}

	function closeSelect() {
		open = false;
		highlightedIndex = -1;
		triggerEl?.focus();
	}

	function selectOption(index: number) {
		const opt = options[index];
		if (!opt || opt.disabled) return;
		value = opt.value;
		onchange?.(opt.value);
		closeSelect();
	}

	function handleTriggerClick() {
		if (open) {
			closeSelect();
		} else {
			openSelect();
		}
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (disabled) return;

		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (open) {
					if (highlightedIndex >= 0) {
						selectOption(highlightedIndex);
					}
				} else {
					openSelect();
				}
				break;

			case 'ArrowDown':
				event.preventDefault();
				if (!open) {
					openSelect();
				} else {
					moveHighlight(1);
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (!open) {
					openSelect();
					highlightedIndex = options.length - 1;
				} else {
					moveHighlight(-1);
				}
				break;

			case 'Home':
				if (open) {
					event.preventDefault();
					highlightedIndex = findNextEnabledIndex(-1, 1);
				}
				break;

			case 'End':
				if (open) {
					event.preventDefault();
					highlightedIndex = findNextEnabledIndex(options.length, -1);
				}
				break;

			case 'Tab':
				if (open) {
					closeSelect();
				}
				break;

			default:
				// Typeahead - open and search
				if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
					if (!open) {
						openSelect();
					}
					typeahead.handleKeydown(event);
				}
				break;
		}
	}

	function moveHighlight(direction: 1 | -1) {
		const nextIndex = findNextEnabledIndex(highlightedIndex, direction);
		if (nextIndex !== highlightedIndex) {
			highlightedIndex = nextIndex;
			optionEls[nextIndex]?.scrollIntoView({ block: 'nearest' });
		}
	}

	function findNextEnabledIndex(start: number, direction: 1 | -1): number {
		let index = start + direction;
		const length = options.length;

		while (index >= 0 && index < length) {
			if (!options[index]?.disabled) {
				return index;
			}
			index += direction;
		}

		// Wrap around
		index = direction === 1 ? 0 : length - 1;
		while (index !== start) {
			if (!options[index]?.disabled) {
				return index;
			}
			index += direction;
			if (index < 0) index = length - 1;
			if (index >= length) index = 0;
		}

		return start;
	}

	function handleOptionClick(index: number) {
		selectOption(index);
	}

	function handleOptionPointerEnter(index: number) {
		if (!options[index]?.disabled) {
			highlightedIndex = index;
		}
	}

	// Build props for snippets
	function getTriggerProps(): TriggerProps {
		return {
			id: ids.trigger,
			role: 'combobox',
			'aria-haspopup': 'listbox',
			'aria-expanded': open,
			'aria-controls': ids.listbox,
			'aria-activedescendant': highlightedIndex >= 0 ? ids.option(highlightedIndex) : undefined,
			'aria-disabled': disabled || undefined,
			tabindex: disabled ? -1 : 0,
			onclick: handleTriggerClick,
			onkeydown: handleTriggerKeydown,
			'data-state': open ? 'open' : 'closed',
			'data-disabled': disabled || undefined,
		};
	}

	function getOptionProps(index: number): OptionProps {
		const opt = options[index];
		const isSelected = opt?.value === value;
		const isHighlighted = index === highlightedIndex;
		const isDisabled = opt?.disabled ?? false;

		return {
			id: ids.option(index),
			role: 'option',
			'aria-selected': isSelected,
			'aria-disabled': isDisabled || undefined,
			tabindex: -1,
			onclick: () => handleOptionClick(index),
			onpointerenter: () => handleOptionPointerEnter(index),
			'data-highlighted': isHighlighted || undefined,
			'data-selected': isSelected || undefined,
			'data-disabled': isDisabled || undefined,
		};
	}

	function getListboxProps(): ListboxProps {
		const x = floatingInstance?.state.x ?? 0;
		const y = floatingInstance?.state.y ?? 0;
		const minWidth = floatingInstance?.state.referenceWidth ?? 0;

		return {
			id: ids.listbox,
			role: 'listbox',
			'aria-labelledby': ids.trigger,
			'data-state': 'open',
			style: `position: absolute; left: ${x}px; top: ${y}px; min-width: ${minWidth}px;`,
		};
	}
</script>

<div class="select-root">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={triggerEl}>
		{@render trigger(getTriggerProps(), selectedOption)}
	</div>

	{#if open}
		<div
			bind:this={listboxEl}
			use:clickOutside={{ handler: closeSelect, reference: triggerEl }}
			use:escapeKeydown={{ handler: closeSelect }}
		>
			{@render listbox(getListboxProps(), optionsSnippet)}
		</div>
	{/if}
</div>

{#snippet optionsSnippet()}
	{#each options as opt, index}
		<div bind:this={optionEls[index]}>
			{@render option(getOptionProps(index), opt, opt.value === value)}
		</div>
	{/each}
{/snippet}
