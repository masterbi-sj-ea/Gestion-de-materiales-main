import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import {
  obtenerPermisosModuloPorRoles,
  type PermisoAccionesModulo,
} from '../modules/permisos/permisos.service';

type AccionPermiso = 'ver' | 'crear' | 'editar' | 'aprobar' | 'eliminar';

const actionMap: Record<AccionPermiso, keyof PermisoAccionesModulo> = {
  ver: 'puedeVer',
  crear: 'puedeCrear',
  editar: 'puedeEditar',
  aprobar: 'puedeAprobar',
  eliminar: 'puedeEliminar',
};

function isSuperUserRole(roles: string[] | null | undefined): boolean {
  return (roles || []).some((rol) => {
    const normalized = String(rol || '').trim().toLowerCase();
    return normalized === 'administrador' || normalized === 'admin' || normalized === 'administrator';
  });
}

export function requireModulePermission(moduloCodigo: string, accion: AccionPermiso = 'ver') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    if (isSuperUserRole(req.userRoles)) {
      return next();
    }

    try {
      const permisos = await obtenerPermisosModuloPorRoles(req.userRoles ?? [], moduloCodigo);
      const permissionKey = actionMap[accion];

      if (!permisos || !permisos[permissionKey]) {
        return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' });
      }

      return next();
    } catch (error) {
      console.error('Error validando acceso al módulo', { moduloCodigo, accion, error });
      return res.status(500).json({ message: 'No se pudo validar el permiso del módulo' });
    }
  };
}

export const accessControl = requireModulePermission;
