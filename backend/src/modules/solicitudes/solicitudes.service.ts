import sql from 'mssql';
import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';
import {
  buildDespachosPreviosOuterApply,
  buildDevolucionesPresupuestoOuterApply,
  resolveDetalleDespachosSchema,
} from '../../infra/detalleDespachos';
import { io } from '../../server';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import { listarPresupuestos, type Presupuesto } from '../presupuestos/presupuestos.service';
import { sendPendingApprovalPushNotification } from '../push/push.service';
import {
  ESTADOS_COMPROMETEN_PRESUPUESTO,
  agruparCostoSolicitudPorArea,
  seleccionarPresupuestoAreaVigente,
  validarCostoSolicitudPorArea,
} from '../presupuestos/presupuestoValidation';

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
  AreaCodigoCuenta: string | null;
  AreaResumen?: string;
  AreasDetalle?: string[];
  CodigoCuentaResumen?: string;
  CodigosCuentaDetalle?: string[];
  OT?: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
  Comentario: string | null;
  TotalItems: number;
  TotalMonto: number;
  FechaAprobacion?: string | null;
  EstadoAprobacion?: string | null;
  ComentarioAprobacion?: string | null;
  NombreAprobador?: string | null;
  PresupuestoArea?: number | null;
  ConsumoAcumulado?: number | null;

  PresupuestoEstado?: 'CONTROLADO' | 'SIN_PRESUPUESTO' | 'EXCEDE_PRESUPUESTO';
  PresupuestoBloqueada?: boolean;
  PresupuestoMensaje?: string | null;
  PresupuestoSolicitudActual?: number | null;
  PresupuestoDisponibleDespues?: number | null;
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
  AreaResumen?: string;
  AreasDetalle?: string[];
  CodigoCuenta?: string | null;
  CodigoCuentaResumen?: string;
  CodigosCuentaDetalle?: string[];
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
  OT?: string | null;
  IdCatalogoSolicitud?: number | null;
  CatalogoNombre?: string | null;
}

export interface SolicitudDetalle {
  IdDetalleSolicitud: number;
  IdSolicitud: number;
  IdMaterial: number;
  IdArea?: number | null;
  AreaNombre?: string | null;
  IdRecurso?: number | null;
  RecursoNombre?: string | null;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  CodigoCuenta?: string | null;
  UnidadMedidaMaterial: string;
  GrupoArticulos: string | null;
  CantidadSolicitada: number;
  CantidadAprobada: number | null;
  UnidadMedidaDetalle: string | null;
  ComentarioLinea: string | null;
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
}

export interface SolicitudCompleta {
  cabecera: SolicitudCabecera | null;
  detalle: SolicitudDetalle[];
}

export interface SolicitudMeta {
  IdSolicitud: number;
  CodigoSolicitud: string;
  Estado: string;
  IdSolicitante: number;
  FechaAprobacion: string | null;
  EstadoAprobacion: string | null;
  ComentarioAprobacion: string | null;
  NombreAprobador: string | null;
}

interface SolicitudPendienteRealtimePayload {
  id: number;
  codigo: string;
  area: string;
  solicitante: string;
  items: number;
  createdAt: string;
}

interface SolicitudAprobacionActualizadaRealtimePayload {
  id: number;
  codigo: string;
  estado: 'APROBADA' | 'RECHAZADA';
  aprobador: string | null;
  comentario: string | null;
  idAprobador: number;
  updatedAt: string;
}

interface SolicitudAprobacionReciente {
  IdSolicitud: number;
  FechaAprobacion: string | null;
  EstadoAprobacion: string | null;
  ComentarioAprobacion: string | null;
  NombreAprobador: string | null;
}

export interface SolicitudesPaginadasSummary {
  totalMonto: number;
  aprobadasHoyCount: number;
  aprobadasHoyMonto: number;
}

export interface SolicitudesPaginadasResult {
  data: SolicitudResumen[];
  total: number;
  page: number;
  pageSize: number;
  summary: SolicitudesPaginadasSummary;
}

interface SolicitudResumenPaginadoRow extends SolicitudResumen {
  TotalRegistros: number;
  TotalMontoRegistros: number;
  TotalAprobadasHoy: number;
  TotalMontoAprobadasHoy: number;
}

type SolicitudResumenData = {
  areas: string[];
  codigosCuenta: string[];
  ot: string | null;
};

type SolicitudCabeceraExtra = {
  CodigoCuenta: string | null;
  OT: string | null;
  IdCatalogoSolicitud: number | null;
  CatalogoNombre: string | null;
};

type SolicitudDetalleExtra = {
  IdDetalleSolicitud: number;
  IdArea: number | null;
  AreaNombre: string | null;
  IdRecurso: number | null;
  RecursoNombre: string | null;
  CodigoCuenta: string | null;
};

const SOCKET_ROOM_BODEGA = 'bodega';
const SOCKET_ROOM_APROBACIONES = 'aprobaciones';
const SOCKET_EVENT_NUEVA_SOLICITUD = 'nueva_solicitud';
const SOCKET_EVENT_SOLICITUD_PENDIENTE_APROBACION = 'solicitud_pendiente_aprobacion';
const SOCKET_EVENT_SOLICITUD_APROBACION_ACTUALIZADA = 'solicitud_aprobacion_actualizada';

async function obtenerAprobacionesRecientes(idsSolicitud: number[]): Promise<Map<number, SolicitudAprobacionReciente>> {
  if (idsSolicitud.length === 0) {
    return new Map();
  }

  const pool = await getPool();
  const request = pool.request();
  const placeholders = idsSolicitud.map((idSolicitud, index) => {
    const paramName = `IdSolicitud${index}`;
    request.input(paramName, sql.Int, idSolicitud);
    return `@${paramName}`;
  });

  const result = await request.query<SolicitudAprobacionReciente>(`
    WITH UltimaAprobacion AS (
      SELECT
        a.IdSolicitud,
        a.FechaAprobacion,
        a.Estado AS EstadoAprobacion,
        a.Comentario AS ComentarioAprobacion,
        a.IdAprobador,
        ROW_NUMBER() OVER (
          PARTITION BY a.IdSolicitud
          ORDER BY a.FechaAprobacion DESC, a.IdAprobacion DESC
        ) AS rn
      FROM dbo.Aprobaciones a
      WHERE a.IdSolicitud IN (${placeholders.join(', ')})
    )
    SELECT
      ua.IdSolicitud,
      ua.FechaAprobacion,
      ua.EstadoAprobacion,
      ua.ComentarioAprobacion,
      u.NombreCompleto AS NombreAprobador
    FROM UltimaAprobacion ua
    LEFT JOIN dbo.Usuarios u
      ON u.IdUsuario = ua.IdAprobador
    WHERE ua.rn = 1;
  `);

  return new Map(result.recordset.map((row) => [row.IdSolicitud, row]));
}

function compactText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function buildSolicitudPendienteRealtimePayload(args: {
  idSolicitud: number;
  codigoSolicitud: string;
  area?: string | null;
  solicitanteNombre?: string | null;
  items: number;
}): SolicitudPendienteRealtimePayload {
  return {
    id: args.idSolicitud,
    codigo: compactText(args.codigoSolicitud) ?? `#${args.idSolicitud}`,
    area: compactText(args.area) ?? 'General',
    solicitante: compactText(args.solicitanteNombre) ?? 'Usuario no identificado',
    items: Math.max(0, Number(args.items ?? 0)),
    createdAt: new Date().toISOString(),
  };
}

function emitSolicitudPendienteRealtime(payload: SolicitudPendienteRealtimePayload) {
  try {
    io.to(SOCKET_ROOM_BODEGA).emit(SOCKET_EVENT_NUEVA_SOLICITUD, payload);
    io.to(SOCKET_ROOM_APROBACIONES).emit(SOCKET_EVENT_SOLICITUD_PENDIENTE_APROBACION, payload);
  } catch (error) {
    console.error('Error emitiendo socket solicitud_pendiente_aprobacion:', error);
  }

  void sendPendingApprovalPushNotification(payload).catch((error) => {
    console.error('No se pudo enviar la notificación push de solicitud pendiente', error);
  });
}

function emitSolicitudAprobacionActualizadaRealtime(payload: SolicitudAprobacionActualizadaRealtimePayload) {
  try {
    io.to(SOCKET_ROOM_APROBACIONES).emit(SOCKET_EVENT_SOLICITUD_APROBACION_ACTUALIZADA, payload);
  } catch (error) {
    console.error('Error emitiendo socket solicitud_aprobacion_actualizada:', error);
  }
}

function uniqueTexts(values: Array<unknown>): string[] {
  return Array.from(
    new Set(values.map(compactText).filter((value): value is string => value !== null)),
  );
}

function formatCompactSummary(
  values: string[],
  options?: { separator?: string; maxVisible?: number },
): string {
  const { separator = ' · ', maxVisible = 2 } = options ?? {};

  if (values.length === 0) {
    return '';
  }

  if (values.length <= maxVisible) {
    return values.join(separator);
  }

  return `${values.slice(0, maxVisible).join(separator)} +${values.length - maxVisible}`;
}

function shouldTryNextStoredProcedureVariant(error: any): boolean {
  const message = String(error?.originalError?.info?.message || error?.message || '').toLowerCase();

  return [
    'parameter',
    'expects parameter',
    'too many arguments',
    'too many parameters',
    'was not supplied',
  ].some((fragment) => message.includes(fragment));
}

async function executeStoredProcedureWithVariants<T = any>(
  name: string,
  variants: Array<(request: sql.Request) => void>,
) {
  const pool = await getPool();
  let lastError: any;

  for (const configureRequest of variants) {
    const request = pool.request();
    configureRequest(request);

    try {
      return await request.execute<T>(name);
    } catch (error: any) {
      lastError = error;
      if (!shouldTryNextStoredProcedureVariant(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function buildSolicitudDetalleTvp(
  detalle: CrearSolicitudDetalleInput[],
  idAreaCabecera?: number | null,
  idRecursoCabecera?: number | null,
) {
  const tvp = new sql.Table('dbo.TDetalleSolicitudMaterial');
  tvp.columns.add('IdMaterial', sql.Int);
  tvp.columns.add('CantidadSolicitada', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(100));
  tvp.columns.add('ComentarioLinea', sql.NVarChar(510));
  tvp.columns.add('IdArea', sql.Int);
  tvp.columns.add('IdRecurso', sql.Int);

  for (const d of detalle) {
    tvp.rows.add(
      d.idMaterial,
      d.cantidadSolicitada,
      d.unidadMedida ?? null,
      d.comentarioLinea ?? null,
      d.idArea ?? idAreaCabecera ?? null,
      d.idRecurso ?? idRecursoCabecera ?? null,
    );
  }

  return tvp;
}

async function cargarResumenSolicitudes(
  idsSolicitud: number[],
  pool?: sql.ConnectionPool,
): Promise<Map<number, SolicitudResumenData>> {
  const ids = Array.from(
    new Set(
      idsSolicitud
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

  if (ids.length === 0) {
    return new Map();
  }

  const activePool = pool ?? await getPool();
  const request = activePool.request();
  const placeholders = ids.map((idSolicitud, index) => {
    const paramName = `IdSolicitudResumen${index}`;
    request.input(paramName, sql.Int, idSolicitud);
    return `@${paramName}`;
  });

  const result = await request.query(`
    SELECT
      d.IdSolicitud,
      COALESCE(a_det.Nombre, a_cab.Nombre, NULLIF(LTRIM(RTRIM(s.Area)), '')) AS AreaNombre,
      NULLIF(LTRIM(RTRIM(COALESCE(cuenta.CodigoCuenta, cc.Codigo))), '') AS CodigoCuenta,
      NULLIF(LTRIM(RTRIM(s.OT)), '') AS OT
    FROM dbo.DetalleSolicitudesMaterial d
    JOIN dbo.SolicitudesMaterial s
      ON s.IdSolicitud = d.IdSolicitud
    LEFT JOIN dbo.Areas a_det
      ON a_det.IdArea = d.IdArea
    LEFT JOIN dbo.Areas a_cab
      ON a_cab.IdArea = s.IdArea
    LEFT JOIN dbo.CentrosCosto cc
      ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a_cab.IdCentroCosto)
    OUTER APPLY (
      SELECT TOP 1 mr.IdRecurso
      FROM dbo.MaterialRecurso mr
      WHERE mr.IdMaterial = d.IdMaterial
        AND ISNULL(mr.Activo, 1) = 1
      ORDER BY
        CASE
          WHEN d.IdRecurso IS NOT NULL AND mr.IdRecurso = d.IdRecurso THEN 0
          WHEN mr.IdRecurso = 1 THEN 1
          ELSE 2
        END,
        mr.IdRecurso
    ) recurso
    OUTER APPLY (
      SELECT TOP 1 arc.CodigoCuenta
      FROM dbo.AreaRecursoCuenta arc
      WHERE arc.IdArea = COALESCE(d.IdArea, s.IdArea)
        AND arc.IdRecurso = COALESCE(d.IdRecurso, recurso.IdRecurso, 1)
        AND ISNULL(arc.Activo, 1) = 1
        AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''))) <> ''
      ORDER BY
        CASE
          WHEN d.IdRecurso IS NOT NULL AND arc.IdRecurso = d.IdRecurso THEN 0
          WHEN arc.IdRecurso = 1 THEN 1
          ELSE 2
        END,
        arc.IdAreaRecursoCuenta DESC
    ) cuenta
    WHERE d.IdSolicitud IN (${placeholders.join(', ')})
  `);

  const summaryMap = new Map<number, SolicitudResumenData>();

  for (const row of result.recordset ?? []) {
    const idSolicitud = Number(row.IdSolicitud ?? 0);
    if (idSolicitud <= 0) {
      continue;
    }

    const entry = summaryMap.get(idSolicitud) ?? { areas: [], codigosCuenta: [], ot: null };
    const areaNombre = compactText(row.AreaNombre);
    const codigoCuenta = compactText(row.CodigoCuenta);
    const ot = compactText(row.OT);

    if (areaNombre && !entry.areas.includes(areaNombre)) {
      entry.areas.push(areaNombre);
    }

    if (codigoCuenta && !entry.codigosCuenta.includes(codigoCuenta)) {
      entry.codigosCuenta.push(codigoCuenta);
    }

    if (!entry.ot && ot) {
      entry.ot = ot;
    }

    summaryMap.set(idSolicitud, entry);
  }

  return summaryMap;
}

function enriquecerResumenSolicitud<TRow extends {
  IdSolicitud: number;
  AreaNombre?: string | null;
  AreaCodigoCuenta?: string | null;
  CodigoCuenta?: string | null;
  OT?: string | null;
}>(
  row: TRow,
  resumen: SolicitudResumenData | undefined,
): TRow & {
  AreaResumen: string;
  AreasDetalle: string[];
  CodigoCuentaResumen: string;
  CodigosCuentaDetalle: string[];
  OT: string | null;
} {
  const areas = uniqueTexts([...(resumen?.areas ?? []), row.AreaNombre]);
  const codigosCuenta = uniqueTexts([
    ...(resumen?.codigosCuenta ?? []),
    row.CodigoCuenta,
    row.AreaCodigoCuenta,
  ]);

  return {
    ...row,
    AreaResumen: formatCompactSummary(areas),
    AreasDetalle: areas,
    CodigoCuentaResumen: formatCompactSummary(codigosCuenta),
    CodigosCuentaDetalle: codigosCuenta,
    OT: compactText(row.OT) ?? resumen?.ot ?? null,
  };
}

function construirResumenSolicitud(args: {
  areaNombre?: string | null;
  codigoCuenta?: string | null;
  ot?: string | null;
  detalle: Array<Pick<SolicitudDetalle, 'AreaNombre' | 'CodigoCuenta'>>;
}) {
  const areas = uniqueTexts([args.areaNombre, ...args.detalle.map((item) => item.AreaNombre)]);
  const codigosCuenta = uniqueTexts([args.codigoCuenta, ...args.detalle.map((item) => item.CodigoCuenta)]);

  return {
    AreaResumen: formatCompactSummary(areas),
    AreasDetalle: areas,
    CodigoCuentaResumen: formatCompactSummary(codigosCuenta),
    CodigosCuentaDetalle: codigosCuenta,
    OT: compactText(args.ot) ?? null,
  };
}

async function cargarCabeceraSolicitudExtra(
  pool: sql.ConnectionPool,
  idSolicitud: number,
): Promise<SolicitudCabeceraExtra | null> {
  const result = await pool.request()
    .input('IdSolicitud', sql.Int, idSolicitud)
    .query<SolicitudCabeceraExtra>(`
      SELECT
        NULLIF(LTRIM(RTRIM(COALESCE(cc.Codigo, cuentaCabecera.CodigoCuenta))), '') AS CodigoCuenta,
        NULLIF(LTRIM(RTRIM(s.OT)), '') AS OT,
        s.IdCatalogoSolicitud,
        cat.NombreCatalogo AS CatalogoNombre
      FROM dbo.SolicitudesMaterial s
      LEFT JOIN dbo.Areas a
        ON a.IdArea = s.IdArea
      LEFT JOIN dbo.CentrosCosto cc
        ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
      LEFT JOIN dbo.CatalogosSolicitud cat
        ON cat.IdCatalogoSolicitud = s.IdCatalogoSolicitud
      OUTER APPLY (
        SELECT TOP 1 arc.CodigoCuenta
        FROM dbo.AreaRecursoCuenta arc
        WHERE arc.IdArea = s.IdArea
          AND ISNULL(arc.Activo, 1) = 1
          AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''))) <> ''
        ORDER BY
          CASE WHEN arc.IdRecurso = 1 THEN 0 ELSE 1 END,
          arc.IdAreaRecursoCuenta DESC
      ) cuentaCabecera
      WHERE s.IdSolicitud = @IdSolicitud
    `);

  return result.recordset[0] ?? null;
}

async function cargarDetalleSolicitudExtra(
  pool: sql.ConnectionPool,
  idSolicitud: number,
): Promise<Map<number, SolicitudDetalleExtra>> {
  const result = await pool.request()
    .input('IdSolicitud', sql.Int, idSolicitud)
    .query<SolicitudDetalleExtra>(`
      SELECT
        d.IdDetalleSolicitud,
        d.IdArea,
        COALESCE(a_det.Nombre, a_cab.Nombre, NULLIF(LTRIM(RTRIM(s.Area)), '')) AS AreaNombre,
        COALESCE(d.IdRecurso, recurso.IdRecurso) AS IdRecurso,
        recurso.RecursoNombre,
        NULLIF(LTRIM(RTRIM(COALESCE(cuenta.CodigoCuenta, cc.Codigo))), '') AS CodigoCuenta
      FROM dbo.DetalleSolicitudesMaterial d
      JOIN dbo.SolicitudesMaterial s
        ON s.IdSolicitud = d.IdSolicitud
      LEFT JOIN dbo.Areas a_det
        ON a_det.IdArea = d.IdArea
      LEFT JOIN dbo.Areas a_cab
        ON a_cab.IdArea = s.IdArea
      LEFT JOIN dbo.CentrosCosto cc
        ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a_cab.IdCentroCosto)
      OUTER APPLY (
        SELECT TOP 1
          mr.IdRecurso,
          r.Nombre AS RecursoNombre
        FROM dbo.MaterialRecurso mr
        LEFT JOIN dbo.Recursos r
          ON r.IdRecurso = mr.IdRecurso
        WHERE mr.IdMaterial = d.IdMaterial
          AND ISNULL(mr.Activo, 1) = 1
        ORDER BY
          CASE
            WHEN d.IdRecurso IS NOT NULL AND mr.IdRecurso = d.IdRecurso THEN 0
            WHEN mr.IdRecurso = 1 THEN 1
            ELSE 2
          END,
          mr.IdRecurso
      ) recurso
      OUTER APPLY (
        SELECT TOP 1 arc.CodigoCuenta
        FROM dbo.AreaRecursoCuenta arc
        WHERE arc.IdArea = COALESCE(d.IdArea, s.IdArea)
          AND arc.IdRecurso = COALESCE(d.IdRecurso, recurso.IdRecurso, 1)
          AND ISNULL(arc.Activo, 1) = 1
          AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''))) <> ''
        ORDER BY
          CASE
            WHEN d.IdRecurso IS NOT NULL AND arc.IdRecurso = d.IdRecurso THEN 0
            WHEN arc.IdRecurso = 1 THEN 1
            ELSE 2
          END,
          arc.IdAreaRecursoCuenta DESC
      ) cuenta
      WHERE d.IdSolicitud = @IdSolicitud
    `);

  return new Map(
    (result.recordset ?? []).map((row) => [Number(row.IdDetalleSolicitud), row]),
  );
}

function resolverEstadoPresupuestarioSolicitud(
  preview: SolicitudPresupuestoPreview | undefined,
): 'CONTROLADO' | 'SIN_PRESUPUESTO' | 'EXCEDE_PRESUPUESTO' {
  if (!preview || preview.areas.length === 0) {
    return 'SIN_PRESUPUESTO';
  }

  if (preview.areas.some((area) => area.estado === 'sin-presupuesto')) {
    return 'SIN_PRESUPUESTO';
  }

  if (preview.areas.some((area) => area.estado === 'excedido')) {
    return 'EXCEDE_PRESUPUESTO';
  }

  return 'CONTROLADO';
}

function resumirPreviewPresupuesto(preview: SolicitudPresupuestoPreview | undefined) {
  if (!preview) {
    return {
      estado: 'SIN_PRESUPUESTO' as const,
      bloqueada: true,
      mensaje: 'Sin evaluacion presupuestaria.',
      solicitado: null,
      disponibleDespues: null,
    };
  }

  return {
    estado: resolverEstadoPresupuestarioSolicitud(preview),
    bloqueada: preview.bloqueada,
    mensaje: preview.mensaje,
    solicitado: preview.areas.reduce((acc, area) => acc + Number(area.solicitadoNuevo ?? 0), 0),
    disponibleDespues: preview.areas.reduce((acc, area) => acc + Number(area.disponibleDespues ?? 0), 0),
  };
}

type SolicitudPreviewRow = {
  IdSolicitud: number;
  FechaSolicitud: string | null;
  Estado: string | null;
  IdAreaCabecera: number | null;
  IdMaterial: number;
  CantidadSolicitada: number;
  IdAreaDetalle: number | null;
  IdRecurso: number | null;
};

async function cargarPreviewPresupuestoSolicitudes(
  idsSolicitud: number[],
): Promise<Map<number, SolicitudPresupuestoPreview>> {
  const ids = Array.from(
    new Set(idsSolicitud.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)),
  );

  if (ids.length === 0) {
    return new Map();
  }

  const pool = await getPool();
  const request = pool.request();
  const placeholders = buildAreaPlaceholders(request, ids, 'SolicitudPreview');

  const result = await request.query<SolicitudPreviewRow>(`
    SELECT
      s.IdSolicitud,
      CONVERT(VARCHAR(33), s.FechaSolicitud, 126) AS FechaSolicitud,
      s.Estado,
      s.IdArea AS IdAreaCabecera,
      d.IdMaterial,
      d.CantidadSolicitada,
      d.IdArea AS IdAreaDetalle,
      d.IdRecurso
    FROM dbo.SolicitudesMaterial s
    INNER JOIN dbo.DetalleSolicitudesMaterial d
      ON d.IdSolicitud = s.IdSolicitud
    WHERE s.IdSolicitud IN (${placeholders})
    ORDER BY s.IdSolicitud, d.IdDetalleSolicitud;
  `);

  const grouped = new Map<number, SolicitudPreviewRow[]>();
  for (const row of result.recordset ?? []) {
    const idSolicitud = Number(row.IdSolicitud ?? 0);
    if (idSolicitud <= 0) continue;
    const bucket = grouped.get(idSolicitud) ?? [];
    bucket.push(row);
    grouped.set(idSolicitud, bucket);
  }

  const previewEntries = await Promise.all(
    Array.from(grouped.entries()).map(async ([idSolicitud, rows]) => {
      const first = rows[0];
      const preview = await obtenerPreviewPresupuestoSolicitud({
        idSolicitud,
        fechaSolicitud: first?.FechaSolicitud ?? null,
        estado: first?.Estado ?? 'PENDIENTE',
        idAreaCabecera: Number(first?.IdAreaCabecera ?? 0) || null,
        detalle: rows.map((row) => ({
          idMaterial: Number(row.IdMaterial),
          cantidadSolicitada: Number(row.CantidadSolicitada ?? 0),
          idArea: Number(row.IdAreaDetalle ?? 0) || null,
          idRecurso: Number(row.IdRecurso ?? 0) || null,
        })),
      });

      return [idSolicitud, preview] as const;
    }),
  );

  return new Map(previewEntries);
}

async function enriquecerSolicitudes(solicitudes: SolicitudResumen[]): Promise<SolicitudResumen[]> {
  if (solicitudes.length === 0) {
    return solicitudes;
  }

  const idsSolicitud = solicitudes.map((solicitud) => solicitud.IdSolicitud);
  const [aprobacionesRecientes, presupuestos, resumenes, previews] = await Promise.all([
    obtenerAprobacionesRecientes(idsSolicitud),
    listarPresupuestos().catch((error) => {
      console.error('No se pudo obtener el presupuesto para enriquecer solicitudes', error);
      return [] as Presupuesto[];
    }),
    cargarResumenSolicitudes(idsSolicitud),
    cargarPreviewPresupuestoSolicitudes(idsSolicitud),
  ]);

  return solicitudes.map((solicitud) => {
    const aprobacion = aprobacionesRecientes.get(solicitud.IdSolicitud);
    const presupuesto = seleccionarPresupuestoAreaVigente(presupuestos, solicitud.IdArea ?? null);
    const preview = previews.get(solicitud.IdSolicitud);
    const resumenPresupuesto = resumirPreviewPresupuesto(preview);

    return enriquecerResumenSolicitud({
      ...solicitud,
      FechaAprobacion: aprobacion?.FechaAprobacion ?? null,
      EstadoAprobacion: aprobacion?.EstadoAprobacion ?? null,
      ComentarioAprobacion: aprobacion?.ComentarioAprobacion ?? null,
      NombreAprobador: aprobacion?.NombreAprobador ?? null,
      PresupuestoArea: presupuesto ? Number(presupuesto.Presupuesto ?? 0) : null,
      ConsumoAcumulado: presupuesto ? Number(presupuesto.Consumo ?? 0) : null,
      PresupuestoEstado: resumenPresupuesto.estado,
      PresupuestoBloqueada: resumenPresupuesto.bloqueada,
      PresupuestoMensaje: resumenPresupuesto.mensaje,
      PresupuestoSolicitudActual: resumenPresupuesto.solicitado,
      PresupuestoDisponibleDespues: resumenPresupuesto.disponibleDespues,
    }, resumenes.get(solicitud.IdSolicitud));
  });
}

function buildAreaPlaceholders(request: sql.Request, ids: number[], paramPrefix: string): string {
  return ids.map((id, index) => {
    const paramName = `${paramPrefix}${index}`;
    request.input(paramName, sql.Int, id);
    return `@${paramName}`;
  }).join(', ');
}

function buildStateList(values: Iterable<string>): string {
  return Array.from(values).map((value) => `'${value}'`).join(', ');
}

async function loadPrecioMaterialMap(pool: sql.ConnectionPool, idsMateriales: number[]): Promise<Map<number, number>> {
  const precios = new Map<number, number>();
  if (idsMateriales.length === 0) {
    return precios;
  }

  const request = pool.request();
  const placeholders = buildAreaPlaceholders(request, idsMateriales, 'IdMaterial');
  const result = await request.query(`
    SELECT IdMaterial, ISNULL(UltimoPrecioCompra, 0) AS Precio
    FROM dbo.StockActual
    WHERE IdMaterial IN (${placeholders});
  `);

  for (const row of result.recordset ?? []) {
    precios.set(Number(row.IdMaterial), Number(row.Precio ?? 0));
  }

  return precios;
}

async function loadCostoActualSolicitudPorArea(idSolicitud: number): Promise<Map<number, number>> {
  const costos = new Map<number, number>();
  if (!Number.isInteger(idSolicitud) || idSolicitud <= 0) {
    return costos;
  }

  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();
  const result = await pool.request()
    .input('IdSolicitud', sql.Int, idSolicitud)
    .query(`
      SELECT
        COALESCE(d.IdArea, s.IdArea) AS IdArea,
        SUM(
          CASE
            WHEN s.Estado IN (${buildStateList(ESTADOS_COMPROMETEN_PRESUPUESTO)})
              THEN CASE
                WHEN (
                  ISNULL(d.CantidadAprobada, d.CantidadSolicitada)
                  - ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                ) > 0
                  THEN (
                    ISNULL(d.CantidadAprobada, d.CantidadSolicitada)
                    - ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                  ) * ISNULL(sa.UltimoPrecioCompra, 0)
                ELSE 0
              END
            ELSE 0
          END
          + CASE
            WHEN (
              ISNULL(despachosPrevios.CantidadYaDespachada, 0)
              - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuesto, 0)
            ) > 0
              THEN (
                ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuesto, 0)
              ) * ISNULL(sa.UltimoPrecioCompra, 0)
            ELSE 0
          END
        ) AS CostoActual
      FROM dbo.SolicitudesMaterial s
      INNER JOIN dbo.DetalleSolicitudesMaterial d ON d.IdSolicitud = s.IdSolicitud
      LEFT JOIN dbo.StockActual sa ON sa.IdMaterial = d.IdMaterial
      ${buildDespachosPreviosOuterApply(detalleDespachosSchema, {
        solicitudIdExpression: 's.IdSolicitud',
        detalleSolicitudAlias: 'd',
        detalleDespachoAlias: 'dd',
        despachoAlias: 'desp',
      })}
      ${buildDevolucionesPresupuestoOuterApply(detalleDespachosSchema, {
        solicitudIdExpression: 's.IdSolicitud',
        detalleSolicitudAlias: 'd',
        detalleDespachoAlias: 'dd_dev',
        despachoAlias: 'desp_dev',
        detalleDevolucionAlias: 'ddv',
        devolucionAlias: 'dev',
      })}
      WHERE s.IdSolicitud = @IdSolicitud
        AND COALESCE(d.IdArea, s.IdArea) IS NOT NULL
      GROUP BY COALESCE(d.IdArea, s.IdArea);
    `);

  for (const row of result.recordset ?? []) {
    const idArea = Number(row.IdArea ?? 0);
    if (idArea > 0) {
      costos.set(idArea, Number(row.CostoActual ?? 0));
    }
  }

  return costos;
}

async function loadAreaNamesMap(idsArea: number[]): Promise<Map<number, string>> {
  const areaNames = new Map<number, string>();
  if (idsArea.length === 0) {
    return areaNames;
  }

  const pool = await getPool();
  const request = pool.request();
  const placeholders = buildAreaPlaceholders(request, idsArea, 'PreviewArea');
  const result = await request.query(`
    SELECT IdArea, Nombre
    FROM dbo.Areas
    WHERE IdArea IN (${placeholders});
  `);

  for (const row of result.recordset ?? []) {
    const idArea = Number(row.IdArea ?? 0);
    if (idArea > 0) {
      areaNames.set(idArea, String(row.Nombre ?? `Area #${idArea}`));
    }
  }

  return areaNames;
}

function buildPresupuestoErrorMessage(errors: Array<{
  idArea: number;
  costoSolicitado: number;
  disponible: number;
  reason: 'missing-budget' | 'exceeded-budget';
}>): string {
  if (errors.length === 1) {
    const [error] = errors;
    if (error.reason === 'missing-budget') {
      return `PRESUPUESTO_NO_CONFIGURADO: El area ${error.idArea} no tiene presupuesto vigente para el periodo de la solicitud.`;
    }

    return `PRESUPUESTO_EXCEDIDO: El area ${error.idArea} solicita $${error.costoSolicitado.toFixed(2)} pero solo tiene $${error.disponible.toFixed(2)} disponibles.`;
  }

  const detalle = errors.map((error) => {
    if (error.reason === 'missing-budget') {
      return `area ${error.idArea} sin presupuesto vigente`;
    }
    return `area ${error.idArea} solicita $${error.costoSolicitado.toFixed(2)} y dispone de $${error.disponible.toFixed(2)}`;
  }).join('; ');

  return `PRESUPUESTO_EXCEDIDO: La solicitud no cumple validacion presupuestaria: ${detalle}.`;
}

function calcularPorcentajeUso(valorBase: number | null, disponible: number | null): number | null {
  if (!valorBase || valorBase <= 0 || disponible == null) {
    return null;
  }

  return Math.max(0, Math.min(100, ((valorBase - disponible) / valorBase) * 100));
}

function resolverEstadoPreview(args: {
  presupuesto: Presupuesto | null;
  disponibleDespues: number | null;
  solicitadoNuevo: number;
}): SolicitudPresupuestoPreviewArea['estado'] {
  const { presupuesto, disponibleDespues, solicitadoNuevo } = args;
  if (!presupuesto) {
    return 'sin-presupuesto';
  }

  if (disponibleDespues == null) {
    return 'sin-presupuesto';
  }

  if (solicitadoNuevo > presupuesto.Presupuesto) {
    return 'excedido';
  }

  const porcentaje = calcularPorcentajeUso(presupuesto.Presupuesto, disponibleDespues) ?? 0;
  if (disponibleDespues < 0) {
    return 'excedido';
  }

  if (porcentaje >= 90) {
    return 'critico';
  }

  if (porcentaje >= 70) {
    return 'alerta';
  }

  return 'ok';
}

export async function obtenerPreviewPresupuestoSolicitud(args: {
  idSolicitud?: number;
  fechaSolicitud?: string | null;
  estado?: string | null;
  idAreaCabecera?: number | null;
  detalle: CrearSolicitudDetalleInput[];
}): Promise<SolicitudPresupuestoPreview> {
  const estadoNormalizado = String(args.estado ?? 'PENDIENTE').trim().toUpperCase();
  const idsMateriales = Array.from(new Set(
    args.detalle
      .map((linea) => Number(linea.idMaterial))
      .filter((idMaterial) => Number.isInteger(idMaterial) && idMaterial > 0),
  ));

  if (idsMateriales.length === 0 || !ESTADOS_COMPROMETEN_PRESUPUESTO.has(estadoNormalizado)) {
    return {
      bloqueada: false,
      mensaje: null,
      materialesSinPrecio: [],
      areas: [],
    };
  }

  const pool = await getPool();
  const preciosPorMaterial = await loadPrecioMaterialMap(pool, idsMateriales);
  const materialesSinPrecio = idsMateriales.filter((idMaterial) => !(preciosPorMaterial.get(idMaterial) && Number(preciosPorMaterial.get(idMaterial)) > 0));
  const detalleNormalizado = args.detalle
    .map((linea) => ({
      idMaterial: Number(linea.idMaterial),
      cantidadSolicitada: Number(linea.cantidadSolicitada ?? 0),
      idArea: Number(linea.idArea ?? args.idAreaCabecera ?? 0) || null,
      idRecurso: Number(linea.idRecurso ?? 0) || null,
    }))
    .filter((linea) => Number.isInteger(linea.idMaterial) && linea.idMaterial > 0);

  const referenceDate = args.fechaSolicitud ? new Date(args.fechaSolicitud) : new Date();
  const safeReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const costosPorArea = agruparCostoSolicitudPorArea(args.detalle, preciosPorMaterial, args.idAreaCabecera ?? null);
  const idsArea = Array.from(new Set(
    detalleNormalizado
      .map((linea) => linea.idArea)
      .filter((idArea): idArea is number => idArea != null && Number.isInteger(idArea) && idArea > 0),
  ));

  const [presupuestos, costosActualesPorArea, areaNames] = await Promise.all([
    listarPresupuestos(),
    args.idSolicitud ? loadCostoActualSolicitudPorArea(args.idSolicitud) : Promise.resolve(new Map<number, number>()),
    loadAreaNamesMap(idsArea),
  ]);

  const validationErrors = validarCostoSolicitudPorArea({
    presupuestos,
    costosPorArea,
    costosActualesPorArea,
    referenceDate: safeReferenceDate,
  });

  const validationByArea = new Map(validationErrors.map((item) => [item.idArea, item]));

  const areas = idsArea
    .map((idArea): SolicitudPresupuestoPreviewArea => {
      const presupuesto = seleccionarPresupuestoAreaVigente(presupuestos, idArea, safeReferenceDate);
      const solicitadoNuevo = costosPorArea.get(idArea) ?? 0;
      const comprometidoActual = Math.max((presupuesto?.Comprometido ?? 0) - (costosActualesPorArea.get(idArea) ?? 0), 0);
      const disponibleAntes = presupuesto ? Math.max(presupuesto.Presupuesto - comprometidoActual, 0) : null;
      const disponibleDespues = presupuesto ? disponibleAntes! - solicitadoNuevo : null;
      const validationError = validationByArea.get(idArea);

      return {
        idArea,
        areaNombre: presupuesto?.AreaNombre ?? areaNames.get(idArea) ?? `Area #${idArea}`,
        presupuestoId: presupuesto?.IdPresupuesto ?? null,
        presupuesto: presupuesto?.Presupuesto ?? null,
        comprometidoActual,
        solicitadoNuevo,
        disponibleAntes,
        disponibleDespues,
        porcentajeUsoAntes: calcularPorcentajeUso(presupuesto?.Presupuesto ?? null, disponibleAntes),
        porcentajeUsoDespues: calcularPorcentajeUso(presupuesto?.Presupuesto ?? null, disponibleDespues),
        estado: validationError?.reason === 'exceeded-budget'
          ? 'excedido'
          : resolverEstadoPreview({ presupuesto: presupuesto ?? null, disponibleDespues, solicitadoNuevo }),
        materialesSinPresupuesto: [],
      };
    })
    .sort((left, right) => left.areaNombre.localeCompare(right.areaNombre, 'es'));

  const budgetMessage = validationErrors.length > 0 ? buildPresupuestoErrorMessage(validationErrors) : null;
  const priceMessage = materialesSinPrecio.length > 0
    ? `PRESUPUESTO_SIN_PRECIO_REFERENCIA: Los materiales ${materialesSinPrecio.join(', ')} no tienen UltimoPrecioCompra configurado en StockActual.`
    : null;

  return {
    bloqueada: materialesSinPrecio.length > 0 || validationErrors.length > 0,
    mensaje: priceMessage || budgetMessage,
    materialesSinPrecio,
    areas,
  };
}

async function validarPresupuestoSolicitud(args: {
  idSolicitud?: number;
  fechaSolicitud?: string | null;
  estado?: string | null;
  idAreaCabecera?: number | null;
  detalle: CrearSolicitudDetalleInput[];
}): Promise<void> {
  const preview = await obtenerPreviewPresupuestoSolicitud(args);
  if (!preview.bloqueada) {
    return;
  }

  const error: any = new Error(preview.mensaje || 'La solicitud no cumple con la validacion presupuestaria.');
  error.statusCode = 409;
  error.code = preview.materialesSinPrecio.length > 0
    ? 'PRESUPUESTO_SIN_PRECIO_REFERENCIA'
    : preview.areas.some((area) => area.estado === 'sin-presupuesto')
      ? 'PRESUPUESTO_NO_CONFIGURADO'
      : 'PRESUPUESTO_EXCEDIDO';
  error.materiales = preview.materialesSinPrecio;
  error.detallePresupuesto = preview.areas
    .filter((area) => area.estado === 'excedido' || area.estado === 'sin-presupuesto')
    .map((area) => ({
      idArea: area.idArea,
      costoSolicitado: area.solicitadoNuevo,
      disponible: area.disponibleAntes ?? 0,
      reason: area.estado === 'sin-presupuesto' ? 'missing-budget' : 'exceeded-budget',
    }));
  throw error;
}

export interface CrearSolicitudDetalleInput {
  idMaterial: number;
  cantidadSolicitada: number;
  unidadMedida?: string | null;
  comentarioLinea?: string | null;
  idArea?: number | null;
  idRecurso?: number | null;
}

export interface CrearSolicitudInput {
  idSolicitante: number;
  fechaSolicitud?: string | null; // ISO string o null para SYSDATETIME()
  estado?: string | null; // por defecto 'PENDIENTE'
  area?: string | null;
  solicitanteNombre?: string | null;
  comentario?: string | null;
  idCorteStock?: number | null;
  idArea?: number | null;
  idRecurso?: number | null;
  idCatalogoSolicitud?: number | null;
  idCentroCosto?: number | null;
  ot?: string | null;
  detalle: CrearSolicitudDetalleInput[];
}

export interface ActualizarSolicitudInput {
  idSolicitud: number;
  fechaSolicitud?: string | null;
  nuevoEstado?: string | null;
  area?: string | null;
  solicitanteNombre?: string | null;
  comentario?: string | null;
  idArea?: number | null;
  idRecurso?: number | null;
  idCatalogoSolicitud?: number | null;
  idCentroCosto?: number | null;
  ot?: string | null;
  detalle: CrearSolicitudDetalleInput[];
}

export interface SolicitudPresupuestoPreviewArea {
  idArea: number;
  areaNombre: string;
  presupuestoId: number | null;
  presupuesto: number | null;
  comprometidoActual: number;
  solicitadoNuevo: number;
  disponibleAntes: number | null;
  disponibleDespues: number | null;
  porcentajeUsoAntes: number | null;
  porcentajeUsoDespues: number | null;
  estado: 'ok' | 'alerta' | 'critico' | 'excedido' | 'sin-presupuesto';
  materialesSinPresupuesto: number[];
}

export interface SolicitudPresupuestoPreview {
  bloqueada: boolean;
  mensaje: string | null;
  materialesSinPrecio: number[];
  areas: SolicitudPresupuestoPreviewArea[];
}

export async function crearSolicitud(input: CrearSolicitudInput): Promise<{ IdSolicitud: number; CodigoSolicitud: string }> {
  if (!input.detalle || input.detalle.length === 0) {
    throw new Error('La solicitud debe tener al menos una línea de detalle');
  }

  if (input.detalle.length > 9) {
    throw new Error('Solo se permiten un máximo de 9 materiales por solicitud para ajustarse al formato de impresión.');
  }

  await validarPresupuestoSolicitud({
    fechaSolicitud: input.fechaSolicitud ?? null,
    estado: input.estado ?? 'PENDIENTE',
    idAreaCabecera: input.idArea ?? null,
    detalle: input.detalle,
  });

  const baseInputs = (request: sql.Request) => {
    request.input('IdSolicitante', sql.Int, input.idSolicitante);
    request.input('FechaSolicitud', sql.DateTime2, input.fechaSolicitud ?? null);
    request.input('Estado', sql.NVarChar(30), input.estado ?? 'PENDIENTE');
    request.input('Area', sql.NVarChar(100), input.area ?? null);
    request.input('Comentario', sql.NVarChar(500), input.comentario ?? null);
    request.input('IdCorteStock', sql.Int, input.idCorteStock ?? null);
    request.input('IdArea', sql.Int, input.idArea ?? null);
    request.input('IdCentroCosto', sql.Int, input.idCentroCosto ?? null);
    request.input('Detalle', buildSolicitudDetalleTvp(input.detalle, input.idArea, input.idRecurso) as any);
  };

  // Log temporal para depuración: muestra la cabecera que se enviará al SP
  try {
    console.log('[BACK] crearSolicitud cabecera:', {
      idSolicitante: input.idSolicitante,
      area: input.area,
      comentario: input.comentario,
      idArea: input.idArea,
      idCatalogoSolicitud: input.idCatalogoSolicitud,
      idCentroCosto: input.idCentroCosto,
      ot: input.ot,
    });
  } catch (e) {
    console.error('[BACK] error log crearSolicitud cabecera', e);
  }

  const result = await executeStoredProcedureWithVariants<{ IdSolicitud: number; CodigoSolicitud: string }>('sp_CrearSolicitudMaterial', [
    (request) => {
      baseInputs(request);
      request.input('IdCatalogoSolicitud', sql.Int, input.idCatalogoSolicitud ?? null);
      request.input('OT', sql.NVarChar(100), input.ot ?? null);
    },
    (request) => {
      baseInputs(request);
      request.input('IdCatalogoSolicitud', sql.Int, input.idCatalogoSolicitud ?? null);
    },
    (request) => {
      baseInputs(request);
      request.input('OT', sql.NVarChar(100), input.ot ?? null);
    },
    (request) => {
      baseInputs(request);
    },
  ]);

  const row = (result.recordset && result.recordset[0]) as { IdSolicitud: number; CodigoSolicitud: string } | undefined;
  if (!row) {
    throw new Error('No se pudo crear la solicitud');
  }

  emitSolicitudPendienteRealtime(
    buildSolicitudPendienteRealtimePayload({
      idSolicitud: row.IdSolicitud,
      codigoSolicitud: row.CodigoSolicitud,
      area: input.area,
      solicitanteNombre: input.solicitanteNombre,
      items: input.detalle.length,
    }),
  );

  return row;
}

export async function actualizarSolicitud(input: ActualizarSolicitudInput): Promise<void> {
  if (!input.detalle || input.detalle.length === 0) {
    throw new Error('La solicitud debe tener al menos una línea de detalle');
  }

  if (input.detalle.length > 9) {
    throw new Error('Solo se permiten un máximo de 9 materiales por solicitud para ajustarse al formato de impresión.');
  }

  await validarPresupuestoSolicitud({
    idSolicitud: input.idSolicitud,
    fechaSolicitud: input.fechaSolicitud ?? null,
    estado: input.nuevoEstado ?? 'PENDIENTE',
    idAreaCabecera: input.idArea ?? null,
    detalle: input.detalle,
  });

  const baseInputs = (request: sql.Request) => {
    request.input('IdSolicitud', sql.Int, input.idSolicitud);
    request.input('FechaSolicitud', sql.DateTime2, input.fechaSolicitud ?? null);
    request.input('NuevoEstado', sql.NVarChar(30), input.nuevoEstado ?? null);
    request.input('Area', sql.NVarChar(100), input.area ?? null);
    request.input('Comentario', sql.NVarChar(500), input.comentario ?? null);
    request.input('IdArea', sql.Int, input.idArea ?? null);
    request.input('IdCentroCosto', sql.Int, input.idCentroCosto ?? null);
    request.input('Detalle', buildSolicitudDetalleTvp(input.detalle, input.idArea, input.idRecurso) as any);
  };

  await executeStoredProcedureWithVariants('sp_ActualizarSolicitudMaterial', [
    (request) => {
      baseInputs(request);
      request.input('IdCatalogoSolicitud', sql.Int, input.idCatalogoSolicitud ?? null);
      request.input('OT', sql.NVarChar(100), input.ot ?? null);
    },
    (request) => {
      baseInputs(request);
      request.input('IdCatalogoSolicitud', sql.Int, input.idCatalogoSolicitud ?? null);
    },
    (request) => {
      baseInputs(request);
      request.input('OT', sql.NVarChar(100), input.ot ?? null);
    },
    (request) => {
      baseInputs(request);
    },
  ]);

  if (String(input.nuevoEstado ?? '').trim().toUpperCase() === 'PENDIENTE') {
    try {
      const meta = await obtenerSolicitudMeta(input.idSolicitud);
      emitSolicitudPendienteRealtime(
        buildSolicitudPendienteRealtimePayload({
          idSolicitud: input.idSolicitud,
          codigoSolicitud: meta?.CodigoSolicitud ?? `#${input.idSolicitud}`,
          area: input.area,
          solicitanteNombre: input.solicitanteNombre,
          items: input.detalle.length,
        }),
      );
    } catch (error) {
      console.error('Error obteniendo metadatos para socket solicitud_pendiente_aprobacion:', error);
    }
  }
}

export async function listarSolicitudes(params: {
  idSolicitante?: number;
  estado?: string;
  idArea?: number;
  fechaDesde?: string;
  fechaHasta?: string;
} = {}): Promise<SolicitudResumen[]> {
  const solicitudes = await callSpMany<SolicitudResumen>('sp_ListarSolicitudesMaterial', {
    IdSolicitante: params.idSolicitante ?? null,
    Estado: params.estado ?? null,
    IdArea: params.idArea ?? null,
    FechaDesde: params.fechaDesde ?? null,
    FechaHasta: params.fechaHasta ?? null,
  });

  return enriquecerSolicitudes(solicitudes);
}

export async function listarSolicitudesPaginadas(params: {
  idSolicitante?: number;
  estado?: string;
  idArea?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<SolicitudesPaginadasResult> {
  const pool = await getPool();
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 10)));
  const offset = (page - 1) * pageSize;

  const request = pool.request();
  request.input('IdSolicitante', sql.Int, params.idSolicitante ?? null);
  request.input('Estado', sql.NVarChar(30), params.estado ?? null);
  request.input('IdArea', sql.Int, params.idArea ?? null);
  request.input('FechaDesde', sql.Date, params.fechaDesde ?? null);
  request.input('FechaHasta', sql.Date, params.fechaHasta ?? null);
  request.input('Offset', sql.Int, offset);
  request.input('PageSize', sql.Int, pageSize);

  const result = await request.query<SolicitudResumenPaginadoRow>(`
    WITH SolicitudesBase AS (
      SELECT
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.FechaSolicitud,
        s.Estado,
        s.IdSolicitante,
        u.NombreCompleto AS NombreSolicitante,
        (
          SELECT TOP 1 r.Nombre
          FROM dbo.UsuariosRoles ur
          JOIN dbo.Roles r
            ON r.IdRol = ur.IdRol
          WHERE ur.IdUsuario = s.IdSolicitante
          ORDER BY r.Nombre
        ) AS RolSolicitante,
        s.IdArea,
        a.Nombre AS AreaNombre,
        NULLIF(LTRIM(RTRIM(cc.Codigo)), '') AS AreaCodigoCuenta,
        s.IdCentroCosto,
        cc.Codigo AS CentroCostoCodigo,
        cc.Nombre AS CentroCostoNombre,
        s.Comentario,
        ISNULL(SUM(d.CantidadSolicitada), 0) AS TotalItems,
        ISNULL(SUM(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0)), 0.0) AS TotalMonto,
        ultimaAprobacion.FechaAprobacion AS UltimaFechaAprobacion
      FROM dbo.SolicitudesMaterial s
      JOIN dbo.Usuarios u
        ON u.IdUsuario = s.IdSolicitante
      LEFT JOIN dbo.Areas a
        ON a.IdArea = s.IdArea
      LEFT JOIN dbo.CentrosCosto cc
        ON cc.IdCentroCosto = s.IdCentroCosto
      LEFT JOIN dbo.DetalleSolicitudesMaterial d
        ON d.IdSolicitud = s.IdSolicitud
      LEFT JOIN dbo.StockActual sa
        ON sa.IdMaterial = d.IdMaterial
      OUTER APPLY (
        SELECT TOP 1 a2.FechaAprobacion
        FROM dbo.Aprobaciones a2
        WHERE a2.IdSolicitud = s.IdSolicitud
        ORDER BY a2.FechaAprobacion DESC, a2.IdAprobacion DESC
      ) ultimaAprobacion
      WHERE
        (@IdSolicitante IS NULL OR s.IdSolicitante = @IdSolicitante)
        AND (@Estado IS NULL OR s.Estado = @Estado)
        AND (@IdArea IS NULL OR s.IdArea = @IdArea)
        AND (@FechaDesde IS NULL OR CONVERT(DATE, s.FechaSolicitud) >= @FechaDesde)
        AND (@FechaHasta IS NULL OR CONVERT(DATE, s.FechaSolicitud) <= @FechaHasta)
      GROUP BY
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.FechaSolicitud,
        s.Estado,
        s.IdSolicitante,
        u.NombreCompleto,
        s.IdArea,
        a.Nombre,
        s.IdCentroCosto,
        cc.Codigo,
        cc.Nombre,
        s.Comentario,
        ultimaAprobacion.FechaAprobacion
    ),
    SolicitudesPaginadas AS (
      SELECT
        *,
        COUNT(*) OVER() AS TotalRegistros,
        SUM(TotalMonto) OVER() AS TotalMontoRegistros,
        SUM(
          CASE
            WHEN Estado = 'APROBADA'
              AND UltimaFechaAprobacion IS NOT NULL
              AND CONVERT(DATE, UltimaFechaAprobacion) = CONVERT(DATE, GETDATE())
            THEN 1
            ELSE 0
          END
        ) OVER() AS TotalAprobadasHoy,
        SUM(
          CASE
            WHEN Estado = 'APROBADA'
              AND UltimaFechaAprobacion IS NOT NULL
              AND CONVERT(DATE, UltimaFechaAprobacion) = CONVERT(DATE, GETDATE())
            THEN TotalMonto
            ELSE 0
          END
        ) OVER() AS TotalMontoAprobadasHoy
      FROM SolicitudesBase
    )
    SELECT *
    FROM SolicitudesPaginadas
    ORDER BY FechaSolicitud DESC, IdSolicitud DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
  `);

  const rows = result.recordset ?? [];
  const total = Number(rows[0]?.TotalRegistros ?? 0);
  const summary: SolicitudesPaginadasSummary = {
    totalMonto: Number(rows[0]?.TotalMontoRegistros ?? 0),
    aprobadasHoyCount: Number(rows[0]?.TotalAprobadasHoy ?? 0),
    aprobadasHoyMonto: Number(rows[0]?.TotalMontoAprobadasHoy ?? 0),
  };

  const data = await enriquecerSolicitudes(
    rows.map((row) => {
      const {
        TotalRegistros,
        TotalMontoRegistros,
        TotalAprobadasHoy,
        TotalMontoAprobadasHoy,
        ...baseRow
      } = row;
      void TotalRegistros;
      void TotalMontoRegistros;
      void TotalAprobadasHoy;
      void TotalMontoAprobadasHoy;
      return baseRow;
    }),
  );

  return {
    data,
    total,
    page,
    pageSize,
    summary,
  };
}

export async function obtenerSolicitud(idSolicitud: number): Promise<SolicitudCompleta> {
  const pool = await getPool();
  const request = pool.request();
  request.input('IdSolicitud', sql.Int, idSolicitud);

  const result = await request.execute('sp_ObtenerSolicitudMaterial');

  const recordsets = (result as any).recordsets as any[] | undefined;
  const cabecera = (recordsets?.[0]?.[0] as SolicitudCabecera) ?? null;
  const detalle = (recordsets?.[1] as SolicitudDetalle[]) ?? [];
  const [cabeceraExtra, detalleExtraMap] = await Promise.all([
    cargarCabeceraSolicitudExtra(pool, idSolicitud),
    cargarDetalleSolicitudExtra(pool, idSolicitud),
  ]);

  const detalleEnriquecido = detalle.map((item) => ({
    ...item,
    ...(detalleExtraMap.get(Number(item.IdDetalleSolicitud)) ?? {}),
  }));

  const resumen = construirResumenSolicitud({
    areaNombre: cabecera?.AreaNombre ?? cabecera?.Area ?? null,
    codigoCuenta: cabeceraExtra?.CodigoCuenta ?? cabecera?.CentroCostoCodigo ?? null,
    ot: cabeceraExtra?.OT ?? null,
    detalle: detalleEnriquecido,
  });

  return {
    cabecera: cabecera
      ? {
        ...cabecera,
        ...cabeceraExtra,
        ...resumen,
      }
      : null,
    detalle: detalleEnriquecido,
  };
}

export async function obtenerSolicitudMeta(idSolicitud: number): Promise<SolicitudMeta | null> {
  const pool = await getPool();
  const request = pool.request();
  request.input('IdSolicitud', sql.Int, idSolicitud);

  const result = await request.query<SolicitudMeta>(`
    SELECT
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.Estado,
      s.IdSolicitante,
      ap.FechaAprobacion,
      ap.EstadoAprobacion,
      ap.ComentarioAprobacion,
      ap.NombreAprobador
    FROM dbo.SolicitudesMaterial s
    OUTER APPLY (
      SELECT TOP 1
        a.FechaAprobacion,
        a.Estado AS EstadoAprobacion,
        a.Comentario AS ComentarioAprobacion,
        u.NombreCompleto AS NombreAprobador
      FROM dbo.Aprobaciones a
      LEFT JOIN dbo.Usuarios u
        ON u.IdUsuario = a.IdAprobador
      WHERE a.IdSolicitud = s.IdSolicitud
      ORDER BY a.FechaAprobacion DESC, a.IdAprobacion DESC
    ) ap
    WHERE s.IdSolicitud = @IdSolicitud;
  `);

  return result.recordset[0] ?? null;
}

export async function registrarAprobacionSolicitud(input: {
  idSolicitud: number;
  idAprobador: number;
  estado: 'APROBADA' | 'RECHAZADA';
  comentario?: string | null;
  nombreAprobador?: string | null;
}): Promise<void> {
  const comentarioNormalizado = typeof input.comentario === 'string' ? input.comentario.trim() : '';
  const comentarioFinal = comentarioNormalizado.length > 0 ? comentarioNormalizado : null;
  await callSpOne('sp_RegistrarAprobacionSolicitud', {
    IdSolicitud: input.idSolicitud,
    IdAprobador: input.idAprobador,
    Estado: input.estado,
    Comentario: comentarioFinal,
  });

  let solicitud: SolicitudMeta | null = null;
  try {
    solicitud = await obtenerSolicitudMeta(input.idSolicitud);
  } catch (error) {
    console.error('Error obteniendo meta para socket solicitud_aprobacion_actualizada:', error);
  }

  if (input.estado === 'APROBADA') {
    try {
      if (solicitud?.IdSolicitante) {
        io.to(`user:${solicitud.IdSolicitante}`).emit('solicitud_aprobada', {
          id: input.idSolicitud,
          codigo: solicitud.CodigoSolicitud || `#${input.idSolicitud}`,
        });
      }
    } catch (err) {
      console.error('Error emitiendo socket solicitud_aprobada:', err);
    }
  }

  emitSolicitudAprobacionActualizadaRealtime({
    id: input.idSolicitud,
    codigo: solicitud?.CodigoSolicitud || `#${input.idSolicitud}`,
    estado: input.estado,
    aprobador: compactText(input.nombreAprobador),
    comentario: comentarioFinal,
    idAprobador: input.idAprobador,
    updatedAt: new Date().toISOString(),
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
  idUsuarioDespacho: number;
  nuevoEstado?: string;
  detalle: { idMaterial: number; cantidadAprobada: number; comentarioLinea?: string | null }[];
}): Promise<void> {
  await callSpOne('sp_RegistrarDespachoSolicitud', {
    IdSolicitud: input.idSolicitud,
    IdUsuarioDespacho: input.idUsuarioDespacho,
    NuevoEstado: input.nuevoEstado ?? 'COMPLETADA',
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

function dibujarLogoPlaceholder(doc: any, x: number, y: number) {
  doc.save()
     .path(`M ${x + 30} ${y + 5} Q ${x + 50} ${y + 25} ${x + 30} ${y + 35} Q ${x + 10} ${y + 25} ${x + 30} ${y + 5} Z`)
     .fillAndStroke("#333", "#333")
     .restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
  doc.text("Extraceite", x, y + 40, { width: 40, align: "center" });
}

type SolicitudPdfCabecera = {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  FechaSolicitudTexto: string;
  NumeroSolicitudCorta: string;
  Estado: string;
  NombreSolicitante: string;
  AreaNombre: string | null;
  CodigoCC: string | null;
  IdArea: number | null;
  OT?: string | null;
  NombreAprobador: string | null;
};

export async function generarPdfSolicitud(idSolicitud: number): Promise<PassThrough> {
  const pool = await getPool();

  // 1. Obtener datos de la solicitud
 const query = `
    SELECT 
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      s.OT AS OT,
      CONVERT(VARCHAR(10), CAST(s.FechaSolicitud AS DATE), 103) AS FechaSolicitudTexto,
      RIGHT('000000' + CAST(s.IdSolicitud AS VARCHAR(6)), 6) AS NumeroSolicitudCorta,
      s.Estado,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      COALESCE(
        cc.Codigo, 
        a.Codigo,
        (SELECT TOP 1 arc.CodigoCuenta 
         FROM AreaRecursoCuenta arc 
         WHERE arc.IdArea = s.IdArea 
           AND arc.IdRecurso = 1 
           AND ISNULL(arc.Activo, 1) = 1)
      ) AS CodigoCC,
      s.IdArea,
      ap.NombreAprobador
    FROM SolicitudesMaterial s
    JOIN Usuarios u 
      ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a 
      ON s.IdArea = a.IdArea
    LEFT JOIN CentrosCosto cc 
      ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    OUTER APPLY (
  SELECT TOP 1 
    uap.NombreCompleto AS NombreAprobador
  FROM dbo.Aprobaciones ap
  INNER JOIN dbo.Usuarios uap
    ON uap.IdUsuario = ap.IdAprobador
  INNER JOIN dbo.UsuariosRoles ur
    ON ur.IdUsuario = uap.IdUsuario
  INNER JOIN dbo.Roles r
    ON r.IdRol = ur.IdRol
  WHERE ap.IdSolicitud = s.IdSolicitud
    AND ap.Estado = 'APROBADA'
    AND r.Nombre = 'Jefe de Producción'
  ORDER BY ap.FechaAprobacion DESC, ap.IdAprobacion DESC
) ap
    WHERE s.IdSolicitud = @id
  `;

  const cabeceraResult = await pool.request()
    .input('id', sql.Int, idSolicitud)
    .query(query);

  if (cabeceraResult.recordset.length === 0) {
    throw new Error('Solicitud no encontrada');
  }

  const cab = cabeceraResult.recordset[0] as SolicitudPdfCabecera;

  const queryDetalle = `
  SELECT 
    m.IdMaterial,
    m.NumeroArticulo AS Codigo,
    m.DescripcionArticulo AS Descripcion,
    m.UnidadMedida,
    d.CantidadSolicitada,
    NULLIF(LTRIM(RTRIM(d.ComentarioLinea)), '') AS ActividadLinea,
    a.Nombre AS Actividad,
    arc.CodigoCuenta
  FROM DetalleSolicitudesMaterial d
  JOIN SolicitudesMaterial sm ON sm.IdSolicitud = d.IdSolicitud
  JOIN Materiales m ON d.IdMaterial = m.IdMaterial

  LEFT JOIN Areas a
    ON a.IdArea = COALESCE(d.IdArea, sm.IdArea)

  OUTER APPLY (
    SELECT TOP (1) mr.IdRecurso
    FROM MaterialRecurso mr
    WHERE mr.IdMaterial = d.IdMaterial
      AND mr.Activo = 1
    ORDER BY mr.IdRecurso
  ) MRE

  LEFT JOIN AreaRecursoCuenta arc
    ON arc.IdArea = COALESCE(d.IdArea, sm.IdArea)
   AND arc.IdRecurso = COALESCE(d.IdRecurso, MRE.IdRecurso)
   AND ISNULL(arc.Activo, 1) = 1

  WHERE d.IdSolicitud = @id
  ORDER BY d.IdDetalleSolicitud;
`;

  const detalleResult = await pool.request()
    .input('id', sql.Int, idSolicitud)
    .query(queryDetalle);

  const detalle = detalleResult.recordset;
  // Debug: log query and sample result to confirm fields before PDF generation
  try {
    console.log('[PDF Solicitud] queryDetalle:', queryDetalle);
    console.log('[PDF Solicitud] detalle rows:', detalle.length);
    if (detalle.length > 0) {
      console.log('[PDF Solicitud] detalle columns:', Object.keys(detalle[0]));
      console.log('[PDF Solicitud] first rows sample:', detalle.slice(0, 5));
    }
  } catch (e) {
    console.error('[PDF Solicitud] Error logging detalle sample', e);
  }

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: { top: 20, bottom: 20, left: 15, right: 15 },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  doc.lineWidth(0.5);
  const left = 15;
  const right = doc.page.width - 15;
  const contentW = right - left;

  const strokeBox = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();
  const fillStrokeBox = (x: number, y: number, w: number, h: number, color = "#E8E8E8") => {
    doc.save().fillColor(color).rect(x, y, w, h).fill().restore();
    doc.rect(x, y, w, h).stroke();
  };
  const fmtDate = (texto: any) => texto ? String(texto) : "";

  const drawRequisa = (startY: number) => {
    // Elevamos todo substancialmente reduciendo el startY aquí
    const adjustedStartY = startY - 30; // Lo subimos 20 puntos adicionales (de -15 a -35)

    // Título igual al físico
    const titleY = adjustedStartY + 10; // Bajamos el titulo para que asimile mejor el espacio del logo

    // Logo o placeholder
    const logoX = left - 5;
    const logoY = adjustedStartY + 2; // Bajamos solo un poco más el logo

    // Aquí evitamos que el logo y el texto queden superpuestos ajustando X en el titulo
    const posiblesRutas = [
      path.join(process.cwd(), "backend", "public", "logo_extraceite.png"),
      path.join(process.cwd(), "public", "logo_extraceite.png"),
      path.join(process.cwd(), "backend", "public", "logo.png"),
      path.join(process.cwd(), "public", "logo.png")
    ];

    let logoFinalPath = null;
    for (const ruta of posiblesRutas) {
      if (fs.existsSync(ruta)) { logoFinalPath = ruta; break; }
    }

    if (logoFinalPath) {
      // Reducimos un poco mas el logo sin alterar el resto del layout
      try { doc.image(logoFinalPath, logoX, logoY, { width: 52 }); }
      catch (err) { dibujarLogoPlaceholder(doc, logoX, logoY); }
    } else {
      dibujarLogoPlaceholder(doc, logoX, logoY);
    }

    doc.font("Helvetica").fontSize(12).fillColor("black");
    doc.text("SOLICITUD DE PEDIDO A BODEGA EXTRACEITE, S.A.", left + 60, titleY, { align: 'center', width: contentW - 140 });
    
    // N° Number in Red / Dark Pink
    const numeroSolicitud = cab.NumeroSolicitudCorta || '000000';
doc.font("Helvetica").fontSize(14).fillColor("#a13854");
doc.text(`N°  ${numeroSolicitud}`, right - 110, titleY, { align: 'right', width: 110 });

doc.fillColor("black");

const headerTextY = titleY + 45;

// FECHA
doc.font("Helvetica").fontSize(9);
doc.text("FECHA:", left, headerTextY);
doc.text(fmtDate(cab.FechaSolicitudTexto), left + 45, headerTextY - 2);
doc.moveTo(left + 35, headerTextY + 10).lineTo(left + 220, headerTextY + 10).stroke();

// ESTADO
doc.text("ESTADO:", right - 220, headerTextY);
doc.text(String(cab.Estado || "PENDIENTE"), right - 150, headerTextY - 2);
doc.moveTo(right - 155, headerTextY + 10).lineTo(right, headerTextY + 10).stroke();

    const tableY = headerTextY + 15; // Reducido algo de espacio aquí también
    const headerH = 22;
    const rowHTable = 22; // Reducido un poquito (de 24 a 22) para que las 9 filas suban juntas
    const rowsLimit = 9;

    const cellPadY = 4;
    const cellH = rowHTable - (cellPadY * 2);
    const baseFontSize = 9; // Subimos el tamaño por defecto de la tabla a 9
    const minFontSize = 5; // Permitimos que, si el texto es excesivamente largo, se reduzca hasta tamaño 5 para que siempre quepa completo
    const drawCellTextFit = (
      text: any,
      x: number,
      y: number,
      w: number,
      align: 'left' | 'center' | 'right' = 'left',
      fit: boolean = false,
      baseSizeOverride?: number,
      minSizeOverride?: number,
    ) => {
      const value = text == null ? '' : String(text);
      const measureOpts = { width: w, lineBreak: true } as const;

      const localBase = baseSizeOverride ?? baseFontSize;
      const localMin = minSizeOverride ?? minFontSize;

      let fontSize = localBase;
      if (fit && value) {
        for (let fs = localBase; fs >= localMin; fs -= 0.5) { // Vamos decreciendo de a 0.5 puntos para el un ajuste más suave
          doc.fontSize(fs);
          const h = doc.heightOfString(value, measureOpts as any);
          if (h <= cellH) {
            fontSize = fs;
            break;
          }
          fontSize = fs;
        }
      }

      doc.fontSize(fontSize);
      const fits = !value ? true : doc.heightOfString(value, measureOpts as any) <= cellH;

      // Un cálculo simple para centrar verticalmente según el tamaño de fuente final
      const textH = doc.heightOfString(value, measureOpts as any);
      const offsetY = Math.max(0, (cellH - textH) / 2);

      doc.text(value, x, y + cellPadY + offsetY, { // Sumamos ese offsetY para que si el texto es chiquito, quede en el medio vertical de la celda
        width: w,
        height: cellH,
        align,
        lineBreak: true,
        ellipsis: !fits, // Si a pesar de bajar a 5pt sigue sin caber, pone puntos suspensivos (aunque es casi imposible en ese tamaño)
      });

      doc.fontSize(baseFontSize);
    };

    const wCodigo = 55;
    const wDesc = 255; // Le damos a DESCRIPCIÓN los puntos adicionales
    const wUM = 60;
    const wCant = 50;
    const wAct = 75;
    const wCCO = contentW - (wCodigo + wDesc + wUM + wCant + wAct); // Ahora CCO será más delgado

    fillStrokeBox(left, tableY, contentW, headerH);
    doc.font("Helvetica").fontSize(9);
    doc.text("CÓDIGO", left, tableY + 6, { width: wCodigo, align: 'center' });
    doc.text("DESCRIPCIÓN MATERIAL", left + wCodigo, tableY + 6, { width: wDesc, align: 'center' });
    doc.text("U/MEDIDA", left + wCodigo + wDesc, tableY + 6, { width: wUM, align: 'center' });
    doc.text("CANTIDAD", left + wCodigo + wDesc + wUM, tableY + 6, { width: wCant, align: 'center' });
    doc.text("ACTIVIDAD", left + wCodigo + wDesc + wUM + wCant, tableY + 6, { width: wAct, align: 'center' });
    doc.text("C.CUENTA", left + wCodigo + wDesc + wUM + wCant + wAct, tableY + 6, { width: wCCO, align: 'center' });

    for (let i = 0; i < rowsLimit; i++) {
      const y = tableY + headerH + (i * rowHTable);
      doc.moveTo(left, y).lineTo(right, y).stroke();
      const it = detalle[i];
      if (it) {
        doc.font("Helvetica").fontSize(8);
        drawCellTextFit(it.Codigo, left, y, wCodigo, 'center');
        drawCellTextFit(it.Descripcion, left + wCodigo + 5, y, wDesc - 10, 'left', true);
        drawCellTextFit(it.UnidadMedida, left + wCodigo + wDesc, y, wUM, 'center');
        drawCellTextFit(String(it.CantidadSolicitada), left + wCodigo + wDesc + wUM, y, wCant, 'center');
        // Prioridad: actividad capturada en la línea, luego OT de cabecera, luego actividad/área derivada.
        const actividadLinea = typeof it.ActividadLinea === 'string' ? String(it.ActividadLinea).trim() : '';
        const actividadValor = actividadLinea || ((cab.OT && String(cab.OT).trim() !== '') ? String(cab.OT) : (it.Actividad || cab.AreaNombre || ''));
        drawCellTextFit(
          actividadValor,
          left + wCodigo + wDesc + wUM + wCant + 2,
          y,
          wAct - 4,
          'center',
          true,
          8.5,
          4.5,
        );
        drawCellTextFit(
          it.CodigoCuenta || cab.CodigoCC || '',
          left + wCodigo + wDesc + wUM + wCant + wAct + 2,
          y,
          wCCO - 4,
          'center',
          true,
          8.5,
          5,
        );
      }
    }
    
    // Lazo de cierre inferior
    const yLineBottom = tableY + headerH + (rowsLimit * rowHTable);
    doc.moveTo(left, yLineBottom).lineTo(right, yLineBottom).stroke();

    // Lineas verticales
    let curX = left;
    [wCodigo, wDesc, wUM, wCant, wAct].forEach(w => {
        curX += w;
        doc.moveTo(curX, tableY).lineTo(curX, tableY + headerH + (rowsLimit * rowHTable)).stroke();
    });
    // Borde exterior completo
    strokeBox(left, tableY, contentW, headerH + (rowsLimit * rowHTable));

    const tableBottomY = tableY + headerH + (rowsLimit * rowHTable);

    // Etiqueta FR-F-BD-022
    doc.font("Helvetica").fontSize(8).fillColor("black");
    doc.text("FR-F-BD-022", left + 2, tableBottomY + 3);

    const sigY = tableBottomY + 45;
    doc.font("Helvetica").fontSize(9);
    
    const nombreAprobador = String(cab.NombreAprobador || 'PENDIENTE DE APROBACIÓN');

doc.moveTo(left + 25, sigY).lineTo(left + 200, sigY).stroke();
doc.font("Helvetica").fontSize(9);
doc.text(nombreAprobador, left + 25, sigY - 12, { width: 175, align: 'center' });
doc.text("Autorizado por", left + 25, sigY + 5, { width: 175, align: 'center' });
doc.text("Jefe de Producción", left + 25, sigY + 15, { width: 175, align: 'center' });

doc.moveTo(right - 200, sigY).lineTo(right - 25, sigY).stroke();
doc.text("Retirado por", right - 200, sigY + 5, { width: 175, align: 'center' });
doc.text("Nombre y firma", right - 200, sigY + 15, { width: 175, align: 'center' });

  };

  drawRequisa(40);
  doc.end();
  return stream;
}
