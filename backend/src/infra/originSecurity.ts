import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import type { CorsOptions } from 'cors';
import type { Request } from 'express';

type HeaderValue = string | string[] | undefined;
type RequestLike = Pick<IncomingMessage, 'headers' | 'socket'>;

function firstHeaderValue(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizeHost(host: string | undefined): string | null {
  if (!host) return null;
  return host.split(',')[0]?.trim().toLowerCase() || null;
}

export function normalizeOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.host) {
      return null;
    }

    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function getOriginFromHeaders(headers: IncomingHttpHeaders): string | null {
  return normalizeOrigin(firstHeaderValue(headers.origin));
}

function getRequestHost(req: RequestLike): string | null {
  const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || firstHeaderValue(req.headers.host);
  return normalizeHost(host);
}

function getRequestProtocol(req: RequestLike): 'http:' | 'https:' {
  const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']);
  const normalizedForwardedProto = forwardedProto?.split(',')[0]?.trim().toLowerCase();

  if (normalizedForwardedProto === 'https' || normalizedForwardedProto === 'https:') {
    return 'https:';
  }

  if (normalizedForwardedProto === 'http' || normalizedForwardedProto === 'http:') {
    return 'http:';
  }

  const socketWithTls = req.socket as typeof req.socket & { encrypted?: boolean };
  return socketWithTls.encrypted ? 'https:' : 'http:';
}

function isSameOriginRequest(req: RequestLike, origin: string): boolean {
  const host = getRequestHost(req);
  if (!host) {
    return false;
  }

  const requestOrigin = `${getRequestProtocol(req)}//${host}`;
  return requestOrigin === origin;
}

export function normalizeOriginList(origins: string[]): string[] {
  return Array.from(new Set(origins.map((origin) => normalizeOrigin(origin)).filter(Boolean))) as string[];
}

export function isOriginAllowed(
  req: RequestLike,
  allowedOrigins: string[],
  allowAllWhenListEmpty: boolean,
): boolean {
  const origin = getOriginFromHeaders(req.headers);

  if (!origin) {
    return true;
  }

  if (allowAllWhenListEmpty && allowedOrigins.length === 0) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return isSameOriginRequest(req, origin);
}

export function createCorsOptionsDelegate(allowedOrigins: string[], nodeEnv: string) {
  const normalizedAllowedOrigins = normalizeOriginList(allowedOrigins);
  const allowAllWhenListEmpty = nodeEnv !== 'production';

  return (
    req: Request,
    callback: (error: Error | null, options?: CorsOptions) => void,
  ) => {
    const allowed = isOriginAllowed(req, normalizedAllowedOrigins, allowAllWhenListEmpty);
    callback(null, {
      origin: allowed,
      credentials: false,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    });
  };
}

export function describeOriginPolicy(allowedOrigins: string[], nodeEnv: string): string {
  const normalizedAllowedOrigins = normalizeOriginList(allowedOrigins);

  if (normalizedAllowedOrigins.length > 0) {
    return `mismo origen y allowlist explícita: ${normalizedAllowedOrigins.join(', ')}`;
  }

  if (nodeEnv === 'production') {
    return 'solo mismo origen y requests sin cabecera Origin';
  }

  return 'abierto en desarrollo cuando no existe allowlist explícita';
}