import { getPool } from '../config/db';

export interface DetalleDespachosSchema {
  hasIdDetalleSolicitud: boolean;
}

let cachedDetalleDespachosSchema: DetalleDespachosSchema | null = null;

export async function resolveDetalleDespachosSchema(): Promise<DetalleDespachosSchema> {
  if (cachedDetalleDespachosSchema) {
    return cachedDetalleDespachosSchema;
  }

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      CASE
        WHEN COL_LENGTH('dbo.DetalleDespachos', 'IdDetalleSolicitud') IS NULL THEN CAST(0 AS bit)
        ELSE CAST(1 AS bit)
      END AS HasIdDetalleSolicitud;
  `);

  cachedDetalleDespachosSchema = {
    hasIdDetalleSolicitud: Boolean(result.recordset?.[0]?.HasIdDetalleSolicitud),
  };

  return cachedDetalleDespachosSchema;
}

function buildDetalleDespachoMatchCondition(
  schema: DetalleDespachosSchema,
  detalleSolicitudAlias: string,
  detalleDespachoAlias: string,
): string {
  if (schema.hasIdDetalleSolicitud) {
    return `(
      ${detalleDespachoAlias}.IdDetalleSolicitud = ${detalleSolicitudAlias}.IdDetalleSolicitud
      OR (
        ${detalleDespachoAlias}.IdDetalleSolicitud IS NULL
        AND ${detalleDespachoAlias}.IdMaterial = ${detalleSolicitudAlias}.IdMaterial
      )
    )`;
  }

  return `${detalleDespachoAlias}.IdMaterial = ${detalleSolicitudAlias}.IdMaterial`;
}

export function buildDespachosPreviosOuterApply(
  schema: DetalleDespachosSchema,
  options: {
    solicitudIdExpression: string;
    detalleSolicitudAlias: string;
    outputAlias?: string;
    cantidadAlias?: string;
    detalleDespachoAlias?: string;
    despachoAlias?: string;
  },
): string {
  const outputAlias = options.outputAlias ?? 'despachosPrevios';
  const cantidadAlias = options.cantidadAlias ?? 'CantidadYaDespachada';
  const detalleDespachoAlias = options.detalleDespachoAlias ?? 'dd';
  const despachoAlias = options.despachoAlias ?? 'desp';
  const matchCondition = buildDetalleDespachoMatchCondition(
    schema,
    options.detalleSolicitudAlias,
    detalleDespachoAlias,
  );

  return `
    OUTER APPLY (
      SELECT SUM(${detalleDespachoAlias}.CantidadDespachada) AS ${cantidadAlias}
      FROM dbo.DetalleDespachos ${detalleDespachoAlias}
      INNER JOIN dbo.Despachos ${despachoAlias}
        ON ${despachoAlias}.IdDespacho = ${detalleDespachoAlias}.IdDespacho
      WHERE ${despachoAlias}.IdSolicitud = ${options.solicitudIdExpression}
        AND ${matchCondition}
    ) ${outputAlias}
  `;
}

export function buildDevolucionesPresupuestoOuterApply(
  schema: DetalleDespachosSchema,
  options: {
    solicitudIdExpression: string;
    detalleSolicitudAlias: string;
    outputAlias?: string;
    cantidadAlias?: string;
    detalleDespachoAlias?: string;
    despachoAlias?: string;
    detalleDevolucionAlias?: string;
    devolucionAlias?: string;
  },
): string {
  const outputAlias = options.outputAlias ?? 'devolucionesPresupuesto';
  const cantidadAlias = options.cantidadAlias ?? 'CantidadDevueltaPresupuesto';
  const detalleDespachoAlias = options.detalleDespachoAlias ?? 'dd_dev';
  const despachoAlias = options.despachoAlias ?? 'desp_dev';
  const detalleDevolucionAlias = options.detalleDevolucionAlias ?? 'ddv';
  const devolucionAlias = options.devolucionAlias ?? 'dev';
  const matchCondition = buildDetalleDespachoMatchCondition(
    schema,
    options.detalleSolicitudAlias,
    detalleDespachoAlias,
  );

  return `
    OUTER APPLY (
      SELECT SUM(${detalleDevolucionAlias}.CantidadDevuelta) AS ${cantidadAlias}
      FROM dbo.DetalleDespachos ${detalleDespachoAlias}
      INNER JOIN dbo.Despachos ${despachoAlias}
        ON ${despachoAlias}.IdDespacho = ${detalleDespachoAlias}.IdDespacho
      INNER JOIN dbo.DetalleDevolucionesDespacho ${detalleDevolucionAlias}
        ON ${detalleDevolucionAlias}.IdDetalleDespacho = ${detalleDespachoAlias}.IdDetalleDespacho
      INNER JOIN dbo.DevolucionesDespacho ${devolucionAlias}
        ON ${devolucionAlias}.IdDevolucion = ${detalleDevolucionAlias}.IdDevolucion
      WHERE ${despachoAlias}.IdSolicitud = ${options.solicitudIdExpression}
        AND ${matchCondition}
        AND ${devolucionAlias}.Estado = 'REGISTRADA'
        AND ISNULL(${devolucionAlias}.ReversaPresupuesto, 0) = 1
    ) ${outputAlias}
  `;
}