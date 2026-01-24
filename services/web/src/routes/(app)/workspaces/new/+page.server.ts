import { formError } from '@wonder/forms';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createWorkspaceSchema } from './schema';
import { validateFormData } from '@wonder/forms';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, cookies, url }) => {
    const formData = await request.formData();

    const result = validateFormData(formData, createWorkspaceSchema);

    if (!result.success) {
      return formError(result.errors, result.data);
    }

    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: result.data.name,
      }),
    });

    if (!res.ok) {
      return formError({ name: 'Failed to create workspace' }, result.data);
    }

    const data = await res.json();

    const isSecure = url.protocol === 'https:';
    cookies.set('workspace', data.workspaceId, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    redirect(302, '/workspaces');
  },
};
