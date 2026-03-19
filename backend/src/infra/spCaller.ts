import { getPool } from '../config/db';
import { env } from '../config/env';

export async function callSpOne<T, P extends object = Record<string, unknown>>(
  name: string,
  params: P = {} as P,
): Promise<T | null> {
  const startedAt = Date.now();
  const pool = await getPool();
  const request = pool.request();

  // Asegurar timeout consistente (evita default 15000ms de tedious)
  (request as any).timeout = env.DB_REQUEST_TIMEOUT_MS;

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    request.input(key, value as any);
  }

  try {
    const result = await request.execute<T>(name);
    return (result.recordset && result.recordset[0]) || null;
  } finally {
    const ms = Date.now() - startedAt;
    if (ms >= env.DB_LOG_SLOW_MS) {
      console.warn(`[SQL] ${name} tardó ${ms}ms`);
    }
  }
}

export async function callSpMany<T, P extends object = Record<string, unknown>>(
  name: string,
  params: P = {} as P,
): Promise<T[]> {
  const startedAt = Date.now();
  const pool = await getPool();
  const request = pool.request();

  // Asegurar timeout consistente (evita default 15000ms de tedious)
  (request as any).timeout = env.DB_REQUEST_TIMEOUT_MS;

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    request.input(key, value as any);
  }

  try {
    const result = await request.execute<T>(name);
    return result.recordset || [];
  } finally {
    const ms = Date.now() - startedAt;
    if (ms >= env.DB_LOG_SLOW_MS) {
      console.warn(`[SQL] ${name} tardó ${ms}ms`);
    }
  }
}
