import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface Usuario {
  IdUsuario: number;
  NombreCompleto: string;
  Email: string;
  Activo: boolean;
  FechaCreacion: string;
  RolPrincipal?: string | null;
  IdRolPrincipal?: number | null;
  AreaNombre?: string | null;
  IdArea?: number | null;
}

export interface CrearUsuarioInput {
  NombreCompleto: string;
  Email: string;
  HashPassword?: string | null;
  Activo?: boolean;
  IdArea?: number | null;
  IdRolPrincipal?: number | null;
}

export interface ActualizarUsuarioInput {
  NombreCompleto: string;
  Email: string;
  Activo: boolean;
  IdArea?: number | null;
  IdRolPrincipal?: number | null;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return callSpMany<Usuario>('sp_ListarUsuarios');
}

export async function obtenerUsuario(idUsuario: number): Promise<Usuario | null> {
  return callSpOne<Usuario>('sp_ObtenerUsuario', { IdUsuario: idUsuario });
}

export async function crearUsuario(input: CrearUsuarioInput): Promise<number> {
  const result = await callSpOne<{ IdUsuario: number }>('sp_CrearUsuario', {
    NombreCompleto: input.NombreCompleto,
    Email: input.Email,
    HashPassword: input.HashPassword ?? null,
    Activo: input.Activo ?? true,
    IdArea: input.IdArea ?? null,
    IdRolPrincipal: input.IdRolPrincipal ?? null,
  });

  return result?.IdUsuario ?? 0;
}

export async function actualizarUsuario(idUsuario: number, input: ActualizarUsuarioInput): Promise<void> {
  await callSpOne('sp_ActualizarUsuario', {
    IdUsuario: idUsuario,
    NombreCompleto: input.NombreCompleto,
    Email: input.Email,
    Activo: input.Activo,
    IdArea: input.IdArea ?? null,
    IdRolPrincipal: input.IdRolPrincipal ?? null,
  });
}

export async function desactivarUsuario(idUsuario: number): Promise<void> {
  await callSpOne('sp_DesactivarUsuario', { IdUsuario: idUsuario });
}
