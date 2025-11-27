/** Event recording and retrieval */

import { CustomTypeRegistry, DDLGenerator, DMLGenerator } from '@wonder/schema';
import { eventSchemaType, type EventKind } from '../execution/definitions';

export class EventManager {
  private sql: SqlStorage;
  private ddl: DDLGenerator;
  private dml: DMLGenerator;
  private sequenceNumber: number = 0;
  private broadcastCallback?: (kind: EventKind, payload: Record<string, unknown>) => void;

  constructor(sql: SqlStorage, customTypes: CustomTypeRegistry) {
    this.sql = sql;
    this.ddl = new DDLGenerator(eventSchemaType, customTypes);
    this.dml = new DMLGenerator(eventSchemaType, customTypes);
  }

  initialize(): void {
    this.createTable();
  }

  /**
   * Set callback for broadcasting events to WebSocket clients.
   */
  setBroadcastCallback(
    callback: (kind: EventKind, payload: Record<string, unknown>) => void,
  ): void {
    this.broadcastCallback = callback;
  }

  emit(kind: EventKind, payload: Record<string, unknown>): void {
    this.sequenceNumber++;

    const event = {
      sequence_number: this.sequenceNumber,
      kind,
      payload: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
    };

    const { statements, values } = this.dml.generateInsert('events', event);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }

    // Broadcast to WebSocket clients if callback is set
    if (this.broadcastCallback) {
      this.broadcastCallback(kind, payload);
    }
  }

  getPending(workflowRunId: string): Array<{
    workflow_run_id: string;
    sequence_number: number;
    kind: EventKind;
    payload: string;
    timestamp: string;
  }> {
    const eventsRows = this.sql.exec('SELECT * FROM events ORDER BY sequence_number').toArray();

    return eventsRows.map((row) => ({
      workflow_run_id: workflowRunId,
      sequence_number: row.sequence_number as number,
      kind: row.kind as EventKind,
      payload: row.payload as string,
      timestamp: row.timestamp as string,
    }));
  }

  private createTable(): void {
    const eventDDL = this.ddl.generateDDL('events');
    this.sql.exec(eventDDL).toArray();
  }
}
