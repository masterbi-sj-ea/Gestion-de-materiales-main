import sql, { ConnectionPool, config as SqlConfig } from 'mssql';
import { env } from './env';

let pool: ConnectionPool | null = null;

const sqlConfig: SqlConfig = {
  server: env.DB_SERVER,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: !env.DB_ENCRYPT
  }
};

export async function getPool(): Promise<ConnectionPool> {
  if (pool) return pool;

  pool = await sql.connect(sqlConfig);
  return pool;
}
