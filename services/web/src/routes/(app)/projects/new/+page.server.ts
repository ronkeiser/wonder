import { formError, formSuccess, validateFormData } from "@wonder/forms";
import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createProjectSchema } from "./schema";

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, locals }) => {
    const formData = await request.formData();

    const result = validateFormData(formData, createProjectSchema);

    if (!result.success) {
      return formError(result.errors, result.data);
    }

    const { workspaceId } = locals;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: result.data.name,
        description: result.data.description,
      }),
    });

    if (!res.ok) {
      return formError({ name: "Failed to create project" }, result.data);
    }

    const data = await res.json();

    redirect(302, `/projects/${data.projectId}`);
  },
};
