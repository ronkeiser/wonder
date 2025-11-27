/**
 * HTTP fetch handler
 * Placeholder - HTTP API now handled by services/http worker
 */

export async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  // Health check
  if (url.pathname === '/health') {
    return new Response('OK', { status: 200 });
  }

  return new Response('Not Found - Use services/http worker for REST API', { status: 404 });
}
