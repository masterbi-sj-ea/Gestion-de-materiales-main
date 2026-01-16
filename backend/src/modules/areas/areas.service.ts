import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface Area {
  IdArea: number;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
  IdCentroCosto: number | null;
  CentroCostoNombre: string | null;
}

export async function listarAreas(): Promise<Area[]> {
  return callSpMany<Area>('sp_ListarAreas');
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
