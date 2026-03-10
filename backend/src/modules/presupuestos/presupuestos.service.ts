import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface Presupuesto {
  IdPresupuesto: number;
  Anio: number;
  Mes: number;
  Presupuesto: number;
  Moneda: string;
  IdArea: number;
  AreaNombre: string;
  IdCentroCosto: number | null;
  CentroCostoNombre: string | null;
  Comprometido: number;
  Ejecutado: number;
  Consumo: number;
  Disponible: number;
  PorcentajeEjecucion: number;
  EstadoAlerta: 'Normal' | 'Alerta' | 'Critico';
}

export interface PresupuestoDetalle {
  IdPresupuestoDetalle: number;
  IdPresupuesto: number;
  IdMaterial: number;
  MaterialNombre: string;
  GrupoArticulos: string;
  MontoPermitido: number;
  CantidadPresupuestada: number;
  CostoUnitarioPresupuestado: number;
  MontoAsignado: number;
  MontoComprometido: number;
  MontoEjecutado: number;
}

export interface GuardarPresupuestoInput {
  IdPresupuesto?: number;
  Anio: number;
  Mes: number;
  MontoTotal: number;
  IdArea: number;
  IdCentroCosto?: number;
  IdUsuarioAudit: number;
}

export interface GuardarPresupuestoDetalleInput {
  IdPresupuesto: number;
  IdMaterial: number;
  GrupoArticulos: string;
  MontoPermitido: number;
  CantidadPresupuestada: number;
  CostoUnitarioPresupuestado: number;
  MontoAsignado: number;
}

export async function listarPresupuestos(): Promise<Presupuesto[]> {
  return callSpMany<Presupuesto>('sp_ListarPresupuestosPro');
}

export async function guardarPresupuesto(input: GuardarPresupuestoInput): Promise<void> {
  await callSpOne('sp_GuardarPresupuesto', {
    IdPresupuesto: input.IdPresupuesto ?? null,
    Anio: input.Anio,
    Mes: input.Mes,
    MontoTotal: input.MontoTotal,
    IdArea: input.IdArea,
    IdUsuarioAudit: input.IdUsuarioAudit
  });
}

export async function guardarPresupuestoDetalle(input: GuardarPresupuestoDetalleInput): Promise<void> {
  await callSpOne('sp_GuardarPresupuestoDetalle', input);
}

export async function obtenerDetallePresupuesto(idPresupuesto: number): Promise<PresupuestoDetalle[]> {
  return callSpMany<PresupuestoDetalle>('sp_ObtenerDetallePresupuesto', { IdPresupuesto: idPresupuesto });
}

