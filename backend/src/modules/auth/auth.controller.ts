import { Request, Response } from 'express';
import { loginService } from './auth.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';

export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  try {
    const result = await loginService(email, password);

    try {
      const user = result.user as { id?: number; email?: string; nombre?: string };
      await registrarAuditoria(user.id ?? null, 'LOGIN', {
        modulo: 'Autenticación',
        entidad: user.email || user.nombre,
        email: user.email,
        nombre: user.nombre,
        detalles: `Inicio de sesión en el sistema${user.email ? ` (${user.email})` : ''}`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría de LOGIN', auditError);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Error en login' });
  }
}
