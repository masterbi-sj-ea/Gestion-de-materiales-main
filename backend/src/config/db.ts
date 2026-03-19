import sql, { ConnectionPool, config as SqlConfig } from 'mssql';
import { env } from './env';

let pool: ConnectionPool | null = null;

const sqlConfig: SqlConfig = {
  server: env.DB_SERVER,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  connectionTimeout: env.DB_CONNECTION_TIMEOUT_MS,
  requestTimeout: env.DB_REQUEST_TIMEOUT_MS,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: !env.DB_ENCRYPT,
    enableArithAbort: true
  }
};

export async function getPool(): Promise<ConnectionPool> {
  if (pool) return pool;

  pool = await sql.connect(sqlConfig);
  return pool;
}
