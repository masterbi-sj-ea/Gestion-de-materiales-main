import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';

const PORT = env.PORT || 4000;

const server = http.createServer(app);
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

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Solo escuchar puerto cuando este archivo se ejecuta como entrypoint.
// Esto permite importar servicios en scripts/tests sin chocar con EADDRINUSE.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`API Gestión Materiales con WebSockets escuchando en puerto ${PORT}`);
  });
}

export { server };
