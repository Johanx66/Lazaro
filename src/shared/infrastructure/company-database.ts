import { Pool } from 'pg';

export function createCompanyDbPool(connectionString: string, queryTimeoutMs: number): Pool {
  const pool = new Pool({
    connectionString,
    statement_timeout: queryTimeoutMs,
    max: 10,
  });

  return pool;
}