/** Token lifecycle management */

import { CustomTypeRegistry, DDLGenerator, DMLGenerator } from '@wonder/schema';
import { tokenSchemaType, type Token } from '../execution/definitions';

export class TokenManager {
  private sql: SqlStorage;
  private ddl: DDLGenerator;
  private dml: DMLGenerator;

  constructor(sql: SqlStorage, customTypes: CustomTypeRegistry) {
    this.sql = sql;
    this.ddl = new DDLGenerator(tokenSchemaType, customTypes);
    this.dml = new DMLGenerator(tokenSchemaType, customTypes);
  }

  initialize(): void {
    this.createTable();
  }

  store(token: Token): void {
    const { statements, values } = this.dml.generateInsert('tokens', token);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  updateStatus(tokenId: string, status: Token['status']): void {
    const { statements, values } = this.dml.generateUpdate(
      'tokens',
      { status, updated_at: new Date().toISOString() },
      `id = '${tokenId}'`,
    );
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private createTable(): void {
    const tokenDDL = this.ddl.generateDDL('tokens');
    this.sql.exec(tokenDDL).toArray();
  }
}
