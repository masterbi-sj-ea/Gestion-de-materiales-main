import { getPool } from '../config/db';

export async function callSpOne<T>(name: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const pool = await getPool();
  const request = pool.request();

  for (const [key, value] of Object.entries(params)) {
    request.input(key, value as any);
  }

  const result = await request.execute<T>(name);
  return (result.recordset && result.recordset[0]) || null;
}

export async function callSpMany<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();

  for (const [key, value] of Object.entries(params)) {
    request.input(key, value as any);
  }

  const result = await request.execute<T>(name);
  return result.recordset || [];
}
