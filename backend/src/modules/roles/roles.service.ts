import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface Rol {
  IdRol: number;
  Nombre: string;
  Descripcion: string | null;
}

export interface CrearRolInput {
  Nombre: string;
  Descripcion?: string | null;
}

export interface ActualizarRolInput {
  Nombre: string;
  Descripcion?: string | null;
}

export async function listarRoles(): Promise<Rol[]> {
  return callSpMany<Rol>('sp_ListarRoles');
}

export async function obtenerRol(idRol: number): Promise<Rol | null> {
  return callSpOne<Rol>('sp_ObtenerRol', { IdRol: idRol });
}

export async function crearRol(input: CrearRolInput): Promise<number> {
  const result = await callSpOne<{ IdRol: number }>('sp_CrearRol', {
    Nombre: input.Nombre,
    Descripcion: input.Descripcion ?? null
  });
  return result?.IdRol ?? 0;
}

export async function actualizarRol(idRol: number, input: ActualizarRolInput): Promise<void> {
  await callSpOne('sp_ActualizarRol', {
    IdRol: idRol,
    Nombre: input.Nombre,
    Descripcion: input.Descripcion ?? null
  });
}

export async function eliminarRol(idRol: number): Promise<void> {
  await callSpOne('sp_EliminarRol', { IdRol: idRol });
}
