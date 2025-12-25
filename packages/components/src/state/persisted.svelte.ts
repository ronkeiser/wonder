export interface Persisted<T> {
	value: T;
}

const isBrowser = typeof window !== 'undefined';

export function createPersisted<T>(key: string, initial: T): Persisted<T> {
	let value = $state<T>(initial);

	$effect(() => {
		if (isBrowser) {
			setCookie(key, JSON.stringify(value));
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

function setCookie(name: string, value: string, days = 365): void {
	if (typeof document === 'undefined') return;
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
