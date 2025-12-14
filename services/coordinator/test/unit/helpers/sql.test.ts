/**
 * Unit tests for helpers/sql.ts
 *
 * Tests the composeSqlMessage function which formats SQL queries
 * into human-readable trace messages.
 */

import { describe, expect, it } from 'vitest';
import { composeSqlMessage } from '../../../src/helpers/sql.js';

describe('composeSqlMessage', () => {
  describe('SELECT queries', () => {
    it('extracts table name from simple SELECT', () => {
      const result = composeSqlMessage('SELECT * FROM context_input', 1.5);
      expect(result).toBe('SELECT context_input (1.5ms)');
    });

    it('extracts table name with column list', () => {
      const result = composeSqlMessage('SELECT id, name FROM users WHERE id = 1', 0.8);
      expect(result).toBe('SELECT users (0.8ms)');
    });

    it('handles lowercase SQL', () => {
      const result = composeSqlMessage('select * from tokens', 2.0);
      expect(result).toBe('SELECT tokens (2ms)');
    });

    it('handles mixed case SQL', () => {
      const result = composeSqlMessage('Select id From context_state', 0.5);
      expect(result).toBe('SELECT context_state (0.5ms)');
    });
  });

  describe('INSERT queries', () => {
    it('extracts table name from INSERT INTO', () => {
      const result = composeSqlMessage('INSERT INTO tokens (id, status) VALUES (?, ?)', 3.2);
      expect(result).toBe('INSERT tokens (3.2ms)');
    });

    it('handles lowercase insert', () => {
      const result = composeSqlMessage('insert into context_output values (?)', 1.0);
      expect(result).toBe('INSERT context_output (1ms)');
    });
  });

  describe('UPDATE queries', () => {
    it('extracts table name from UPDATE', () => {
      const result = composeSqlMessage('UPDATE tokens SET status = ? WHERE id = ?', 2.1);
      expect(result).toBe('UPDATE tokens (2.1ms)');
    });

    it('handles lowercase update', () => {
      const result = composeSqlMessage('update workflow_runs set status = ?', 0.9);
      expect(result).toBe('UPDATE workflow_runs (0.9ms)');
    });
  });

  describe('DELETE queries', () => {
    it('extracts table name from DELETE FROM', () => {
      const result = composeSqlMessage('DELETE FROM branch_output_123', 1.7);
      expect(result).toBe('DELETE branch_output_123 (1.7ms)');
    });

    it('handles lowercase delete', () => {
      const result = composeSqlMessage('delete from temporary_data where expired = 1', 0.3);
      expect(result).toBe('DELETE temporary_data (0.3ms)');
    });
  });

  describe('CREATE TABLE queries', () => {
    it('extracts table name from CREATE TABLE', () => {
      const result = composeSqlMessage('CREATE TABLE context_input (id TEXT PRIMARY KEY)', 5.0);
      expect(result).toBe('CREATE context_input (5ms)');
    });

    it('handles CREATE TABLE IF NOT EXISTS', () => {
      const result = composeSqlMessage(
        'CREATE TABLE IF NOT EXISTS branch_output_abc (data JSON)',
        4.5,
      );
      expect(result).toBe('CREATE branch_output_abc (4.5ms)');
    });

    it('handles lowercase create', () => {
      const result = composeSqlMessage('create table new_table (col1 text)', 3.0);
      expect(result).toBe('CREATE new_table (3ms)');
    });
  });

  describe('DROP TABLE queries', () => {
    it('extracts table name from DROP TABLE', () => {
      const result = composeSqlMessage('DROP TABLE branch_output_xyz', 0.5);
      expect(result).toBe('DROP branch_output_xyz (0.5ms)');
    });

    it('handles DROP TABLE IF EXISTS', () => {
      const result = composeSqlMessage('DROP TABLE IF EXISTS temporary_data', 0.2);
      expect(result).toBe('DROP temporary_data (0.2ms)');
    });
  });

  describe('duration formatting', () => {
    it('rounds to 2 decimal places', () => {
      const result = composeSqlMessage('SELECT * FROM test', 1.234567);
      expect(result).toBe('SELECT test (1.23ms)');
    });

    it('handles whole numbers', () => {
      const result = composeSqlMessage('SELECT * FROM test', 5);
      expect(result).toBe('SELECT test (5ms)');
    });

    it('handles zero duration', () => {
      const result = composeSqlMessage('SELECT * FROM test', 0);
      expect(result).toBe('SELECT test (0ms)');
    });

    it('handles sub-millisecond duration', () => {
      const result = composeSqlMessage('SELECT * FROM test', 0.001);
      expect(result).toBe('SELECT test (0ms)');
    });

    it('handles very small duration with precision', () => {
      const result = composeSqlMessage('SELECT * FROM test', 0.05);
      expect(result).toBe('SELECT test (0.05ms)');
    });
  });

  describe('edge cases', () => {
    it('handles unknown SQL operation', () => {
      const result = composeSqlMessage('PRAGMA table_info(tokens)', 0.1);
      expect(result).toBe('PRAGMA (0.1ms)');
    });

    it('handles empty string', () => {
      const result = composeSqlMessage('', 0);
      expect(result).toBe('QUERY (0ms)');
    });

    it('handles whitespace-only string', () => {
      const result = composeSqlMessage('   ', 0);
      expect(result).toBe('QUERY (0ms)');
    });

    it('trims leading/trailing whitespace', () => {
      const result = composeSqlMessage('  SELECT * FROM test  ', 1.0);
      expect(result).toBe('SELECT test (1ms)');
    });

    it('handles multi-line SQL', () => {
      const result = composeSqlMessage(
        `SELECT *
         FROM tokens
         WHERE status = 'pending'`,
        2.5,
      );
      expect(result).toBe('SELECT tokens (2.5ms)');
    });

    it('handles SQL with no table match pattern', () => {
      const result = composeSqlMessage('BEGIN TRANSACTION', 0.01);
      expect(result).toBe('BEGIN (0.01ms)');
    });
  });
});
