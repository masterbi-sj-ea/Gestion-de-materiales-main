import { callSpMany } from '../../infra/spCaller';
import sql from 'mssql';
import { getPool } from '../../config/db';
import { listarRoles } from '../roles/roles.service';

export interface PermisoModulo {
  IdModulo: number;
  Codigo: string;
  Nombre: string;
  Path: string | null;
  Descripcion: string | null;
  PuedeVer: boolean;
  PuedeCrear: boolean;
  PuedeEditar: boolean;
  PuedeAprobar: boolean;
  PuedeEliminar: boolean;
}

export interface PermisoAccionesModulo {
  puedeVer: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAprobar: boolean;
  puedeEliminar: boolean;
}

function normalizeRoleKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

function isProductionChiefRole(value: string | null | undefined): boolean {
  return normalizeRoleKey(value) === 'jefe de produccion';
}

function mergePermisosModulo(
  base: PermisoAccionesModulo,
  extra: Partial<PermisoAccionesModulo>,
): PermisoAccionesModulo {
  return {
    puedeVer: base.puedeVer || !!extra.puedeVer,
    puedeCrear: base.puedeCrear || !!extra.puedeCrear,
    puedeEditar: base.puedeEditar || !!extra.puedeEditar,
    puedeAprobar: base.puedeAprobar || !!extra.puedeAprobar,
    puedeEliminar: base.puedeEliminar || !!extra.puedeEliminar,
  };
}

function buildRolePermissionOverride(
  normalizedRoles: string[],
  normalizedModulo: string,
): Partial<PermisoAccionesModulo> {
  if (normalizedModulo === 'aprobaciones' && normalizedRoles.some((rol) => isProductionChiefRole(rol))) {
    return {
      puedeVer: true,
      puedeAprobar: true,
    };
  }

  return {};
}

export async function obtenerPermisosPorRol(idRol: number): Promise<PermisoModulo[]> {
  const rows = await callSpMany<PermisoModulo>('sp_ObtenerPermisosPorRol', { IdRol: idRol });
  return rows;
}

export async function obtenerPermisosModuloPorRoles(
  nombresRol: string[],
  codigoModulo: string,
): Promise<PermisoAccionesModulo | null> {
  const normalizedModulo = String(codigoModulo || '').trim().toLowerCase();
  const normalizedRoles = Array.from(
    new Set(
      (nombresRol || [])
        .map((rol) => normalizeRoleKey(rol))
        .filter(Boolean),
    ),
  );

  if (!normalizedModulo || normalizedRoles.length === 0) {
    return null;
  }

  const roles = await listarRoles();
  const idsRol = roles
    .filter((rol) => normalizedRoles.includes(normalizeRoleKey(rol.Nombre)))
    .map((rol) => rol.IdRol);

  const permisosPorRol = idsRol.length > 0
    ? await Promise.all(idsRol.map((idRol) => obtenerPermisosPorRol(idRol)))
    : [];
  const permisosModulo = permisosPorRol
    .flat()
    .filter((permiso) => String(permiso.Codigo || '').trim().toLowerCase() === normalizedModulo);

  const permisosBase = permisosModulo.reduce<PermisoAccionesModulo>(
    (acc, permiso) => ({
      puedeVer: acc.puedeVer || !!permiso.PuedeVer,
      puedeCrear: acc.puedeCrear || !!permiso.PuedeCrear,
      puedeEditar: acc.puedeEditar || !!permiso.PuedeEditar,
      puedeAprobar: acc.puedeAprobar || !!permiso.PuedeAprobar,
      puedeEliminar: acc.puedeEliminar || !!permiso.PuedeEliminar,
    }),
    {
      puedeVer: false,
      puedeCrear: false,
      puedeEditar: false,
      puedeAprobar: false,
      puedeEliminar: false,
    },
  );

  const permisosFinales = mergePermisosModulo(
    permisosBase,
    buildRolePermissionOverride(normalizedRoles, normalizedModulo),
  );

  if (!Object.values(permisosFinales).some(Boolean)) {
    return null;
  }

  return permisosFinales;
}

export interface PermisoRolInput {
  idModulo: number;
  puedeVer: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAprobar: boolean;
  puedeEliminar: boolean;
}

export async function guardarPermisosRol(idRol: number, permisos: PermisoRolInput[]): Promise<void> {
  const pool = await getPool();
  const tvp = new sql.Table('TPermisosRolModulo');

  tvp.columns.add('IdModulo', sql.Int);
  tvp.columns.add('PuedeVer', sql.Bit);
  tvp.columns.add('PuedeCrear', sql.Bit);
  tvp.columns.add('PuedeEditar', sql.Bit);
  tvp.columns.add('PuedeAprobar', sql.Bit);
  tvp.columns.add('PuedeEliminar', sql.Bit);

  for (const p of permisos) {
    tvp.rows.add(
      p.idModulo,
      !!p.puedeVer,
      !!p.puedeCrear,
      !!p.puedeEditar,
      !!p.puedeAprobar,
      !!p.puedeEliminar
    );
  }

  const request = pool.request();
  request.input('IdRol', sql.Int, idRol);
  request.input('Permisos', tvp);

  await request.execute('sp_GuardarPermisosRol');
}
