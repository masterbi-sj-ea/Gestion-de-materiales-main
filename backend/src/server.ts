import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import http from 'http';
import https from 'https';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { describeOriginPolicy, isOriginAllowed, normalizeOriginList } from './infra/originSecurity';

const PORT = env.PORT || 4000;
const normalizedAllowedOrigins = normalizeOriginList(env.CORS_ALLOWED_ORIGINS);

function buildServer() {
  if (env.HTTPS_KEY_PATH && env.HTTPS_CERT_PATH) {
    try {
      const key = fs.readFileSync(env.HTTPS_KEY_PATH);
      const cert = fs.readFileSync(env.HTTPS_CERT_PATH);
      return {
        protocol: 'https' as const,
        instance: https.createServer({ key, cert }, app),
      };
    } catch (error) {
      console.error('No se pudieron cargar los certificados HTTPS, se iniciará en HTTP', error);
    }
  }

  return {
    protocol: 'http' as const,
    instance: http.createServer(app),
  };
}

const serverConfig = buildServer();
const server = serverConfig.instance;
export const io = new Server(server, {
  cors: {
    origin: normalizedAllowedOrigins.length > 0 ? normalizedAllowedOrigins : true,
    methods: ["GET", "POST"]
  },
  allowRequest: (req, callback) => {
    const allowed = isOriginAllowed(req, normalizedAllowedOrigins, env.NODE_ENV !== 'production');
    if (!allowed) {
      console.warn(`[socket.io] Conexión rechazada para origin no permitido: ${req.headers.origin || 'sin-origin'}`);
    }
    callback(null, allowed);
  },
});

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} se unió a la sala: ${room}`);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
    console.log(`Socket ${socket.id} salió de la sala: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[server] Señal ${signal} recibida. Cerrando servidor HTTP y Socket.IO...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[server] Tiempo de espera agotado durante el shutdown. Saliendo con código 1.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  io.close(() => {
    server.close((error) => {
      clearTimeout(forceExitTimer);

      if (error) {
        console.error('[server] Error cerrando el servidor:', error);
        process.exit(1);
        return;
      }

      console.log('[server] Shutdown completado.');
      process.exit(0);
    });
  });
}

// Solo escuchar puerto cuando este archivo se ejecuta como entrypoint.
// Esto permite importar servicios en scripts/tests sin chocar con EADDRINUSE.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`API Gestión Materiales con WebSockets escuchando en ${serverConfig.protocol.toUpperCase()} puerto ${PORT}`);
    console.log(`[server] Política de orígenes: ${describeOriginPolicy(normalizedAllowedOrigins, env.NODE_ENV)}`);
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { server };
