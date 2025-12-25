/**
 * Unique ID generation for ARIA relationships.
 *
 * Components use these IDs to link elements via aria-labelledby,
 * aria-describedby, aria-controls, etc.
 */

let counter = 0;

/**
 * Generate a unique ID with an optional prefix.
 * Uses an incrementing counter for uniqueness within the session.
 */
export function generateId(prefix = 'fui'): string {
	return `${prefix}-${++counter}`;
}

/**
 * Generate a truly unique ID using the crypto API.
 * Use this when IDs need to be unique across sessions or workers.
 */
export function generateUniqueId(): string {
	return crypto.randomUUID();
}

/**
 * Create a set of related IDs for a component.
 * Useful for components that need multiple linked IDs (trigger, content, title, description).
 */
export function createIdGroup(prefix = 'fui'): {
	trigger: string;
	content: string;
	title: string;
	description: string;
} {
	const base = generateId(prefix);
	return {
		trigger: `${base}-trigger`,
		content: `${base}-content`,
		title: `${base}-title`,
		description: `${base}-description`,
	};
}