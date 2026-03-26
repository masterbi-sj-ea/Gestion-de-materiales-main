import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userId?: number;
  userRoles?: string[];
  userEmail?: string;
  userName?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  const token = header.substring(7);

  try {
    if (!token || token === 'null' || token.trim() === '') {
      return res.status(401).json({ message: 'Token requerido' });
    }

    /* COMENTADO PARA LIMPIAR CONSOLA
    try {
      console.debug('authMiddleware: Authorization header length=', header ? header.length : 0);
      console.debug('authMiddleware: token (prefix) =', token ? token.substring(0, 10) + '...' : '<empty>');
    } catch (logErr) {
      // ignore logging errors
    }
    */

    const payload = jwt.verify(token, env.JWT_SECRET) as {
      id?: number;
      email?: string;
      nombre?: string;
      roles?: unknown;
    };
    if (payload.id) {
      req.userId = payload.id;
    }
    req.userEmail = typeof payload.email === 'string' ? payload.email : undefined;
    req.userName = typeof payload.nombre === 'string' ? payload.nombre : undefined;
    req.userRoles = Array.isArray(payload.roles)
      ? payload.roles.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    return next();
  } catch (err) {
    console.error('Error verificando JWT en authMiddleware', err && (err as Error).message ? (err as Error).message : err);
    // Mostrar header completo sólo en debug para entender qué envía el cliente (temporal)
    try {
      console.debug('authMiddleware: received Authorization header=', header);
    } catch (logErr) {}
    return res.status(401).json({ message: 'Token inválido' });
  }
}
