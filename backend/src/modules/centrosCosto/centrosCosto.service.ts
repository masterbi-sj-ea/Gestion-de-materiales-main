import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface CentroCosto {
  IdCentroCosto: number;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
}

export async function listarCentrosCosto(): Promise<CentroCosto[]> {
  return callSpMany<CentroCosto>('sp_ListarCentrosCosto');
}

export async function crearCentroCosto(input: {
  Codigo: string;
  Nombre: string;
  Descripcion?: string | null;
  Activo?: boolean;
}): Promise<number> {
  const result = await callSpOne<{ IdCentroCosto: number }>('sp_CrearCentroCosto', {
    Codigo: input.Codigo,
    Nombre: input.Nombre,
    Descripcion: input.Descripcion ?? null,
    Activo: input.Activo ?? true,
  });
  return result?.IdCentroCosto ?? 0;
}
