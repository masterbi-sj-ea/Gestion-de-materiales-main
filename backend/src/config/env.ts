import dotenv from 'dotenv';

dotenv.config();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i > 0 ? i : fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT ? Number(process.env.PORT) : 4000,
  TRUST_PROXY: parseBoolean(process.env.TRUST_PROXY, false),
  CORS_ALLOWED_ORIGINS: parseCsv(process.env.CORS_ALLOWED_ORIGINS),
  DB_SERVER: process.env.DB_SERVER || '',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_DATABASE: process.env.DB_DATABASE || '',
  DB_ENCRYPT: process.env.DB_ENCRYPT === 'true',
  DB_CONNECTION_TIMEOUT_MS: parsePositiveInt(process.env.DB_CONNECTION_TIMEOUT_MS, 30000),
  DB_REQUEST_TIMEOUT_MS: parsePositiveInt(process.env.DB_REQUEST_TIMEOUT_MS, 120000),
  DB_LOG_SLOW_MS: parsePositiveInt(process.env.DB_LOG_SLOW_MS, 2000),
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',

  // Tipo de cambio de referencia para normalizar importaciones de materiales a USD.
  MATERIALES_TIPO_CAMBIO_USD_TO_CORD: parsePositiveNumber(
    process.env.MATERIALES_TIPO_CAMBIO_USD_TO_CORD,
    36.80,
  ),

  // Carpeta raíz donde viven las imágenes (NAS / disco), ej: \\NAS02\Desarollo\Imagenes_items
  MATERIALES_IMG_ROOT: (process.env.MATERIALES_IMG_ROOT || '').trim() || null,
  WEB_PUSH_VAPID_PUBLIC_KEY: (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim() || null,
  WEB_PUSH_VAPID_PRIVATE_KEY: (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim() || null,
  WEB_PUSH_VAPID_SUBJECT: (process.env.WEB_PUSH_VAPID_SUBJECT || '').trim() || null,
  HTTPS_KEY_PATH: (process.env.HTTPS_KEY_PATH || '').trim() || null,
  HTTPS_CERT_PATH: (process.env.HTTPS_CERT_PATH || '').trim() || null,
};
