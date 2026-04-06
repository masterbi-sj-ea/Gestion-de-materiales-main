import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface Area {
  IdArea: number;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
  IdCentroCosto: number | null;
  CentroCostoNombre: string | null;
  CodigoCuenta?: string | null;
  NombreCuenta?: string | null;
}

interface AccesoAreaResult {
  TieneAcceso?: boolean | number | null;
}

export async function listarAreas(): Promise<Area[]> {
  return callSpMany<Area>('sp_ListarAreas');
}

export async function listarAreasPermitidasPorUsuario(idUsuario: number): Promise<Area[]> {
  return callSpMany<Area>('sp_ListarAreasPermitidasPorUsuario', { IdUsuario: idUsuario });
}

export async function usuarioTieneAccesoArea(idUsuario: number, idArea: number): Promise<boolean> {
  try {
    const result = await callSpOne<AccesoAreaResult>('sp_UsuarioTieneAccesoArea', {
      IdUsuario: idUsuario,
      IdArea: idArea,
    });

    return Number(result?.TieneAcceso ?? 0) === 1;
  } catch (error) {
    try {
      const areas = await listarAreasPermitidasPorUsuario(idUsuario);
      return areas.some((area) => Number(area?.IdArea ?? 0) === idArea);
    } catch {
      return false;
    }
  }
}

export async function crearArea(input: {
  Codigo: string;
  Nombre: string;
  Descripcion?: string | null;
  Activo?: boolean;
  IdCentroCosto?: number | null;
}): Promise<number> {
  const result = await callSpOne<{ IdArea: number }>('sp_CrearArea', {
    Codigo: input.Codigo,
    Nombre: input.Nombre,
    Descripcion: input.Descripcion ?? null,
    Activo: input.Activo ?? true,
    IdCentroCosto: input.IdCentroCosto ?? null,
  });
  return result?.IdArea ?? 0;
}

export async function actualizarArea(
  idArea: number,
  input: { Codigo: string; Nombre: string; Descripcion?: string | null; Activo?: boolean; IdCentroCosto?: number | null },
): Promise<void> {
  await callSpOne('sp_ActualizarArea', {
    IdArea: idArea,
    Codigo: input.Codigo,
    Nombre: input.Nombre,
    Descripcion: input.Descripcion ?? null,
    Activo: input.Activo ?? true,
    IdCentroCosto: input.IdCentroCosto ?? null,
  });
}

export async function eliminarArea(idArea: number): Promise<void> {
  await callSpOne('sp_EliminarArea', { IdArea: idArea });
}
