/**
 * Participant Operations
 *
 * Drizzle-based operations for conversation participant management.
 *
 * Participants track who has access to a conversation:
 * - Users who started or joined the conversation
 * - Agents added via loop-in mode
 */

import type { Emitter } from '@wonder/events';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { participants } from '../schema';
import type { Participant } from '../types';
import type { AgentDb } from './db';

/** Participant row type inferred from schema */
export type ParticipantRow = typeof participants.$inferSelect;

/** Add participant parameters */
export type AddParticipantParams = {
  conversationId: string;
  participant: Participant;
  addedByTurnId?: string;
};

/**
 * ParticipantManager manages conversation participants.
 *
 * Tracks users and agents who can access a conversation.
 * Used for loop-in mode where agents join existing conversations.
 */
export class ParticipantManager {
  private readonly db: AgentDb;
  private readonly emitter: Emitter;

  constructor(db: AgentDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Add a participant to a conversation.
   *
   * Returns the participant ID if added, null if already exists.
   */
  add(params: AddParticipantParams): string | null {
    const { conversationId, participant, addedByTurnId } = params;

    // Check if already a participant
    if (this.exists(conversationId, participant)) {
      this.emitter.emitTrace({
        type: 'operation.participants.already_exists',
        payload: {
          conversationId,
          participantType: participant.type,
          participantId: participant.type === 'user' ? participant.userId : participant.agentId,
        },
      });
      return null;
    }

    const id = ulid();
    const now = new Date();

    this.db
      .insert(participants)
      .values({
        id,
        conversationId,
        participantType: participant.type,
        participantId: participant.type === 'user' ? participant.userId : participant.agentId,
        addedAt: now,
        addedByTurnId: addedByTurnId ?? null,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.participants.added',
      payload: {
        id,
        conversationId,
        participantType: participant.type,
        participantId: participant.type === 'user' ? participant.userId : participant.agentId,
        addedByTurnId,
      },
    });

    return id;
  }

  /**
   * Check if a participant exists in a conversation.
   */
  exists(conversationId: string, participant: Participant): boolean {
    const participantId = participant.type === 'user' ? participant.userId : participant.agentId;

    const result = this.db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.conversationId, conversationId),
          eq(participants.participantType, participant.type),
          eq(participants.participantId, participantId),
        ),
      )
      .limit(1)
      .all();

    return result.length > 0;
  }

  /**
   * Get all participants for a conversation.
   */
  getForConversation(conversationId: string): ParticipantRow[] {
    return this.db
      .select()
      .from(participants)
      .where(eq(participants.conversationId, conversationId))
      .all();
  }

  /**
   * Get participants as Participant type array.
   */
  getParticipants(conversationId: string): Participant[] {
    const rows = this.getForConversation(conversationId);

    return rows.map((row): Participant => {
      if (row.participantType === 'user') {
        return { type: 'user', userId: row.participantId };
      } else {
        return { type: 'agent', agentId: row.participantId };
      }
    });
  }

  /**
   * Remove a participant from a conversation.
   *
   * Returns true if removed, false if not found.
   */
  remove(conversationId: string, participant: Participant): boolean {
    const participantId = participant.type === 'user' ? participant.userId : participant.agentId;

    // Check if exists first
    const exists = this.exists(conversationId, participant);
    if (!exists) {
      return false;
    }

    this.db
      .delete(participants)
      .where(
        and(
          eq(participants.conversationId, conversationId),
          eq(participants.participantType, participant.type),
          eq(participants.participantId, participantId),
        ),
      )
      .run();

    this.emitter.emitTrace({
      type: 'operation.participants.removed',
      payload: {
        conversationId,
        participantType: participant.type,
        participantId,
      },
    });

    return true;
  }
}
