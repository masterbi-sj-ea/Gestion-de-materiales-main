import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import {
  obtenerPermisosModuloPorRoles,
  type PermisoAccionesModulo,
} from '../modules/permisos/permisos.service';

export type AccionPermiso = 'ver' | 'crear' | 'editar' | 'aprobar' | 'eliminar';

interface ModulePermissionRequirement {
  moduloCodigo: string;
  accion?: AccionPermiso;
}

const actionMap: Record<AccionPermiso, keyof PermisoAccionesModulo> = {
  ver: 'puedeVer',
  crear: 'puedeCrear',
  editar: 'puedeEditar',
  aprobar: 'puedeAprobar',
  eliminar: 'puedeEliminar',
};

function normalizeRoleKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

function isSuperUserRole(roles: string[] | null | undefined): boolean {
  return (roles || []).some((rol) => {
    const normalized = normalizeRoleKey(rol);
    return normalized === 'administrador' || normalized === 'admin' || normalized === 'administrator';
  });
}

export async function userHasModulePermission(
  userRoles: string[] | null | undefined,
  moduloCodigo: string,
  accion: AccionPermiso,
): Promise<boolean> {
  if (isSuperUserRole(userRoles)) {
    return true;
  }

  const normalizedModulo = String(moduloCodigo || '').trim().toLowerCase();
  if (!normalizedModulo) {
    return false;
  }

  const permisos = await obtenerPermisosModuloPorRoles(userRoles ?? [], normalizedModulo);
  const permissionKey = actionMap[accion];
  return !!permisos?.[permissionKey];
}

export async function hasRequestModulePermission(
  req: AuthRequest,
  moduloCodigo: string,
  accion: AccionPermiso = 'ver',
): Promise<boolean> {
  if (!req.userId) {
    return false;
  }

  if (isSuperUserRole(req.userRoles)) {
    return true;
  }

  const normalizedModulo = String(moduloCodigo || '').trim().toLowerCase();
  if (!normalizedModulo) {
    return false;
  }

  return userHasModulePermission(req.userRoles, normalizedModulo, accion);
}

export function requireModulePermission(moduloCodigo: string, accion: AccionPermiso = 'ver') {
  return requireAnyModulePermission([{ moduloCodigo, accion }]);
}

export function requireAnyModulePermission(requirements: ModulePermissionRequirement[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    const normalizedRequirements = requirements
      .map((requirement) => ({
        moduloCodigo: String(requirement.moduloCodigo || '').trim().toLowerCase(),
        accion: requirement.accion ?? 'ver',
      }))
      .filter((requirement) => requirement.moduloCodigo.length > 0);

    if (normalizedRequirements.length === 0) {
      console.error('requireAnyModulePermission recibió una configuración inválida', { requirements });
      return res.status(500).json({ message: 'No se pudo validar el permiso del módulo' });
    }

    try {
      const results = await Promise.all(
        normalizedRequirements.map((requirement) =>
          userHasModulePermission(req.userRoles, requirement.moduloCodigo, requirement.accion),
        ),
      );

      if (!results.some(Boolean)) {
        return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' });
      }

      return next();
    } catch (error) {
      console.error('Error validando acceso a módulos', { requirements: normalizedRequirements, error });
      return res.status(500).json({ message: 'No se pudo validar el permiso del módulo' });
    }
  };
}

export const accessControl = requireModulePermission;
