/**
 * Ducky Service - Minimal example using logs and events services
 */
import { WorkerEntrypoint } from 'cloudflare:workers';

export default class DuckyService extends WorkerEntrypoint<Env> {
  // HTTP handler for testing
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    try {
      // Emit request received event
      this.emitEvent('request_received', {
        request_id: requestId,
        path: url.pathname,
        method: request.method,
      });

      if (url.pathname === '/quack') {
        const result = await this.quack(requestId);
        this.emitEvent('request_completed', {
          request_id: requestId,
          path: url.pathname,
          status: 200,
        });
        return Response.json({ result, request_id: requestId });
      }

      if (url.pathname === '/swim') {
        const distance = parseInt(url.searchParams.get('distance') || '100');
        const result = await this.swim(distance, requestId);
        this.emitEvent('request_completed', {
          request_id: requestId,
          path: url.pathname,
          status: 200,
        });
        return Response.json({ result, request_id: requestId });
      }

      this.emitEvent('request_not_found', {
        request_id: requestId,
        path: url.pathname,
      });
      return Response.json(
        { error: 'Try /quack or /swim?distance=500', request_id: requestId },
        { status: 404 },
      );
    } catch (error) {
      console.error('Request error:', error);
      return Response.json(
        { error: 'Internal server error', details: String(error) },
        { status: 500 },
      );
    }
  }

  private emitEvent(eventType: string, metadata: Record<string, unknown>) {
    // Fire and forget - events service handles waitUntil internally
    try {
      const emitter = this.env.EVENTS.newEmitter({
        workflow_run_id: 'ducky_service',
        workspace_id: 'ducky_workspace',
        project_id: 'ducky_project',
      });

      emitter.emit({
        event_type: eventType,
        sequence_number: Date.now(),
        message: `Ducky event: ${eventType}`,
        metadata,
      });
    } catch (error) {
      console.error('Failed to emit event:', error);
    }
  }

  async quack(requestId: string): Promise<string> {
    const logger = this.env.LOGS.newLogger({
      service: 'ducky',
      environment: 'development',
    });

    logger.info({
      event_type: 'quack_called',
      message: 'Ducky says quack!',
    });

    this.emitEvent('quack_started', {
      request_id: requestId,
      action: 'quack',
    });

    // Simulate some processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    this.emitEvent('quack_processing', {
      request_id: requestId,
      loudness: 'very_loud',
      duration_ms: 50,
    });

    this.emitEvent('quack_completed', {
      request_id: requestId,
      sound: '🦆 Quack!',
    });

    return '🦆 Quack!';
  }

  async swim(distance: number, requestId: string): Promise<string> {
    const logger = this.env.LOGS.newLogger({
      service: 'ducky',
      environment: 'development',
    });

    logger.info({
      event_type: 'swim_started',
      message: `Swimming ${distance}m`,
      metadata: { distance },
    });

    this.emitEvent('swim_started', {
      request_id: requestId,
      distance,
      start_time: Date.now(),
    });

    // Simulate swimming with progress events
    const segments = Math.min(5, Math.floor(distance / 100));
    for (let i = 1; i <= segments; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      this.emitEvent('swim_progress', {
        request_id: requestId,
        distance_covered: (distance * i) / segments,
        total_distance: distance,
        progress_percent: (i / segments) * 100,
        segment: i,
      });
    }

    // Simulate swimming
    if (distance > 1000) {
      logger.warn({
        event_type: 'swim_distance_high',
        message: 'Swimming a long distance',
        metadata: { distance, threshold: 1000 },
      });

      this.emitEvent('swim_distance_warning', {
        request_id: requestId,
        distance,
        threshold: 1000,
        warning: 'Long distance detected',
      });
    }

    if (distance > 500) {
      this.emitEvent('swim_milestone', {
        request_id: requestId,
        milestone: 'half_kilometer',
        distance,
      });
    }

    logger.info({
      event_type: 'swim_completed',
      message: 'Swim complete',
      metadata: { distance },
    });

    this.emitEvent('swim_completed', {
      request_id: requestId,
      distance,
      result: 'success',
      end_time: Date.now(),
    });

    return `🦆 Swam ${distance}m!`;
  }
}
