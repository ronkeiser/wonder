/**
 * Generated client for Wonder API
 * This file was auto-generated. Do not edit manually.
 */

import type { paths } from './schema.js';
import type { SchemaType } from '@wonder/context';
import { createCollection } from '../client-base.js';

/**
 * Create a typed client for the Wonder API
 * @param baseClient - The underlying HTTP client (from openapi-fetch)
 */
export function createClient(baseClient: any) {
  return {
    workspaces: createCollection(baseClient, '/api/workspaces'),
    projects: createCollection(baseClient, '/api/projects'),
    actions: createCollection(baseClient, '/api/actions'),
    "prompt-specs": createCollection(baseClient, '/api/prompt-specs'),
    "model-profiles": createCollection(baseClient, '/api/model-profiles'),
    "workflow-defs": createCollection(baseClient, '/api/workflow-defs'),
    workflows: createCollection(baseClient, '/api/workflows'),
    logs: createCollection(baseClient, '/api/logs')
  };
}
