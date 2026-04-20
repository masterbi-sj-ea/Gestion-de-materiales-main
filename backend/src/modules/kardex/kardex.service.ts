import { callSpMany } from '../../infra/spCaller';

export interface MovimientoInventario {
  IdMovimiento: number;
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  TipoMovimiento: string;
  OrigenMovimiento: string;
  Cantidad: number;
  StockAnterior: number;
  StockNuevo: number;
  FechaMovimiento: string;
  IdUsuario: number | null;
  NombreUsuario: string | null;
  Referencia: string | null;
  CodigoCuenta: string | null;
  AreaDestino: string | null;
  TotalRows?: number;
}

export async function listarMovimientosInventario(filtros: {
  IdMaterial?: number;
  TipoMovimiento?: string;
  FechaInicio?: string;
  FechaFin?: string;
  Search?: string;
  IdUsuario?: number;
  OrigenMovimiento?: string;
  Page?: number;
  Limit?: number;
}): Promise<MovimientoInventario[]> {
  return callSpMany<MovimientoInventario>('sp_ListarMovimientosInventario', {
    IdMaterial: filtros.IdMaterial ?? null,
    TipoMovimiento: filtros.TipoMovimiento ?? null,
    FechaInicio: filtros.FechaInicio ?? null,
    FechaFin: filtros.FechaFin ?? null,
    Search: filtros.Search ?? null,
    IdUsuario: filtros.IdUsuario ?? null,
    OrigenMovimiento: filtros.OrigenMovimiento ?? null,
    Page: filtros.Page ?? null,
    Limit: filtros.Limit ?? null,
  });
}
