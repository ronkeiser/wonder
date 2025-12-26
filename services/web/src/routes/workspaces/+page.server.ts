import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/workspaces');
  if (!res.ok) {
    return { workspaces: [] };
  }
  const data = await res.json();
  return { workspaces: data.workspaces as Workspace[] };
};

export const actions: Actions = {
  select: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    const workspaceId = formData.get('workspaceId')?.toString();

    if (!workspaceId) {
      return fail(400, { error: 'Workspace ID is required' });
    }

    const isSecure = url.protocol === 'https:';
    cookies.set('workspace', workspaceId, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    throw redirect(302, '/');
  },
};
