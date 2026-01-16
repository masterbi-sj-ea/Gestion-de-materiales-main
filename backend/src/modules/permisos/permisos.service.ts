import { callSpMany } from '../../infra/spCaller';
import sql from 'mssql';
import { getPool } from '../../config/db';

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

export async function obtenerPermisosPorRol(idRol: number): Promise<PermisoModulo[]> {
  const rows = await callSpMany<PermisoModulo>('sp_ObtenerPermisosPorRol', { IdRol: idRol });
  return rows;
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
