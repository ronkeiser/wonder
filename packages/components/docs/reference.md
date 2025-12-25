# Floating UI React → Svelte 5 Implementation Reference

This document maps our utility layer to `@floating-ui/react` source code, extracting the key implementation details needed for a Svelte 5 port.

## Pattern Translation Guide

| React | Svelte 5 |
|-------|----------|
| `useRef` (mutable) | `let value = $state(...)` or `{ current: value }` |
| `useEffect` | `$effect(() => { ... return cleanup })` |
| `useLayoutEffect` | `$effect.pre()` |
| `useMemo` | `$derived(...)` |
| `useCallback` | Regular function (Svelte handles reactivity) |
| `useContext` | `getContext()` / `setContext()` |
| `useId()` | `crypto.randomUUID()` or counter |

---

## Actions

### clickOutside.ts

**React source:** `useDismiss` → `outsidePress` handling

#### Core Logic

Dual-phase event listening (capture + bubble) to distinguish real outside clicks from intercepted events:

```typescript
// Phase 1: Capture - record if event started inside
document.addEventListener('pointerdown', (e) => {
  startedInsideRef = contains(floating, getTarget(e));
}, { capture: true });

// Phase 2: Bubble - check if click was truly outside
document.addEventListener('pointerdown', (e) => {
  if (startedInsideRef) return;
  if (contains(floating, getTarget(e))) return;
  if (contains(reference, getTarget(e))) return;
  onClickOutside(e);
});
```

#### Edge Cases to Handle

**Scrollbar clicks (RTL-aware):**
```typescript
const style = getComputedStyle(target);
const isRTL = style.direction === 'rtl';
const canScrollY = target.scrollHeight > target.clientHeight;
const canScrollX = target.scrollWidth > target.clientWidth;

// Vertical scrollbar position depends on RTL
const pressedVerticalScrollbar = canScrollY && (isRTL
  ? event.offsetX <= target.offsetWidth - target.clientWidth
  : event.offsetX > target.clientWidth);

const pressedHorizontalScrollbar = canScrollX &&
  event.offsetY > target.clientHeight;

if (pressedVerticalScrollbar || pressedHorizontalScrollbar) return;
```

**Third-party injected elements:**
```typescript
// Browser extensions inject elements - check for inert marker
if (target.hasAttribute('data-floating-ui-inert')) return;
```

**Drag scenarios:**
```typescript
// Track mousedown inside to prevent closing on drag-release outside
let endedOrStartedInside = false;
document.addEventListener('mousedown', () => {
  endedOrStartedInside = contains(floating, activeElement(doc));
}, { capture: true });
```

**Shadow DOM:**
```typescript
function getTarget(event: Event): Element | null {
  if ('composedPath' in event) {
    return event.composedPath()[0] as Element;
  }
  return event.target as Element;
}

function contains(parent: Element | null, child: Element | null): boolean {
  if (!parent || !child) return false;
  const rootNode = child.getRootNode?.();
  if (rootNode instanceof ShadowRoot) {
    return parent.contains(rootNode.host);
  }
  return parent.contains(child);
}
```

#### Svelte Action Signature

```typescript
interface ClickOutsideOptions {
  enabled?: boolean;
  handler: (event: PointerEvent) => void;
  ignore?: (Element | string)[]; // Elements or selectors to ignore
}

export function clickOutside(node: HTMLElement, options: ClickOutsideOptions): ActionReturn;
```

---

### escapeKeydown.ts

**React source:** `useDismiss` → `escapeKey` handling

#### Core Logic

Four escape behaviors for nested floating elements:

```typescript
type EscapeBehavior =
  | 'close'              // Always close
  | 'ignore'             // Never close
  | 'defer-otherwise-close'   // Propagate first, close if not prevented
  | 'defer-otherwise-ignore'; // Propagate first, do nothing if not prevented
```

**Defer pattern implementation:**

```typescript
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;

  if (behavior === 'close') {
    event.stopPropagation();
    onClose();
    return;
  }

  if (behavior === 'ignore') return;

  // Defer variants: let event propagate, check after tick
  if (behavior.startsWith('defer')) {
    // Don't call preventDefault or stopPropagation
    requestAnimationFrame(() => {
      if (event.defaultPrevented) return;
      if (behavior === 'defer-otherwise-close') {
        onClose();
      }
    });
  }
}
```

**IME composition handling (especially WebKit):**

```typescript
let isComposing = false;
let compositionTimeout: number;

node.addEventListener('compositionstart', () => {
  isComposing = true;
});

node.addEventListener('compositionend', () => {
  // WebKit needs 5ms delay after compositionend
  compositionTimeout = window.setTimeout(() => {
    isComposing = false;
  }, isWebKit() ? 5 : 0);
});

function handleKeydown(event: KeyboardEvent) {
  if (isComposing) return; // Ignore during IME
  // ... escape handling
}
```

#### Svelte Action Signature

```typescript
interface EscapeKeydownOptions {
  enabled?: boolean;
  handler: () => void;
  behavior?: EscapeBehavior;
}

export function escapeKeydown(node: HTMLElement, options: EscapeKeydownOptions): ActionReturn;
```

---

### focusTrap.ts

**React source:** `FloatingFocusManager`

#### Core Logic

**Tab key interception:**

```typescript
function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;

  const tabbables = getTabbableElements(node);
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
```

**Focus guards (invisible tabbable sentinels):**

```typescript
// Rendered at start and end of trapped region
const guard = document.createElement('span');
guard.tabIndex = 0;
guard.setAttribute('aria-hidden', 'true');
guard.style.cssText = 'position:fixed;top:1px;left:1px;width:1px;height:0;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

guard.addEventListener('focus', () => {
  // Redirect focus back into trapped region
  const tabbables = getTabbableElements(node);
  if (isBeforeGuard) {
    tabbables[tabbables.length - 1]?.focus();
  } else {
    tabbables[0]?.focus();
  }
});
```

**Mark other elements inert:**

```typescript
function markOthers(inside: Element[], ariaHidden = true, inert = true) {
  const roots = [document.body];

  return roots.map((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const elements: Element[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Element;
      // Skip elements inside the floating element
      if (inside.some(el => el.contains(node))) continue;

      if (inert) node.setAttribute('inert', '');
      if (ariaHidden) node.setAttribute('aria-hidden', 'true');
      elements.push(node);
    }

    return () => {
      elements.forEach(el => {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      });
    };
  });
}
```

#### Svelte Action Signature

```typescript
interface FocusTrapOptions {
  enabled?: boolean;
  initialFocus?: HTMLElement | string | (() => HTMLElement | null);
  returnFocus?: boolean;
  modal?: boolean; // Whether to mark other elements inert
}

export function focusTrap(node: HTMLElement, options: FocusTrapOptions): ActionReturn;
```

---

### portal.ts

**React source:** `FloatingPortal`

#### Core Logic

```typescript
export function portal(node: HTMLElement, target: HTMLElement | string = 'body'): ActionReturn {
  const container = typeof target === 'string'
    ? document.querySelector(target)
    : target;

  if (!container) {
    console.warn(`Portal target not found: ${target}`);
    return {};
  }

  container.appendChild(node);

  return {
    destroy() {
      node.remove();
    }
  };
}
```

**Portal ID tracking (for focus coordination):**

```typescript
// Used by FloatingFocusManager to handle focus across portals
const portalContext = {
  preserveTabOrder: boolean,
  portalNode: HTMLElement | null,
  setFocusManagerState: (state) => void,
};
```

---

## Utils

### floating.ts

**React source:** `useFloating` + middleware

#### Core Logic

Wrapper around `@floating-ui/dom` with reactive updates:

```typescript
import { computePosition, autoUpdate, flip, offset, shift, arrow, size } from '@floating-ui/dom';

interface FloatingOptions {
  placement?: Placement;
  offset?: number;
  flip?: boolean;
  shift?: boolean | { padding?: number };
  arrow?: { element: HTMLElement; padding?: number };
  size?: { apply: (args: { availableWidth: number; availableHeight: number }) => void };
}

export function createFloating(
  reference: HTMLElement,
  floating: HTMLElement,
  options: FloatingOptions
) {
  let x = $state(0);
  let y = $state(0);
  let placement = $state(options.placement ?? 'bottom');
  let arrowX = $state<number | undefined>();
  let arrowY = $state<number | undefined>();

  const middleware = [
    options.offset && offset(options.offset),
    options.flip && flip(),
    options.shift && shift(typeof options.shift === 'object' ? options.shift : {}),
    options.arrow && arrow({ element: options.arrow.element, padding: options.arrow.padding }),
    options.size && size({ apply: options.size.apply }),
  ].filter(Boolean);

  async function update() {
    const result = await computePosition(reference, floating, {
      placement: options.placement,
      middleware,
    });

    x = result.x;
    y = result.y;
    placement = result.placement;

    if (result.middlewareData.arrow) {
      arrowX = result.middlewareData.arrow.x;
      arrowY = result.middlewareData.arrow.y;
    }
  }

  const cleanup = autoUpdate(reference, floating, update);

  return {
    get x() { return x; },
    get y() { return y; },
    get placement() { return placement; },
    get arrowX() { return arrowX; },
    get arrowY() { return arrowY; },
    destroy: cleanup,
  };
}
```

**Standard middleware order:**

1. `offset()` — distance from anchor
2. `flip()` — reverse placement if insufficient space
3. `shift()` — prevent overflow
4. `arrow()` — position arrow element
5. `size()` — viewport constraints

---

### floatingTree.ts

**React source:** `FloatingTree`, `useFloatingTree`, `useFloatingNodeId`, `useFloatingParentNodeId`

#### Core Logic

Tracks parent/child relationships between nested floating elements:

```typescript
interface FloatingNode {
  id: string;
  parentId: string | null;
}

interface FloatingTreeContext {
  nodes: FloatingNode[];
  addNode: (node: FloatingNode) => void;
  removeNode: (id: string) => void;
  events: EventEmitter;
}

export function createFloatingTree(): FloatingTreeContext {
  let nodes = $state<FloatingNode[]>([]);
  const events = createEventEmitter();

  return {
    get nodes() { return nodes; },
    addNode(node) {
      nodes = [...nodes, node];
    },
    removeNode(id) {
      nodes = nodes.filter(n => n.id !== id);
    },
    events,
  };
}

// Event emitter for cross-node communication
function createEventEmitter() {
  const listeners = new Map<string, Set<Function>>();

  return {
    on(event: string, handler: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    emit(event: string, data?: unknown) {
      listeners.get(event)?.forEach(fn => fn(data));
    },
  };
}
```

**Getting children for dismiss bubbling:**

```typescript
function getChildren(nodes: FloatingNode[], parentId: string): FloatingNode[] {
  return nodes.filter(node => {
    let current = node;
    while (current.parentId) {
      if (current.parentId === parentId) return true;
      current = nodes.find(n => n.id === current.parentId)!;
    }
    return false;
  });
}
```

**Svelte context integration:**

```typescript
const FLOATING_TREE_KEY = Symbol('floating-tree');

export function setFloatingTree(tree: FloatingTreeContext) {
  setContext(FLOATING_TREE_KEY, tree);
}

export function getFloatingTree(): FloatingTreeContext | undefined {
  return getContext(FLOATING_TREE_KEY);
}

export function getFloatingParentId(): string | null {
  return getContext('floating-parent-id') ?? null;
}
```

---

### focus.ts

**React source:** `FloatingFocusManager` focus tracking

#### Core Logic

**Save/restore focus:**

```typescript
let previouslyFocused: Element[] = [];
const LIST_LIMIT = 20;

export function saveFocus() {
  const active = document.activeElement;
  if (active && active.tagName !== 'BODY') {
    previouslyFocused.push(active);
    if (previouslyFocused.length > LIST_LIMIT) {
      previouslyFocused = previouslyFocused.slice(-LIST_LIMIT);
    }
  }
}

export function restoreFocus() {
  // Clean disconnected elements
  previouslyFocused = previouslyFocused.filter(el => el.isConnected);

  const target = previouslyFocused.pop();
  if (target && 'focus' in target) {
    (target as HTMLElement).focus();
  }
}
```

**Configurable focus targets:**

```typescript
type FocusTarget = HTMLElement | string | (() => HTMLElement | null);

export function resolveFocusTarget(target: FocusTarget, container?: HTMLElement): HTMLElement | null {
  if (typeof target === 'function') {
    return target();
  }
  if (typeof target === 'string') {
    return (container ?? document).querySelector(target);
  }
  return target;
}
```

**Enqueueing focus (prevent race conditions):**

```typescript
export function enqueueFocus(
  element: HTMLElement | null,
  options: { preventScroll?: boolean } = {}
) {
  // Use RAF to ensure DOM is settled
  requestAnimationFrame(() => {
    element?.focus({ preventScroll: options.preventScroll });
  });
}
```

**Active element (shadow DOM aware):**

```typescript
export function activeElement(doc: Document = document): Element | null {
  let active = doc.activeElement;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active;
}
```

---

### keyboard.ts

**React source:** `useListNavigation`

#### Core Logic

**Roving tabindex manager:**

```typescript
interface RovingFocusOptions {
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  rtl?: boolean;
}

export function createRovingFocus(items: () => HTMLElement[], options: RovingFocusOptions = {}) {
  let activeIndex = $state(-1);
  const { orientation = 'vertical', loop = true, rtl = false } = options;

  function getNextIndex(current: number, direction: 1 | -1): number {
    const list = items();
    let next = current + direction;

    if (loop) {
      if (next < 0) next = list.length - 1;
      if (next >= list.length) next = 0;
    } else {
      next = Math.max(0, Math.min(next, list.length - 1));
    }

    // Skip disabled items
    while (list[next]?.hasAttribute('disabled') || list[next]?.getAttribute('aria-disabled') === 'true') {
      next += direction;
      if (loop) {
        if (next < 0) next = list.length - 1;
        if (next >= list.length) next = 0;
      }
      if (next === current) break; // All disabled
    }

    return next;
  }

  function handleKeydown(event: KeyboardEvent) {
    const list = items();
    if (!list.length) return;

    const isVertical = orientation === 'vertical' || orientation === 'both';
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';

    let direction: 1 | -1 | null = null;

    if (event.key === 'ArrowDown' && isVertical) direction = 1;
    if (event.key === 'ArrowUp' && isVertical) direction = -1;
    if (event.key === 'ArrowRight' && isHorizontal) direction = rtl ? -1 : 1;
    if (event.key === 'ArrowLeft' && isHorizontal) direction = rtl ? 1 : -1;
    if (event.key === 'Home') { activeIndex = 0; list[0]?.focus(); return; }
    if (event.key === 'End') { activeIndex = list.length - 1; list[list.length - 1]?.focus(); return; }

    if (direction !== null) {
      event.preventDefault();
      activeIndex = getNextIndex(activeIndex, direction);
      list[activeIndex]?.focus();
    }
  }

  // Update tabindex on items
  $effect(() => {
    const list = items();
    list.forEach((item, i) => {
      item.tabIndex = i === activeIndex ? 0 : -1;
    });
  });

  return {
    get activeIndex() { return activeIndex; },
    set activeIndex(i: number) { activeIndex = i; },
    handleKeydown,
  };
}
```

**Grid navigation (for complex layouts):**

```typescript
interface GridNavigationOptions extends RovingFocusOptions {
  cols: number;
  itemSizes?: number[]; // For variable-sized items
}

export function createGridNavigation(items: () => HTMLElement[], options: GridNavigationOptions) {
  // ... similar to roving focus but with 2D navigation
  // Arrow up/down moves by column count
  // Arrow left/right moves within row
}
```

---

### typeahead.ts

**React source:** `useTypeahead`

#### Core Logic

```typescript
interface TypeaheadOptions {
  items: () => string[];
  onMatch: (index: number) => void;
  resetMs?: number; // Default 750ms
}

export function createTypeahead(options: TypeaheadOptions) {
  const { resetMs = 750 } = options;

  let buffer = '';
  let timeout: number;
  let prevIndex = -1;

  function handleKeydown(event: KeyboardEvent) {
    // Ignore modifier keys and non-printable
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length !== 1) return;

    // Space only meaningful if mid-search
    if (event.key === ' ' && !buffer) return;

    clearTimeout(timeout);
    buffer += event.key.toLowerCase();

    timeout = window.setTimeout(() => {
      buffer = '';
    }, resetMs);

    const items = options.items();

    // Rapid succession of same letter cycles through matches
    const allSameStart = items.every(text =>
      !text || text[0]?.toLowerCase() !== text[1]?.toLowerCase()
    );
    if (allSameStart && buffer.length === 1 && buffer === event.key.toLowerCase()) {
      // Find next match after previous
      const searchFrom = prevIndex + 1;
      const reordered = [...items.slice(searchFrom), ...items.slice(0, searchFrom)];
      const match = reordered.findIndex(text =>
        text?.toLowerCase().startsWith(buffer)
      );

      if (match !== -1) {
        const actualIndex = (match + searchFrom) % items.length;
        prevIndex = actualIndex;
        options.onMatch(actualIndex);
      }
      return;
    }

    // Normal prefix search
    const match = items.findIndex(text =>
      text?.toLowerCase().startsWith(buffer)
    );

    if (match !== -1) {
      prevIndex = match;
      options.onMatch(match);
    }
  }

  return {
    handleKeydown,
    reset() {
      buffer = '';
      clearTimeout(timeout);
    },
  };
}
```

---

### id.ts

**React source:** `useId` equivalent

```typescript
let counter = 0;

export function generateId(prefix = 'fui'): string {
  return `${prefix}-${++counter}`;
}

// Or use crypto API for truly unique IDs
export function generateUniqueId(): string {
  return crypto.randomUUID();
}
```

---

### scrollLock.ts

**React source:** Scroll lock utilities

#### Core Logic

```typescript
let lockCount = 0;
let originalStyles: { overflow: string; paddingRight: string } | null = null;

export function lockScroll() {
  lockCount++;
  if (lockCount > 1) return; // Already locked

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  originalStyles = {
    overflow: document.body.style.overflow,
    paddingRight: document.body.style.paddingRight,
  };

  document.body.style.overflow = 'hidden';

  // Prevent layout shift from scrollbar removal
  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }

  // iOS Safari requires position: fixed
  if (isIOS()) {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
  }
}

export function unlockScroll() {
  lockCount--;
  if (lockCount > 0) return; // Other locks still active

  if (originalStyles) {
    document.body.style.overflow = originalStyles.overflow;
    document.body.style.paddingRight = originalStyles.paddingRight;
  }

  if (isIOS()) {
    const scrollY = parseInt(document.body.style.top || '0', 10);
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, -scrollY);
  }

  originalStyles = null;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}
```

---

## Browser Detection Helpers

```typescript
export function isWebKit(): boolean {
  return /WebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
}

export function isMacSafari(): boolean {
  return /^(?=.*Safari)(?!.*Chrome).*/i.test(navigator.userAgent) &&
    /Mac/.test(navigator.platform);
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
```

---

## DOM Utilities

```typescript
// Shadow DOM aware containment check
export function contains(parent: Element | null, child: Element | null): boolean {
  if (!parent || !child) return false;

  const rootNode = child.getRootNode?.();
  if (rootNode instanceof ShadowRoot) {
    return parent.contains(rootNode.host);
  }

  return parent.contains(child);
}

// Get event target accounting for composed path
export function getTarget(event: Event): Element | null {
  if ('composedPath' in event) {
    return event.composedPath()[0] as Element;
  }
  return event.target as Element;
}

// Shadow DOM aware active element
export function activeElement(doc: Document = document): Element | null {
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

// Get tabbable elements
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll(selector))
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1') as HTMLElement[];
}
```
