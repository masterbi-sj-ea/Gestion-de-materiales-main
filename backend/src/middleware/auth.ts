import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userId?: number;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  const token = header.substring(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { id?: number };
    if (payload.id) {
      req.userId = payload.id;
    }
    return next();
  } catch (err) {
    console.error('Error verificando JWT en authMiddleware', err);
    return res.status(401).json({ message: 'Token inválido' });
  }
}
