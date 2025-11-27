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

  // Workflow start endpoint for testing
  if (url.pathname === '/workflows/start' && request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        workflow_id: string;
        input: Record<string, unknown>;
      };

      const { createLogger } = await import('@wonder/logger');
      const { drizzle } = await import('drizzle-orm/d1');
      const { createServiceContext } = await import('~/infrastructure/context');

      const db = drizzle(env.DB);
      const logger = createLogger({ consoleOnly: false, db: env.DB });
      const serviceCtx = createServiceContext(db, env.AI, logger, ctx);

      const { startWorkflow } = await import('~/domains/execution/service');
      const workflowRun = await startWorkflow(
        {
          ...serviceCtx,
          WORKFLOW_COORDINATOR: env.WORKFLOW_COORDINATOR,
        },
        body.workflow_id,
        body.input,
      );

      return new Response(
        JSON.stringify({
          workflow_run_id: workflowRun.id,
          durable_object_id: workflowRun.durable_object_id,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // WebSocket event streaming: /coordinator/:doId/stream
  const coordinatorStreamMatch = url.pathname.match(/^\/coordinator\/([^/]+)\/stream$/);
  if (coordinatorStreamMatch) {
    const doId = coordinatorStreamMatch[1];
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket') {
      try {
        const id = env.WORKFLOW_COORDINATOR.idFromString(doId);
        const stub = env.WORKFLOW_COORDINATOR.get(id);

        // Create new request with /stream path for DO
        const doUrl = new URL(request.url);
        doUrl.pathname = '/stream';
        const doRequest = new Request(doUrl, request);

        return await stub.fetch(doRequest);
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: 'Invalid durable object ID',
            message: err instanceof Error ? err.message : String(err),
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          error: 'WebSocket upgrade required',
          received_upgrade: upgradeHeader,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  return new Response('Not Found - Use services/http worker for REST API', { status: 404 });
}
