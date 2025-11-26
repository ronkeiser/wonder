/**
 * HTTP fetch handler
 * Routes requests to appropriate APIs (REST, GraphQL, etc.)
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

  // Stage 0: Placeholder responses
  if (url.pathname.startsWith('/api/')) {
    return new Response('Wonder API - Stage 0', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  if (url.pathname.startsWith('/graphql')) {
    return new Response('GraphQL API - Coming Soon', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  return new Response('Not Found', { status: 404 });
}
