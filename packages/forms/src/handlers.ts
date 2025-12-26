import type { Writable } from "svelte/store";

/**
 * Creates an input event handler that updates a form store field.
 *
 * @param store - The writable store containing form values
 * @param fieldName - The name of the field to update
 * @returns An event handler function for input/textarea elements
 */
export function createFieldHandler(store: Writable<Record<string, string>>, fieldName: string) {
  return (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    store.update((v) => ({ ...v, [fieldName]: target.value }));
  };
}
