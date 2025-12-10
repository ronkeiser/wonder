import { DurableObject } from 'cloudflare:workers';

/**
 * WorkflowCoordinator Durable Object
 *
 * Hello World example.
 */
export class WorkflowCoordinator extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}
