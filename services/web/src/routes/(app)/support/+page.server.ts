import { formError, formSuccess, validateFormData } from "@wonder/forms";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { supportRequestSchema } from "./schema";

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();

    const result = validateFormData(formData, supportRequestSchema);

    if (!result.success) {
      return formError(result.errors, result.data);
    }

    console.log("Valid support request:", result.data);

    // TODO: Send email, save to database, etc.

    return formSuccess();
  },
};
