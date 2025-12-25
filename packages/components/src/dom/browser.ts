/**
 * Browser detection utilities.
 *
 * Used for platform-specific workarounds in focus management,
 * scroll locking, and event handling.
 */

/**
 * Detect WebKit browsers (Safari, iOS browsers).
 * WebKit has specific quirks with IME composition and focus.
 */
export function isWebKit(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /WebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
}

/**
 * Detect macOS Safari specifically.
 * Safari on Mac has unique focus-visible behavior.
 */
export function isMacSafari(): boolean {
	if (typeof navigator === 'undefined') return false;
	return (
		/^(?=.*Safari)(?!.*Chrome).*/i.test(navigator.userAgent) && /Mac/.test(navigator.platform)
	);
}

/**
 * Detect iOS devices.
 * iOS Safari requires position: fixed for scroll locking.
 */
export function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

/**
 * Detect Firefox.
 * Firefox has specific focus and keyboard handling quirks.
 */
export function isFirefox(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /Firefox/.test(navigator.userAgent);
}

/**
 * Detect if the user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Detect if the layout direction is RTL.
 */
export function isRTL(element?: Element): boolean {
	const el = element ?? document.documentElement;
	return getComputedStyle(el).direction === 'rtl';
}
