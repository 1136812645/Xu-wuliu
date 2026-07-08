import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import * as logger from './logger.js';

let pool: Pool | null = null;

function getDbConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
    return { uri: url };
  }

  const host = process.env.DB_HOST;
  if (!host) {
    return null;
  }

  return {
    host,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? 'root',
    database: process.env.DB_NAME ?? 'waybill_admin',
  };
}

export async function initializeDb(): Promise<boolean> {
  if (pool) {
    return true;
  }

  const config = getDbConfig();
  if (!config) {
    return false;
  }

  pool = 'uri' in config
    ? mysql.createPool({
        uri: config.uri,
        connectionLimit: 10,
        namedPlaceholders: true,
      })
    : mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: 10,
        namedPlaceholders: true,
      });

  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    pool = null;
    if (error instanceof Error) {
      logger.warn('db.initialize_failed', { error: error.message });
    }
    return false;
  }
}

export function isDbEnabled(): boolean {
  return Boolean(pool);
}

export async function withDbConnection<T>(handler: (conn: PoolConnection) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error('Database is not initialized.');
  }
  const conn = await pool.getConnection();
  try {
    return await handler(conn);
  } finally {
    conn.release();
  }
}

export async function dbQuery<T extends RowDataPacket[] = RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
  if (!pool) {
    throw new Error('Database is not initialized.');
  }
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

export async function dbExecute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  if (!pool) {
    throw new Error('Database is not initialized.');
  }
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result;
}
