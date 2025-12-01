/** Service layer for effects domain operations */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import type { ServiceContext } from '~/infrastructure/context';
import * as effectsRepo from './repository';

/** Create a new action */
export async function createAction(
  ctx: ServiceContext,
  data: {
    version: number;
    name: string;
    description?: string;
    kind:
      | 'llm_call'
      | 'mcp_tool'
      | 'http_request'
      | 'human_input'
      | 'update_context'
      | 'write_artifact'
      | 'workflow_call'
      | 'vector_search'
      | 'emit_metric';
    implementation: unknown;
    requires?: unknown;
    produces?: unknown;
    execution?: unknown;
    idempotency?: unknown;
  },
) {
  ctx.logger.info('action_create_started', { name: data.name, version: data.version });

  try {
    const action = await effectsRepo.createAction(ctx.db, {
      version: data.version,
      name: data.name,
      description: data.description ?? '',
      kind: data.kind,
      implementation: data.implementation,
      requires: data.requires ?? null,
      produces: data.produces ?? null,
      execution: data.execution ?? null,
      idempotency: data.idempotency ?? null,
    });

    ctx.logger.info('action_created', {
      action_id: action.id,
      name: action.name,
      version: action.version,
    });

    return action;
  } catch (error) {
    const dbError = extractDbError(error);

    if (dbError.constraint === 'unique') {
      ctx.logger.warn('action_create_conflict', {
        name: data.name,
        version: data.version,
        field: dbError.field,
      });
      throw new ConflictError(
        `Action with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    if (dbError.constraint === 'foreign_key') {
      ctx.logger.warn('action_create_invalid_reference', { name: data.name });
      throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
    }

    ctx.logger.error('action_create_failed', { name: data.name, error: dbError.message });
    throw error;
  }
}

/** Get an action by ID */
export async function getAction(ctx: ServiceContext, actionId: string) {
  ctx.logger.info('action_get', { action_id: actionId });

  const action = await effectsRepo.getAction(ctx.db, actionId);
  if (!action) {
    ctx.logger.warn('action_not_found', { action_id: actionId });
    throw new NotFoundError(`Action not found: ${actionId}`, 'action', actionId);
  }

  return action;
}

/** Get an action by ID and version */
export async function getActionVersion(ctx: ServiceContext, actionId: string, version: number) {
  ctx.logger.info('action_get_version', { action_id: actionId, version });

  const action = await effectsRepo.getActionVersion(ctx.db, actionId, version);
  if (!action) {
    ctx.logger.warn('action_version_not_found', { action_id: actionId, version });
    throw new NotFoundError(`Action not found: ${actionId} version ${version}`, 'action', actionId);
  }

  return action;
}

/** List actions by kind */
export async function listActionsByKind(
  ctx: ServiceContext,
  kind:
    | 'llm_call'
    | 'mcp_tool'
    | 'http_request'
    | 'human_input'
    | 'update_context'
    | 'write_artifact'
    | 'workflow_call'
    | 'vector_search'
    | 'emit_metric',
) {
  ctx.logger.info('action_list_by_kind', { kind });
  return await effectsRepo.listActionsByKind(ctx.db, kind);
}

/** Delete an action */
export async function deleteAction(ctx: ServiceContext, actionId: string, version?: number) {
  ctx.logger.info('action_delete_started', { action_id: actionId, version });

  // Verify action exists
  if (version !== undefined) {
    const action = await effectsRepo.getActionVersion(ctx.db, actionId, version);
    if (!action) {
      ctx.logger.warn('action_version_not_found', { action_id: actionId, version });
      throw new NotFoundError(
        `Action not found: ${actionId} version ${version}`,
        'action',
        actionId,
      );
    }
  } else {
    const action = await effectsRepo.getAction(ctx.db, actionId);
    if (!action) {
      ctx.logger.warn('action_not_found', { action_id: actionId });
      throw new NotFoundError(`Action not found: ${actionId}`, 'action', actionId);
    }
  }

  await effectsRepo.deleteAction(ctx.db, actionId, version);
  ctx.logger.info('action_deleted', { action_id: actionId, version });
}
