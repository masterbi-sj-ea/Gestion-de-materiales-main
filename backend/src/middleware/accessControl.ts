import { Response, NextFunction } from 'express';
import { AuthRequest } from './authJwt';

export function accessControl(moduloId: string, accion: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    // TODO: llamar a SP de validación de acceso cuando esté disponible
    // Por ahora, simplemente continua
    next();
  };
}
