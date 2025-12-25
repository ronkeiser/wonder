// Components
export { default as Sidebar } from './components/Sidebar.svelte';
export { default as Select, type SelectOption } from './components/Select.svelte';
export { default as DropdownMenu, type MenuItem } from './components/DropdownMenu.svelte';
export { default as Dialog } from './components/Dialog.svelte';
export { default as Tooltip } from './components/Tooltip.svelte';
export { default as Popover } from './components/Popover.svelte';

// State (reactive utilities using runes)
export { createPersisted, type Persisted } from './state/persisted.svelte';
export {
	createFloating,
	applyFloatingStyles,
	applyArrowStyles,
	type FloatingOptions,
	type FloatingState,
	type FloatingInstance,
	type Placement,
} from './state/floating.svelte';
export {
	createFloatingTree,
	setFloatingTree,
	getFloatingTree,
	setFloatingParentId,
	getFloatingParentId,
	registerFloatingNode,
	type FloatingNode,
	type FloatingTreeContext,
	type FloatingTreeEvents,
} from './state/floatingTree.svelte';
export {
	createRovingFocus,
	isCompositionEvent,
	getNavigationDirection,
	type Orientation,
	type RovingFocusOptions,
	type RovingFocusState,
} from './state/keyboard.svelte';
export { createTypeahead, type TypeaheadOptions, type TypeaheadState } from './state/typeahead.svelte';

// Actions
export { clickOutside, type ClickOutsideOptions } from './actions/clickOutside';
export {
	escapeKeydown,
	type EscapeKeydownOptions,
	type EscapeBehavior,
} from './actions/escapeKeydown';
export { focusTrap, type FocusTrapOptions } from './actions/focusTrap';
export { portal, type PortalOptions, type PortalTarget } from './actions/portal';

// DOM utilities (pure functions)
export { generateId, generateUniqueId, createIdGroup } from './dom/id';
export {
	activeElement,
	contains,
	getTarget,
	saveFocus,
	restoreFocus,
	resolveFocusTarget,
	enqueueFocus,
	getTabbableElements,
	type FocusTarget,
} from './dom/focus';
export {
	lockScroll,
	unlockScroll,
	isScrollLocked,
	forceUnlockScroll,
} from './dom/scrollLock';
export {
	isWebKit,
	isMacSafari,
	isIOS,
	isFirefox,
	prefersReducedMotion,
	isRTL,
} from './dom/browser';
