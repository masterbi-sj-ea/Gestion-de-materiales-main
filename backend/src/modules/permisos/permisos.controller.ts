import { Request, Response } from 'express';
import { obtenerPermisosPorRol, guardarPermisosRol } from './permisos.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { AuthRequest } from '../../middleware/auth';

export async function getPermisosPorRolController(req: Request, res: Response) {
  const idRol = Number(req.params.idRol);

  if (!Number.isInteger(idRol) || idRol <= 0) {
    return res.status(400).json({ message: 'idRol inválido' });
  }

  try {
    const permisos = await obtenerPermisosPorRol(idRol);
    return res.json(permisos);
  } catch (error: any) {
    console.error('Error en getPermisosPorRolController', error);
    return res.status(500).json({ message: 'Error al obtener permisos por rol' });
  }
}

export async function guardarPermisosRolController(req: AuthRequest, res: Response) {
  const idRol = Number(req.params.idRol);
  const permisos = req.body?.permisos as unknown;

  if (!Number.isInteger(idRol) || idRol <= 0) {
    return res.status(400).json({ message: 'idRol inválido' });
  }

  if (!Array.isArray(permisos)) {
    return res.status(400).json({ message: 'El cuerpo debe incluir un arreglo permisos' });
  }

  try {
    await guardarPermisosRol(idRol, permisos as any);

    try {
      await registrarAuditoria(req.userId ?? null, 'GUARDAR_PERMISOS_ROL', {
        modulo: 'Roles y Permisos',
        entidad: `Rol #${idRol}`,
        idRol,
        cantidadPermisos: (permisos as any[]).length,
        detalles: `Actualización de permisos del rol #${idRol} (${(permisos as any[]).length} permisos)`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría GUARDAR_PERMISOS_ROL', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en guardarPermisosRolController', error);
    return res.status(500).json({ message: 'Error al guardar permisos del rol' });
  }
}
