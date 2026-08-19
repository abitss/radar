import pg from 'pg';
import { schemaSql } from './schema.js';

const { Pool } = pg;
const globalForDb = globalThis;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Copy .env.example to .env.local and add a PostgreSQL connection string.');
  }
  if (!globalForDb.__radarPool) {
    const useSsl = process.env.DATABASE_SSL !== 'false' && !process.env.DATABASE_URL.includes('localhost');
    globalForDb.__radarPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }
  return globalForDb.__radarPool;
}

let schemaPromise;
export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().query(schemaSql).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

export async function query(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}

export async function transaction(fn) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function dbHealth() {
  try {
    const result = await query('SELECT now() AS now');
    return { ok: true, now: result.rows[0].now };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
