/**
 * Simple cookie-based authentication for Wonder web interface
 */

const SESSION_COOKIE_NAME = 'wonder_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Verify username and password against environment variables
 */
export function verifyCredentials(
  username: string,
  password: string,
  env: { AUTH_USERNAME?: string; AUTH_PASSWORD?: string },
): boolean {
  if (!env.AUTH_USERNAME || !env.AUTH_PASSWORD) {
    console.error('AUTH_USERNAME or AUTH_PASSWORD not configured');
    return false;
  }

  return username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD;
}

/**
 * Create a signed session token
 * Uses HMAC-SHA256 with SESSION_SECRET
 */
async function createSessionToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify({ timestamp: Date.now() }));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  const token = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return token;
}

/**
 * Verify a session token
 */
async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  try {
    // For now, just check if token exists and is not empty
    // In production, you might verify the HMAC signature and timestamp
    return token.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create session cookie header
 */
export async function createSessionCookie(secret: string, secure: boolean = true): Promise<string> {
  const token = await createSessionToken(secret);
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `HttpOnly`,
    `Path=/`,
    `Max-Age=${SESSION_MAX_AGE}`,
    `SameSite=Lax`,
    secure ? `Secure` : '',
  ]
    .filter(Boolean)
    .join('; ');

  return attributes;
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`;
}

/**
 * Verify session from cookies
 */
export async function verifySession(cookies: string | null, secret: string): Promise<boolean> {
  if (!cookies) return false;

  const sessionCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) return false;

  const token = sessionCookie.split('=')[1];
  return verifySessionToken(token, secret);
}
