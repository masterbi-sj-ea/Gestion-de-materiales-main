import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Archivo demasiado grande' });
    }
    return res.status(400).json({ message: 'Error al procesar archivo', code: err.code });
  }

  console.error(err);
  return res.status(500).json({ message: 'Error interno del servidor' });
}
