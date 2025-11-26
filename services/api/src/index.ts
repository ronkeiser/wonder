/**
 * Wonder API Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */

import { handleFetch } from './handlers/fetch';
import { handleQueue } from './handlers/queue';

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './domains/execution/coordinator';

// Export handler implementations
export default {
  fetch: handleFetch,
  queue: handleQueue,
};
