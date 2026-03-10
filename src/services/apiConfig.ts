function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildDefaultApiOrigin(): string {
  // En runtime del navegador, usamos el mismo hostname/IP que el frontend.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  // Fallback seguro para entornos sin window (tests/SSR).
  return 'http://localhost:4000';
}

function normalizeApiUrls() {
  const raw = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
  const envValue = raw ? stripTrailingSlashes(raw.trim()) : '';

  // VITE_API_URL puede venir como:
  // - http://host:4000/api
  // - http://host:4000
  // Normalizamos para tener ambos: origin (sin /api) y base (con /api)
  if (envValue) {
    if (envValue.endsWith('/api')) {
      return {
        apiBaseUrl: envValue,
        apiOrigin: envValue.slice(0, -'/api'.length),
      };
    }

    return {
      apiBaseUrl: `${envValue}/api`,
      apiOrigin: envValue,
    };
  }

  const apiOrigin = buildDefaultApiOrigin();
  return {
    apiBaseUrl: `${apiOrigin}/api`,
    apiOrigin,
  };
}

const { apiBaseUrl, apiOrigin } = normalizeApiUrls();

// Base con /api (ej: http://192.168.10.200:4000/api)
export const API_BASE_URL = apiBaseUrl;

// Origin sin /api (ej: http://192.168.10.200:4000)
export const API_ORIGIN = apiOrigin;

export function apiUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${API_BASE_URL}${path}`;
}
