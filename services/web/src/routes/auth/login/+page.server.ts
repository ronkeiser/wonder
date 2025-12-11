import { createSessionCookie, verifyCredentials } from '$lib/auth';
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
  default: async (event: any) => {
    const { request, platform, url, cookies } = event;
    const formData = await request.formData();
    const username = formData.get('username')?.toString() || '';
    const password = formData.get('password')?.toString() || '';

    const env = platform?.env;
    if (!env) {
      console.error('No platform.env available');
      return fail(500, { error: 'Server configuration error' });
    }

    console.log('Auth attempt:', {
      username,
      hasPassword: !!password,
      hasAuthUsername: !!env.AUTH_USERNAME,
      hasAuthPassword: !!env.AUTH_PASSWORD,
      envAuthUsername: env.AUTH_USERNAME,
    });

    // Verify credentials
    if (!verifyCredentials(username, password, env)) {
      console.error('Credential verification failed');
      return fail(401, { error: 'Invalid username or password' });
    }

    // Get SESSION_SECRET from environment
    const secret = env.SESSION_SECRET;
    if (!secret) {
      console.error('SESSION_SECRET not configured');
      return fail(500, { error: 'Server configuration error' });
    }

    // Create session cookie
    const isSecure = url.protocol === 'https:';
    const cookieHeader = await createSessionCookie(secret, isSecure);

    // Set cookie and redirect
    cookies.set('wonder_session', cookieHeader.split('=')[1].split(';')[0], {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    throw redirect(302, '/');
  },
};
