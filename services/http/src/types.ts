/**
 * HTTP Service Type Definitions
 * Extends Hono's environment types with logger and request tracking
 */

import type { Logger } from '@wonder/logs';

/**
 * Extended Hono environment for HTTP service
 * Provides type-safe access to logger and request tracking via c.var
 */
export type HttpEnv = {
  Bindings: Env;
  Variables: {
    logger: Logger;
    requestId: string;
  };
};
