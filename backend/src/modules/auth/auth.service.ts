import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { callSpOne } from '../../infra/spCaller';

interface LoginSpResult {
  IdUsuario: number;
  NombreCompleto: string;
  Email: string;
  Activo: boolean;
  Roles: string | null; // STRING_AGG desde el SP
}

export async function loginService(email: string, _password: string) {
  if (!email) {
    throw new Error('Email requerido');
  }

  const row = await callSpOne<LoginSpResult>('sp_LoginUsuario', {
    Email: email,
    Password: _password
  });

  if (!row) {
    throw new Error('Usuario no encontrado');
  }

  if (!row.Activo) {
    throw new Error('Usuario inactivo');
  }

  const payload = {
    id: row.IdUsuario,
    email: row.Email,
    nombre: row.NombreCompleto,
    roles: row.Roles ? row.Roles.split(',') : []
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '8h' });

  return {
    user: payload,
    token
  };
}
