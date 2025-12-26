import { fail, type ActionFailure } from "@sveltejs/kit";
import type { ZodType } from "zod";

/**
 * Validates form data against a Zod schema
 * Returns errors in a flat Record<string, string> format
 */
export function validateFormData<T>(
  formData: FormData,
  schema: ZodType<T>
):
  | { success: true; data: T }
  | { success: false; errors: Record<string, string>; data: Record<string, unknown> } {
  // Extract all form data
  const data: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });

  // Validate with Zod
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        errors[issue.path[0] as string] = issue.message;
      }
    });

    return { success: false, errors, data };
  }

  return { success: true, data: result.data };
}

/**
 * Helper to return a fail response with errors
 */
export function formError<T>(
  errors: Record<string, string>,
  data: Record<string, unknown>
): ActionFailure<{ errors: Record<string, string>; data: Record<string, unknown> }> {
  return fail(400, { errors, data });
}

/**
 * Helper to return a success response
 */
export function formSuccess<T = void>(data?: T): { success: true; data: T | undefined } {
  return { success: true, data };
}
