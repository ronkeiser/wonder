<script lang="ts" module>
	export interface MenuItem {
		id: string;
		label: string;
		disabled?: boolean;
		onSelect?: () => void;
		children?: MenuItem[];
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { generateId } from '../dom/id.js';
	import { createFloating, type Placement } from '../state/floating.svelte.js';
	import { createTypeahead } from '../state/typeahead.svelte.js';
	import {
		createFloatingTree,
		setFloatingTree,
		getFloatingTree,
		setFloatingParentId,
		getFloatingParentId,
		registerFloatingNode,
		type FloatingTreeContext,
	} from '../state/floatingTree.svelte.js';
	import { clickOutside } from '../actions/clickOutside.js';
	import { escapeKeydown, type EscapeBehavior } from '../actions/escapeKeydown.js';
	import Self from './DropdownMenu.svelte';

	interface TriggerProps {
		id: string;
		'aria-haspopup': 'menu';
		'aria-expanded': boolean;
		'aria-controls': string;
		'aria-disabled': boolean | undefined;
		tabindex: number;
		onclick: () => void;
		onkeydown: (event: KeyboardEvent) => void;
		'data-state': 'open' | 'closed';
		'data-disabled': true | undefined;
	}

	interface ContentProps {
		id: string;
		role: 'menu';
		'aria-labelledby': string;
		'data-state': 'open';
		style: string;
	}

	interface ItemProps {
		id: string;
		role: 'menuitem';
		'aria-disabled': boolean | undefined;
		'aria-haspopup': 'menu' | undefined;
		'aria-expanded': boolean | undefined;
		tabindex: -1;
		onclick: () => void;
		onpointerenter: () => void;
		onpointerleave: () => void;
		onkeydown: (event: KeyboardEvent) => void;
		'data-highlighted': true | undefined;
		'data-disabled': true | undefined;
		'data-has-submenu': true | undefined;
	}

	let {
		items,
		open = $bindable(false),
		disabled = false,
		placement = 'bottom-start' as Placement,
		// For submenus, the reference element is the parent item
		referenceEl = null as HTMLElement | null,
		trigger,
		content,
		item,
	}: {
		items: MenuItem[];
		open?: boolean;
		disabled?: boolean;
		placement?: Placement;
		referenceEl?: HTMLElement | null;
		trigger: Snippet<[TriggerProps]>;
		content: Snippet<[ContentProps, Snippet]>;
		item: Snippet<[ItemProps, MenuItem]>;
	} = $props();

	// Determine if this is a root menu or a submenu
	const parentTree = getFloatingTree();
	const parentId = getFloatingParentId();
	const isSubmenu = referenceEl !== null;

	// Create or use existing floating tree
	const tree: FloatingTreeContext = parentTree ?? createFloatingTree();
	if (!parentTree) {
		setFloatingTree(tree);
	}

	// IDs for ARIA relationships
	const ids = {
		menu: generateId('dropdown-menu'),
		trigger: generateId('dropdown-trigger'),
		item: (id: string) => `${ids.menu}-item-${id}`,
	};

	// Register this menu with the tree (use onMount to avoid effect loop)
	onMount(() => {
		const unregister = registerFloatingNode(ids.menu);
		return unregister;
	});

	// Make this menu the parent for any nested submenus
	setFloatingParentId(ids.menu);

	// Element refs
	let triggerEl: HTMLElement | null = $state(null);
	let contentEl: HTMLElement | null = $state(null);
	let itemElsArray: (HTMLElement | null)[] = $state([]);

	// State
	let highlightedIndex = $state(-1);
	let openSubmenuIndex = $state(-1);
	let submenuHoverTimeout: ReturnType<typeof setTimeout> | undefined;

	// Floating positioning
	let floatingInstance: ReturnType<typeof createFloating> | null = $state(null);

	$effect(() => {
		const reference = isSubmenu ? referenceEl : triggerEl;
		if (open && reference && contentEl) {
			floatingInstance = createFloating(reference, contentEl, {
				placement: isSubmenu ? 'right-start' : placement,
				offset: isSubmenu ? -4 : 4,
				flip: true,
				shift: { padding: 8 },
			});
			return () => floatingInstance?.destroy();
		}
	});

	// Get enabled items for navigation
	function getEnabledIndices(): number[] {
		return items.map((_, i) => i).filter((i) => !items[i]?.disabled);
	}

	// Typeahead
	const typeahead = createTypeahead({
		getItems: () => items.map((i) => i.label),
		onMatch: (index) => {
			if (!items[index]?.disabled) {
				highlightedIndex = index;
				itemElsArray[index]?.scrollIntoView({ block: 'nearest' });
			}
		},
	});

	// Escape behavior depends on whether this is a submenu
	const escapeBehavior: EscapeBehavior = isSubmenu ? 'close' : 'defer-otherwise-close';

	// Actions
	function openMenu() {
		if (disabled) return;
		open = true;
		const enabled = getEnabledIndices();
		highlightedIndex = enabled[0] ?? -1;
	}

	function closeMenu() {
		open = false;
		highlightedIndex = -1;
		openSubmenuIndex = -1;
		triggerEl?.focus();
	}

	function closeAll() {
		tree.events.emit('dismiss');
	}

	function selectItem(index: number) {
		const menuItem = items[index];
		if (!menuItem || menuItem.disabled) return;

		if (menuItem.children && menuItem.children.length > 0) {
			openSubmenuIndex = index;
		} else {
			menuItem.onSelect?.();
			closeAll();
		}
	}

	function handleTriggerClick() {
		if (open) {
			closeMenu();
		} else {
			openMenu();
		}
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (disabled) return;

		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (!open) {
					openMenu();
				}
				break;

			case 'ArrowDown':
				event.preventDefault();
				if (!open) {
					openMenu();
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (!open) {
					openMenu();
					const enabled = getEnabledIndices();
					highlightedIndex = enabled[enabled.length - 1] ?? -1;
				}
				break;
		}
	}

	function handleItemKeydown(event: KeyboardEvent, index: number) {
		const menuItem = items[index];

		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				selectItem(index);
				break;

			case 'ArrowDown':
				event.preventDefault();
				moveHighlight(1);
				break;

			case 'ArrowUp':
				event.preventDefault();
				moveHighlight(-1);
				break;

			case 'ArrowRight':
				if (menuItem?.children && menuItem.children.length > 0) {
					event.preventDefault();
					openSubmenuIndex = index;
				}
				break;

			case 'ArrowLeft':
				if (isSubmenu) {
					event.preventDefault();
					closeMenu();
				}
				break;

			case 'Home':
				event.preventDefault();
				{
					const enabled = getEnabledIndices();
					highlightedIndex = enabled[0] ?? -1;
				}
				break;

			case 'End':
				event.preventDefault();
				{
					const enabled = getEnabledIndices();
					highlightedIndex = enabled[enabled.length - 1] ?? -1;
				}
				break;

			case 'Tab':
				closeAll();
				break;

			default:
				if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
					typeahead.handleKeydown(event);
				}
				break;
		}
	}

	function moveHighlight(direction: 1 | -1) {
		const enabled = getEnabledIndices();
		if (enabled.length === 0) return;

		if (highlightedIndex === -1) {
			highlightedIndex = direction === 1 ? enabled[0]! : enabled[enabled.length - 1]!;
			return;
		}

		const currentPos = enabled.indexOf(highlightedIndex);
		if (currentPos === -1) {
			highlightedIndex = enabled[0]!;
			return;
		}

		let nextPos = currentPos + direction;
		if (nextPos < 0) nextPos = enabled.length - 1;
		if (nextPos >= enabled.length) nextPos = 0;

		highlightedIndex = enabled[nextPos]!;
		itemElsArray[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
	}

	function handleItemPointerEnter(index: number) {
		const menuItem = items[index];
		if (menuItem && !menuItem.disabled) {
			highlightedIndex = index;

			// Clear any pending submenu open
			if (submenuHoverTimeout) {
				clearTimeout(submenuHoverTimeout);
				submenuHoverTimeout = undefined;
			}

			// If this item has children, open submenu after a short delay
			if (menuItem.children && menuItem.children.length > 0) {
				submenuHoverTimeout = setTimeout(() => {
					openSubmenuIndex = index;
				}, 150);
			} else if (openSubmenuIndex !== -1) {
				// Close other submenus when hovering a non-submenu item
				openSubmenuIndex = -1;
			}
		}
	}

	function handleItemPointerLeave() {
		// Clear pending submenu open on leave
		if (submenuHoverTimeout) {
			clearTimeout(submenuHoverTimeout);
			submenuHoverTimeout = undefined;
		}
	}

	// Props builders
	function getTriggerProps(): TriggerProps {
		return {
			id: ids.trigger,
			'aria-haspopup': 'menu',
			'aria-expanded': open,
			'aria-controls': ids.menu,
			'aria-disabled': disabled || undefined,
			tabindex: disabled ? -1 : 0,
			onclick: handleTriggerClick,
			onkeydown: handleTriggerKeydown,
			'data-state': open ? 'open' : 'closed',
			'data-disabled': disabled || undefined,
		};
	}

	function getContentProps(): ContentProps {
		const x = floatingInstance?.state.x ?? 0;
		const y = floatingInstance?.state.y ?? 0;
		const minWidth = floatingInstance?.state.referenceWidth ?? 0;

		return {
			id: ids.menu,
			role: 'menu',
			'aria-labelledby': ids.trigger,
			'data-state': 'open',
			style: `position: absolute; left: ${x}px; top: ${y}px; min-width: ${minWidth}px;`,
		};
	}

	function getItemProps(index: number): ItemProps {
		const menuItem = items[index]!;
		const isHighlighted = index === highlightedIndex;
		const hasChildren = menuItem.children && menuItem.children.length > 0;
		const isSubmenuOpen = openSubmenuIndex === index;

		return {
			id: ids.item(menuItem.id),
			role: 'menuitem',
			'aria-disabled': menuItem.disabled || undefined,
			'aria-haspopup': hasChildren ? 'menu' : undefined,
			'aria-expanded': hasChildren ? isSubmenuOpen : undefined,
			tabindex: -1,
			onclick: () => selectItem(index),
			onpointerenter: () => handleItemPointerEnter(index),
			onpointerleave: handleItemPointerLeave,
			onkeydown: (event: KeyboardEvent) => handleItemKeydown(event, index),
			'data-highlighted': isHighlighted || undefined,
			'data-disabled': menuItem.disabled || undefined,
			'data-has-submenu': hasChildren || undefined,
		};
	}

	// Listen for dismiss events from tree
	$effect(() => {
		const unsubscribe = tree.events.on('dismiss', () => {
			open = false;
			highlightedIndex = -1;
			openSubmenuIndex = -1;
		});
		return unsubscribe;
	});

	// Close submenu when it signals close
	function handleSubmenuClose() {
		openSubmenuIndex = -1;
		// Focus the parent item
		if (highlightedIndex >= 0) {
			itemElsArray[highlightedIndex]?.focus();
		}
	}
</script>

{#if isSubmenu}
	<!-- Submenu: no trigger, just content -->
	{#if open}
		<div
			bind:this={contentEl}
			use:clickOutside={{ handler: closeMenu, reference: referenceEl }}
			use:escapeKeydown={{ handler: closeMenu, behavior: escapeBehavior }}
		>
			{@render content(getContentProps(), itemsSnippet)}
		</div>
	{/if}
{:else}
	<!-- Root menu: has trigger -->
	<div class="dropdown-menu-root">
		<div bind:this={triggerEl}>
			{@render trigger(getTriggerProps())}
		</div>

		{#if open}
			<div
				bind:this={contentEl}
				use:clickOutside={{ handler: closeMenu, reference: triggerEl }}
				use:escapeKeydown={{ handler: closeMenu, behavior: escapeBehavior }}
			>
				{@render content(getContentProps(), itemsSnippet)}
			</div>
		{/if}
	</div>
{/if}

{#snippet itemsSnippet()}
	{#each items as menuItem, index}
		<div bind:this={itemElsArray[index]}>
			{@render item(getItemProps(index), menuItem)}
		</div>

		{#if menuItem.children && menuItem.children.length > 0 && openSubmenuIndex === index}
			<Self
				items={menuItem.children}
				open={true}
				placement="right-start"
				referenceEl={itemElsArray[index]}
				{trigger}
				{content}
				{item}
			/>
		{/if}
	{/each}
{/snippet}
