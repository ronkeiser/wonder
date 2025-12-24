export interface PersistedOptions {
	cookie?: boolean;
}

export interface Persisted<T> {
	value: T;
}

const isBrowser = typeof window !== 'undefined';

export function createPersisted<T>(
	key: string,
	initial: T,
	options: PersistedOptions = {}
): Persisted<T> {
	const useCookie = options.cookie ?? false;

	const stored = isBrowser
		? (useCookie ? getCookie(key) : localStorage.getItem(key))
		: null;

	let value = $state<T>(stored !== null ? parse(stored, initial) : initial);

	$effect(() => {
		if (isBrowser) {
			const serialized = JSON.stringify(value);
			if (useCookie) {
				setCookie(key, serialized);
			} else {
				localStorage.setItem(key, serialized);
			}
		}
	});

	return {
		get value() {
			return value;
		},
		set value(v: T) {
			value = v;
		},
	};
}

function parse<T>(stored: string, fallback: T): T {
	try {
		return JSON.parse(stored);
	} catch {
		return fallback;
	}
}

function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
	return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 365): void {
	if (typeof document === 'undefined') return;
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
