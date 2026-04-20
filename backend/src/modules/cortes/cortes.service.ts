import sql, { ConnectionPool } from 'mssql';
import { getPool } from '../../config/db';
import { env } from '../../config/env';
import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface CorteStock {
  IdCorte: number;
  FechaCorte: string;
  Descripcion: string | null;
  FechaInicio: string;
  FechaFin: string | null;
  Ambito: string;
  EsMaximo: boolean;
  Estado?: string | null;
}

export interface CorteDetalleCabecera {
  idCorte: number;
  fechaCorte: string | null;
  descripcion: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  ambito: string | null;
  esMaximo: boolean;
  estado: string | null;
  idUsuarioCrea: number | null;
  idUsuarioAprueba: number | null;
  fechaAprobacion: string | null;
  fechaAplicacion: string | null;
  observacionRevision: string | null;
  observacionAplicacion: string | null;
  totalLineas: number;
  lineasConDiferencia: number;
  lineasPendientes: number;
}

export interface CorteDetalleLinea {
  idDetalleCorte: number;
  idMaterial: number | null;
  numeroArticulo: string | null;
  descripcionArticulo: string | null;
  unidadMedida: string | null;
  stockSistema: number;
  conteoFisico: number | null;
  diferencia: number;
  costoUnitarioReferencia: number;
  valorDiferencia: number;
  estadoLinea: string | null;
  comentarioLinea: string | null;
  idUsuarioConteo: number | null;
  idUsuarioRevision: number | null;
  fechaAplicacion: string | null;
}

export interface CorteDetalle {
  cabecera: CorteDetalleCabecera | null;
  detalle: CorteDetalleLinea[];
}

export interface RegistrarConteoDetalleInput {
  idDetalleCorte: number;
  conteoFisico: number;
  comentarioLinea?: string | null;
}

export interface CorteOperacionResultado {
  resultado: string;
  idCorte: number;
  nuevoEstado: string | null;
  lineasSnapshot: number | null;
  lineasContadas: number | null;
  lineasPendientes: number | null;
  lineasConDiferencia: number | null;
  lineasAjustadas: number | null;
  lineasSinDiferencia: number | null;
}

function createRequest(pool: ConnectionPool) {
  const request = pool.request();
  (request as any).timeout = env.DB_REQUEST_TIMEOUT_MS;
  return request;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 'sí';
}

function shouldTryNextVariant(error: any): boolean {
  const message = String(error?.originalError?.info?.message || error?.message || '').toLowerCase();

  return [
    'parameter',
    'expects parameter',
    'too many arguments',
    'too many parameters',
    'was not supplied',
    'could not find stored procedure',
    'cannot find data type',
    'must declare the scalar variable',
    'must declare the table variable',
  ].some((fragment) => message.includes(fragment));
}

async function executeStoredProcedureWithVariants<T = any>(
  names: string[],
  paramVariants: Array<Record<string, unknown>>,
) {
  const pool = await getPool();
  let lastError: any;

  for (const name of names) {
    for (const params of paramVariants) {
      const request = createRequest(pool);

      for (const [key, value] of Object.entries(params)) {
        request.input(key, value as any);
      }

      try {
        return await request.execute<T>(name);
      } catch (error: any) {
        lastError = error;
        if (!shouldTryNextVariant(error)) {
          throw error;
        }
      }
    }
  }

  throw lastError;
}

function normalizeLinea(row: any): CorteDetalleLinea {
  const stockSistema = toNumber(firstDefined(row?.StockSistema, row?.EnStock, row?.StockActual)) ?? 0;
  const conteoFisico = toNumber(firstDefined(row?.ConteoFisico, row?.Conteo, row?.StockFisico));
  const diferencia = toNumber(firstDefined(
    row?.Diferencia,
    conteoFisico !== null ? conteoFisico - stockSistema : 0,
  )) ?? 0;
  const costoUnitarioReferencia = toNumber(firstDefined(
    row?.CostoUnitarioReferencia,
    row?.CostoUnitario,
    row?.UltimoPrecioCompra,
  )) ?? 0;

  return {
    idDetalleCorte: toNumber(firstDefined(row?.IdDetalleCorte, row?.IdDetalle)) ?? 0,
    idMaterial: toNumber(firstDefined(row?.IdMaterial, row?.MaterialId)),
    numeroArticulo: toStringOrNull(firstDefined(row?.NumeroArticulo, row?.Codigo, row?.CodigoMaterial)),
    descripcionArticulo: toStringOrNull(firstDefined(row?.DescripcionArticulo, row?.Descripcion, row?.Material)),
    unidadMedida: toStringOrNull(firstDefined(row?.UnidadMedida, row?.Unidad)),
    stockSistema,
    conteoFisico,
    diferencia,
    costoUnitarioReferencia,
    valorDiferencia: toNumber(firstDefined(row?.ValorDiferencia, diferencia * costoUnitarioReferencia)) ?? 0,
    estadoLinea: toStringOrNull(firstDefined(row?.EstadoLinea, row?.Estado)),
    comentarioLinea: toStringOrNull(firstDefined(row?.ComentarioLinea, row?.ObservacionLinea, row?.Comentario)),
    idUsuarioConteo: toNumber(firstDefined(row?.IdUsuarioConteo, row?.UsuarioConteo)),
    idUsuarioRevision: toNumber(firstDefined(row?.IdUsuarioRevision, row?.UsuarioRevision)),
    fechaAplicacion: toStringOrNull(firstDefined(row?.FechaAplicacion, row?.AplicadoEn)),
  };
}

function normalizeCabecera(row: any, detalle: CorteDetalleLinea[]): CorteDetalleCabecera {
  const totalLineas = toNumber(firstDefined(row?.TotalLineas, row?.CantidadLineas, detalle.length)) ?? detalle.length;
  const lineasConDiferencia = toNumber(firstDefined(
    row?.LineasConDiferencia,
    row?.TotalDiferencias,
    detalle.filter((linea) => Math.abs(linea.diferencia) > 0).length,
  )) ?? 0;
  const lineasPendientes = toNumber(firstDefined(
    row?.LineasPendientes,
    detalle.filter((linea) => linea.conteoFisico === null).length,
  )) ?? 0;

  return {
    idCorte: toNumber(firstDefined(row?.IdCorte, row?.Id)) ?? 0,
    fechaCorte: toStringOrNull(firstDefined(row?.FechaCorte, row?.CreadoEn)),
    descripcion: toStringOrNull(row?.Descripcion),
    fechaInicio: toStringOrNull(row?.FechaInicio),
    fechaFin: toStringOrNull(row?.FechaFin),
    ambito: toStringOrNull(row?.Ambito),
    esMaximo: toBoolean(firstDefined(row?.EsMaximo, row?.Vigente, false)),
    estado: toStringOrNull(firstDefined(row?.Estado, row?.EstadoCorte, detalle.length > 0 ? 'EN_CONTEO' : 'BORRADOR')),
    idUsuarioCrea: toNumber(firstDefined(row?.IdUsuarioCrea, row?.UsuarioCrea)),
    idUsuarioAprueba: toNumber(firstDefined(row?.IdUsuarioAprueba, row?.UsuarioAprueba)),
    fechaAprobacion: toStringOrNull(row?.FechaAprobacion),
    fechaAplicacion: toStringOrNull(row?.FechaAplicacion),
    observacionRevision: toStringOrNull(firstDefined(row?.ObservacionRevision, row?.ComentarioRevision)),
    observacionAplicacion: toStringOrNull(firstDefined(row?.ObservacionAplicacion, row?.ComentarioAplicacion)),
    totalLineas,
    lineasConDiferencia,
    lineasPendientes,
  };
}

function normalizeOperacionResultado(row: any, idCorteFallback: number): CorteOperacionResultado {
  return {
    resultado: toStringOrNull(firstDefined(row?.Resultado, row?.result, row?.EstadoOperacion)) ?? 'OK',
    idCorte: toNumber(firstDefined(row?.IdCorte, row?.idCorte, idCorteFallback)) ?? idCorteFallback,
    nuevoEstado: toStringOrNull(firstDefined(row?.NuevoEstado, row?.Estado, row?.estado)),
    lineasSnapshot: toNumber(firstDefined(row?.LineasSnapshot, row?.TotalLineas, row?.LineasGeneradas)),
    lineasContadas: toNumber(firstDefined(row?.LineasContadas, row?.TotalContadas)),
    lineasPendientes: toNumber(firstDefined(row?.LineasPendientes, row?.TotalPendientes)),
    lineasConDiferencia: toNumber(firstDefined(row?.LineasConDiferencia, row?.TotalDiferencias)),
    lineasAjustadas: toNumber(firstDefined(row?.LineasAjustadas, row?.TotalAjustadas)),
    lineasSinDiferencia: toNumber(firstDefined(row?.LineasSinDiferencia, row?.TotalSinDiferencia)),
  };
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

export async function obtenerDetalleCorte(idCorte: number): Promise<CorteDetalle> {
  try {
    const result = await executeStoredProcedureWithVariants(
      ['sp_ObtenerDetalleCorteStock', 'sp_ObtenerDetalleCorte'],
      [
        { IdCorte: idCorte },
        { IdCorteStock: idCorte },
      ],
    );

    const recordsets = Array.isArray((result as any)?.recordsets) ? (result as any).recordsets : [];
    const cabeceraRow = recordsets[0]?.[0] ?? (result as any)?.recordset?.[0] ?? null;
    const detalleNormalizado = (recordsets[1] ?? []).map(normalizeLinea);

    return {
      cabecera: cabeceraRow ? normalizeCabecera(cabeceraRow, detalleNormalizado) : null,
      detalle: detalleNormalizado,
    };
  } catch {
    const pool = await getPool();
    const request = createRequest(pool);
    request.input('IdCorte', sql.Int, idCorte);

    const result = await request.query(`
      SELECT
        c.IdCorte,
        c.FechaCorte,
        c.Descripcion,
        c.FechaInicio,
        c.FechaFin,
        c.Ambito,
        c.EsMaximo,
        c.Estado,
        c.IdUsuarioCrea,
        c.IdUsuarioAprueba,
        c.FechaAprobacion,
        c.FechaAplicacion,
        c.ObservacionRevision,
        c.ObservacionAplicacion
      FROM dbo.CortesStock c
      WHERE c.IdCorte = @IdCorte;

      SELECT
        d.IdDetalleCorte,
        d.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        d.StockSistema,
        d.ConteoFisico,
        d.Diferencia,
        d.CostoUnitarioReferencia,
        d.ValorDiferencia,
        d.EstadoLinea,
        d.ComentarioLinea,
        d.IdUsuarioConteo,
        d.IdUsuarioRevision,
        d.FechaAplicacion
      FROM dbo.DetalleCortesStock d
      LEFT JOIN dbo.Materiales m ON m.IdMaterial = d.IdMaterial
      WHERE d.IdCorte = @IdCorte
      ORDER BY d.IdDetalleCorte;
    `);

    const recordsets = Array.isArray((result as any)?.recordsets) ? (result as any).recordsets : [];
    const detalleNormalizado = (recordsets[1] ?? []).map(normalizeLinea);

    return {
      cabecera: recordsets[0]?.[0] ? normalizeCabecera(recordsets[0][0], detalleNormalizado) : null,
      detalle: detalleNormalizado,
    };
  }
}

export async function cargarSnapshotCorte(
  idCorte: number,
  idUsuario?: number | null,
): Promise<CorteOperacionResultado> {
  const result = await executeStoredProcedureWithVariants(
    ['sp_CargarSnapshotCorteStock', 'sp_CargarSnapshotCorte'],
    [
      { IdCorte: idCorte, IdUsuario: idUsuario ?? null },
      { IdCorte: idCorte, IdUsuarioCarga: idUsuario ?? null },
      { IdCorte: idCorte, IdUsuarioCrea: idUsuario ?? null },
      { IdCorte: idCorte },
      { IdCorteStock: idCorte, IdUsuario: idUsuario ?? null },
      { IdCorteStock: idCorte },
    ],
  );

  const row = (result as any)?.recordset?.[0] ?? (result as any)?.recordsets?.[0]?.[0] ?? null;
  return normalizeOperacionResultado(row, idCorte);
}

export async function registrarConteoCorte(
  idCorte: number,
  idUsuarioConteo: number,
  detalle: RegistrarConteoDetalleInput[],
): Promise<CorteOperacionResultado> {
  const pool = await getPool();
  const detalleJson = JSON.stringify(
    detalle.map((linea) => ({
      idDetalleCorte: linea.idDetalleCorte,
      conteoFisico: linea.conteoFisico,
      comentarioLinea: linea.comentarioLinea ?? null,
    })),
  );

  const procedureNames = ['sp_RegistrarConteoCorteStock', 'sp_RegistrarConteoCorte'];
  const userParamNames = ['IdUsuarioConteo', 'IdUsuario'];
  const tableTypeNames = [
    'dbo.TDetalleConteoCorteStock',
    'dbo.TDetalleCorteConteoStock',
    'dbo.TDetalleConteoCorte',
    'dbo.TDetalleCorteStockConteo',
  ];

  let lastError: any;

  for (const procedureName of procedureNames) {
    for (const userParamName of userParamNames) {
      for (const tableTypeName of tableTypeNames) {
        const request = createRequest(pool);
        request.input('IdCorte', sql.Int, idCorte);
        request.input('IdUsuario', sql.Int, idUsuarioConteo);
        request.input('DetalleJson', sql.NVarChar(sql.MAX), detalleJson);

        const query = `
          DECLARE @Detalle ${tableTypeName};

          INSERT INTO @Detalle (IdDetalleCorte, ConteoFisico, ComentarioLinea)
          SELECT
            IdDetalleCorte,
            ConteoFisico,
            ComentarioLinea
          FROM OPENJSON(@DetalleJson)
          WITH (
            IdDetalleCorte INT '$.idDetalleCorte',
            ConteoFisico DECIMAL(18,4) '$.conteoFisico',
            ComentarioLinea NVARCHAR(300) '$.comentarioLinea'
          );

          EXEC ${procedureName}
            @IdCorte = @IdCorte,
            @${userParamName} = @IdUsuario,
            @Detalle = @Detalle;
        `;

        try {
          const result = await request.query(query);
          const fallbackRecordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
          const row = result.recordset?.[0] ?? fallbackRecordsets[0]?.[0] ?? null;
          return normalizeOperacionResultado(row, idCorte);
        } catch (error: any) {
          lastError = error;
          if (!shouldTryNextVariant(error)) {
            throw error;
          }
        }
      }
    }
  }

  throw lastError;
}

export async function aprobarCorte(
  idCorte: number,
  idUsuarioAprueba: number,
  observacionRevision?: string | null,
): Promise<CorteOperacionResultado> {
  const result = await executeStoredProcedureWithVariants(
    ['sp_AprobarCorteStock', 'sp_AprobarCorte'],
    [
      { IdCorte: idCorte, IdUsuarioAprueba: idUsuarioAprueba, ObservacionRevision: observacionRevision ?? null },
      { IdCorte: idCorte, IdUsuarioRevision: idUsuarioAprueba, ObservacionRevision: observacionRevision ?? null },
      { IdCorte: idCorte, IdUsuarioAprueba: idUsuarioAprueba, ComentarioRevision: observacionRevision ?? null },
      { IdCorte: idCorte, IdUsuario: idUsuarioAprueba, ObservacionRevision: observacionRevision ?? null },
      { IdCorte: idCorte, IdUsuario: idUsuarioAprueba, Observacion: observacionRevision ?? null },
      { IdCorteStock: idCorte, IdUsuarioAprueba: idUsuarioAprueba, ObservacionRevision: observacionRevision ?? null },
      { IdCorteStock: idCorte, IdUsuario: idUsuarioAprueba, Observacion: observacionRevision ?? null },
      { IdCorte: idCorte, IdUsuarioAprueba: idUsuarioAprueba },
      { IdCorte: idCorte, IdUsuario: idUsuarioAprueba },
      { IdCorteStock: idCorte, IdUsuario: idUsuarioAprueba },
    ],
  );

  const row = (result as any)?.recordset?.[0] ?? (result as any)?.recordsets?.[0]?.[0] ?? null;
  return normalizeOperacionResultado(row, idCorte);
}

export async function aplicarAjusteCorte(
  idCorte: number,
  idUsuarioAplicacion: number,
  observacionAplicacion?: string | null,
): Promise<CorteOperacionResultado> {
  const result = await executeStoredProcedureWithVariants(
    ['sp_AplicarAjusteCorteStock', 'sp_AplicarAjusteCorte'],
    [
      { IdCorte: idCorte, IdUsuarioAplicacion: idUsuarioAplicacion, ObservacionAplicacion: observacionAplicacion ?? null },
      { IdCorte: idCorte, IdUsuarioAplica: idUsuarioAplicacion, ObservacionAplicacion: observacionAplicacion ?? null },
      { IdCorte: idCorte, IdUsuarioAplicacion: idUsuarioAplicacion, ComentarioAplicacion: observacionAplicacion ?? null },
      { IdCorte: idCorte, IdUsuario: idUsuarioAplicacion, ObservacionAplicacion: observacionAplicacion ?? null },
      { IdCorte: idCorte, IdUsuario: idUsuarioAplicacion, Observacion: observacionAplicacion ?? null },
      { IdCorteStock: idCorte, IdUsuarioAplicacion: idUsuarioAplicacion, ObservacionAplicacion: observacionAplicacion ?? null },
      { IdCorteStock: idCorte, IdUsuario: idUsuarioAplicacion, Observacion: observacionAplicacion ?? null },
      { IdCorte: idCorte, IdUsuarioAplicacion: idUsuarioAplicacion },
      { IdCorte: idCorte, IdUsuario: idUsuarioAplicacion },
      { IdCorteStock: idCorte, IdUsuario: idUsuarioAplicacion },
    ],
  );

  const row = (result as any)?.recordset?.[0] ?? (result as any)?.recordsets?.[0]?.[0] ?? null;
  return normalizeOperacionResultado(row, idCorte);
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
