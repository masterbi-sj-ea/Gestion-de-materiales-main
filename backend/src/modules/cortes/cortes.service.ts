import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface CorteStock {
  IdCorte: number;
  FechaCorte: string;
  Descripcion: string | null;
  FechaInicio: string;
  FechaFin: string | null;
  Ambito: string;
  EsMaximo: boolean;
}

export async function listarCortes(): Promise<CorteStock[]> {
  return callSpMany<CorteStock>('sp_ListarCortesStock');
}

export interface CrearCorteInput {
  descripcion: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  ambito?: string | null;
  esMaximo?: boolean;
}

export async function crearCorte(input: CrearCorteInput): Promise<number> {
  const result = await callSpOne<{ IdCorte: number }>('sp_CrearCorteStock', {
    Descripcion: input.descripcion,
    FechaInicio: input.fechaInicio ?? null,
    FechaFin: input.fechaFin ?? null,
    Ambito: input.ambito ?? null,
    EsMaximo: input.esMaximo ?? false,
  });
  return result?.IdCorte ?? 0;
}

export async function actualizarCorte(idCorte: number, input: CrearCorteInput): Promise<void> {
	await callSpOne<null>('sp_ActualizarCorteStock', {
		IdCorte: idCorte,
		Descripcion: input.descripcion,
		FechaInicio: input.fechaInicio ?? null,
		FechaFin: input.fechaFin ?? null,
		Ambito: input.ambito ?? null,
		EsMaximo: input.esMaximo ?? false,
	});
}

export async function eliminarCorte(idCorte: number): Promise<void> {
	await callSpOne<null>('sp_EliminarCorteStock', {
		IdCorte: idCorte,
	});
}
