import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { json } from 'express';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(json());

// Rutas de API
app.use('/api', routes);

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gestion-materiales-backend' });
});

// Servir frontend estático compilado desde backend/public
const publicPath = path.join(__dirname, '..', 'public');

app.use(express.static(publicPath));

// Para SPA: cualquier ruta no API la resuelve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.use(errorHandler);

export default app;
