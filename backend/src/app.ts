import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { json, type Request, type Response } from 'express';
import { env } from './config/env';
import { createCorsOptionsDelegate } from './infra/originSecurity';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();
const FRONTEND_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const FRONTEND_DEFAULT_CACHE_CONTROL = 'public, max-age=3600';
const FRONTEND_NO_CACHE_CONTROL = 'no-cache, no-store, must-revalidate';

function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProtoHeader = req.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader;

  return forwardedProto?.split(',')[0]?.trim().toLowerCase() === 'https';
}

const secureHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'upgrade-insecure-requests': [],
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  originAgentCluster: true,
  referrerPolicy: { policy: 'no-referrer' },
});

const standardHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  originAgentCluster: false,
  referrerPolicy: { policy: 'no-referrer' },
});

function setFrontendStaticHeaders(res: Response, filePath: string) {
  const normalizedPath = filePath.toLowerCase();
  const fileName = path.basename(normalizedPath);

  if (normalizedPath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', FRONTEND_ASSET_CACHE_CONTROL);
    return;
  }

  if (fileName === 'index.html' || fileName === 'push-sw.js' || fileName === 'manifest.webmanifest') {
    res.setHeader('Cache-Control', FRONTEND_NO_CACHE_CONTROL);
    return;
  }

  res.setHeader('Cache-Control', FRONTEND_DEFAULT_CACHE_CONTROL);
}

function shouldServeSpaIndex(req: Request): boolean {
  if (req.method !== 'GET') {
    return false;
  }

  const requestPath = req.path || '/';
  if (
    requestPath === '/health'
    || requestPath.startsWith('/api')
    || requestPath.startsWith('/socket.io')
  ) {
    return false;
  }

  return Boolean(req.accepts('html'));
}

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);
app.use((req, res, next) => (isSecureRequest(req) ? secureHelmet : standardHelmet)(req, res, next));
app.use(cors(createCorsOptionsDelegate(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV)));
app.use(json());

// Rutas de API
app.use('/api', routes);

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gestion-materiales-backend' });
});

const publicPath = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicPath, 'index.html');
const hasFrontendBundle = fs.existsSync(indexPath);

if (hasFrontendBundle) {
  // Servir frontend estático compilado desde backend/public
  app.use(express.static(publicPath, {
    index: false,
    etag: true,
    lastModified: true,
    maxAge: '1h',
    setHeaders: setFrontendStaticHeaders,
  }));

  // Para SPA: solo rutas de navegación HTML, sin interceptar API/health/socket
  app.get('*', (req, res, next) => {
    if (!shouldServeSpaIndex(req)) {
      next();
      return;
    }

    res.setHeader('Cache-Control', FRONTEND_NO_CACHE_CONTROL);
    res.sendFile(indexPath, (error) => {
      if (error) {
        next(error);
      }
    });
  });
} else if (process.env.NODE_ENV !== 'test') {
  console.warn(`[static] No se encontró bundle del frontend en ${indexPath}. El backend iniciará en modo API-only.`);
}

app.use(errorHandler);

export default app;
