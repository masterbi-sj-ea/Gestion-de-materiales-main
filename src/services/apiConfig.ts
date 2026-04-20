function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeOrigin(value: string | undefined, fallback: string): string {
  const normalized = value ? stripTrailingSlashes(value.trim()) : '';

  if (!normalized) {
    return fallback;
  }

  return normalized.endsWith('/api')
    ? normalized.slice(0, -'/api'.length)
    : normalized;
}

function isHttpsOrigin(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeSocketTransportMode(
  value: string | undefined,
  socketOriginFallback: string,
): 'polling' | 'websocket' | 'auto' {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'websocket' || normalized === 'auto') {
    return normalized;
  }

  if (normalized === 'polling') {
    return 'polling';
  }

  return isHttpsOrigin(socketOriginFallback) ? 'auto' : 'polling';
}

function buildDefaultApiOrigin(): string {
  // En desarrollo con Vite seguimos apuntando al backend en :4009.
  if (typeof window !== 'undefined' && window.location?.origin) {
    if ((import.meta as any)?.env?.DEV) {
      return `${window.location.protocol}//${window.location.hostname}:4009`;
    }

    // En producción, el comportamiento por defecto debe ser mismo-origin.
    return window.location.origin;
  }

  // Fallback seguro para entornos sin window (tests/SSR).
  return 'http://localhost:4009';
}

function normalizeApiUrls() {
  const raw = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
  const rawSocketUrl = (import.meta as any)?.env?.VITE_SOCKET_URL as string | undefined;
  const rawSocketTransport = (import.meta as any)?.env?.VITE_SOCKET_TRANSPORT as string | undefined;
  const envValue = raw ? stripTrailingSlashes(raw.trim()) : '';

  // VITE_API_URL puede venir como:
  // - http://host:4009/api
  // - http://host:4009
  // Normalizamos para tener ambos: origin (sin /api) y base (con /api)
  if (envValue) {
    if (envValue.endsWith('/api')) {
      const apiOrigin = envValue.slice(0, -'/api'.length);
      const socketOrigin = normalizeOrigin(rawSocketUrl, apiOrigin);
      return {
        apiBaseUrl: envValue,
        apiOrigin,
        socketOrigin,
        socketTransportMode: normalizeSocketTransportMode(rawSocketTransport, socketOrigin),
      };
    }

    const socketOrigin = normalizeOrigin(rawSocketUrl, envValue);
    return {
      apiBaseUrl: `${envValue}/api`,
      apiOrigin: envValue,
      socketOrigin,
      socketTransportMode: normalizeSocketTransportMode(rawSocketTransport, socketOrigin),
    };
  }

  const apiOrigin = buildDefaultApiOrigin();
  const socketOrigin = normalizeOrigin(rawSocketUrl, apiOrigin);
  return {
    apiBaseUrl: `${apiOrigin}/api`,
    apiOrigin,
    socketOrigin,
    socketTransportMode: normalizeSocketTransportMode(rawSocketTransport, socketOrigin),
  };
}

const { apiBaseUrl, apiOrigin, socketOrigin, socketTransportMode } = normalizeApiUrls();

// Base con /api (ej: http://192.168.10.200:4009/api)
export const API_BASE_URL = apiBaseUrl;

// Origin sin /api (ej: http://192.168.10.200:4009)
export const API_ORIGIN = apiOrigin;

// Origin del socket (puede separarse del API si el despliegue lo requiere)
export const SOCKET_ORIGIN = socketOrigin;

export const SOCKET_TRANSPORTS = socketTransportMode === 'websocket'
  ? ['websocket'] as const
  : socketTransportMode === 'auto'
    ? ['polling', 'websocket'] as const
    : ['polling'] as const;

export const SOCKET_ALLOW_UPGRADE = socketTransportMode === 'auto';

export function apiUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${API_BASE_URL}${path}`;
}
