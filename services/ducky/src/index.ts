/**
 * Ducky Service - Minimal example using logs service
 */
import { WorkerEntrypoint } from 'cloudflare:workers';

export default class DuckyService extends WorkerEntrypoint<Env> {
  // HTTP handler for testing
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/quack') {
      const result = await this.quack();
      return Response.json({ result });
    }

    if (url.pathname === '/swim') {
      const distance = parseInt(url.searchParams.get('distance') || '100');
      const result = await this.swim(distance);
      return Response.json({ result });
    }

    return Response.json({ error: 'Try /quack or /swim?distance=500' }, { status: 404 });
  }

  async quack(): Promise<string> {
    const logger = await this.env.LOGS.newLogger({
      service: 'ducky',
      environment: 'development',
    });

    logger({
      level: 'info',
      event_type: 'quack_called',
      message: 'Ducky says quack!',
    });

    return '🦆 Quack!';
  }

  async swim(distance: number): Promise<string> {
    const logger = this.env.LOGS.newLogger({
      service: 'ducky',
      environment: 'development',
    });

    await logger({
      level: 'info',
      event_type: 'swim_started',
      message: `Swimming ${distance}m`,
      metadata: { distance },
    });

    // Simulate swimming
    if (distance > 1000) {
      await logger({
        level: 'warn',
        event_type: 'swim_distance_high',
        message: 'Swimming a long distance',
        metadata: { distance, threshold: 1000 },
      });
    }

    await logger({
      level: 'info',
      event_type: 'swim_completed',
      message: 'Swim complete',
      metadata: { distance },
    });

    return `🦆 Swam ${distance}m!`;
  }
}
