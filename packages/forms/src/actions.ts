import { enhance as svelteKitEnhance } from "$app/forms";
import type { SubmitFunction } from "@sveltejs/kit";
import type { Action } from "svelte/action";
import type { Writable } from "svelte/store";

/**
 * Creates a form action with validation and progressive enhancement
 */
export function createEnhance(
  onValidate: (name: string, value: string) => void,
  submitting: Writable<boolean>
): Action<HTMLFormElement> {
  return (formElement) => {
    function handleBlur(e: Event) {
      const target = e.target as HTMLElement;

      // Check if the target is an input, textarea, or select
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        const name = target.name;
        const value = target.value;

        if (name) {
          onValidate(name, value);
        }
      }
    }

    // Progressive enhancement with loading state
    const submitFunction: SubmitFunction = () => {
      submitting.set(true);
      return async ({ update }) => {
        await update();
        submitting.set(false);
      };
    };

    // Use capture phase to catch blur events from all children
    formElement.addEventListener("blur", handleBlur, true);

    // Apply progressive enhancement
    const enhanceCleanup = svelteKitEnhance(formElement, submitFunction);

    return {
      destroy() {
        formElement.removeEventListener("blur", handleBlur, true);
        enhanceCleanup?.destroy();
      },
    };
  };
}

/**
 * Form action that handles validation and progressive enhancement
 * Usage: <form use:formEnhance={{ onValidate: validateField, submitting }}>
 * @deprecated Use createFormEnhance from createFormState instead
 */
export const formEnhance: Action<
  HTMLFormElement,
  {
    onValidate?: (name: string, value: string) => void;
    submitting?: Writable<boolean>;
  }
> = (formElement, params) => {
  function handleBlur(e: Event) {
    const target = e.target as HTMLElement;

    // Check if the target is an input, textarea, or select
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      const name = target.name;
      const value = target.value;

      if (name && params?.onValidate) {
        params.onValidate(name, value);
      }
    }
  }

  // Progressive enhancement with loading state
  const submitFunction: SubmitFunction = () => {
    params?.submitting?.set(true);
    return async ({ update }) => {
      await update();
      params?.submitting?.set(false);
    };
  };

  // Use capture phase to catch blur events from all children
  formElement.addEventListener("blur", handleBlur, true);

  // Apply progressive enhancement
  const enhanceCleanup = svelteKitEnhance(formElement, submitFunction);

  return {
    update(newParams) {
      params = newParams;
    },
    destroy() {
      formElement.removeEventListener("blur", handleBlur, true);
      enhanceCleanup?.destroy();
    },
  };
};
