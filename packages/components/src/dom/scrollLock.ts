/**
 * Body scroll lock utilities.
 *
 * Prevents background scrolling when modals/dialogs are open.
 * Handles platform quirks like iOS Safari and scrollbar layout shift.
 */

interface OriginalStyles {
	overflow: string;
	paddingRight: string;
	position: string;
	top: string;
	width: string;
}

let lockCount = 0;
let originalStyles: OriginalStyles | null = null;
let scrollY = 0;

/**
 * Detect iOS Safari which requires special handling.
 */
function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

/**
 * Get the current scrollbar width.
 * Returns 0 if there's no scrollbar or on mobile.
 */
function getScrollbarWidth(): number {
	return window.innerWidth - document.documentElement.clientWidth;
}

/**
 * Lock body scroll.
 *
 * Supports nested calls - only the first call actually locks,
 * and only the last unlock call actually unlocks.
 *
 * Handles:
 * - Scrollbar width compensation (prevents layout shift)
 * - iOS Safari position: fixed requirement
 * - Nested lock/unlock calls
 *
 * @example
 * ```svelte
 * <script>
 *   import { lockScroll, unlockScroll } from './scrollLock';
 *
 *   let open = $state(false);
 *
 *   $effect(() => {
 *     if (open) {
 *       lockScroll();
 *       return () => unlockScroll();
 *     }
 *   });
 * </script>
 * ```
 */
export function lockScroll(): void {
	lockCount++;

	if (lockCount > 1) {
		// Already locked by another component
		return;
	}

	const scrollbarWidth = getScrollbarWidth();

	// Save original styles
	originalStyles = {
		overflow: document.body.style.overflow,
		paddingRight: document.body.style.paddingRight,
		position: document.body.style.position,
		top: document.body.style.top,
		width: document.body.style.width,
	};

	// Prevent scroll
	document.body.style.overflow = 'hidden';

	// Compensate for scrollbar removal to prevent layout shift
	if (scrollbarWidth > 0) {
		document.body.style.paddingRight = `${scrollbarWidth}px`;
	}

	// iOS Safari requires position: fixed to prevent background scroll
	if (isIOS()) {
		scrollY = window.scrollY;
		document.body.style.position = 'fixed';
		document.body.style.top = `-${scrollY}px`;
		document.body.style.width = '100%';
	}
}

/**
 * Unlock body scroll.
 *
 * Only actually unlocks when the lock count reaches 0.
 * Restores scroll position on iOS Safari.
 */
export function unlockScroll(): void {
	lockCount--;

	if (lockCount > 0) {
		// Still locked by another component
		return;
	}

	// Ensure we don't go negative
	lockCount = 0;

	if (!originalStyles) {
		return;
	}

	// Restore original styles
	document.body.style.overflow = originalStyles.overflow;
	document.body.style.paddingRight = originalStyles.paddingRight;

	// Restore iOS Safari state
	if (isIOS()) {
		document.body.style.position = originalStyles.position;
		document.body.style.top = originalStyles.top;
		document.body.style.width = originalStyles.width;

		// Restore scroll position
		window.scrollTo(0, scrollY);
	}

	originalStyles = null;
}

/**
 * Check if scroll is currently locked.
 */
export function isScrollLocked(): boolean {
	return lockCount > 0;
}

/**
 * Force unlock all scroll locks.
 * Use sparingly - this can break components expecting the lock.
 */
export function forceUnlockScroll(): void {
	lockCount = 1;
	unlockScroll();
}
