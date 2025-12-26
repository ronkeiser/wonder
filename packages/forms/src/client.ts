import { derived, writable, type Writable } from "svelte/store";
import type { ZodType } from "zod";
import { createEnhance } from "./actions";

export interface FormState<T = Record<string, unknown>> {
  errors: Record<string, string>;
  data: T;
  submitting: boolean;
  success?: boolean;
}

export interface FormOptions<T> {
  schema?: ZodType<T>;
  onSubmit?: (data: T) => void | Promise<void>;
}

/**
 * Creates form state management with automatic restoration from server errors
 * This is the simplest way to use forms - handles both client and server validation
 *
 * Initial values are inferred from the schema defaults.
 * You can optionally provide custom initial values.
 */
export function createFormState<T extends Record<string, unknown>>(
  schema: ZodType<T>,
  serverForm?: {
    errors?: Record<string, string>;
    data?: Partial<T> | unknown;
    success?: boolean;
  } | null,
  initialValues?: Partial<T>
) {
  // Parse with defaults to get the default values from the schema
  let schemaDefaults: T;
  try {
    // Try to parse an object with defaults applied
    const result = schema.safeParse({});
    if (result.success) {
      schemaDefaults = result.data;
    } else {
      // If safeParse fails, the schema doesn't have complete defaults
      // Fall back to empty object and rely on initialValues or serverForm data
      schemaDefaults = {} as T;
    }
  } catch {
    schemaDefaults = {} as T;
  }

  const defaults = { ...schemaDefaults, ...initialValues } as T;

  // Initialize with server data if available, otherwise use defaults
  // Handle the case where data might be void/unknown from formSuccess()
  const serverData =
    serverForm?.data && typeof serverForm.data === "object" ? (serverForm.data as Partial<T>) : {};
  const formValues = writable<T>({ ...defaults, ...serverData });
  const submitting = writable(false);

  const { clientErrors, validateField, clearErrors } = createFieldValidator(schema, () => {
    let currentValues: T = defaults;
    formValues.subscribe((v) => (currentValues = v))();
    return currentValues;
  });

  // Merge server and client errors
  const allErrors = derived([clientErrors], ([$clientErrors]) => ({
    ...(serverForm?.errors || {}),
    ...$clientErrors,
  }));

  const enhance = createEnhance(validateField, submitting);

  return {
    formValues,
    errors: allErrors,
    validateField,
    clearErrors,
    submitting,
    enhance,
    success: serverForm?.success,
  };
}

/**
 * Creates a field validator function for client-side validation
 */
export function createFieldValidator<T = Record<string, unknown>>(
  schema: ZodType<T>,
  currentData: () => Partial<T>
) {
  const clientErrors = writable<Record<string, string>>({});

  function validateField(fieldName: string, value: unknown) {
    const testData = {
      ...currentData(),
      [fieldName]: value,
    };

    const result = schema.safeParse(testData);

    if (!result.success) {
      const fieldError = result.error.issues.find((issue) => issue.path[0] === fieldName);
      if (fieldError) {
        clientErrors.update((errs) => ({ ...errs, [fieldName]: fieldError.message }));
      } else {
        clientErrors.update((errs) => {
          const { [fieldName]: _, ...rest } = errs;
          return rest;
        });
      }
    } else {
      clientErrors.update((errs) => {
        const { [fieldName]: _, ...rest } = errs;
        return rest;
      });
    }
  }

  function clearErrors() {
    clientErrors.set({});
  }

  return {
    clientErrors,
    validateField,
    clearErrors,
  };
}

/**
 * Creates a form store with validation and state management
 */
export function createForm<T = Record<string, unknown>>(
  initialData?: Partial<T>,
  options?: FormOptions<T>
) {
  const errors = writable<Record<string, string>>({});
  const data = writable<Partial<T>>(initialData || {});
  const submitting = writable(false);
  const clientErrors = writable<Record<string, string>>({});

  // Merge server errors and client errors
  const allErrors = derived([errors, clientErrors], ([$errors, $clientErrors]) => ({
    ...$errors,
    ...$clientErrors,
  }));

  /**
   * Validate a single field
   */
  function validateField(fieldName: string, value: unknown, currentData?: Partial<T>) {
    if (!options?.schema) return;

    const testData = {
      ...(currentData || {}),
      [fieldName]: value,
    };

    const result = options.schema.safeParse(testData);

    if (!result.success) {
      const fieldError = result.error.issues.find((issue) => issue.path[0] === fieldName);
      if (fieldError) {
        clientErrors.update((errs) => ({
          ...errs,
          [fieldName]: fieldError.message,
        }));
      } else {
        clientErrors.update((errs) => {
          const { [fieldName]: _, ...rest } = errs;
          return rest;
        });
      }
    } else {
      clientErrors.update((errs) => {
        const { [fieldName]: _, ...rest } = errs;
        return rest;
      });
    }
  }

  /**
   * Clear all client-side errors
   */
  function clearErrors() {
    clientErrors.set({});
  }

  /**
   * Update form state from server response
   */
  function updateFromServer(serverData: {
    errors?: Record<string, string>;
    data?: Partial<T>;
    success?: boolean;
  }) {
    if (serverData.errors) {
      errors.set(serverData.errors);
    }
    if (serverData.data) {
      data.set(serverData.data);
    }
  }

  return {
    errors: allErrors,
    data,
    submitting,
    validateField,
    clearErrors,
    updateFromServer,
  };
}
