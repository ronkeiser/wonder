/**
 * Focus management utilities.
 *
 * Handles focus save/restore, configurable focus targets,
 * and shadow DOM aware focus detection.
 */

const LIST_LIMIT = 20;
let previouslyFocused: Element[] = [];

/**
 * Get the active element, traversing into shadow DOM if needed.
 */
export function activeElement(doc: Document = document): Element | null {
  let active = doc.activeElement;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active;
}

/**
 * Check if parent contains child, accounting for shadow DOM.
 */
export function contains(parent: Element | null, child: Element | null): boolean {
  if (!parent || !child) return false;

  const rootNode = child.getRootNode?.();
  if (rootNode instanceof ShadowRoot) {
    return parent.contains(rootNode.host);
  }

  return parent.contains(child);
}

/**
 * Get the target element from an event, accounting for composed path in shadow DOM.
 */
export function getTarget(event: Event): Element | null {
  const path = event.composedPath?.();
  if (path && path.length > 0) {
    return path[0] as Element;
  }
  return event.target as Element | null;
}

/**
 * Save the currently focused element to the stack.
 * Used before opening dialogs/popovers to enable focus restoration on close.
 */
export function saveFocus(): void {
  const active = activeElement();
  if (active && active.tagName !== 'BODY') {
    previouslyFocused.push(active);
    if (previouslyFocused.length > LIST_LIMIT) {
      previouslyFocused = previouslyFocused.slice(-LIST_LIMIT);
    }
  }
}

/**
 * Restore focus to the most recently saved element.
 * Cleans up disconnected elements before restoring.
 */
export function restoreFocus(): void {
  // Clean disconnected elements
  previouslyFocused = previouslyFocused.filter((el) => el.isConnected);

  const target = previouslyFocused.pop();
  if (target && 'focus' in target) {
    (target as HTMLElement).focus();
  }
}

/**
 * Type for configurable focus targets.
 * Can be an element, a CSS selector, or a function returning an element.
 */
export type FocusTarget = HTMLElement | string | (() => HTMLElement | null);

/**
 * Resolve a focus target to an actual element.
 */
export function resolveFocusTarget(
  target: FocusTarget,
  container?: HTMLElement,
): HTMLElement | null {
  if (typeof target === 'function') {
    return target();
  }
  if (typeof target === 'string') {
    return (container ?? document).querySelector(target);
  }
  return target;
}

/**
 * Queue a focus operation to run after the current frame.
 * Prevents race conditions when focusing elements during DOM updates.
 */
export function enqueueFocus(
  element: HTMLElement | null,
  options: { preventScroll?: boolean } = {},
): void {
  requestAnimationFrame(() => {
    element?.focus({ preventScroll: options.preventScroll });
  });
}

/**
 * Get all tabbable elements within a container.
 * Excludes focus guards (used internally by focus trap).
 */
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll(selector)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      !el.hasAttribute('data-focus-guard') &&
      el.getAttribute('tabindex') !== '-1',
  ) as HTMLElement[];
}
