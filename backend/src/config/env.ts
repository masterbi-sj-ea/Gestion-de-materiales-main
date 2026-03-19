import dotenv from 'dotenv';

dotenv.config();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i > 0 ? i : fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT ? Number(process.env.PORT) : 4000,
  DB_SERVER: process.env.DB_SERVER || '',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_DATABASE: process.env.DB_DATABASE || '',
  DB_ENCRYPT: process.env.DB_ENCRYPT === 'true',
  DB_CONNECTION_TIMEOUT_MS: parsePositiveInt(process.env.DB_CONNECTION_TIMEOUT_MS, 30000),
  DB_REQUEST_TIMEOUT_MS: parsePositiveInt(process.env.DB_REQUEST_TIMEOUT_MS, 120000),
  DB_LOG_SLOW_MS: parsePositiveInt(process.env.DB_LOG_SLOW_MS, 2000),
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',

  // Carpeta raíz donde viven las imágenes (NAS / disco), ej: \\NAS02\Desarollo\Imagenes_items
  MATERIALES_IMG_ROOT: (process.env.MATERIALES_IMG_ROOT || '').trim() || null,
};
