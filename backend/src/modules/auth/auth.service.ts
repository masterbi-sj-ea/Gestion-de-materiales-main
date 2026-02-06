import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { callSpOne } from '../../infra/spCaller';

interface LoginSpResult {
  IdUsuario: number;
  NombreCompleto: string;
  Email: string;
  Activo: boolean;
  HashPassword: Buffer | null;
  Roles: string | null; // STRING_AGG desde el SP
}

export async function loginService(email: string, passwordString: string) {
  if (!email || !passwordString) {
    throw new Error('Email y contraseña requeridos');
  }

  const row = await callSpOne<LoginSpResult>('sp_LoginUsuario', {
    Email: email,
    Password: passwordString
  });

  if (!row) {
    throw new Error('Usuario no encontrado');
  }

  if (!row.Activo) {
    throw new Error('Usuario inactivo');
  }

  // Validación de Contraseña
  // Verificamos si la contraseña coincide con el binario almacenado (Legacy: UTF-16LE directo)
  let isValid = false;
  if (row.HashPassword) {
    const inputBuffer = Buffer.from(passwordString, 'utf16le');
    if (inputBuffer.equals(row.HashPassword)) {
      isValid = true;
    }
  }

  if (!isValid) {
    throw new Error('Credenciales inválidas');
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
