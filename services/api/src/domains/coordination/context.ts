/** Context storage and schema management */

import { CustomTypeRegistry, DDLGenerator, DMLGenerator, type SchemaType } from '@wonder/schema';
import type { Context } from '../execution/definitions';

export class ContextManager {
  private sql: SqlStorage;
  private customTypes: CustomTypeRegistry;
  private ddl?: DDLGenerator;
  private dml?: DMLGenerator;
  private workflowRunId?: string;
  private workflowDefId?: string;

  constructor(sql: SqlStorage, customTypes: CustomTypeRegistry) {
    this.sql = sql;
    this.customTypes = customTypes;
  }

  initialize(
    workflowRunId: string,
    workflowDefId: string,
    inputSchema: SchemaType,
    outputSchema: SchemaType,
  ): void {
    this.workflowRunId = workflowRunId;
    this.workflowDefId = workflowDefId;

    // Create context schema (Stage 0: simplified with JSON for state)
    const contextSchemaType: SchemaType = {
      type: 'object',
      properties: {
        workflow_run_id: { type: 'string' },
        workflow_def_id: { type: 'string' },
        input: inputSchema,
        state: { type: 'object' }, // Simplified: store as JSON
        output: outputSchema,
      },
      required: ['workflow_run_id', 'workflow_def_id', 'input'],
    };

    // Initialize DDL/DML generators
    this.ddl = new DDLGenerator(contextSchemaType, this.customTypes, {
      nestedObjectStrategy: 'json',
      arrayStrategy: 'json',
    });

    this.dml = new DMLGenerator(contextSchemaType, this.customTypes, {
      nestedObjectStrategy: 'json',
      arrayStrategy: 'json',
    });

    // Create table
    this.createTable();
  }

  store(context: Context): void {
    if (!this.dml) {
      throw new Error('Context manager not initialized');
    }

    const contextWithMeta = {
      workflow_run_id: this.workflowRunId,
      workflow_def_id: this.workflowDefId,
      ...context,
    };

    const { statements, values } = this.dml.generateInsert('context', contextWithMeta);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  get(): Context {
    const contextRow = this.sql.exec('SELECT * FROM context LIMIT 1').toArray();
    if (contextRow.length === 0) {
      throw new Error('Context not found');
    }

    const row = contextRow[0];
    return {
      input: row.input ? JSON.parse(row.input as string) : {},
      state: row.state ? JSON.parse(row.state as string) : {},
      output: row.output ? JSON.parse(row.output as string) : undefined,
      artifacts: {},
    };
  }

  update(context: Context): void {
    if (!this.dml) {
      throw new Error('Context manager not initialized');
    }

    const contextWithMeta = {
      workflow_run_id: this.workflowRunId,
      workflow_def_id: this.workflowDefId,
      ...context,
    };

    const { statements, values } = this.dml.generateUpdate(
      'context',
      contextWithMeta,
      '1=1', // Stage 0: single row table
    );
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private createTable(): void {
    if (!this.ddl) {
      throw new Error('Context manager not initialized');
    }
    const contextDDL = this.ddl.generateDDL('context');
    this.sql.exec(contextDDL).toArray();
  }
}
