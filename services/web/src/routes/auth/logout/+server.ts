import { redirect } from '@sveltejs/kit';

export const POST = async (event: any) => {
  const { cookies } = event;
  cookies.delete('wonder_session', { path: '/' });
  throw redirect(302, '/auth/login');
};
