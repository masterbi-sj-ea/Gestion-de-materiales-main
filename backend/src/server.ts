import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import http from 'http';
import https from 'https';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';

const PORT = env.PORT || 4000;

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
    origin: "*", // En producción ajustar al dominio del frontend
    methods: ["GET", "POST"]
  }
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

// Solo escuchar puerto cuando este archivo se ejecuta como entrypoint.
// Esto permite importar servicios en scripts/tests sin chocar con EADDRINUSE.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`API Gestión Materiales con WebSockets escuchando en ${serverConfig.protocol.toUpperCase()} puerto ${PORT}`);
  });
}

export { server };
