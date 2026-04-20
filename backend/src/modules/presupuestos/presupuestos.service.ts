import sql from 'mssql';
import { getPool } from '../../config/db';
import {
  buildDespachosPreviosOuterApply,
  resolveDetalleDespachosSchema,
} from '../../infra/detalleDespachos';

const ESTADOS_CON_RESERVA_PENDIENTE = ['PENDIENTE', 'APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA'];

export interface Presupuesto {
  IdPresupuesto: number;
  Anio: number;
  Mes: number | null;
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
  IdMaterial: number | null;
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
  IdCentroCosto?: number | null;
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

function toNumber(value: unknown, fallback = 0): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeMonth(value: number): number {
  const month = Math.trunc(toNumber(value, 0));
  if (month < 1 || month > 12) {
    throw new Error('El mes debe estar entre 1 y 12');
  }

  return month;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function buildStateList(values: string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

function normalizeCodigoCuenta(value: unknown): string | null {
  const text = normalizeNullableString(value);
  if (!text || text === '-') {
    return null;
  }

  return text.replace(/\.0+$/, '').replace(/\s+/g, '');
}

function parseFechaImportacion(value: unknown): { anio: number; mes: number } | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      anio: value.getFullYear(),
      mes: value.getMonth() + 1,
    };
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const latinMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (latinMatch) {
    const [, , month, year] = latinMatch;
    return {
      anio: Number(year),
      mes: Number(month),
    };
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month] = isoMatch;
    return {
      anio: Number(year),
      mes: Number(month),
    };
  }

  return null;
}

function parseMontoImportacion(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text === '-') {
    return 0;
  }

  text = text.replace(/\s+/g, '').replace(/\$/g, '');

  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) {
    if (dotIndex > commaIndex) {
      text = text.replace(/,/g, '');
    } else {
      text = text.replace(/\./g, '').replace(',', '.');
    }
  } else if (commaIndex >= 0) {
    const decimalDigits = text.length - commaIndex - 1;
    text = decimalDigits <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  }

  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

interface ResolvedImportTarget {
  codigoCuenta: string;
  idArea: number;
  idCentroCosto: number | null;
  areaNombre: string;
  origen: 'centroCosto' | 'areaRecursoCuenta';
}

async function resolveImportTargetsByCodigoCuenta(codigosCuenta: string[]): Promise<{
  resolved: Map<string, ResolvedImportTarget>;
  ambiguous: Map<string, ResolvedImportTarget[]>;
}> {
  const resolved = new Map<string, ResolvedImportTarget>();
  const ambiguous = new Map<string, ResolvedImportTarget[]>();

  if (codigosCuenta.length === 0) {
    return { resolved, ambiguous };
  }

  const pool = await getPool();
  const request = pool.request();
  const placeholders = codigosCuenta.map((codigoCuenta, index) => {
    const paramName = `CodigoCuenta${index}`;
    request.input(paramName, sql.NVarChar(50), codigoCuenta);
    return `@${paramName}`;
  });

  const result = await request.query(`
    WITH CentroCostoMatch AS (
      SELECT
        LTRIM(RTRIM(cc.Codigo)) AS CodigoCuenta,
        a.IdArea,
        cc.IdCentroCosto,
        a.Nombre AS AreaNombre,
        CAST('centroCosto' AS NVARCHAR(30)) AS Origen
      FROM dbo.CentrosCosto cc
      INNER JOIN dbo.Areas a ON a.IdCentroCosto = cc.IdCentroCosto
      WHERE LTRIM(RTRIM(ISNULL(cc.Codigo, ''))) IN (${placeholders.join(', ')})
        AND ISNULL(a.Activo, 1) = 1
        AND ISNULL(cc.Activo, 1) = 1
    ),
    AreaRecursoCuentaMatch AS (
      SELECT DISTINCT
        LTRIM(RTRIM(arc.CodigoCuenta)) AS CodigoCuenta,
        arc.IdArea,
        a.IdCentroCosto,
        a.Nombre AS AreaNombre,
        CAST('areaRecursoCuenta' AS NVARCHAR(30)) AS Origen
      FROM dbo.AreaRecursoCuenta arc
      INNER JOIN dbo.Areas a ON a.IdArea = arc.IdArea
      WHERE LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''))) IN (${placeholders.join(', ')})
        AND ISNULL(a.Activo, 1) = 1
    )
    SELECT CodigoCuenta, IdArea, IdCentroCosto, AreaNombre, Origen
    FROM CentroCostoMatch
    UNION ALL
    SELECT CodigoCuenta, IdArea, IdCentroCosto, AreaNombre, Origen
    FROM AreaRecursoCuentaMatch;
  `);

  const matchesByCodigo = new Map<string, ResolvedImportTarget[]>();
  for (const row of result.recordset ?? []) {
    const codigoCuenta = normalizeCodigoCuenta(row?.CodigoCuenta);
    const idArea = toNumber(row?.IdArea);
    if (!codigoCuenta || idArea <= 0) {
      continue;
    }

    const target: ResolvedImportTarget = {
      codigoCuenta,
      idArea,
      idCentroCosto: row?.IdCentroCosto === null || row?.IdCentroCosto === undefined ? null : toNumber(row?.IdCentroCosto),
      areaNombre: String(row?.AreaNombre ?? `Area #${idArea}`),
      origen: row?.Origen === 'centroCosto' ? 'centroCosto' : 'areaRecursoCuenta',
    };

    const current = matchesByCodigo.get(codigoCuenta) ?? [];
    if (!current.some((item) => item.idArea === target.idArea && item.idCentroCosto === target.idCentroCosto && item.origen === target.origen)) {
      current.push(target);
      matchesByCodigo.set(codigoCuenta, current);
    }
  }

  for (const codigoCuenta of codigosCuenta) {
    const candidates = matchesByCodigo.get(codigoCuenta) ?? [];
    const centroCostoCandidates = candidates.filter((candidate) => candidate.origen === 'centroCosto');

    if (centroCostoCandidates.length === 1) {
      resolved.set(codigoCuenta, centroCostoCandidates[0]);
      continue;
    }

    if (centroCostoCandidates.length > 1) {
      ambiguous.set(codigoCuenta, centroCostoCandidates);
      continue;
    }

    if (candidates.length === 1) {
      resolved.set(codigoCuenta, candidates[0]);
      continue;
    }

    if (candidates.length > 1) {
      ambiguous.set(codigoCuenta, candidates);
    }
  }

  return { resolved, ambiguous };
}

async function loadPresupuestoRows() {
  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();

  return pool.request().query(`
    WITH MovimientoDetalle AS (
      SELECT
        COALESCE(d.IdArea, s.IdArea) AS IdArea,
        YEAR(s.FechaSolicitud) AS Anio,
        MONTH(s.FechaSolicitud) AS Mes,
        CASE
          WHEN s.Estado IN (${buildStateList(ESTADOS_CON_RESERVA_PENDIENTE)})
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
        END AS ReservaPendiente,
        CASE
          WHEN (
            ISNULL(despachosPrevios.CantidadYaDespachada, 0)
            - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
          ) > 0
            THEN (
              ISNULL(despachosPrevios.CantidadYaDespachada, 0)
              - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
            ) * ISNULL(sa.UltimoPrecioCompra, 0)
          ELSE 0
        END AS EjecutadoReal,
        ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
          * ISNULL(sa.UltimoPrecioCompra, 0) AS MontoDevolucionPresupuestariaVigente,
        ISNULL(devolucionesPresupuesto.CantidadReconsumidaPorAnulacion, 0)
          * ISNULL(sa.UltimoPrecioCompra, 0) AS MontoReconsumoPorAnulacion
      FROM dbo.SolicitudesMaterial s
      INNER JOIN dbo.DetalleSolicitudesMaterial d ON d.IdSolicitud = s.IdSolicitud
      LEFT JOIN dbo.StockActual sa ON sa.IdMaterial = d.IdMaterial
      ${buildDespachosPreviosOuterApply(detalleDespachosSchema, {
        solicitudIdExpression: 's.IdSolicitud',
        detalleSolicitudAlias: 'd',
        detalleDespachoAlias: 'dd',
        despachoAlias: 'desp',
      })}
      OUTER APPLY (
        SELECT
          SUM(
            CASE
              WHEN dev.Estado = 'REGISTRADA'
               AND ISNULL(dev.ReversaPresupuesto, 0) = 1
              THEN ISNULL(ddv.CantidadDevuelta, 0)
              ELSE 0
            END
          ) AS CantidadDevueltaPresupuestoVigente,
          SUM(
            CASE
              WHEN dev.Estado = 'ANULADA'
               AND ISNULL(dev.ReversaPresupuesto, 0) = 1
              THEN ISNULL(ddv.CantidadDevuelta, 0)
              ELSE 0
            END
          ) AS CantidadReconsumidaPorAnulacion
        FROM dbo.DetalleDevolucionesDespacho ddv
        INNER JOIN dbo.DevolucionesDespacho dev
          ON dev.IdDevolucion = ddv.IdDevolucion
        INNER JOIN dbo.DetalleDespachos dd_dev
          ON dd_dev.IdDetalleDespacho = ddv.IdDetalleDespacho
        INNER JOIN dbo.Despachos desp_dev
          ON desp_dev.IdDespacho = dd_dev.IdDespacho
        WHERE desp_dev.IdSolicitud = s.IdSolicitud
          AND (
            ddv.IdDetalleSolicitud = d.IdDetalleSolicitud
            OR (
              ddv.IdDetalleSolicitud IS NULL
              AND dd_dev.IdMaterial = d.IdMaterial
            )
          )
      ) devolucionesPresupuesto
      WHERE COALESCE(d.IdArea, s.IdArea) IS NOT NULL
    ),
    MovimientoArea AS (
      SELECT
        IdArea,
        Anio,
        Mes,
        SUM(ReservaPendiente + EjecutadoReal) AS Comprometido,
        SUM(EjecutadoReal) AS Ejecutado,
        SUM(EjecutadoReal) AS ConsumoNeto,
        SUM(MontoDevolucionPresupuestariaVigente) AS DevolucionesPresupuestarias,
        SUM(MontoReconsumoPorAnulacion) AS ReconsumoAnulaciones
      FROM MovimientoDetalle
      GROUP BY IdArea, Anio, Mes
    )
    SELECT
      p.IdPresupuesto,
      p.Anio,
      p.Mes,
      p.MontoTotal AS Presupuesto,
      p.Moneda,
      p.IdArea,
      COALESCE(a.Nombre, CONCAT('Área #', p.IdArea)) AS AreaNombre,
      p.IdCentroCosto,
      cc.Nombre AS CentroCostoNombre,
      CAST(ISNULL(m.Comprometido, 0) AS DECIMAL(18,2)) AS Comprometido,
      CAST(ISNULL(m.Ejecutado, 0) AS DECIMAL(18,2)) AS Ejecutado,
      CAST(ISNULL(m.ConsumoNeto, 0) AS DECIMAL(18,2)) AS Consumo,
      CAST(p.MontoTotal - ISNULL(m.Comprometido, 0) AS DECIMAL(18,2)) AS Disponible,
      CAST(CASE WHEN p.MontoTotal > 0 THEN (ISNULL(m.Comprometido, 0) / p.MontoTotal) * 100 ELSE 0 END AS DECIMAL(10,2)) AS PorcentajeEjecucion,
      CASE
        WHEN p.MontoTotal > 0 AND (ISNULL(m.Comprometido, 0) / p.MontoTotal) * 100 >= 90 THEN 'Critico'
        WHEN p.MontoTotal > 0 AND (ISNULL(m.Comprometido, 0) / p.MontoTotal) * 100 >= 70 THEN 'Alerta'
        ELSE 'Normal'
      END AS EstadoAlerta
    FROM dbo.Presupuestos p
    LEFT JOIN dbo.Areas a ON a.IdArea = p.IdArea
    LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = p.IdCentroCosto
    OUTER APPLY (
      SELECT
        SUM(COALESCE(ma.Comprometido, 0)) AS Comprometido,
        SUM(COALESCE(ma.Ejecutado, 0)) AS Ejecutado,
        SUM(COALESCE(ma.ConsumoNeto, 0)) AS ConsumoNeto
      FROM MovimientoArea ma
      WHERE ma.IdArea = p.IdArea
        AND ma.Anio = p.Anio
        AND (p.Mes IS NULL OR ma.Mes = p.Mes)
    ) m
    WHERE p.Activo = 1
    ORDER BY p.Anio DESC, COALESCE(p.Mes, 13) DESC, COALESCE(a.Nombre, CONCAT('Área #', p.IdArea));
  `);
}

export async function listarPresupuestos(): Promise<Presupuesto[]> {
  const result = await loadPresupuestoRows();

  return (result.recordset ?? []).map((row: any) => ({
    IdPresupuesto: toNumber(row?.IdPresupuesto),
    Anio: toNumber(row?.Anio),
    Mes: row?.Mes === null || row?.Mes === undefined ? null : toNumber(row?.Mes),
    Presupuesto: toNumber(row?.Presupuesto),
    Moneda: String(row?.Moneda ?? 'USD'),
    IdArea: toNumber(row?.IdArea),
    AreaNombre: String(row?.AreaNombre ?? ''),
    IdCentroCosto: row?.IdCentroCosto === null || row?.IdCentroCosto === undefined ? null : toNumber(row?.IdCentroCosto),
    CentroCostoNombre: row?.CentroCostoNombre ?? null,
    Comprometido: toNumber(row?.Comprometido),
    Ejecutado: toNumber(row?.Ejecutado),
    Consumo: toNumber(row?.Consumo),
    Disponible: toNumber(row?.Disponible),
    PorcentajeEjecucion: toNumber(row?.PorcentajeEjecucion),
    EstadoAlerta: (row?.EstadoAlerta ?? 'Normal') as 'Normal' | 'Alerta' | 'Critico',
  }));
}

export async function guardarPresupuesto(input: GuardarPresupuestoInput): Promise<{ idPresupuesto: number; action: 'created' | 'updated' }> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let started = false;

  try {
    await transaction.begin();
    started = true;

    const request = new sql.Request(transaction);
    const idPresupuesto = input.IdPresupuesto ? Math.trunc(Number(input.IdPresupuesto)) : null;
    const anio = Math.trunc(Number(input.Anio));
    const mes = normalizeMonth(Number(input.Mes));
    const montoTotal = Number(input.MontoTotal);
    const idArea = Math.trunc(Number(input.IdArea));
    const idCentroCosto = input.IdCentroCosto === null || input.IdCentroCosto === undefined ? null : Math.trunc(Number(input.IdCentroCosto));

    if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) {
      throw new Error('El año es inválido');
    }

    if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
      throw new Error('El monto total debe ser mayor que cero');
    }

    if (!Number.isFinite(idArea) || idArea <= 0) {
      throw new Error('El área es obligatoria');
    }

    let existingId = idPresupuesto;

    if (!existingId) {
      const duplicate = await request
        .input('Anio', sql.Int, anio)
        .input('Mes', sql.Int, mes)
        .input('IdArea', sql.Int, idArea)
        .query(`
          SELECT TOP 1 IdPresupuesto
          FROM dbo.Presupuestos
          WHERE Anio = @Anio
            AND Mes = @Mes
            AND IdArea = @IdArea
            AND Activo = 1
          ORDER BY IdPresupuesto DESC;
        `);

      existingId = duplicate.recordset?.[0]?.IdPresupuesto ?? null;
    }

    if (existingId) {
      await request
        .input('IdPresupuesto', sql.Int, existingId)
        .input('Anio', sql.Int, anio)
        .input('Mes', sql.Int, mes)
        .input('IdArea', sql.Int, idArea)
        .input('IdCentroCosto', sql.Int, idCentroCosto)
        .input('MontoTotal', sql.Decimal(18, 2), montoTotal)
        .input('Moneda', sql.NVarChar(10), 'USD')
        .query(`
          UPDATE dbo.Presupuestos
          SET
            Anio = @Anio,
            Mes = @Mes,
            IdArea = @IdArea,
            IdCentroCosto = @IdCentroCosto,
            MontoTotal = @MontoTotal,
            Moneda = @Moneda
          WHERE IdPresupuesto = @IdPresupuesto;
        `);

      await transaction.commit();
      return { idPresupuesto: existingId, action: 'updated' };
    }

    const insertResult = await request
      .input('Anio', sql.Int, anio)
      .input('Mes', sql.Int, mes)
      .input('IdArea', sql.Int, idArea)
      .input('IdCentroCosto', sql.Int, idCentroCosto)
      .input('MontoTotal', sql.Decimal(18, 2), montoTotal)
      .input('Moneda', sql.NVarChar(10), 'USD')
      .query(`
        INSERT INTO dbo.Presupuestos (Anio, Mes, IdArea, IdCentroCosto, MontoTotal, Moneda, Activo)
        OUTPUT INSERTED.IdPresupuesto
        VALUES (@Anio, @Mes, @IdArea, @IdCentroCosto, @MontoTotal, @Moneda, 1);
      `);

    const insertedId = toNumber(insertResult.recordset?.[0]?.IdPresupuesto);
    await transaction.commit();

    return { idPresupuesto: insertedId, action: 'created' };
  } catch (error) {
    if (started) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Error al revertir transacción de presupuesto', rollbackError);
      }
    }

    throw error;
  }
}

export async function guardarPresupuestoDetalle(input: GuardarPresupuestoDetalleInput): Promise<{ idPresupuestoDetalle: number; action: 'created' | 'updated' }> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let started = false;

  try {
    await transaction.begin();
    started = true;

    const request = new sql.Request(transaction);
    const idPresupuesto = Math.trunc(Number(input.IdPresupuesto));
    const idMaterial = Math.trunc(Number(input.IdMaterial));
    const montoPermitido = Number(input.MontoPermitido);
    const grupoArticulos = normalizeNullableString(input.GrupoArticulos);

    if (!Number.isFinite(idPresupuesto) || idPresupuesto <= 0) {
      throw new Error('IdPresupuesto inválido');
    }

    if (!Number.isFinite(idMaterial) || idMaterial <= 0) {
      throw new Error('IdMaterial inválido');
    }

    if (!Number.isFinite(montoPermitido) || montoPermitido <= 0) {
      throw new Error('Monto permitido inválido');
    }

    const duplicate = await request
      .input('IdPresupuesto', sql.Int, idPresupuesto)
      .input('IdMaterial', sql.Int, idMaterial)
      .input('GrupoArticulos', sql.NVarChar(100), grupoArticulos)
      .query(`
        SELECT TOP 1 IdPresupuestoDetalle
        FROM dbo.PresupuestoDetalle
        WHERE IdPresupuesto = @IdPresupuesto
          AND IdMaterial = @IdMaterial
        ORDER BY IdPresupuestoDetalle DESC;
      `);

    const existingId = duplicate.recordset?.[0]?.IdPresupuestoDetalle ?? null;

    if (existingId) {
      await request
        .input('IdPresupuestoDetalle', sql.Int, existingId)
        .input('MontoPermitido', sql.Decimal(18, 2), montoPermitido)
        .input('GrupoArticulos', sql.NVarChar(100), grupoArticulos)
        .query(`
          UPDATE dbo.PresupuestoDetalle
          SET
            MontoPermitido = @MontoPermitido,
            GrupoArticulos = @GrupoArticulos
          WHERE IdPresupuestoDetalle = @IdPresupuestoDetalle;
        `);

      await transaction.commit();
      return { idPresupuestoDetalle: existingId, action: 'updated' };
    }

    const insertResult = await request
      .input('MontoPermitido', sql.Decimal(18, 2), montoPermitido)
      .input('GrupoArticulos', sql.NVarChar(100), grupoArticulos)
      .query(`
        INSERT INTO dbo.PresupuestoDetalle
          (IdPresupuesto, IdMaterial, GrupoArticulos, MontoPermitido)
        OUTPUT INSERTED.IdPresupuestoDetalle
        VALUES
          (@IdPresupuesto, @IdMaterial, @GrupoArticulos, @MontoPermitido);
      `);

    const idPresupuestoDetalle = toNumber(insertResult.recordset?.[0]?.IdPresupuestoDetalle);
    await transaction.commit();
    return { idPresupuestoDetalle, action: 'created' };
  } catch (error) {
    if (started) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Error al revertir transacción de detalle de presupuesto', rollbackError);
      }
    }

    throw error;
  }
}

export async function obtenerDetallePresupuesto(idPresupuesto: number): Promise<PresupuestoDetalle[]> {
  const pool = await getPool();
  const detalleDespachosSchema = await resolveDetalleDespachosSchema();
  const result = await pool.request()
    .input('IdPresupuesto', sql.Int, idPresupuesto)
    .query(`
      SELECT
        pd.IdPresupuestoDetalle,
        pd.IdPresupuesto,
        pd.IdMaterial,
        COALESCE(m.NumeroArticulo, pd.GrupoArticulos, 'General') AS MaterialNombre,
        COALESCE(m.GrupoArticulos, pd.GrupoArticulos, '') AS GrupoArticulos,
        CAST(pd.MontoPermitido AS DECIMAL(18,2)) AS MontoPermitido,
        CAST(ISNULL(mov.CantidadPresupuestada, 0) AS DECIMAL(18,4)) AS CantidadPresupuestada,
        CAST(ISNULL(mov.CostoUnitarioPresupuestado, 0) AS DECIMAL(18,4)) AS CostoUnitarioPresupuestado,
        CAST(pd.MontoPermitido AS DECIMAL(18,2)) AS MontoAsignado,
        CAST(ISNULL(mov.MontoComprometido, 0) AS DECIMAL(18,2)) AS MontoComprometido,
        CAST(ISNULL(mov.MontoEjecutado, 0) AS DECIMAL(18,2)) AS MontoEjecutado
      FROM dbo.PresupuestoDetalle pd
      INNER JOIN dbo.Presupuestos p ON p.IdPresupuesto = pd.IdPresupuesto
      LEFT JOIN dbo.Materiales m ON m.IdMaterial = pd.IdMaterial
      OUTER APPLY (
        SELECT
          SUM(ISNULL(d.CantidadSolicitada, 0)) AS CantidadPresupuestada,
          MAX(ISNULL(sa.UltimoPrecioCompra, 0)) AS CostoUnitarioPresupuestado,
          SUM(
            CASE
              WHEN s.Estado IN (${buildStateList(ESTADOS_CON_RESERVA_PENDIENTE)})
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
                - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
              ) > 0
                THEN (
                  ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                  - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
                ) * ISNULL(sa.UltimoPrecioCompra, 0)
              ELSE 0
            END
          ) AS MontoComprometido,
          SUM(
            CASE
              WHEN (
                ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
              ) > 0
                THEN (
                  ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                  - ISNULL(devolucionesPresupuesto.CantidadDevueltaPresupuestoVigente, 0)
                ) * ISNULL(sa.UltimoPrecioCompra, 0)
              ELSE 0
            END
          ) AS MontoEjecutado
        FROM dbo.SolicitudesMaterial s
        INNER JOIN dbo.DetalleSolicitudesMaterial d ON d.IdSolicitud = s.IdSolicitud
        LEFT JOIN dbo.StockActual sa ON sa.IdMaterial = d.IdMaterial
        ${buildDespachosPreviosOuterApply(detalleDespachosSchema, {
          solicitudIdExpression: 's.IdSolicitud',
          detalleSolicitudAlias: 'd',
          detalleDespachoAlias: 'dd',
          despachoAlias: 'desp',
        })}
        OUTER APPLY (
          SELECT
            SUM(
              CASE
                WHEN dev.Estado = 'REGISTRADA'
                 AND ISNULL(dev.ReversaPresupuesto, 0) = 1
                THEN ISNULL(ddv.CantidadDevuelta, 0)
                ELSE 0
              END
            ) AS CantidadDevueltaPresupuestoVigente,
            SUM(
              CASE
                WHEN dev.Estado = 'ANULADA'
                 AND ISNULL(dev.ReversaPresupuesto, 0) = 1
                THEN ISNULL(ddv.CantidadDevuelta, 0)
                ELSE 0
              END
            ) AS CantidadReconsumidaPorAnulacion
          FROM dbo.DetalleDevolucionesDespacho ddv
          INNER JOIN dbo.DevolucionesDespacho dev
            ON dev.IdDevolucion = ddv.IdDevolucion
          INNER JOIN dbo.DetalleDespachos dd_dev
            ON dd_dev.IdDetalleDespacho = ddv.IdDetalleDespacho
          INNER JOIN dbo.Despachos desp_dev
            ON desp_dev.IdDespacho = dd_dev.IdDespacho
          WHERE desp_dev.IdSolicitud = s.IdSolicitud
            AND (
              ddv.IdDetalleSolicitud = d.IdDetalleSolicitud
              OR (
                ddv.IdDetalleSolicitud IS NULL
                AND dd_dev.IdMaterial = d.IdMaterial
              )
            )
        ) devolucionesPresupuesto
        WHERE COALESCE(d.IdArea, s.IdArea) = p.IdArea
          AND YEAR(s.FechaSolicitud) = p.Anio
          AND (p.Mes IS NULL OR MONTH(s.FechaSolicitud) = p.Mes)
          AND (
            (pd.IdMaterial IS NOT NULL AND d.IdMaterial = pd.IdMaterial)
            OR
            (pd.IdMaterial IS NULL AND pd.GrupoArticulos IS NOT NULL AND EXISTS (
              SELECT 1
              FROM dbo.Materiales mx
              WHERE mx.IdMaterial = d.IdMaterial
                AND ISNULL(mx.GrupoArticulos, '') = ISNULL(pd.GrupoArticulos, '')
            ))
          )
      ) mov
      WHERE pd.IdPresupuesto = @IdPresupuesto
      ORDER BY CASE WHEN pd.IdMaterial IS NULL THEN 1 ELSE 0 END, MaterialNombre;
    `);

  return (result.recordset ?? []).map((row: any) => ({
    IdPresupuestoDetalle: toNumber(row?.IdPresupuestoDetalle),
    IdPresupuesto: toNumber(row?.IdPresupuesto),
    IdMaterial: row?.IdMaterial === null || row?.IdMaterial === undefined ? null : toNumber(row?.IdMaterial),
    MaterialNombre: String(row?.MaterialNombre ?? 'General'),
    GrupoArticulos: String(row?.GrupoArticulos ?? ''),
    MontoPermitido: toNumber(row?.MontoPermitido),
    CantidadPresupuestada: toNumber(row?.CantidadPresupuestada),
    CostoUnitarioPresupuestado: toNumber(row?.CostoUnitarioPresupuestado),
    MontoAsignado: toNumber(row?.MontoAsignado),
    MontoComprometido: toNumber(row?.MontoComprometido),
    MontoEjecutado: toNumber(row?.MontoEjecutado),
  }));
}


export interface ImportarPresupuestoFila {
  Fecha: string | null;
  CodigoCuenta: string | null;
  ValorAjustado: number | null;
}

export interface ImportarPresupuestoError {
  fila: number;
  codigoCuenta: string | null;
  motivo: string;
}

export interface ImportarPresupuestoResultado {
  filasLeidas: number;
  filasAplicadas: number;
  procesados: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: ImportarPresupuestoError[];
}

export async function importarPresupuestoMasivo(
  filas: ImportarPresupuestoFila[],
  _idUsuarioAudit: number,
): Promise<ImportarPresupuestoResultado> {
  const errores: ImportarPresupuestoError[] = [];
  let omitidos = 0;

  const agregadosPorCodigo = new Map<string, { anio: number; mes: number; codigoCuenta: string; montoTotal: number; filasOrigen: number[] }>();

  filas.forEach((fila, index) => {
    const filaExcel = index + 2;
    const monto = parseMontoImportacion(fila?.ValorAjustado);
    if (monto === null) {
      errores.push({
        fila: filaExcel,
        codigoCuenta: normalizeCodigoCuenta(fila?.CodigoCuenta),
        motivo: 'Valor ajustado invalido.',
      });
      return;
    }

    if (monto <= 0) {
      omitidos += 1;
      return;
    }

    const fecha = parseFechaImportacion(fila?.Fecha);
    if (!fecha) {
      errores.push({
        fila: filaExcel,
        codigoCuenta: normalizeCodigoCuenta(fila?.CodigoCuenta),
        motivo: 'Fecha invalida o no reconocida.',
      });
      return;
    }

    const codigoCuenta = normalizeCodigoCuenta(fila?.CodigoCuenta);
    if (!codigoCuenta) {
      errores.push({
        fila: filaExcel,
        codigoCuenta: null,
        motivo: 'Codigo de cuenta vacio o invalido.',
      });
      return;
    }

    const key = `${fecha.anio}|${fecha.mes}|${codigoCuenta}`;
    const current = agregadosPorCodigo.get(key);
    if (current) {
      current.montoTotal += monto;
      current.filasOrigen.push(filaExcel);
      return;
    }

    agregadosPorCodigo.set(key, {
      anio: fecha.anio,
      mes: fecha.mes,
      codigoCuenta,
      montoTotal: monto,
      filasOrigen: [filaExcel],
    });
  });

  if (errores.length > 0) {
    return {
      filasLeidas: filas.length,
      filasAplicadas: 0,
      procesados: 0,
      creados: 0,
      actualizados: 0,
      omitidos,
      errores,
    };
  }

  const codigosCuenta = Array.from(new Set(Array.from(agregadosPorCodigo.values()).map((fila) => fila.codigoCuenta)));
  const targets = await resolveImportTargetsByCodigoCuenta(codigosCuenta);

  const agregadosPorPresupuesto = new Map<string, {
    anio: number;
    mes: number;
    idArea: number;
    idCentroCosto: number | null;
    montoTotal: number;
  }>();

  for (const fila of agregadosPorCodigo.values()) {
    const ambiguousTargets = targets.ambiguous.get(fila.codigoCuenta);
    if (ambiguousTargets?.length) {
      errores.push({
        fila: fila.filasOrigen[0],
        codigoCuenta: fila.codigoCuenta,
        motivo: 'El codigo de cuenta corresponde a multiples areas y requiere depuracion.',
      });
      continue;
    }

    const target = targets.resolved.get(fila.codigoCuenta);
    if (!target) {
      errores.push({
        fila: fila.filasOrigen[0],
        codigoCuenta: fila.codigoCuenta,
        motivo: 'No existe un area o centro de costo asociado a este codigo de cuenta.',
      });
      continue;
    }

    const key = `${fila.anio}|${fila.mes}|${target.idArea}|${target.idCentroCosto ?? 'null'}`;
    const current = agregadosPorPresupuesto.get(key);
    if (current) {
      current.montoTotal += fila.montoTotal;
      continue;
    }

    agregadosPorPresupuesto.set(key, {
      anio: fila.anio,
      mes: fila.mes,
      idArea: target.idArea,
      idCentroCosto: target.idCentroCosto,
      montoTotal: fila.montoTotal,
    });
  }

  if (errores.length > 0) {
    return {
      filasLeidas: filas.length,
      filasAplicadas: 0,
      procesados: 0,
      creados: 0,
      actualizados: 0,
      omitidos,
      errores,
    };
  }

  if (agregadosPorPresupuesto.size === 0) {
    return {
      filasLeidas: filas.length,
      filasAplicadas: 0,
      procesados: 0,
      creados: 0,
      actualizados: 0,
      omitidos,
      errores: [{ fila: 1, codigoCuenta: null, motivo: 'No se encontraron filas importables con monto mayor que cero.' }],
    };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let creados = 0;
  let actualizados = 0;

  try {
    await transaction.begin();

    for (const presupuesto of agregadosPorPresupuesto.values()) {
      const duplicateRequest = new sql.Request(transaction);
      const duplicate = await duplicateRequest
        .input('Anio', sql.Int, presupuesto.anio)
        .input('Mes', sql.Int, presupuesto.mes)
        .input('IdArea', sql.Int, presupuesto.idArea)
        .query(`
          SELECT TOP 1 IdPresupuesto
          FROM dbo.Presupuestos
          WHERE Anio = @Anio
            AND Mes = @Mes
            AND IdArea = @IdArea
            AND Activo = 1
          ORDER BY IdPresupuesto DESC;
        `);

      const existingId = duplicate.recordset?.[0]?.IdPresupuesto ?? null;

      if (existingId) {
        const updateRequest = new sql.Request(transaction);
        await updateRequest
          .input('IdPresupuesto', sql.Int, existingId)
          .input('IdCentroCosto', sql.Int, presupuesto.idCentroCosto)
          .input('MontoTotal', sql.Decimal(18, 2), presupuesto.montoTotal)
          .query(`
            UPDATE dbo.Presupuestos
            SET IdCentroCosto = @IdCentroCosto,
                MontoTotal = @MontoTotal,
                Moneda = 'USD'
            WHERE IdPresupuesto = @IdPresupuesto;
          `);
        actualizados += 1;
        continue;
      }

      const insertRequest = new sql.Request(transaction);
      await insertRequest
        .input('Anio', sql.Int, presupuesto.anio)
        .input('Mes', sql.Int, presupuesto.mes)
        .input('IdArea', sql.Int, presupuesto.idArea)
        .input('IdCentroCosto', sql.Int, presupuesto.idCentroCosto)
        .input('MontoTotal', sql.Decimal(18, 2), presupuesto.montoTotal)
        .query(`
          INSERT INTO dbo.Presupuestos (Anio, Mes, IdArea, IdCentroCosto, MontoTotal, Moneda, Activo)
          VALUES (@Anio, @Mes, @IdArea, @IdCentroCosto, @MontoTotal, 'USD', 1);
        `);
      creados += 1;
    }

    await transaction.commit();

    return {
      filasLeidas: filas.length,
      filasAplicadas: agregadosPorCodigo.size,
      procesados: creados + actualizados,
      creados,
      actualizados,
      omitidos,
      errores: [],
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('Error al revertir importacion masiva de presupuestos', rollbackError);
    }

    throw error;
  }
}
