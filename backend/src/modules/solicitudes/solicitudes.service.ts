import sql from 'mssql';
import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';

export interface SolicitudResumen {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  Estado: string;
  IdSolicitante: number;
  NombreSolicitante: string;
  RolSolicitante: string | null;
  IdArea: number | null;
  AreaNombre: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
  Comentario: string | null;
  TotalItems: number;
  TotalMonto: number;
}

export interface SolicitudCabecera {
  IdSolicitud: number;
  CodigoSolicitud: string;
  IdSolicitante: number;
  NombreSolicitante: string;
  EmailSolicitante: string;
  RolSolicitante: string | null;
  FechaSolicitud: string;
  Estado: string;
  Area: string | null;
  Comentario: string | null;
  IdCorteStock: number | null;
  IdArea: number | null;
  AreaNombre: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
}

export interface SolicitudDetalle {
  IdDetalleSolicitud: number;
  IdSolicitud: number;
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedidaMaterial: string;
  GrupoArticulos: string | null;
  CantidadSolicitada: number;
  CantidadAprobada: number | null;
  UnidadMedidaDetalle: string | null;
  ComentarioLinea: string | null;
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
  UltimaMonedaCompra: string | null;
}

export interface SolicitudCompleta {
  cabecera: SolicitudCabecera | null;
  detalle: SolicitudDetalle[];
}

export interface CrearSolicitudDetalleInput {
  idMaterial: number;
  cantidadSolicitada: number;
  unidadMedida?: string | null;
  comentarioLinea?: string | null;
}

export interface CrearSolicitudInput {
  idSolicitante: number;
  fechaSolicitud?: string | null; // ISO string o null para SYSDATETIME()
  estado?: string | null; // por defecto 'PENDIENTE'
  area?: string | null;
  comentario?: string | null;
  idCorteStock?: number | null;
  idArea?: number | null;
  idCentroCosto?: number | null;
  detalle: CrearSolicitudDetalleInput[];
}

export async function crearSolicitud(input: CrearSolicitudInput): Promise<{ IdSolicitud: number; CodigoSolicitud: string }> {
  if (!input.detalle || input.detalle.length === 0) {
    throw new Error('La solicitud debe tener al menos una línea de detalle');
  }

  const pool = await getPool();

  // Construir TVP para dbo.TDetalleSolicitudMaterial
  const tvp = new sql.Table();
  tvp.columns.add('IdMaterial', sql.Int);
  tvp.columns.add('CantidadSolicitada', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(50));
  tvp.columns.add('ComentarioLinea', sql.NVarChar(255));

  for (const d of input.detalle) {
    tvp.rows.add(
      d.idMaterial,
      d.cantidadSolicitada,
      d.unidadMedida ?? null,
      d.comentarioLinea ?? null,
    );
  }

  const request = pool.request();

  request.input('IdSolicitante', sql.Int, input.idSolicitante);
  request.input('FechaSolicitud', sql.DateTime2, input.fechaSolicitud ?? null);
  request.input('Estado', sql.NVarChar(30), input.estado ?? 'PENDIENTE');
  request.input('Area', sql.NVarChar(100), input.area ?? null);
  request.input('Comentario', sql.NVarChar(500), input.comentario ?? null);
  request.input('IdCorteStock', sql.Int, input.idCorteStock ?? null);
  request.input('IdArea', sql.Int, input.idArea ?? null);
  request.input('IdCentroCosto', sql.Int, input.idCentroCosto ?? null);
  request.input('Detalle', tvp as any);

  const result = await request.execute<{ IdSolicitud: number; CodigoSolicitud: string }>('sp_CrearSolicitudMaterial');

  const row = (result.recordset && result.recordset[0]) as { IdSolicitud: number; CodigoSolicitud: string } | undefined;
  if (!row) {
    throw new Error('No se pudo crear la solicitud');
  }

  return row;
}

export async function listarSolicitudes(params: {
  idSolicitante?: number;
  estado?: string;
  idArea?: number;
  fechaDesde?: string;
  fechaHasta?: string;
} = {}): Promise<SolicitudResumen[]> {
  return callSpMany<SolicitudResumen>('sp_ListarSolicitudesMaterial', {
    IdSolicitante: params.idSolicitante ?? null,
    Estado: params.estado ?? null,
    IdArea: params.idArea ?? null,
    FechaDesde: params.fechaDesde ?? null,
    FechaHasta: params.fechaHasta ?? null,
  });
}

export async function obtenerSolicitud(idSolicitud: number): Promise<SolicitudCompleta> {
  const pool = await getPool();
  const request = pool.request();
  request.input('IdSolicitud', sql.Int, idSolicitud);

  const result = await request.execute('sp_ObtenerSolicitudMaterial');

  const recordsets = (result as any).recordsets as any[] | undefined;
  const cabecera = (recordsets?.[0]?.[0] as SolicitudCabecera) ?? null;
  const detalle = (recordsets?.[1] as SolicitudDetalle[]) ?? [];

  return {
    cabecera,
    detalle,
  };
}

export async function registrarAprobacionSolicitud(input: {
  idSolicitud: number;
  idAprobador: number;
  estado: 'APROBADA' | 'RECHAZADA';
  comentario?: string | null;
}): Promise<void> {
  await callSpOne('sp_RegistrarAprobacionSolicitud', {
    IdSolicitud: input.idSolicitud,
    IdAprobador: input.idAprobador,
    Estado: input.estado,
    Comentario: input.comentario ?? null,
  });
}

export interface AprobacionSolicitud {
  IdAprobacion: number;
  IdSolicitud: number;
  IdAprobador: number;
  NombreAprobador: string;
  EmailAprobador: string;
  FechaAprobacion: string;
  Estado: string;
  Comentario: string | null;
}

export async function listarAprobacionesPorSolicitud(idSolicitud: number): Promise<AprobacionSolicitud[]> {
  return callSpMany<AprobacionSolicitud>('sp_ListarAprobacionesPorSolicitud', { IdSolicitud: idSolicitud });
}

export async function actualizarEstadoSolicitud(idSolicitud: number, nuevoEstado: string): Promise<void> {
  await callSpOne('sp_ActualizarEstadoSolicitudMaterial', {
    IdSolicitud: idSolicitud,
    NuevoEstado: nuevoEstado,
  });
}

export async function registrarDespachoSolicitud(input: {
  idSolicitud: number;
  nuevoEstado?: string;
  detalle: { idMaterial: number; cantidadAprobada: number; comentarioLinea?: string | null }[];
}): Promise<void> {
  await callSpOne('sp_RegistrarDespachoSolicitud', {
    IdSolicitud: input.idSolicitud,
    NuevoEstado: input.nuevoEstado ?? 'DESPACHADA',
    DetalleDesp: {
      type: 'TDespachoSolicitudDetalle',
      value: input.detalle.map((d) => ({
        IdMaterial: d.idMaterial,
        CantidadAprobada: d.cantidadAprobada,
        ComentarioLinea: d.comentarioLinea ?? null,
      })),
    },
  });
}
