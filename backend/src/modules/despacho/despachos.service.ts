import sql from 'mssql';
import { getPool } from '../../config/db';
import { buildDespachosPreviosOuterApply, resolveDetalleDespachosSchema } from '../../infra/detalleDespachos';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';

const SOLICITUD_DESPACHABLE_STATES = ['APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA'];

function normalizeSolicitudState(value: unknown): string {
  const normalized = String(value ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'DESPACHADA':
    case 'DESPACHADA_TOTAL':
    case 'DESPACHADA TOTAL':
      return 'COMPLETADA';
    case 'DESPACHADA_PARCIAL':
    case 'DESPACHADA PARCIAL':
      return 'PARCIALMENTE_DESPACHADA';
    case 'CERRADA PARCIAL':
      return 'CERRADA_PARCIAL';
    case 'EN DESPACHO':
    case 'ENDESPACHO':
      return 'EN_DESPACHO';
    default:
      return normalized;
  }
}

function normalizeDispatchAction(value: unknown): 'despachar' | 'cerrar_parcial' {
  return String(value ?? '').trim().toLowerCase() === 'cerrar_parcial' ? 'cerrar_parcial' : 'despachar';
}

function normalizeOptionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function resolvePdfLogoPath(): string | null {
  const posiblesRutas = [
    path.join(process.cwd(), 'backend', 'public', 'logo_extraceite.png'),
    path.join(process.cwd(), 'public', 'logo_extraceite.png'),
    path.join(process.cwd(), 'backend', 'public', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
  ];

  for (const ruta of posiblesRutas) {
    if (fs.existsSync(ruta)) {
      return ruta;
    }
  }

  return null;
}

async function resolveSolicitudClosureColumns(request: sql.Request): Promise<{
  motivo: boolean;
  fecha: boolean;
  usuario: boolean;
}> {
  const result = await request.query(`
    SELECT
      CASE WHEN COL_LENGTH('dbo.SolicitudesMaterial', 'MotivoCierreParcial') IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasMotivo,
      CASE WHEN COL_LENGTH('dbo.SolicitudesMaterial', 'FechaCierreParcial') IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasFecha,
      CASE WHEN COL_LENGTH('dbo.SolicitudesMaterial', 'IdUsuarioCierreParcial') IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasUsuario;
  `);

  return {
    motivo: Boolean(result.recordset?.[0]?.HasMotivo),
    fecha: Boolean(result.recordset?.[0]?.HasFecha),
    usuario: Boolean(result.recordset?.[0]?.HasUsuario),
  };
}

async function resolveDetalleDevolucionColumns(request: sql.Request): Promise<{
  observacionLinea: boolean;
}> {
  const result = await request.query(`
    SELECT
      CASE
        WHEN COL_LENGTH('dbo.DetalleDevolucionesDespacho', 'ObservacionLinea') IS NULL THEN CAST(0 AS bit)
        ELSE CAST(1 AS bit)
      END AS HasObservacionLinea;
  `);

  return {
    observacionLinea: Boolean(result.recordset?.[0]?.HasObservacionLinea),
  };
}

async function marcarSolicitudCerradaParcial(request: sql.Request, args: {
  idSolicitud: number;
  motivo: string | null;
  idUsuario: number | null;
}) {
  const closureColumns = await resolveSolicitudClosureColumns(request);
  const setClauses = ['Estado = @EstadoCierreParcial'];

  request.input('EstadoCierreParcial', sql.NVarChar(30), 'CERRADA_PARCIAL');

  if (closureColumns.motivo) {
    request.input('MotivoCierreParcial', sql.NVarChar(500), args.motivo);
    setClauses.push('MotivoCierreParcial = @MotivoCierreParcial');
  }

  if (closureColumns.fecha) {
    setClauses.push('FechaCierreParcial = SYSDATETIME()');
  }

  if (closureColumns.usuario) {
    request.input('IdUsuarioCierreParcial', sql.Int, args.idUsuario ?? null);
    setClauses.push('IdUsuarioCierreParcial = @IdUsuarioCierreParcial');
  }

  await request
    .input('IdSolicitudCierreParcial', sql.Int, args.idSolicitud)
    .query(`
      UPDATE dbo.SolicitudesMaterial
      SET ${setClauses.join(', ')}
      WHERE IdSolicitud = @IdSolicitudCierreParcial;
    `);
}

export interface DespachoPendiente {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  NombreSolicitante: string;
  AreaNombre: string;
  AreaResumen?: string;
  AreasDetalle?: string[];
  CodigoCuenta?: string | null;
  CodigoCuentaResumen?: string;
  CodigosCuentaDetalle?: string[];
  OT?: string | null;
  Estado: string;
  EstadoDespacho?: 'LISTA_PARA_DESPACHO' | 'NO_LISTA';
  ListaParaDespachar?: boolean;
  EstadoDespachoLabel?: string;
  ItemsTotal: number;
}

export interface DetalleDespachoItem {
  IdDetalleSolicitud: number;
  IdMaterial: number;
  IdArea?: number | null;
  AreaNombre?: string | null;
  IdRecurso?: number | null;
  RecursoNombre?: string | null;
  Codigo: string;
  Descripcion: string;
  CodigoCuenta?: string | null;
  UnidadMedida: string;
  CantidadSolicitada: number;
  CantidadAprobada: number;
  CantidadEntregada?: number;
  CantidadPendiente: number;
  EnStock: number;
}

export interface SolicitudDespachoDetalle {
  cabecera: DespachoPendiente;
  detalle: DetalleDespachoItem[];
}

export interface DevolucionDespachoResumen {
  IdDevolucion: number;
  CodigoDevolucion: string;
  IdDespacho: number;
  IdSolicitud: number;
  FechaDespachoOrigen: string;
  FechaDevolucion: string;
  IdUsuarioRecibe: number;
  NombreUsuarioRecibe: string | null;
  Motivo: string;
  Observaciones?: string | null;
  Estado: string;
  ReversaPresupuesto: boolean;
  FueraVentanaPresupuesto: boolean;
  FechaLimiteReversion: string;
  MontoReversionPresupuesto: number;
  ItemsDevueltos: number;
}

export interface DevolucionDetalleLinea {
  IdDetalleDespacho: number;
  IdDetalleSolicitud?: number | null;
  IdMaterial: number;
  Codigo: string;
  Descripcion: string;
  UnidadMedida: string;
  AreaNombre?: string | null;
  CodigoCuenta?: string | null;
  CantidadDespachada: number;
  CantidadYaDevuelta: number;
  CantidadDisponibleDevolver: number;
}

export interface DetalleParaDevolucion {
  cabecera: {
    IdDespacho: number;
    IdSolicitud: number;
    CodigoSolicitud: string;
    FechaDespacho: string;
    FechaSolicitud: string;
    OT?: string | null;
    NombreSolicitante: string;
    NombreDespachador: string;
    AreaNombre: string;
    AreaResumen?: string;
    AreasDetalle?: string[];
    CodigoCuenta?: string | null;
    CodigoCuentaResumen?: string;
    CodigosCuentaDetalle?: string[];
    FechaLimiteReversion: string;
    ReversaPresupuestoPreview: boolean;
    FueraVentanaPresupuestoPreview: boolean;
  };
  detalle: DevolucionDetalleLinea[];
}

type SolicitudResumenData = {
  areas: string[];
  codigosCuenta: string[];
};

function compactText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
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

function buildNumericInClause(request: sql.Request, values: number[], prefix: string): string {
  return values.map((value, index) => {
    const paramName = `${prefix}${index}`;
    request.input(paramName, sql.Int, value);
    return `@${paramName}`;
  }).join(', ');
}

async function cargarResumenSolicitudes(
  pool: sql.ConnectionPool,
  idsSolicitud: number[],
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

  const request = pool.request();
  const inClause = buildNumericInClause(request, ids, 'IdSolicitudResumen');
  const result = await request.query(`
    SELECT
      d.IdSolicitud,
      COALESCE(a_det.Nombre, a_cab.Nombre, NULLIF(LTRIM(RTRIM(s.Area)), '')) AS AreaNombre,
      NULLIF(LTRIM(RTRIM(COALESCE(cuenta.CodigoCuenta, cc.Codigo))), '') AS CodigoCuenta
    FROM DetalleSolicitudesMaterial d
    JOIN SolicitudesMaterial s ON s.IdSolicitud = d.IdSolicitud
    LEFT JOIN Areas a_det ON a_det.IdArea = d.IdArea
    LEFT JOIN Areas a_cab ON a_cab.IdArea = s.IdArea
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a_cab.IdCentroCosto)
    OUTER APPLY (
      SELECT TOP 1 mr.IdRecurso
      FROM MaterialRecurso mr
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
      FROM AreaRecursoCuenta arc
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
    WHERE d.IdSolicitud IN (${inClause})
  `);

  const summaryMap = new Map<number, SolicitudResumenData>();

  for (const row of result.recordset ?? []) {
    const idSolicitud = Number(row.IdSolicitud ?? 0);
    if (idSolicitud <= 0) {
      continue;
    }

    const entry = summaryMap.get(idSolicitud) ?? { areas: [], codigosCuenta: [] };
    const areaNombre = compactText(row.AreaNombre);
    const codigoCuenta = compactText(row.CodigoCuenta);

    if (areaNombre && !entry.areas.includes(areaNombre)) {
      entry.areas.push(areaNombre);
    }

    if (codigoCuenta && !entry.codigosCuenta.includes(codigoCuenta)) {
      entry.codigosCuenta.push(codigoCuenta);
    }

    summaryMap.set(idSolicitud, entry);
  }

  return summaryMap;
}

function enriquecerResumenSolicitud<TRow extends { IdSolicitud: number; AreaNombre?: string | null; CodigoCuenta?: string | null }>(
  row: TRow,
  resumen: SolicitudResumenData | undefined,
): TRow & {
  AreaResumen: string;
  AreasDetalle: string[];
  CodigoCuentaResumen: string;
  CodigosCuentaDetalle: string[];
} {
  const areas = uniqueTexts([...(resumen?.areas ?? []), row.AreaNombre]);
  const codigosCuenta = uniqueTexts([...(resumen?.codigosCuenta ?? []), row.CodigoCuenta]);

  return {
    ...row,
    AreaResumen: formatCompactSummary(areas),
    AreasDetalle: areas,
    CodigoCuentaResumen: formatCompactSummary(codigosCuenta),
    CodigosCuentaDetalle: codigosCuenta,
  };
}

export async function listarSolicitudesPendientes(params: {
  page?: number;
  pageSize?: number;
} = {}): Promise<{ data: DespachoPendiente[]; total: number; totalItems: number }> {
  const pool = await getPool();
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 10)));
  const offset = (page - 1) * pageSize;

  const result = await pool.request()
    .input('Offset', sql.Int, offset)
    .input('PageSize', sql.Int, pageSize)
    .query(`
      WITH Pendientes AS (
        SELECT
          s.IdSolicitud,
          s.CodigoSolicitud,
          s.FechaSolicitud,
          u.NombreCompleto AS NombreSolicitante,
          COALESCE(a.Nombre, s.Area) AS AreaNombre,
          COALESCE(cc.Codigo, NULLIF(LTRIM(RTRIM(cc.Nombre)), '')) AS CodigoCuenta,
          s.OT,
          s.Estado,
          CASE
            WHEN s.Estado IN ('APROBADA', 'PARCIALMENTE_DESPACHADA') THEN 'LISTA_PARA_DESPACHO'
            ELSE 'NO_LISTA'
          END AS EstadoDespacho,
          CASE
            WHEN s.Estado IN ('APROBADA', 'PARCIALMENTE_DESPACHADA') THEN CAST(1 AS bit)
            ELSE CAST(0 AS bit)
          END AS ListaParaDespachar,
          CASE
            WHEN s.Estado = 'APROBADA' THEN 'Aprobada'
            WHEN s.Estado = 'PARCIALMENTE_DESPACHADA' THEN 'Parcialmente Despachada'
            ELSE 'No lista'
          END AS EstadoDespachoLabel,
          (SELECT COUNT(*) FROM DetalleSolicitudesMaterial d WHERE d.IdSolicitud = s.IdSolicitud) AS ItemsTotal
        FROM SolicitudesMaterial s
        JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
        LEFT JOIN Areas a ON s.IdArea = a.IdArea
        LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
        WHERE s.Estado IN ('APROBADA', 'PARCIALMENTE_DESPACHADA')
      )
      SELECT
        *,
        COUNT(*) OVER() AS TotalRegistros,
        SUM(ItemsTotal) OVER() AS TotalItemsPendientes
      FROM Pendientes
      ORDER BY FechaSolicitud DESC
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    `);

  const rows = result.recordset ?? [];
  const total = Number(rows[0]?.TotalRegistros ?? 0);
  const totalItems = Number(rows[0]?.TotalItemsPendientes ?? 0);
  const resumenes = await cargarResumenSolicitudes(pool, rows.map((row) => Number(row.IdSolicitud)));

  const data = rows.map((row) => {
    const { TotalRegistros, TotalItemsPendientes, ...baseRow } = row;
    return enriquecerResumenSolicitud(baseRow as DespachoPendiente, resumenes.get(Number(row.IdSolicitud)));
  });

  return { data, total, totalItems };
}

export async function listarSolicitudesDespachadas(params: {
  fechaDesde?: string;
  fechaHasta?: string;
  idArea?: number;
  idDespachador?: number;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ data: any[]; total: number }> {
  const pool = await getPool();
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 10)));
  const offset = (page - 1) * pageSize;
  const closureColumns = await resolveSolicitudClosureColumns(pool.request());

  const cierreMotivoExpr = closureColumns.motivo
    ? "NULLIF(LTRIM(RTRIM(s.MotivoCierreParcial)), '')"
    : 'CAST(NULL AS NVARCHAR(500))';
  const cierreFechaExpr = closureColumns.fecha
    ? 's.FechaCierreParcial'
    : 'CAST(NULL AS DATETIME2(0))';
  const cierreUsuarioExpr = closureColumns.usuario
    ? 's.IdUsuarioCierreParcial'
    : 'CAST(NULL AS INT)';
  const cierreUsuarioJoin = closureColumns.usuario
    ? 'LEFT JOIN Usuarios uc ON s.IdUsuarioCierreParcial = uc.IdUsuario'
    : 'LEFT JOIN Usuarios uc ON 1 = 0';
  const cierreFechaEventoExpr = closureColumns.fecha
    ? 'COALESCE(s.FechaCierreParcial, cierreStats.UltimaFechaMovimiento, s.FechaSolicitud)'
    : 'COALESCE(cierreStats.UltimaFechaMovimiento, s.FechaSolicitud)';

  const request = pool.request();
  const despachoWhereClauses: string[] = [];
  const cierreWhereClauses: string[] = ["s.Estado = 'CERRADA_PARCIAL'"];
  const devolucionWhereClauses: string[] = ["UPPER(LTRIM(RTRIM(ISNULL(dev.Estado, '')))) IN ('REGISTRADA', 'ANULADA', 'ANULADO')"];

  if (params.fechaDesde) {
    request.input('FechaDesde', sql.Date, params.fechaDesde);
    despachoWhereClauses.push('CAST(d.FechaDespacho AS date) >= @FechaDesde');
    cierreWhereClauses.push(`CAST(${cierreFechaEventoExpr} AS date) >= @FechaDesde`);
    devolucionWhereClauses.push('CAST(dev.FechaDevolucion AS date) >= @FechaDesde');
  }
  if (params.fechaHasta) {
    request.input('FechaHasta', sql.Date, params.fechaHasta);
    despachoWhereClauses.push('CAST(d.FechaDespacho AS date) <= @FechaHasta');
    cierreWhereClauses.push(`CAST(${cierreFechaEventoExpr} AS date) <= @FechaHasta`);
    devolucionWhereClauses.push('CAST(dev.FechaDevolucion AS date) <= @FechaHasta');
  }
  if (params.idArea) {
    request.input('IdArea', sql.Int, params.idArea);
    despachoWhereClauses.push('s.IdArea = @IdArea');
    cierreWhereClauses.push('s.IdArea = @IdArea');
    devolucionWhereClauses.push('s.IdArea = @IdArea');
  }
  if (params.idDespachador) {
    request.input('IdDespachador', sql.Int, params.idDespachador);
    despachoWhereClauses.push('d.IdUsuarioDespacha = @IdDespachador');
    cierreWhereClauses.push(closureColumns.usuario ? 's.IdUsuarioCierreParcial = @IdDespachador' : '1 = 0');
    devolucionWhereClauses.push('dev.IdUsuarioRecibe = @IdDespachador');
  }

  const despachoWhereStr = despachoWhereClauses.length > 0 ? `WHERE ${despachoWhereClauses.join(' AND ')}` : '';
  const cierreWhereStr = `WHERE ${cierreWhereClauses.join(' AND ')}`;
  const devolucionWhereStr = `WHERE ${devolucionWhereClauses.join(' AND ')}`;

  request.input('Offset', sql.Int, offset);
  request.input('PageSize', sql.Int, pageSize);

  const result = await request.query(`
    WITH HistorialBase AS (
      SELECT
        CAST('DESPACHO' AS NVARCHAR(30)) AS HistorialTipo,
        d.IdDespacho,
        d.FechaDespacho,
        d.Estado AS EstadoDespacho,
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.OT,
        u.NombreCompleto AS NombreSolicitante,
        ud.NombreCompleto AS NombreDespachador,
        COALESCE(a.Nombre, s.Area) AS AreaNombre,
        COALESCE(cc.Codigo, NULLIF(LTRIM(RTRIM(cc.Nombre)), '')) AS CodigoCuenta,
        s.Estado AS EstadoSolicitud,
        (SELECT COUNT(*) FROM DetalleDespachos dd WHERE dd.IdDespacho = d.IdDespacho) AS ItemsDespachados,
        ${cierreMotivoExpr} AS MotivoCierreParcial,
        ${cierreFechaExpr} AS FechaCierreParcial,
        ${cierreUsuarioExpr} AS IdUsuarioCierreParcial,
        uc.NombreCompleto AS NombreUsuarioCierreParcial,
        CAST(NULL AS INT) AS IdDevolucion,
        CAST(NULL AS NVARCHAR(50)) AS CodigoDevolucion,
        CAST(NULL AS NVARCHAR(500)) AS MotivoDevolucion,
        CAST(NULL AS NVARCHAR(MAX)) AS ObservacionesDevolucion,
        CAST(CASE WHEN ISNULL(saldoDev.SaldoDisponibleDevolucion, 0) > 0 THEN 1 ELSE 0 END AS bit) AS TieneSaldoDevoluble,
        CAST(ISNULL(saldoDev.SaldoDisponibleDevolucion, 0) AS DECIMAL(18,4)) AS SaldoDisponibleDevolucion,
        CAST(NULL AS bit) AS ReversaPresupuesto,
        CAST(NULL AS bit) AS FueraVentanaPresupuesto,
        CAST(NULL AS DECIMAL(18,2)) AS MontoReversionPresupuesto
      FROM Despachos d
      JOIN SolicitudesMaterial s ON d.IdSolicitud = s.IdSolicitud
      JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
      JOIN Usuarios ud ON d.IdUsuarioDespacha = ud.IdUsuario
      LEFT JOIN Areas a ON s.IdArea = a.IdArea
      LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
      ${cierreUsuarioJoin}
      OUTER APPLY (
        SELECT
          SUM(
            CASE
              WHEN (dd_hist.CantidadDespachada - ISNULL(devueltos.CantidadYaDevuelta, 0)) > 0
                THEN (dd_hist.CantidadDespachada - ISNULL(devueltos.CantidadYaDevuelta, 0))
              ELSE 0
            END
          ) AS SaldoDisponibleDevolucion
        FROM dbo.DetalleDespachos dd_hist
        OUTER APPLY (
          SELECT SUM(ddv.CantidadDevuelta) AS CantidadYaDevuelta
          FROM dbo.DetalleDevolucionesDespacho ddv
          INNER JOIN dbo.DevolucionesDespacho dev_hist
            ON dev_hist.IdDevolucion = ddv.IdDevolucion
          WHERE ddv.IdDetalleDespacho = dd_hist.IdDetalleDespacho
            AND dev_hist.Estado = 'REGISTRADA'
        ) devueltos
        WHERE dd_hist.IdDespacho = d.IdDespacho
      ) saldoDev
      ${despachoWhereStr}

      UNION ALL

      SELECT
        CAST('CIERRE_PARCIAL' AS NVARCHAR(30)) AS HistorialTipo,
        CAST(NULL AS INT) AS IdDespacho,
        ${cierreFechaEventoExpr} AS FechaDespacho,
        CAST('CIERRE_PARCIAL' AS NVARCHAR(30)) AS EstadoDespacho,
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.OT,
        u.NombreCompleto AS NombreSolicitante,
        COALESCE(uc.NombreCompleto, CAST('Sin registro' AS NVARCHAR(200))) AS NombreDespachador,
        COALESCE(a.Nombre, s.Area) AS AreaNombre,
        COALESCE(cc.Codigo, NULLIF(LTRIM(RTRIM(cc.Nombre)), '')) AS CodigoCuenta,
        s.Estado AS EstadoSolicitud,
        ISNULL(cierreStats.ItemsDespachados, 0) AS ItemsDespachados,
        ${cierreMotivoExpr} AS MotivoCierreParcial,
        ${cierreFechaExpr} AS FechaCierreParcial,
        ${cierreUsuarioExpr} AS IdUsuarioCierreParcial,
        uc.NombreCompleto AS NombreUsuarioCierreParcial,
        CAST(NULL AS INT) AS IdDevolucion,
        CAST(NULL AS NVARCHAR(50)) AS CodigoDevolucion,
        CAST(NULL AS NVARCHAR(500)) AS MotivoDevolucion,
        CAST(NULL AS NVARCHAR(MAX)) AS ObservacionesDevolucion,
        CAST(0 AS bit) AS TieneSaldoDevoluble,
        CAST(0 AS DECIMAL(18,4)) AS SaldoDisponibleDevolucion,
        CAST(NULL AS bit) AS ReversaPresupuesto,
        CAST(NULL AS bit) AS FueraVentanaPresupuesto,
        CAST(NULL AS DECIMAL(18,2)) AS MontoReversionPresupuesto
      FROM SolicitudesMaterial s
      JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
      LEFT JOIN Areas a ON s.IdArea = a.IdArea
      LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
      ${cierreUsuarioJoin}
      OUTER APPLY (
        SELECT
          MAX(desp.FechaDespacho) AS UltimaFechaMovimiento,
          COUNT(*) AS ItemsDespachados
        FROM DetalleDespachos dd
        JOIN Despachos desp ON dd.IdDespacho = desp.IdDespacho
        WHERE desp.IdSolicitud = s.IdSolicitud
      ) cierreStats
      ${cierreWhereStr}

      UNION ALL

      SELECT
        CAST('DEVOLUCION' AS NVARCHAR(30)) AS HistorialTipo,
        dev.IdDespacho,
        dev.FechaDevolucion AS FechaDespacho,
        CAST(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(dev.Estado, '')))) IN ('ANULADA', 'ANULADO') THEN 'ANULADA'
            WHEN ISNULL(dev.ReversaPresupuesto, 0) = 1 THEN 'DEVOLUCION_REVERSA'
            ELSE 'DEVOLUCION_STOCK'
          END
        AS NVARCHAR(30)) AS EstadoDespacho,
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.OT,
        u.NombreCompleto AS NombreSolicitante,
        ur.NombreCompleto AS NombreDespachador,
        COALESCE(a.Nombre, s.Area) AS AreaNombre,
        COALESCE(cc.Codigo, NULLIF(LTRIM(RTRIM(cc.Nombre)), '')) AS CodigoCuenta,
        s.Estado AS EstadoSolicitud,
        (
          SELECT COUNT(*)
          FROM dbo.DetalleDevolucionesDespacho ddv_count
          WHERE ddv_count.IdDevolucion = dev.IdDevolucion
        ) AS ItemsDespachados,
        CAST(NULL AS NVARCHAR(500)) AS MotivoCierreParcial,
        CAST(NULL AS DATETIME2) AS FechaCierreParcial,
        CAST(NULL AS INT) AS IdUsuarioCierreParcial,
        CAST(NULL AS NVARCHAR(200)) AS NombreUsuarioCierreParcial,
        dev.IdDevolucion,
        dev.CodigoDevolucion,
        dev.Motivo AS MotivoDevolucion,
        dev.Observaciones AS ObservacionesDevolucion,
        CAST(0 AS bit) AS TieneSaldoDevoluble,
        CAST(0 AS DECIMAL(18,4)) AS SaldoDisponibleDevolucion,
        dev.ReversaPresupuesto,
        dev.FueraVentanaPresupuesto,
        CAST(ISNULL(dev.MontoReversionPresupuesto, 0) AS DECIMAL(18,2)) AS MontoReversionPresupuesto
      FROM dbo.DevolucionesDespacho dev
      INNER JOIN dbo.SolicitudesMaterial s ON s.IdSolicitud = dev.IdSolicitud
      INNER JOIN dbo.Usuarios u ON u.IdUsuario = s.IdSolicitante
      LEFT JOIN dbo.Usuarios ur ON ur.IdUsuario = dev.IdUsuarioRecibe
      LEFT JOIN dbo.Areas a ON a.IdArea = s.IdArea
      LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
      ${devolucionWhereStr}
    )
    SELECT
      COUNT(*) OVER() AS TotalRegistros,
      *
    FROM HistorialBase
    ORDER BY FechaDespacho DESC,
      CASE
        WHEN HistorialTipo = 'CIERRE_PARCIAL' THEN 0
        WHEN HistorialTipo = 'DESPACHO' THEN 1
        WHEN HistorialTipo = 'DEVOLUCION' THEN 2
        ELSE 3
      END,
      IdSolicitud DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
  `);

  const rows = result.recordset ?? [];
  const total = Number(rows[0]?.TotalRegistros ?? 0);
  const resumenes = await cargarResumenSolicitudes(pool, rows.map((row) => Number(row.IdSolicitud)));

  return {
    data: rows.map((row) => enriquecerResumenSolicitud({
      ...row,
      TieneSaldoDevoluble: Boolean(row.TieneSaldoDevoluble),
      SaldoDisponibleDevolucion: Number(row.SaldoDisponibleDevolucion ?? 0),
      ReversaPresupuesto: row.ReversaPresupuesto == null ? null : Boolean(row.ReversaPresupuesto),
      FueraVentanaPresupuesto: row.FueraVentanaPresupuesto == null ? null : Boolean(row.FueraVentanaPresupuesto),
      MontoReversionPresupuesto: Number(row.MontoReversionPresupuesto ?? 0),
    }, resumenes.get(Number(row.IdSolicitud)))),
    total,
  };
}

export async function obtenerSolicitudParaDespacho(id: number): Promise<SolicitudDespachoDetalle | null> {
  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();

  // ─── Cabecera + CodigoCuenta resuelto en UNA sola query ─────────────────────
  // Prioridad: CentroCosto directo > AreaRecursoCuenta con IdRecurso=1 > cualquier ARC activo
  const queryCabecera = `
    SELECT
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      s.OT,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      s.Comentario AS ComentarioSolicitud,
      s.IdArea,
      s.IdCentroCosto,
      cc.Codigo AS CentroCostoCodigo,
      COALESCE(
        cc.Codigo,
        -- AreaRecursoCuenta con IdRecurso=1 activo para el área de cabecera
        (SELECT TOP 1 arc1.CodigoCuenta
         FROM AreaRecursoCuenta arc1
         WHERE arc1.IdArea = s.IdArea
           AND arc1.IdRecurso = 1
           AND ISNULL(arc1.Activo, 1) = 1
           AND LTRIM(RTRIM(ISNULL(arc1.CodigoCuenta,''))) <> ''
         ORDER BY arc1.IdAreaRecursoCuenta DESC),
        -- Cualquier ARC activo para el área de cabecera
        (SELECT TOP 1 arc2.CodigoCuenta
         FROM AreaRecursoCuenta arc2
         WHERE arc2.IdArea = s.IdArea
           AND ISNULL(arc2.Activo, 1) = 1
           AND LTRIM(RTRIM(ISNULL(arc2.CodigoCuenta,''))) <> ''
         ORDER BY arc2.IdAreaRecursoCuenta DESC),
        -- ARC del área del detalle (primer ítem, IdRecurso=1)
        (SELECT TOP 1 arc3.CodigoCuenta
         FROM DetalleSolicitudesMaterial dsub
         JOIN AreaRecursoCuenta arc3 ON arc3.IdArea = dsub.IdArea
         WHERE dsub.IdSolicitud = s.IdSolicitud
           AND dsub.IdArea IS NOT NULL
           AND arc3.IdRecurso = 1
           AND ISNULL(arc3.Activo, 1) = 1
           AND LTRIM(RTRIM(ISNULL(arc3.CodigoCuenta,''))) <> ''
         ORDER BY arc3.IdAreaRecursoCuenta DESC),
        -- ARC del área del detalle (cualquiera activo)
        (SELECT TOP 1 arc4.CodigoCuenta
         FROM DetalleSolicitudesMaterial dsub2
         JOIN AreaRecursoCuenta arc4 ON arc4.IdArea = dsub2.IdArea
         WHERE dsub2.IdSolicitud = s.IdSolicitud
           AND dsub2.IdArea IS NOT NULL
           AND ISNULL(arc4.Activo, 1) = 1
           AND LTRIM(RTRIM(ISNULL(arc4.CodigoCuenta,''))) <> ''
         ORDER BY arc4.IdAreaRecursoCuenta DESC)
      ) AS CodigoCuenta,
      COALESCE(cc.Codigo, cc.Nombre) AS CodigoCentroCosto,
      s.Estado,
      (SELECT COUNT(*) FROM DetalleSolicitudesMaterial dc WHERE dc.IdSolicitud = s.IdSolicitud) AS ItemsTotal
    FROM SolicitudesMaterial s
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a ON (s.IdArea IS NOT NULL AND s.IdArea = a.IdArea)
                      OR (s.IdArea IS NULL AND s.Area = a.Nombre)
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    WHERE s.IdSolicitud = @Id
  `;

  const cabeceraResult = await pool.request()
    .input('Id', sql.Int, id)
    .query(queryCabecera);

  if (cabeceraResult.recordset.length === 0) return null;
  const cabecera = cabeceraResult.recordset[0];
  const estadoActual = normalizeSolicitudState(cabecera.Estado);

  if (!SOLICITUD_DESPACHABLE_STATES.includes(estadoActual)) {
    const e: any = new Error('La solicitud ya no está disponible para despacho');
    e.statusCode = 409;
    throw e;
  }

  // ─── Detalle con saldo REAL pendiente ────────────────────────────────────────
  // CantidadPendiente = Aprobada - SumaDeDespachosPrevios (no Solicitada - Aprobada)
  const queryDetalle = `
    SELECT
      d.IdDetalleSolicitud,
      d.IdMaterial,
      d.IdArea,
      COALESCE(a_det.Nombre, a_cab.Nombre, s.Area) AS AreaNombre,
      COALESCE(d.IdRecurso, recurso.IdRecurso) AS IdRecurso,
      recurso.RecursoNombre,
      m.NumeroArticulo AS Codigo,
      m.DescripcionArticulo AS Descripcion,
      NULLIF(LTRIM(RTRIM(COALESCE(cuenta.CodigoCuenta, cc.Codigo))), '') AS CodigoCuenta,
      m.UnidadMedida,
      d.CantidadSolicitada,
      ISNULL(d.CantidadAprobada, d.CantidadSolicitada) AS CantidadAprobada,
      ISNULL(despachosPrevios.CantidadYaDespachada, 0) AS CantidadEntregada,
      -- Saldo real: lo aprobado (o solicitado si no se ajustó) menos lo que ya salió en despachos anteriores
      CASE 
        WHEN (
          ISNULL(d.CantidadAprobada, d.CantidadSolicitada) - ISNULL(despachosPrevios.CantidadYaDespachada, 0)
        ) > 0 
        THEN (
          ISNULL(d.CantidadAprobada, d.CantidadSolicitada) - ISNULL(despachosPrevios.CantidadYaDespachada, 0)
        )
        ELSE 0 
      END AS CantidadPendiente,
      ISNULL(sa.EnStock, 0) AS EnStock
    FROM DetalleSolicitudesMaterial d
    JOIN SolicitudesMaterial s ON s.IdSolicitud = d.IdSolicitud
    JOIN Materiales m ON d.IdMaterial = m.IdMaterial
    LEFT JOIN StockActual sa ON m.IdMaterial = sa.IdMaterial
    LEFT JOIN Areas a_det ON a_det.IdArea = d.IdArea
    LEFT JOIN Areas a_cab ON a_cab.IdArea = s.IdArea
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a_cab.IdCentroCosto)
    OUTER APPLY (
      SELECT TOP 1
        mr.IdRecurso,
        r.Nombre AS RecursoNombre
      FROM MaterialRecurso mr
      LEFT JOIN Recursos r ON r.IdRecurso = mr.IdRecurso
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
      FROM AreaRecursoCuenta arc
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
    ${buildDespachosPreviosOuterApply(detalleDespachosSchema, {
      solicitudIdExpression: 'd.IdSolicitud',
      detalleSolicitudAlias: 'd',
    })}
    WHERE d.IdSolicitud = @Id
  `;

  const detalleResult = await pool.request()
    .input('Id', sql.Int, id)
    .query(queryDetalle);

  const detalle = detalleResult.recordset as DetalleDespachoItem[];
  const areasDetalle = uniqueTexts(detalle.map((item) => item.AreaNombre));
  const codigosCuentaDetalle = uniqueTexts([
    ...detalle.map((item) => item.CodigoCuenta),
    cabecera.CodigoCuenta,
  ]);

  return {
    cabecera: {
      ...cabecera,
      AreaResumen: formatCompactSummary(areasDetalle),
      AreasDetalle: areasDetalle,
      CodigoCuentaResumen: formatCompactSummary(codigosCuentaDetalle),
      CodigosCuentaDetalle: codigosCuentaDetalle,
    },
    detalle,
  };
}

export async function registrarDespacho(input: {
  idSolicitud: number;
  observaciones: string;
  detalle: { idDetalleSolicitud: number; cantidadDespachada: number }[];
  accion?: 'despachar' | 'cerrar_parcial';
  motivoCierreParcial?: string | null;
  idUsuario?: number;
}) {
  try {
    const accion = normalizeDispatchAction(input.accion);
    const motivoCierreParcial = normalizeOptionalText(input.motivoCierreParcial);

    // Validaciones de entrada (rápidas)
    if (!input?.idSolicitud || !Number.isFinite(input.idSolicitud)) {
      const e: any = new Error('IdSolicitud inválido');
      e.statusCode = 400;
      throw e;
    }
    if (!Array.isArray(input.detalle) || (accion !== 'cerrar_parcial' && input.detalle.length === 0)) {
      const e: any = new Error('El despacho debe contener al menos una línea');
      e.statusCode = 400;
      throw e;
    }
    if (accion === 'cerrar_parcial' && !motivoCierreParcial) {
      const e: any = new Error('Debes indicar el motivo del cierre parcial');
      e.statusCode = 400;
      throw e;
    }

    const normalizado = input.detalle.map((d) => ({
      idDetalleSolicitud: Number(d.idDetalleSolicitud),
      cantidadDespachada: Number(d.cantidadDespachada),
    }));

    for (const d of normalizado) {
      if (!Number.isFinite(d.idDetalleSolicitud) || d.idDetalleSolicitud <= 0) {
        const e: any = new Error('idDetalleSolicitud inválido');
        e.statusCode = 400;
        throw e;
      }
      if (!Number.isFinite(d.cantidadDespachada) || d.cantidadDespachada <= 0) {
        const e: any = new Error('La cantidad a despachar debe ser mayor que cero');
        e.statusCode = 400;
        throw e;
      }
    }

    const pool = await getPool();
    const detalleDespachosSchema = await resolveDetalleDespachosSchema();
    const solicitudResult = await pool.request()
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .query(`
        SELECT TOP 1 Estado
        FROM dbo.SolicitudesMaterial
        WHERE IdSolicitud = @IdSolicitud;
      `);

    const estadoActual = normalizeSolicitudState(solicitudResult.recordset?.[0]?.Estado);
    if (!SOLICITUD_DESPACHABLE_STATES.includes(estadoActual)) {
      const e: any = new Error('La solicitud ya no está disponible para despacho');
      e.statusCode = 409;
      throw e;
    }

    // ─── Validación de negocio contra BD (antes de la transacción) ─────────────
    // Usamos el saldo REAL: CantidadAprobada - SumaDeDespachosPrevios
    const detalleDbResult = await pool.request()
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .query(`
        SELECT
          d.IdDetalleSolicitud,
          d.IdMaterial,
          ISNULL(d.CantidadAprobada, d.CantidadSolicitada) AS CantidadAprobada,
          -- Suma de lo que ya se despachó en eventos anteriores
          ISNULL(despachosPrevios.CantidadYaDespachada, 0) AS CantidadYaDespachada,
          ISNULL(sa.EnStock, 0) AS EnStock
        FROM DetalleSolicitudesMaterial d
        LEFT JOIN StockActual sa ON d.IdMaterial = sa.IdMaterial
        ${buildDespachosPreviosOuterApply(detalleDespachosSchema, {
          solicitudIdExpression: 'd.IdSolicitud',
          detalleSolicitudAlias: 'd',
        })}
        WHERE d.IdSolicitud = @IdSolicitud
      `);

    const detalleDb: Array<{
      IdDetalleSolicitud: number;
      IdMaterial: number;
      CantidadAprobada: number;
      CantidadYaDespachada: number;
      EnStock: number;
    }> = detalleDbResult.recordset;

    if (detalleDb.length === 0) {
      const e: any = new Error(`La solicitud ${input.idSolicitud} no tiene líneas disponibles para despacho`);
      e.statusCode = 404;
      throw e;
    }

    const mapDb = new Map<number, { aprobada: number; yaDespachada: number; enStock: number }>();
    for (const row of detalleDb) {
      mapDb.set(row.IdDetalleSolicitud, {
        aprobada: Number(row.CantidadAprobada ?? 0),
        yaDespachada: Number(row.CantidadYaDespachada ?? 0),
        enStock: Number(row.EnStock ?? 0),
      });
    }

    // Validaciones de negocio por línea
    for (const d of normalizado) {
      const row = mapDb.get(d.idDetalleSolicitud);
      if (!row) {
        const e: any = new Error(`El ítem ${d.idDetalleSolicitud} no pertenece a la solicitud ${input.idSolicitud}`);
        e.statusCode = 400;
        throw e;
      }

      const saldoReal = row.aprobada - row.yaDespachada;
      if (d.cantidadDespachada > saldoReal) {
        const e: any = new Error(
          `La cantidad ${d.cantidadDespachada} excede el saldo pendiente real (${saldoReal}) para la línea ${d.idDetalleSolicitud}`,
        );
        e.statusCode = 409;
        throw e;
      }

      if (d.cantidadDespachada > row.enStock) {
        const e: any = new Error(`Stock insuficiente (${row.enStock}) para la línea ${d.idDetalleSolicitud}`);
        e.statusCode = 409;
        throw e;
      }
    }

    const totalPendienteAntes = detalleDb.reduce((sum, row) => sum + Math.max(Number(row.CantidadAprobada ?? 0) - Number(row.CantidadYaDespachada ?? 0), 0), 0);
    const totalADespacharAhora = normalizado.reduce((sum, item) => sum + item.cantidadDespachada, 0);
    const saldoPendienteDespues = Math.max(totalPendienteAntes - totalADespacharAhora, 0);

    if (accion === 'cerrar_parcial' && saldoPendienteDespues <= 0.0005) {
      const e: any = new Error('No hay saldo pendiente para cerrar parcialmente. Usa despacho total si corresponde.');
      e.statusCode = 409;
      throw e;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let nuevoEstado = 'COMPLETADA';
      let idDespachoGenerado: number | null = null;

      if (normalizado.length > 0) {
        const tvp = new sql.Table('dbo.TDetalleDespacho');
        tvp.columns.add('IdDetalleSolicitud', sql.Int);
        tvp.columns.add('CantidadDespachada', sql.Decimal(18, 4));

        for (const item of normalizado) {
          tvp.rows.add(item.idDetalleSolicitud, item.cantidadDespachada);
        }

        const spRequest = new sql.Request(transaction);
        spRequest.input('IdSolicitud', sql.Int, input.idSolicitud);
        spRequest.input('IdUsuarioDespacha', sql.Int, input.idUsuario || 1);
        spRequest.input('Observaciones', sql.NVarChar(500), input.observaciones || '');
        spRequest.input('Detalle', tvp);

        const spResult = await spRequest.execute('dbo.sp_RegistrarDespacho');
        nuevoEstado = String(spResult.recordset?.[0]?.NuevoEstado ?? 'COMPLETADA');
        idDespachoGenerado = Number(spResult.recordset?.[0]?.IdDespachoGenerado ?? 0) || null;
      }

      if (accion === 'cerrar_parcial') {
        const closeRequest = new sql.Request(transaction);
        await marcarSolicitudCerradaParcial(closeRequest, {
          idSolicitud: input.idSolicitud,
          motivo: motivoCierreParcial,
          idUsuario: input.idUsuario ?? null,
        });
        nuevoEstado = 'CERRADA_PARCIAL';
      }

      const cabeceraResult = await new sql.Request(transaction)
        .input('Id', sql.Int, input.idSolicitud)
        .query(`
          SELECT
            COALESCE(
              cc.Codigo,
              (SELECT TOP 1 arc.CodigoCuenta
               FROM AreaRecursoCuenta arc
               WHERE arc.IdArea = s.IdArea
                 AND arc.IdRecurso = 1
                 AND ISNULL(arc.Activo, 1) = 1
               ORDER BY arc.IdAreaRecursoCuenta DESC)
            ) AS CodigoCCO
          FROM SolicitudesMaterial s
          LEFT JOIN Areas a ON s.IdArea = a.IdArea
          LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
          WHERE s.IdSolicitud = @Id
        `);

      const detalleDespachoResult = idDespachoGenerado
        ? await new sql.Request(transaction)
            .input('IdDespacho', sql.Int, idDespachoGenerado)
            .query(`
              SELECT
                m.NumeroArticulo AS Codigo,
                m.DescripcionArticulo AS Descripcion,
                m.UnidadMedida,
                dd.CantidadDespachada
              FROM DetalleDespachos dd
              JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
              WHERE dd.IdDespacho = @IdDespacho
            `)
        : { recordset: [] as any[] };

      await transaction.commit();

      const codigoCCO = cabeceraResult.recordset[0]?.CodigoCCO || '';

      return {
        despacho: idDespachoGenerado ? {
          CodigoDespacho: `DESP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${idDespachoGenerado}`,
          FechaDespacho: new Date().toISOString(),
          CodigoCentroCosto: codigoCCO,
          CodigoCuenta: codigoCCO,
          Estado: nuevoEstado,
          IdDespacho: idDespachoGenerado,
        } : null,
        detalle: detalleDespachoResult.recordset,
        idDespachoGenerado,
        accion,
        estadoSolicitud: nuevoEstado,
      };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Error al revertir transacción de despacho', rollbackError);
      }
      throw error;
    }

  } catch (error) {
    console.error('Error en registrarDespacho service:', error);
    throw error;
  }
}

export async function listarDevolucionesPorDespacho(
  idDespacho: number,
): Promise<DevolucionDespachoResumen[]> {
  if (!Number.isFinite(idDespacho) || idDespacho <= 0) {
    const e: any = new Error('IdDespacho inválido');
    e.statusCode = 400;
    throw e;
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('IdDespacho', sql.Int, idDespacho)
    .query(`
      SELECT
        dev.IdDevolucion,
        dev.CodigoDevolucion,
        dev.IdDespacho,
        dev.IdSolicitud,
        dev.FechaDespachoOrigen,
        dev.FechaDevolucion,
        dev.IdUsuarioRecibe,
        u.NombreCompleto AS NombreUsuarioRecibe,
        dev.Motivo,
        dev.Observaciones,
        dev.Estado,
        dev.ReversaPresupuesto,
        dev.FueraVentanaPresupuesto,
        dev.FechaLimiteReversion,
        dev.MontoReversionPresupuesto,
        (
          SELECT COUNT(*)
          FROM dbo.DetalleDevolucionesDespacho ddv
          WHERE ddv.IdDevolucion = dev.IdDevolucion
        ) AS ItemsDevueltos
      FROM dbo.DevolucionesDespacho dev
      LEFT JOIN dbo.Usuarios u
        ON u.IdUsuario = dev.IdUsuarioRecibe
      WHERE dev.IdDespacho = @IdDespacho
      ORDER BY dev.FechaDevolucion DESC, dev.IdDevolucion DESC;
    `);

  return (result.recordset ?? []).map((row) => ({
    ...row,
    ReversaPresupuesto: Boolean(row.ReversaPresupuesto),
    FueraVentanaPresupuesto: Boolean(row.FueraVentanaPresupuesto),
    MontoReversionPresupuesto: Number(row.MontoReversionPresupuesto ?? 0),
    ItemsDevueltos: Number(row.ItemsDevueltos ?? 0),
  }));
}

export async function obtenerDetalleParaDevolucion(
  idDespacho: number,
): Promise<DetalleParaDevolucion | null> {
  if (!Number.isFinite(idDespacho) || idDespacho <= 0) {
    const e: any = new Error('IdDespacho inválido');
    e.statusCode = 400;
    throw e;
  }

  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();
  const idDetalleSolicitudExpr = detalleDespachosSchema.hasIdDetalleSolicitud
    ? 'dd.IdDetalleSolicitud'
    : 'CAST(NULL AS INT)';

  const cabeceraResult = await pool.request()
    .input('IdDespacho', sql.Int, idDespacho)
    .query(`
      SELECT TOP 1
        d.IdDespacho,
        d.IdSolicitud,
        d.FechaDespacho,
        s.CodigoSolicitud,
        s.FechaSolicitud,
        s.OT,
        u_sol.NombreCompleto AS NombreSolicitante,
        u_desp.NombreCompleto AS NombreDespachador,
        COALESCE(a.Nombre, s.Area) AS AreaNombre,
        COALESCE(cc.Codigo, NULLIF(LTRIM(RTRIM(cc.Nombre)), '')) AS CodigoCuenta,
        DATEADD(
          MONTH,
          ISNULL((
            SELECT TOP 1 NULLIF(p.ValorEntero, 0)
            FROM dbo.ParametrosModuloInventario p
            WHERE p.Clave = 'MESES_LIMITE_REVERSION_PRESUPUESTO_DEVOLUCION'
              AND p.Activo = 1
          ), 3),
          d.FechaDespacho
        ) AS FechaLimiteReversion,
        CAST(
          CASE
            WHEN SYSDATETIME() <= DATEADD(
              MONTH,
              ISNULL((
                SELECT TOP 1 NULLIF(p.ValorEntero, 0)
                FROM dbo.ParametrosModuloInventario p
                WHERE p.Clave = 'MESES_LIMITE_REVERSION_PRESUPUESTO_DEVOLUCION'
                  AND p.Activo = 1
              ), 3),
              d.FechaDespacho
            ) THEN 1
            ELSE 0
          END
        AS bit) AS ReversaPresupuestoPreview,
        CAST(
          CASE
            WHEN SYSDATETIME() > DATEADD(
              MONTH,
              ISNULL((
                SELECT TOP 1 NULLIF(p.ValorEntero, 0)
                FROM dbo.ParametrosModuloInventario p
                WHERE p.Clave = 'MESES_LIMITE_REVERSION_PRESUPUESTO_DEVOLUCION'
                  AND p.Activo = 1
              ), 3),
              d.FechaDespacho
            ) THEN 1
            ELSE 0
          END
        AS bit) AS FueraVentanaPresupuestoPreview
      FROM dbo.Despachos d
      INNER JOIN dbo.SolicitudesMaterial s
        ON s.IdSolicitud = d.IdSolicitud
      INNER JOIN dbo.Usuarios u_sol
        ON u_sol.IdUsuario = s.IdSolicitante
      INNER JOIN dbo.Usuarios u_desp
        ON u_desp.IdUsuario = d.IdUsuarioDespacha
      LEFT JOIN dbo.Areas a
        ON a.IdArea = s.IdArea
      LEFT JOIN dbo.CentrosCosto cc
        ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
      WHERE d.IdDespacho = @IdDespacho;
    `);

  if ((cabeceraResult.recordset ?? []).length === 0) {
    return null;
  }

  const cabecera = cabeceraResult.recordset[0];

  const detalleResult = await pool.request()
    .input('IdDespacho', sql.Int, idDespacho)
    .query(`
      SELECT
        dd.IdDetalleDespacho,
        ${idDetalleSolicitudExpr} AS IdDetalleSolicitud,
        dd.IdMaterial,
        m.NumeroArticulo AS Codigo,
        m.DescripcionArticulo AS Descripcion,
        m.UnidadMedida,
        COALESCE(a_det.Nombre, s.Area) AS AreaNombre,
        NULLIF(LTRIM(RTRIM(arc.CodigoCuenta)), '') AS CodigoCuenta,
        dd.CantidadDespachada AS CantidadDespachada,
        ISNULL(devPrev.CantidadYaDevuelta, 0) AS CantidadYaDevuelta,
        CASE
          WHEN (dd.CantidadDespachada - ISNULL(devPrev.CantidadYaDevuelta, 0)) > 0
            THEN (dd.CantidadDespachada - ISNULL(devPrev.CantidadYaDevuelta, 0))
          ELSE 0
        END AS CantidadDisponibleDevolver
      FROM dbo.DetalleDespachos dd
      INNER JOIN dbo.Despachos d
        ON d.IdDespacho = dd.IdDespacho
      INNER JOIN dbo.SolicitudesMaterial s
        ON s.IdSolicitud = d.IdSolicitud
      INNER JOIN dbo.Materiales m
        ON m.IdMaterial = dd.IdMaterial
      LEFT JOIN dbo.DetalleSolicitudesMaterial dsm
        ON ${
          detalleDespachosSchema.hasIdDetalleSolicitud
            ? `(dsm.IdDetalleSolicitud = dd.IdDetalleSolicitud
                OR (dd.IdDetalleSolicitud IS NULL AND dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = dd.IdMaterial))`
            : `dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = dd.IdMaterial`
        }
      LEFT JOIN dbo.Areas a_det
        ON a_det.IdArea = COALESCE(dsm.IdArea, s.IdArea)
      LEFT JOIN dbo.MaterialRecurso mr
        ON mr.IdMaterial = dd.IdMaterial
       AND ISNULL(mr.Activo, 1) = 1
      LEFT JOIN dbo.AreaRecursoCuenta arc
        ON arc.IdArea = a_det.IdArea
       AND arc.IdRecurso = COALESCE(dsm.IdRecurso, mr.IdRecurso, 1)
       AND ISNULL(arc.Activo, 1) = 1
      OUTER APPLY (
        SELECT SUM(ddv.CantidadDevuelta) AS CantidadYaDevuelta
        FROM dbo.DetalleDevolucionesDespacho ddv
        INNER JOIN dbo.DevolucionesDespacho dev
          ON dev.IdDevolucion = ddv.IdDevolucion
        WHERE ddv.IdDetalleDespacho = dd.IdDetalleDespacho
          AND dev.Estado = 'REGISTRADA'
      ) devPrev
      WHERE dd.IdDespacho = @IdDespacho
      ORDER BY dd.IdDetalleDespacho ASC;
    `);

  const detalle = (detalleResult.recordset ?? []).map((row) => ({
    ...row,
    CantidadDespachada: Number(row.CantidadDespachada ?? 0),
    CantidadYaDevuelta: Number(row.CantidadYaDevuelta ?? 0),
    CantidadDisponibleDevolver: Number(row.CantidadDisponibleDevolver ?? 0),
  })) as DevolucionDetalleLinea[];

  const resumenes = await cargarResumenSolicitudes(pool, [Number(cabecera.IdSolicitud)]);
  const resumen = resumenes.get(Number(cabecera.IdSolicitud));
  const areas = uniqueTexts([...(resumen?.areas ?? []), cabecera.AreaNombre]);
  const codigos = uniqueTexts([...(resumen?.codigosCuenta ?? []), cabecera.CodigoCuenta]);

  return {
    cabecera: {
      ...cabecera,
      AreaResumen: formatCompactSummary(areas),
      AreasDetalle: areas,
      CodigoCuentaResumen: formatCompactSummary(codigos),
      CodigosCuentaDetalle: codigos,
      ReversaPresupuestoPreview: Boolean(cabecera.ReversaPresupuestoPreview),
      FueraVentanaPresupuestoPreview: Boolean(cabecera.FueraVentanaPresupuestoPreview),
    },
    detalle,
  };
}

export async function registrarDevolucion(input: {
  idDespacho: number;
  idUsuarioRecibe: number;
  motivo: string;
  observaciones?: string | null;
  fechaDevolucion?: string | null;
  detalle: {
    idDetalleDespacho: number;
    cantidadDevuelta: number;
    observacionLinea?: string | null;
  }[];
}) {
  if (!Number.isFinite(input.idDespacho) || input.idDespacho <= 0) {
    const e: any = new Error('IdDespacho inválido');
    e.statusCode = 400;
    throw e;
  }

  if (!Number.isFinite(input.idUsuarioRecibe) || input.idUsuarioRecibe <= 0) {
    const e: any = new Error('IdUsuarioRecibe inválido');
    e.statusCode = 400;
    throw e;
  }

  const motivo = normalizeOptionalText(input.motivo);
  if (!motivo) {
    const e: any = new Error('Debes indicar el motivo de la devolución');
    e.statusCode = 400;
    throw e;
  }

  if (!Array.isArray(input.detalle) || input.detalle.length === 0) {
    const e: any = new Error('Debes enviar al menos una línea para devolución');
    e.statusCode = 400;
    throw e;
  }

  const normalizado = input.detalle.map((item) => ({
    idDetalleDespacho: Number(item.idDetalleDespacho),
    cantidadDevuelta: Number(item.cantidadDevuelta),
    observacionLinea: normalizeOptionalText(item.observacionLinea),
  }));

  for (const item of normalizado) {
    if (!Number.isFinite(item.idDetalleDespacho) || item.idDetalleDespacho <= 0) {
      const e: any = new Error('idDetalleDespacho inválido');
      e.statusCode = 400;
      throw e;
    }

    if (!Number.isFinite(item.cantidadDevuelta) || item.cantidadDevuelta <= 0) {
      const e: any = new Error('La cantidad devuelta debe ser mayor que cero');
      e.statusCode = 400;
      throw e;
    }
  }

  const pool = await getPool();
  const tvp = new sql.Table('dbo.TDetalleDevolucionDespacho');
  tvp.columns.add('IdDetalleDespacho', sql.Int);
  tvp.columns.add('CantidadDevuelta', sql.Decimal(18, 4));
  tvp.columns.add('ObservacionLinea', sql.NVarChar(300));

  for (const item of normalizado) {
    tvp.rows.add(
      item.idDetalleDespacho,
      item.cantidadDevuelta,
      item.observacionLinea ?? null,
    );
  }

  const request = pool.request();
  request.input('IdDespacho', sql.Int, input.idDespacho);
  request.input('IdUsuarioRecibe', sql.Int, input.idUsuarioRecibe);
  request.input('Motivo', sql.NVarChar(500), motivo);
  request.input('Observaciones', sql.NVarChar(500), normalizeOptionalText(input.observaciones) ?? null);
  request.input(
    'FechaDevolucion',
    sql.DateTime2(0),
    input.fechaDevolucion ? new Date(input.fechaDevolucion) : null,
  );
  request.input('Detalle', tvp);

  const result = await request.execute('dbo.sp_RegistrarDevolucionDespacho');
  const fallbackRecordset = Array.isArray(result.recordsets) ? result.recordsets[0] : undefined;
  return result.recordset?.[0] ?? fallbackRecordset?.[0] ?? null;
}

export async function anularDevolucion(input: {
  idDevolucion: number;
  idUsuarioAnula: number;
  motivoAnulacion: string;
  observaciones?: string | null;
}) {
  if (!Number.isFinite(input.idDevolucion) || input.idDevolucion <= 0) {
    const e: any = new Error('IdDevolucion inválido');
    e.statusCode = 400;
    throw e;
  }

  if (!Number.isFinite(input.idUsuarioAnula) || input.idUsuarioAnula <= 0) {
    const e: any = new Error('IdUsuarioAnula inválido');
    e.statusCode = 400;
    throw e;
  }

  const motivoAnulacion = normalizeOptionalText(input.motivoAnulacion);
  if (!motivoAnulacion) {
    const e: any = new Error('Debes indicar el motivo de la anulación');
    e.statusCode = 400;
    throw e;
  }

  const pool = await getPool();
  const request = pool.request();

  request.input('IdDevolucion', sql.Int, input.idDevolucion);
  request.input('IdUsuarioAnula', sql.Int, input.idUsuarioAnula);
  request.input('MotivoAnulacion', sql.NVarChar(500), motivoAnulacion);
  request.input(
    'Observaciones',
    sql.NVarChar(500),
    normalizeOptionalText(input.observaciones) ?? null,
  );

  const result = await request.execute('dbo.sp_AnularDevolucionDespacho');
  const fallbackRecordset = Array.isArray(result.recordsets) ? result.recordsets[0] : undefined;
  return result.recordset?.[0] ?? fallbackRecordset?.[0] ?? null;
}

// Métrica: contar despachos registrados hoy usando Auditoría
export async function contarDespachosHoy(): Promise<number> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT COUNT(*) AS Conteo
    FROM Despachos
    WHERE CONVERT(date, FechaDespacho) = CONVERT(date, GETDATE())
  `);
  return result.recordset[0]?.Conteo ?? 0;
}

export async function generarPdfDespacho(idDespacho: number): Promise<PassThrough> {
  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();

  // 1. Obtener datos del despacho
  const query = `
    SELECT 
      d.IdDespacho,
      d.FechaDespacho,
      d.Observaciones,
      s.CodigoSolicitud,
      s.OT AS OT,
      s.FechaSolicitud,
      u_sol.NombreCompleto AS NombreSolicitante,
      u_desp.NombreCompleto AS NombreDespachador,
      aprob.NombreAprobador,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      COALESCE(
        cc.Codigo, 
        a.Codigo,
        (SELECT TOP 1 arc.CodigoCuenta 
         FROM AreaRecursoCuenta arc 
         WHERE arc.IdArea = s.IdArea AND arc.IdRecurso = 1 AND ISNULL(arc.Activo, 1) = 1)
      ) AS CodigoCC,
      s.IdArea
    FROM Despachos d
    JOIN SolicitudesMaterial s ON d.IdSolicitud = s.IdSolicitud
    JOIN Usuarios u_sol ON s.IdSolicitante = u_sol.IdUsuario
    JOIN Usuarios u_desp ON d.IdUsuarioDespacha = u_desp.IdUsuario
    OUTER APPLY (
      SELECT TOP 1 u_ap.NombreCompleto AS NombreAprobador
      FROM dbo.Aprobaciones ap
      JOIN dbo.Usuarios u_ap ON u_ap.IdUsuario = ap.IdAprobador
      LEFT JOIN dbo.UsuariosRoles ur_ap ON ur_ap.IdUsuario = u_ap.IdUsuario
      LEFT JOIN dbo.Roles r_ap ON r_ap.IdRol = ur_ap.IdRol
      WHERE ap.IdSolicitud = s.IdSolicitud
        AND ap.Estado = 'APROBADA'
      ORDER BY
        CASE
          WHEN LOWER(LTRIM(RTRIM(ISNULL(r_ap.Nombre, '')))) IN ('jefe de producción', 'jefe de produccion') THEN 0
          ELSE 1
        END,
        ap.FechaAprobacion DESC,
        ap.IdAprobacion DESC
    ) aprob
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    WHERE d.IdDespacho = @idDespacho
  `;

  const cabeceraResult = await pool.request()
    .input('idDespacho', sql.Int, idDespacho)
    .query(query);

  if (cabeceraResult.recordset.length === 0) {
    throw new Error('Despacho no encontrado');
  }

  const cab = cabeceraResult.recordset[0];

  // 1.1 Obtener los centros de costo y cuentas de los materiales (usando el IdArea del despacho)
  const queryCcoMateriales = `
    SELECT 
      m.IdMaterial,
      arc.CodigoCuenta
    FROM DetalleDespachos dd
    JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
    LEFT JOIN AreaRecursoCuenta arc ON arc.IdArea = @idArea 
      AND arc.IdRecurso = 1 
      AND ISNULL(arc.Activo, 1) = 1
    WHERE dd.IdDespacho = @idDespacho
  `;

  const ccoResult = await pool.request()
    .input('idDespacho', sql.Int, idDespacho)
    .input('idArea', sql.Int, cab.IdArea)
    .query(queryCcoMateriales);
  
  const mapCco = new Map();
  ccoResult.recordset.forEach(r => mapCco.set(r.IdMaterial, r.CodigoCuenta));

  const queryDetalle = `
    SELECT 
      m.IdMaterial,
      m.NumeroArticulo AS Codigo,
      m.DescripcionArticulo AS Descripcion,
      m.UnidadMedida,
      dd.CantidadDespachada,
      arc.CodigoCuenta AS CodigoCuentaLinea,
      COALESCE(a_det.Nombre, s.Area) AS ActividadLinea
    FROM DetalleDespachos dd
    JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
    JOIN Despachos d_det ON dd.IdDespacho = d_det.IdDespacho
    JOIN SolicitudesMaterial s ON d_det.IdSolicitud = s.IdSolicitud
    LEFT JOIN DetalleSolicitudesMaterial dsm ON ${detalleDespachosSchema.hasIdDetalleSolicitud
      ? `(dsm.IdDetalleSolicitud = dd.IdDetalleSolicitud OR (dd.IdDetalleSolicitud IS NULL AND dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = m.IdMaterial))`
      : 'dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = m.IdMaterial'}
    LEFT JOIN Areas a_det ON a_det.IdArea = COALESCE(dsm.IdArea, s.IdArea)
    LEFT JOIN MaterialRecurso mr ON mr.IdMaterial = m.IdMaterial AND mr.Activo = 1
    LEFT JOIN AreaRecursoCuenta arc ON arc.IdArea = a_det.IdArea 
      AND arc.IdRecurso = mr.IdRecurso 
      AND ISNULL(arc.Activo, 1) = 1
    WHERE dd.IdDespacho = @idDespacho
  `;

  const detalleResult = await pool.request()
    .input('idDespacho', sql.Int, idDespacho)
    .query(queryDetalle);

  const detalle = detalleResult.recordset;

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
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("es-NI") : "";

  const drawRequisa = (startY: number) => {
    const adjustedStartY = startY - 8;
    const titleY = adjustedStartY + 10;

    const logoX = left;
    const logoY = adjustedStartY;
    const logoFinalPath = resolvePdfLogoPath();

    if (logoFinalPath) {
      try { doc.image(logoFinalPath, logoX, logoY, { width: 52 }); }
      catch (err) { dibujarLogoPlaceholder(doc, logoX, logoY); }
    } else {
      dibujarLogoPlaceholder(doc, logoX, logoY);
    }

    doc.font("Helvetica").fontSize(12).fillColor("black");
    doc.text("REQUISA SALIDA DE BODEGA EXTRACEITE", left + 60, titleY, { align: "center", width: contentW - 140 });

    const numFolio = String(cab?.IdDespacho ?? idDespacho).padStart(5, "0");
    doc.font("Helvetica").fontSize(14).fillColor("#a13854");
    doc.text(`N°  ${numFolio}`, right - 110, titleY, { align: "right", width: 110 });

    doc.fillColor("black");

    const headerTextY = titleY + 38;
    doc.font("Helvetica").fontSize(9);
    doc.text("FECHA:", left, headerTextY);
    doc.text(fmtDate(cab?.FechaDespacho), left + 50, headerTextY - 2);
    doc.moveTo(left + 40, headerTextY + 10).lineTo(left + 235, headerTextY + 10).stroke();

    doc.text("SOLICITUD N°:", right - 290, headerTextY);
    doc.text(cab?.CodigoSolicitud || "", right - 165, headerTextY - 2);
    doc.moveTo(right - 170, headerTextY + 10).lineTo(right, headerTextY + 10).stroke();

    const tableY = headerTextY + 18;
    const headerH = 22;
    const rowH = 22;
    const rowsCount = 9;

    const cellPadY = 4;
    const cellH = rowH - (cellPadY * 2);
    const baseFontSize = 9;
    const minFontSize = 5;
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
        for (let fs = localBase; fs >= localMin; fs -= 0.5) {
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
      const textH = doc.heightOfString(value, measureOpts as any);
      const offsetY = Math.max(0, (cellH - textH) / 2);

      doc.text(value, x, y + cellPadY + offsetY, {
        width: w,
        height: cellH,
        align,
        lineBreak: true,
        ellipsis: !fits,
      });

      doc.fontSize(baseFontSize);
    };

    const wCodigo = 55;
    const wDesc = 255;
    const wUM = 60;
    const wCant = 50;
    const wAct = 85;
    const wCCO = contentW - (wCodigo + wDesc + wUM + wCant + wAct);

    fillStrokeBox(left, tableY, contentW, headerH);
    doc.font("Helvetica").fontSize(9);
    doc.text("CÓDIGO", left, tableY + 6, { width: wCodigo, align: "center" });
    doc.text("DESCRIPCIÓN DEL MATERIAL", left + wCodigo, tableY + 6, { width: wDesc, align: "center" });
    doc.text("U/MEDIDA", left + wCodigo + wDesc, tableY + 6, { width: wUM, align: "center" });
    doc.text("CANTIDAD", left + wCodigo + wDesc + wUM, tableY + 6, { width: wCant, align: "center" });
    doc.text("ACTIVIDAD", left + wCodigo + wDesc + wUM + wCant, tableY + 6, { width: wAct, align: "center" });
    doc.text("C.CUENTA", left + wCodigo + wDesc + wUM + wCant + wAct, tableY + 6, { width: wCCO, align: "center" });

    for (let i = 0; i < rowsCount; i++) {
      const curY = tableY + headerH + (i * rowH);
      doc.moveTo(left, curY).lineTo(right, curY).stroke();

      const it = detalle[i];
      if (it) {
        drawCellTextFit(it.Codigo, left, curY, wCodigo, 'center');
        drawCellTextFit(it.Descripcion, left + wCodigo + 5, curY, wDesc - 10, 'left', true, 9, 5);
        drawCellTextFit(it.UnidadMedida, left + wCodigo + wDesc, curY, wUM, 'center', true, 8.5, 5.5);
        drawCellTextFit(String(it.CantidadDespachada ?? ''), left + wCodigo + wDesc + wUM, curY, wCant, 'center');
          // Mostrar OT en ACTIVIDAD si existe y no es vacío; si no, usar la actividad del detalle o el nombre del área
          const actividadValor = (cab?.OT && String(cab.OT).trim() !== '') ? String(cab.OT) : (it.ActividadLinea || cab?.AreaNombre || '');
          drawCellTextFit(
            actividadValor,
            left + wCodigo + wDesc + wUM + wCant + 2,
            curY,
            wAct - 4,
            'center',
            true,
            8.5,
            4.5,
          );
        drawCellTextFit(
          it.CodigoCuentaLinea || cab?.CodigoCC || '',
          left + wCodigo + wDesc + wUM + wCant + wAct + 2,
          curY,
          wCCO - 4,
          'center',
          true,
          8.5,
          5,
        );
      }
    }

    const yLineBottom = tableY + headerH + (rowsCount * rowH);
    doc.moveTo(left, yLineBottom).lineTo(right, yLineBottom).stroke();

    let curX = left;
    [wCodigo, wDesc, wUM, wCant, wAct].forEach((w) => {
      curX += w;
      doc.moveTo(curX, tableY).lineTo(curX, tableY + headerH + (rowsCount * rowH)).stroke();
    });
    strokeBox(left, tableY, contentW, headerH + (rowsCount * rowH));

    const tableBottomY = tableY + headerH + (rowsCount * rowH);
    const footerY = tableBottomY + 8;

    doc.font("Helvetica").fontSize(9).fillColor("black");
    doc.text("OBSERVACIONES:", left, footerY);
    const obsX = left + 92;
    doc.moveTo(obsX, footerY + 10).lineTo(right, footerY + 10).stroke();

    const obsTxt = String(cab?.Observaciones || "").trim();
    if (obsTxt) {
      doc.font("Helvetica").fontSize(8);
      doc.text(obsTxt, obsX + 3, footerY + 2, {
        width: right - (obsX + 3),
        height: 12,
        align: "left",
        ellipsis: true,
      });
    }

    doc.font("Helvetica").fontSize(8).fillColor("black");
    doc.text("FR-F-BD-025", left, footerY + 18);

    const signY = footerY + 45;
    const signW = 150;
    const gap = (contentW - (signW * 3)) / 2;

    const nombreDespachador = String(cab?.NombreDespachador || '');

    doc.moveTo(left + 25, signY).lineTo(left + 200, signY).stroke();
    doc.font("Helvetica").fontSize(9);
    doc.text(nombreDespachador, left + 25, signY - 12, { width: 175, align: 'center' });
    doc.text("Entrega bodega", left + 25, signY + 5, { width: 175, align: 'center' });
    doc.text("Nombre y firma", left + 25, signY + 15, { width: 175, align: 'center' });

    doc.moveTo(left + signW + gap, signY).lineTo(left + signW * 2 + gap, signY).stroke();
    doc.text("Retirado por", left + signW + gap, signY + 5, { width: signW, align: "center" });
    doc.text("Nombre y firma", left + signW + gap, signY + 15, { width: signW, align: "center" });

    const nombreAprobadorFirma = String(cab?.NombreAprobador || "").trim();
    if (nombreAprobadorFirma) {
      doc.text(nombreAprobadorFirma, right - signW, signY - 18, { width: signW, align: "center" });
    }
    doc.moveTo(right - signW, signY).lineTo(right, signY).stroke();
    doc.text("Autorizado por ", right - signW, signY + 5, { width: signW, align: "center" });
    doc.text("Nombre Ingeniero", right - signW, signY + 15, { width: signW, align: "center" });
  };

  drawRequisa(28);

  doc.end();
  return stream;
}

export async function generarPdfDevolucion(idDevolucion: number): Promise<PassThrough> {
  if (!Number.isFinite(idDevolucion) || idDevolucion <= 0) {
    const error: any = new Error('IdDevolucion inválido');
    error.statusCode = 400;
    throw error;
  }

  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();
  const detalleDevolucionColumns = await resolveDetalleDevolucionColumns(pool.request());
  const observacionLineaExpr = detalleDevolucionColumns.observacionLinea
    ? 'ddv.ObservacionLinea'
    : 'CAST(NULL AS NVARCHAR(300))';

  const cabeceraResult = await pool.request()
    .input('IdDevolucion', sql.Int, idDevolucion)
    .query(`
      SELECT TOP 1
        dev.IdDevolucion,
        dev.CodigoDevolucion,
        dev.IdDespacho,
        dev.IdSolicitud,
        dev.FechaDespachoOrigen,
        dev.FechaDevolucion,
        dev.Motivo,
        dev.Observaciones,
        dev.Estado,
        dev.ReversaPresupuesto,
        dev.FueraVentanaPresupuesto,
        dev.FechaLimiteReversion,
        dev.MontoReversionPresupuesto,
        d.Observaciones AS ObservacionesDespachoOrigen,
        s.CodigoSolicitud,
        s.OT,
        s.FechaSolicitud,
        u_sol.NombreCompleto AS NombreSolicitante,
        u_desp.NombreCompleto AS NombreDespachador,
        u_dev.NombreCompleto AS NombreUsuarioRecibe,
        aprob.NombreAprobador,
        COALESCE(a.Nombre, s.Area) AS AreaNombre,
        COALESCE(
          cc.Codigo,
          a.Codigo,
          (SELECT TOP 1 arc.CodigoCuenta
           FROM dbo.AreaRecursoCuenta arc
           WHERE arc.IdArea = s.IdArea AND arc.IdRecurso = 1 AND ISNULL(arc.Activo, 1) = 1)
        ) AS CodigoCC,
        s.IdArea
      FROM dbo.DevolucionesDespacho dev
      INNER JOIN dbo.Despachos d ON d.IdDespacho = dev.IdDespacho
      INNER JOIN dbo.SolicitudesMaterial s ON s.IdSolicitud = dev.IdSolicitud
      INNER JOIN dbo.Usuarios u_sol ON u_sol.IdUsuario = s.IdSolicitante
      LEFT JOIN dbo.Usuarios u_desp ON u_desp.IdUsuario = d.IdUsuarioDespacha
      LEFT JOIN dbo.Usuarios u_dev ON u_dev.IdUsuario = dev.IdUsuarioRecibe
      OUTER APPLY (
        SELECT TOP 1 u_ap.NombreCompleto AS NombreAprobador
        FROM dbo.Aprobaciones ap
        JOIN dbo.Usuarios u_ap ON u_ap.IdUsuario = ap.IdAprobador
        LEFT JOIN dbo.UsuariosRoles ur_ap ON ur_ap.IdUsuario = u_ap.IdUsuario
        LEFT JOIN dbo.Roles r_ap ON r_ap.IdRol = ur_ap.IdRol
        WHERE ap.IdSolicitud = s.IdSolicitud
          AND ap.Estado = 'APROBADA'
        ORDER BY
          CASE
            WHEN LOWER(LTRIM(RTRIM(ISNULL(r_ap.Nombre, '')))) IN ('jefe de producción', 'jefe de produccion') THEN 0
            ELSE 1
          END,
          ap.FechaAprobacion DESC,
          ap.IdAprobacion DESC
      ) aprob
      LEFT JOIN dbo.Areas a ON a.IdArea = s.IdArea
      LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
      WHERE dev.IdDevolucion = @IdDevolucion;
    `);

  if ((cabeceraResult.recordset ?? []).length === 0) {
    const error: any = new Error('Devolución no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const cab = cabeceraResult.recordset[0];

  const detalleResult = await pool.request()
    .input('IdDevolucion', sql.Int, idDevolucion)
    .query(`
      SELECT
        m.IdMaterial,
        m.NumeroArticulo AS Codigo,
        m.DescripcionArticulo AS Descripcion,
        m.UnidadMedida,
        ddv.CantidadDevuelta,
        ${observacionLineaExpr} AS ObservacionLinea,
        arc.CodigoCuenta AS CodigoCuentaLinea,
        COALESCE(a_det.Nombre, s.Area) AS ActividadLinea
      FROM dbo.DetalleDevolucionesDespacho ddv
      INNER JOIN dbo.DevolucionesDespacho dev ON dev.IdDevolucion = ddv.IdDevolucion
      INNER JOIN dbo.DetalleDespachos dd ON dd.IdDetalleDespacho = ddv.IdDetalleDespacho
      INNER JOIN dbo.Materiales m ON m.IdMaterial = dd.IdMaterial
      INNER JOIN dbo.Despachos d_det ON d_det.IdDespacho = dd.IdDespacho
      INNER JOIN dbo.SolicitudesMaterial s ON s.IdSolicitud = d_det.IdSolicitud
      LEFT JOIN dbo.DetalleSolicitudesMaterial dsm ON ${detalleDespachosSchema.hasIdDetalleSolicitud
        ? `(dsm.IdDetalleSolicitud = dd.IdDetalleSolicitud OR (dd.IdDetalleSolicitud IS NULL AND dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = m.IdMaterial))`
        : 'dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = m.IdMaterial'}
      LEFT JOIN dbo.Areas a_det ON a_det.IdArea = COALESCE(dsm.IdArea, s.IdArea)
      LEFT JOIN dbo.MaterialRecurso mr ON mr.IdMaterial = m.IdMaterial AND ISNULL(mr.Activo, 1) = 1
      LEFT JOIN dbo.AreaRecursoCuenta arc ON arc.IdArea = a_det.IdArea
        AND arc.IdRecurso = COALESCE(dsm.IdRecurso, mr.IdRecurso, 1)
        AND ISNULL(arc.Activo, 1) = 1
      WHERE ddv.IdDevolucion = @IdDevolucion
      ORDER BY dd.IdDetalleDespacho ASC;
    `);

  const detalle = detalleResult.recordset ?? [];

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 20, bottom: 20, left: 15, right: 15 },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  doc.lineWidth(0.5);
  const left = 15;
  const right = doc.page.width - 15;
  const contentW = right - left;

  const strokeBox = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();
  const fillStrokeBox = (x: number, y: number, w: number, h: number, color = '#E8E8E8') => {
    doc.save().fillColor(color).rect(x, y, w, h).fill().restore();
    doc.rect(x, y, w, h).stroke();
  };
  const fmtDate = (value: any) => value ? new Date(value).toLocaleDateString('es-NI') : '';
  const fmtAmount = (value: any) => Number(value ?? 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const drawComprobante = (startY: number) => {
    const adjustedStartY = startY - 8;
    const titleY = adjustedStartY + 10;
    const logoX = left;
    const logoY = adjustedStartY;
    const logoFinalPath = resolvePdfLogoPath();

    if (logoFinalPath) {
      try { doc.image(logoFinalPath, logoX, logoY, { width: 52 }); }
      catch (_error) { dibujarLogoPlaceholder(doc, logoX, logoY); }
    } else {
      dibujarLogoPlaceholder(doc, logoX, logoY);
    }

    doc.font('Helvetica').fontSize(12).fillColor('black');
    doc.text('COMPROBANTE DE DEVOLUCION DE BODEGA', left + 60, titleY, { align: 'center', width: contentW - 140 });

    doc.font('Helvetica').fontSize(14).fillColor('#a13854');
    doc.text(cab?.CodigoDevolucion || `DEV-${String(cab?.IdDevolucion ?? idDevolucion).padStart(5, '0')}`, right - 150, titleY, { align: 'right', width: 150 });
    doc.fillColor('black');

    const headerY = titleY + 36;
    const secondHeaderY = headerY + 16;
    const thirdHeaderY = secondHeaderY + 16;

    doc.font('Helvetica').fontSize(9);
    doc.text('FECHA DEV.:', left, headerY);
    doc.text(fmtDate(cab?.FechaDevolucion), left + 62, headerY - 2);
    doc.moveTo(left + 58, headerY + 10).lineTo(left + 200, headerY + 10).stroke();

    doc.text('SOLICITUD N°:', right - 290, headerY);
    doc.text(cab?.CodigoSolicitud || '', right - 165, headerY - 2);
    doc.moveTo(right - 170, headerY + 10).lineTo(right, headerY + 10).stroke();

    doc.text('DESPACHO ORIGEN:', left, secondHeaderY);
    doc.text(`DESP-${cab?.IdDespacho ?? ''}`, left + 92, secondHeaderY - 2);
    doc.moveTo(left + 88, secondHeaderY + 10).lineTo(left + 200, secondHeaderY + 10).stroke();

    doc.text('RECIBE BODEGA:', right - 290, secondHeaderY);
    doc.text(cab?.NombreUsuarioRecibe || '', right - 165, secondHeaderY - 2);
    doc.moveTo(right - 170, secondHeaderY + 10).lineTo(right, secondHeaderY + 10).stroke();

    doc.text('RESULTADO:', left, thirdHeaderY);
    doc.text(
      cab?.ReversaPresupuesto
        ? `Revierte presupuesto ($${fmtAmount(cab?.MontoReversionPresupuesto)})`
        : 'Solo reingreso a stock',
      left + 62,
      thirdHeaderY - 2,
    );
    doc.moveTo(left + 58, thirdHeaderY + 10).lineTo(left + 260, thirdHeaderY + 10).stroke();

    doc.text('FECHA DESP.:', right - 290, thirdHeaderY);
    doc.text(fmtDate(cab?.FechaDespachoOrigen), right - 165, thirdHeaderY - 2);
    doc.moveTo(right - 170, thirdHeaderY + 10).lineTo(right, thirdHeaderY + 10).stroke();

    const tableY = thirdHeaderY + 18;
    const headerH = 22;
    const rowH = 22;
    const rowsCount = 9;
    const cellPadY = 4;
    const cellH = rowH - (cellPadY * 2);
    const baseFontSize = 8.5;
    const minFontSize = 5;

    const drawCellTextFit = (
      text: any,
      x: number,
      y: number,
      w: number,
      align: 'left' | 'center' | 'right' = 'left',
      fit = false,
      baseSizeOverride?: number,
      minSizeOverride?: number,
    ) => {
      const value = text == null ? '' : String(text);
      const measureOpts = { width: w, lineBreak: true } as const;
      const localBase = baseSizeOverride ?? baseFontSize;
      const localMin = minSizeOverride ?? minFontSize;

      let fontSize = localBase;
      if (fit && value) {
        for (let fs = localBase; fs >= localMin; fs -= 0.5) {
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
      const textH = doc.heightOfString(value, measureOpts as any);
      const offsetY = Math.max(0, (cellH - textH) / 2);

      doc.text(value, x, y + cellPadY + offsetY, {
        width: w,
        height: cellH,
        align,
        lineBreak: true,
        ellipsis: !fits,
      });

      doc.fontSize(baseFontSize);
    };

    const wCodigo = 55;
    const wDesc = 170;
    const wUM = 45;
    const wCant = 55;
    const wAct = 75;
    const wCCO = 75;
    const wObs = contentW - (wCodigo + wDesc + wUM + wCant + wAct + wCCO);

    fillStrokeBox(left, tableY, contentW, headerH);
    doc.font('Helvetica').fontSize(9);
    doc.text('CÓDIGO', left, tableY + 6, { width: wCodigo, align: 'center' });
    doc.text('MATERIAL', left + wCodigo, tableY + 6, { width: wDesc, align: 'center' });
    doc.text('U/M', left + wCodigo + wDesc, tableY + 6, { width: wUM, align: 'center' });
    doc.text('CANT.', left + wCodigo + wDesc + wUM, tableY + 6, { width: wCant, align: 'center' });
    doc.text('ACTIVIDAD', left + wCodigo + wDesc + wUM + wCant, tableY + 6, { width: wAct, align: 'center' });
    doc.text('C.CUENTA', left + wCodigo + wDesc + wUM + wCant + wAct, tableY + 6, { width: wCCO, align: 'center' });
    doc.text('OBS.', left + wCodigo + wDesc + wUM + wCant + wAct + wCCO, tableY + 6, { width: wObs, align: 'center' });

    for (let index = 0; index < rowsCount; index += 1) {
      const curY = tableY + headerH + (index * rowH);
      doc.moveTo(left, curY).lineTo(right, curY).stroke();

      const item = detalle[index];
      if (item) {
        drawCellTextFit(item.Codigo, left, curY, wCodigo, 'center');
        drawCellTextFit(item.Descripcion, left + wCodigo + 4, curY, wDesc - 8, 'left', true, 8.5, 5);
        drawCellTextFit(item.UnidadMedida, left + wCodigo + wDesc, curY, wUM, 'center', true, 8, 5.5);
        drawCellTextFit(String(item.CantidadDevuelta ?? ''), left + wCodigo + wDesc + wUM, curY, wCant, 'center');
        drawCellTextFit(
          (cab?.OT && String(cab.OT).trim() !== '') ? String(cab.OT) : (item.ActividadLinea || cab?.AreaNombre || ''),
          left + wCodigo + wDesc + wUM + wCant + 2,
          curY,
          wAct - 4,
          'center',
          true,
          8,
          4.5,
        );
        drawCellTextFit(item.CodigoCuentaLinea || cab?.CodigoCC || '', left + wCodigo + wDesc + wUM + wCant + wAct + 2, curY, wCCO - 4, 'center', true, 8, 5);
        drawCellTextFit(item.ObservacionLinea || '', left + wCodigo + wDesc + wUM + wCant + wAct + wCCO + 2, curY, wObs - 4, 'left', true, 8, 5);
      }
    }

    const bottomY = tableY + headerH + (rowsCount * rowH);
    doc.moveTo(left, bottomY).lineTo(right, bottomY).stroke();

    let curX = left;
    [wCodigo, wDesc, wUM, wCant, wAct, wCCO].forEach((width) => {
      curX += width;
      doc.moveTo(curX, tableY).lineTo(curX, bottomY).stroke();
    });
    strokeBox(left, tableY, contentW, headerH + (rowsCount * rowH));

    const footerY = bottomY + 8;
    doc.font('Helvetica').fontSize(9).fillColor('black');
    doc.text('MOTIVO:', left, footerY);
    const motivoX = left + 55;
    doc.moveTo(motivoX, footerY + 10).lineTo(right, footerY + 10).stroke();
    if (cab?.Motivo) {
      doc.font('Helvetica').fontSize(8);
      doc.text(String(cab.Motivo), motivoX + 3, footerY + 2, {
        width: right - (motivoX + 3),
        height: 12,
        align: 'left',
        ellipsis: true,
      });
    }

    doc.font('Helvetica').fontSize(9);
    const obsY = footerY + 18;
    doc.text('OBSERVACIONES:', left, obsY);
    const obsX = left + 92;
    doc.moveTo(obsX, obsY + 10).lineTo(right, obsY + 10).stroke();
    const obsTexto = String(cab?.Observaciones || '').trim() || String(cab?.ObservacionesDespachoOrigen || '').trim();
    if (obsTexto) {
      doc.font('Helvetica').fontSize(8);
      doc.text(obsTexto, obsX + 3, obsY + 2, {
        width: right - (obsX + 3),
        height: 12,
        align: 'left',
        ellipsis: true,
      });
    }

    doc.font('Helvetica').fontSize(8).fillColor('black');
    doc.text('COMPROBANTE DEVOLUCION BODEGA', left, obsY + 18);

    const signY = obsY + 45;
    const signW = 150;
    const gap = (contentW - (signW * 3)) / 2;

    doc.moveTo(left + 25, signY).lineTo(left + 200, signY).stroke();
    doc.font('Helvetica').fontSize(9);
    doc.text(String(cab?.NombreUsuarioRecibe || ''), left + 25, signY - 12, { width: 175, align: 'center' });
    doc.text('Recibe bodega', left + 25, signY + 5, { width: 175, align: 'center' });
    doc.text('Nombre y firma', left + 25, signY + 15, { width: 175, align: 'center' });

    doc.moveTo(left + signW + gap, signY).lineTo(left + signW * 2 + gap, signY).stroke();
    doc.text('Entrega material', left + signW + gap, signY + 5, { width: signW, align: 'center' });
    doc.text('Nombre y firma', left + signW + gap, signY + 15, { width: signW, align: 'center' });

    const nombreAprobadorFirma = String(cab?.NombreAprobador || '').trim();
    if (nombreAprobadorFirma) {
      doc.text(nombreAprobadorFirma, right - signW, signY - 18, { width: signW, align: 'center' });
    }
    doc.moveTo(right - signW, signY).lineTo(right, signY).stroke();
    doc.text('Autorizado por', right - signW, signY + 5, { width: signW, align: 'center' });
    doc.text('Nombre Ingeniero', right - signW, signY + 15, { width: signW, align: 'center' });
  };

  drawComprobante(28);

  doc.end();
  return stream;
}


/**
 * Dibuja un logo de respaldo (gota/hoja) si no se encuentra la imagen.
 */
function dibujarLogoPlaceholder(doc: any, x: number, y: number) {
  doc.save()
     .path(`M ${x + 30} ${y + 5} Q ${x + 50} ${y + 25} ${x + 30} ${y + 35} Q ${x + 10} ${y + 25} ${x + 30} ${y + 5} Z`)
     .fillAndStroke("#333", "#333")
     .restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
  doc.text("Extraceite", x, y + 40, { width: 60, align: "center" });
}
