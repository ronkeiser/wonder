/**
 * Prompt Spec Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createPromptSpecRoute, deletePromptSpecRoute, getPromptSpecRoute } from './spec';

/** /prompt-specs */
export const promptSpecs = new OpenAPIHono<{ Bindings: Env }>();

/** POST / */
promptSpecs.openapi(createPromptSpecRoute, async (c) => {
  const validated = c.req.valid('json');
  using promptSpecs = c.env.RESOURCES.promptSpecs();
  const result = await promptSpecs.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
promptSpecs.openapi(getPromptSpecRoute, async (c) => {
  const { id } = c.req.valid('param');
  using promptSpecs = c.env.RESOURCES.promptSpecs();
  const result = await promptSpecs.get(id);
  return c.json(result);
});

/** DELETE /{id} */
promptSpecs.openapi(deletePromptSpecRoute, async (c) => {
  const { id } = c.req.valid('param');
  using promptSpecs = c.env.RESOURCES.promptSpecs();
  await promptSpecs.delete(id);
  return c.json({ success: true });
});
