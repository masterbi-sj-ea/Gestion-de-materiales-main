import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface Presupuesto {
  IdPresupuesto: number;
  Anio: number;
  Mes: number | null;
  IdArea: number | null;
  AreaNombre: string | null;
  MontoTotal: number;
  Moneda: string;
}

export interface CrearPresupuestoInput {
  Anio: number;
  Mes?: number | null;
  IdArea?: number | null;
  IdCentroCosto?: number | null;
  MontoTotal: number;
  Moneda?: string;
}

export async function listarPresupuestos(): Promise<Presupuesto[]> {
  return callSpMany<Presupuesto>('sp_ListarPresupuestos');
}

export async function crearPresupuesto(input: CrearPresupuestoInput): Promise<number> {
  const result = await callSpOne<{ IdPresupuesto: number }>('sp_CrearPresupuesto', {
    Anio: input.Anio,
    Mes: input.Mes ?? null,
    IdArea: input.IdArea ?? null,
    IdCentroCosto: input.IdCentroCosto ?? null,
    MontoTotal: input.MontoTotal,
    Moneda: input.Moneda ?? 'USD',
  });
  return result?.IdPresupuesto ?? 0;
}

export async function actualizarPresupuesto(idPresupuesto: number, input: CrearPresupuestoInput): Promise<void> {
  await callSpOne('sp_ActualizarPresupuesto', {
    IdPresupuesto: idPresupuesto,
    Anio: input.Anio,
    Mes: input.Mes ?? null,
    IdArea: input.IdArea ?? null,
    IdCentroCosto: input.IdCentroCosto ?? null,
    MontoTotal: input.MontoTotal,
    Moneda: input.Moneda ?? 'USD',
  });
}
