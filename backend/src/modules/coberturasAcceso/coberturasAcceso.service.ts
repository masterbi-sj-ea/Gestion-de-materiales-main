import { getPool } from '../../config/db';
import { env } from '../../config/env';
import { callSpMany } from '../../infra/spCaller';
import sql from 'mssql';

export interface CoberturaAcceso {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipoAlcance: string;
  activo: boolean;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  fechaCreacion: string | null;
  totalUsuarios: number;
  totalAreas: number;
  totalCatalogos: number;
}

export interface CoberturaUsuario {
  idUsuario: number;
  nombreCompleto: string;
  email: string | null;
  activo: boolean;
}

export interface CoberturaArea {
  idArea: number;
  codigo: string | null;
  nombre: string;
  activo: boolean;
}

export interface CatalogoSolicitud {
  idCatalogoSolicitud: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface CatalogoPermitido {
  id: number;
  nombre: string;
  descripcion: string | null;
  idSource?: string | null;
  idCatalogoSolicitud?: number | null;
  idCatalogo?: number | null;
}

export interface CoberturaAccesoDetalle {
  cobertura: CoberturaAcceso | null;
  usuarios: CoberturaUsuario[];
  areas: CoberturaArea[];
  catalogos: CatalogoSolicitud[];
}

export interface CrearCoberturaAccesoInput {
  nombre: string;
  descripcion?: string | null;
  tipoAlcance: 'GLOBAL' | 'RESTRINGIDO';
  activo?: boolean;
}

type TableColumnsMap = Map<string, Set<string>>;

interface CatalogJoinPlan {
  coverageCatalogColumn: string;
  catalogTableIdColumn: string;
}

function createRequest(pool: Awaited<ReturnType<typeof getPool>>) {
  const request = pool.request();
  (request as any).timeout = env.DB_REQUEST_TIMEOUT_MS;
  return request;
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'activo' || normalized === 'vigente';
  }

  return false;
}

function toSqlDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasColumn(columns: TableColumnsMap, tableName: string, columnName: string): boolean {
  return columns.get(tableName)?.has(columnName.toLowerCase()) ?? false;
}

function pickFirstColumn(columns: TableColumnsMap, tableName: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (hasColumn(columns, tableName, candidate)) {
      return candidate;
    }
  }

  return null;
}

function pickCommonColumn(columns: TableColumnsMap, tableNames: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (tableNames.every((tableName) => hasColumn(columns, tableName, candidate))) {
      return candidate;
    }
  }

  return null;
}

function listExistingColumns(columns: TableColumnsMap, tableName: string, candidates: string[]): string[] {
  return candidates.filter((candidate) => hasColumn(columns, tableName, candidate));
}

async function detectCatalogJoinPlan(columns: TableColumnsMap): Promise<CatalogJoinPlan | null> {
  const coverageCandidates = listExistingColumns(columns, 'CoberturaCatalogos', ['IdCatalogoSolicitud', 'IdCatalogo']);
  const catalogCandidates = listExistingColumns(columns, 'CatalogosSolicitud', ['IdCatalogoSolicitud', 'IdCatalogo', 'Id']);

  if (coverageCandidates.length === 0 || catalogCandidates.length === 0) {
    return null;
  }

  const pairCandidates = coverageCandidates.flatMap((coverageCatalogColumn) => {
    const orderedCatalogCandidates = [
      ...catalogCandidates.filter((catalogTableIdColumn) => catalogTableIdColumn === coverageCatalogColumn),
      ...catalogCandidates.filter((catalogTableIdColumn) => catalogTableIdColumn !== coverageCatalogColumn),
    ];

    return orderedCatalogCandidates.map((catalogTableIdColumn, orderIndex) => ({
      coverageCatalogColumn,
      catalogTableIdColumn,
      orderIndex,
      sameName: coverageCatalogColumn === catalogTableIdColumn,
    }));
  });

  if (pairCandidates.length === 1) {
    return {
      coverageCatalogColumn: pairCandidates[0].coverageCatalogColumn,
      catalogTableIdColumn: pairCandidates[0].catalogTableIdColumn,
    };
  }

  try {
    const pool = await getPool();
    const countQuery = pairCandidates.map((pair, index) => `
      SELECT
        ${index} AS PairIndex,
        COUNT_BIG(*) AS MatchCount
      FROM dbo.CoberturaCatalogos cc
      INNER JOIN dbo.CatalogosSolicitud cs
        ON LTRIM(RTRIM(CONVERT(NVARCHAR(100), cc.${pair.coverageCatalogColumn}))) = LTRIM(RTRIM(CONVERT(NVARCHAR(100), cs.${pair.catalogTableIdColumn})))
      WHERE cc.${pair.coverageCatalogColumn} IS NOT NULL
        AND cs.${pair.catalogTableIdColumn} IS NOT NULL
    `).join('\nUNION ALL\n');

    const result = await pool.request().query(countQuery);
    const ranked = (result.recordset ?? [])
      .map((row: any) => ({
        pairIndex: Number(row?.PairIndex ?? -1),
        matchCount: Number(row?.MatchCount ?? 0),
      }))
      .filter((row: { pairIndex: number; matchCount: number }) => row.pairIndex >= 0)
      .sort((left: { pairIndex: number; matchCount: number }, right: { pairIndex: number; matchCount: number }) => {
        if (right.matchCount !== left.matchCount) {
          return right.matchCount - left.matchCount;
        }

        const leftPair = pairCandidates[left.pairIndex];
        const rightPair = pairCandidates[right.pairIndex];
        if (Number(rightPair.sameName) !== Number(leftPair.sameName)) {
          return Number(rightPair.sameName) - Number(leftPair.sameName);
        }

        return leftPair.orderIndex - rightPair.orderIndex;
      });

    if (ranked[0] && ranked[0].matchCount > 0) {
      const bestPair = pairCandidates[ranked[0].pairIndex];
      return {
        coverageCatalogColumn: bestPair.coverageCatalogColumn,
        catalogTableIdColumn: bestPair.catalogTableIdColumn,
      };
    }
  } catch (error) {
    console.warn('[CoberturasAcceso] No se pudo detectar por datos la columna real de catálogo. Se usará fallback por nombre.', error);
  }

  const fallbackPair = pairCandidates.sort((left, right) => {
    if (Number(right.sameName) !== Number(left.sameName)) {
      return Number(right.sameName) - Number(left.sameName);
    }

    return left.orderIndex - right.orderIndex;
  })[0];

  return fallbackPair
    ? {
        coverageCatalogColumn: fallbackPair.coverageCatalogColumn,
        catalogTableIdColumn: fallbackPair.catalogTableIdColumn,
      }
    : null;
}

function activeCondition(alias: string, columns: TableColumnsMap, tableName: string): string {
  return hasColumn(columns, tableName, 'Activo') ? ` AND ISNULL(${alias}.Activo, 1) = 1` : '';
}

async function loadCatalogCoverageColumns(): Promise<TableColumnsMap> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN (
        'Usuarios',
        'CoberturasAcceso',
        'CoberturaUsuarios',
        'CoberturaAreas',
        'CoberturaCatalogos',
        'CatalogosSolicitud'
      )
  `);

  const columns: TableColumnsMap = new Map();
  for (const row of result.recordset ?? []) {
    const tableName = String(row.TABLE_NAME ?? '');
    const columnName = String(row.COLUMN_NAME ?? '').toLowerCase();
    if (!tableName || !columnName) {
      continue;
    }

    const current = columns.get(tableName) ?? new Set<string>();
    current.add(columnName);
    columns.set(tableName, current);
  }

  return columns;
}

async function listarCatalogosPermitidosPorUsuarioAreaDirecto(
  idUsuario: number,
  idArea: number,
): Promise<CatalogoPermitido[]> {
  const columns = await loadCatalogCoverageColumns();

  const coverageKey = pickCommonColumn(
    columns,
    ['CoberturasAcceso', 'CoberturaUsuarios', 'CoberturaAreas', 'CoberturaCatalogos'],
    ['IdCobertura', 'IdCoberturaAcceso', 'CoberturaId'],
  );
  const coverageScopeColumn = pickFirstColumn(columns, 'CoberturasAcceso', ['TipoAlcance', 'Alcance']);
  const catalogJoinPlan = await detectCatalogJoinPlan(columns);
  const coverageCatalogColumn = catalogJoinPlan?.coverageCatalogColumn ?? null;
  const catalogTableIdColumn = catalogJoinPlan?.catalogTableIdColumn ?? null;
  const catalogNameColumn = pickFirstColumn(columns, 'CatalogosSolicitud', ['NombreCatalogo', 'Nombre', 'Catalogo']);
  const catalogDescriptionColumn = pickFirstColumn(columns, 'CatalogosSolicitud', ['Descripcion', 'DescripcionCatalogo']);

  if (
    !coverageKey
    || !coverageCatalogColumn
    || !catalogTableIdColumn
    || !catalogNameColumn
    || !hasColumn(columns, 'CoberturaUsuarios', 'IdUsuario')
    || !hasColumn(columns, 'CoberturaAreas', 'IdArea')
  ) {
    return [];
  }

  const usuariosJoin = hasColumn(columns, 'Usuarios', 'IdUsuario')
    ? `
    INNER JOIN dbo.Usuarios u
      ON u.IdUsuario = cu.IdUsuario${activeCondition('u', columns, 'Usuarios')}`
    : '';

  const scopeCondition = coverageScopeColumn
    ? `
      AND (
        UPPER(CONVERT(NVARCHAR(50), ISNULL(c.${coverageScopeColumn}, 'RESTRINGIDO'))) = 'GLOBAL'
        OR (ca.IdArea = @IdArea${activeCondition('ca', columns, 'CoberturaAreas')})
      )`
    : `
      AND ca.IdArea = @IdArea${activeCondition('ca', columns, 'CoberturaAreas')}`;

  const coverageValidityConditions = [
    hasColumn(columns, 'CoberturasAcceso', 'Activo') ? `AND ISNULL(c.Activo, 1) = 1` : '',
    hasColumn(columns, 'CoberturasAcceso', 'Vigente') ? `AND ISNULL(c.Vigente, 1) = 1` : '',
    hasColumn(columns, 'CoberturasAcceso', 'VigenteDesde') ? `AND (c.VigenteDesde IS NULL OR c.VigenteDesde <= CAST(GETDATE() AS DATE))` : '',
    hasColumn(columns, 'CoberturasAcceso', 'VigenteHasta') ? `AND (c.VigenteHasta IS NULL OR c.VigenteHasta >= CAST(GETDATE() AS DATE))` : '',
    hasColumn(columns, 'CoberturasAcceso', 'FechaInicio') ? `AND (c.FechaInicio IS NULL OR c.FechaInicio <= CAST(GETDATE() AS DATE))` : '',
    hasColumn(columns, 'CoberturasAcceso', 'FechaFin') ? `AND (c.FechaFin IS NULL OR c.FechaFin >= CAST(GETDATE() AS DATE))` : '',
  ].filter(Boolean).join('\n        ');

  const userCoverageValidityConditions = [
    hasColumn(columns, 'CoberturaUsuarios', 'Activo') ? `AND ISNULL(cu.Activo, 1) = 1` : '',
    hasColumn(columns, 'CoberturaUsuarios', 'FechaInicio') ? `AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))` : '',
    hasColumn(columns, 'CoberturaUsuarios', 'FechaFin') ? `AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))` : '',
  ].filter(Boolean).join('\n        ');

  const query = `
    WITH CoberturasVigentes AS (
      SELECT DISTINCT
        cc.${coverageCatalogColumn} AS CatalogoId
      FROM dbo.CoberturaUsuarios cu
      INNER JOIN dbo.CoberturasAcceso c
        ON c.${coverageKey} = cu.${coverageKey}
        ${coverageValidityConditions}
      ${usuariosJoin}
      LEFT JOIN dbo.CoberturaAreas ca
        ON ca.${coverageKey} = c.${coverageKey}
      INNER JOIN dbo.CoberturaCatalogos cc
        ON cc.${coverageKey} = c.${coverageKey}${activeCondition('cc', columns, 'CoberturaCatalogos')}
      WHERE cu.IdUsuario = @IdUsuario
        ${userCoverageValidityConditions}${scopeCondition}
    )
    SELECT DISTINCT
      cs.${catalogTableIdColumn} AS CatalogoKey,
      ${hasColumn(columns, 'CatalogosSolicitud', 'IdCatalogoSolicitud') ? 'cs.IdCatalogoSolicitud' : 'CAST(NULL AS INT)'} AS IdCatalogoSolicitud,
      ${hasColumn(columns, 'CatalogosSolicitud', 'IdCatalogo') ? 'cs.IdCatalogo' : 'CAST(NULL AS INT)'} AS IdCatalogo,
      CAST('${catalogTableIdColumn}' AS NVARCHAR(50)) AS IdSource,
      cs.${catalogNameColumn} AS NombreCatalogo,
      ${catalogDescriptionColumn ? `cs.${catalogDescriptionColumn}` : 'CAST(NULL AS NVARCHAR(255))'} AS Descripcion
    FROM CoberturasVigentes cv
    INNER JOIN dbo.CatalogosSolicitud cs
      ON cs.${catalogTableIdColumn} = cv.CatalogoId${activeCondition('cs', columns, 'CatalogosSolicitud')}
    ORDER BY cs.${catalogNameColumn};
  `;

  const pool = await getPool();
  const result = await pool.request()
    .input('IdUsuario', sql.Int, idUsuario)
    .input('IdArea', sql.Int, idArea)
    .query(query);

  return (result.recordset ?? []).map((row: any) => ({
    id: Number(row.CatalogoKey ?? row.IdCatalogoSolicitud ?? row.idCatalogoSolicitud ?? row.IdCatalogo ?? row.id ?? 0),
    nombre: String(row.NombreCatalogo ?? row.nombre ?? row.Nombre ?? ''),
    descripcion: row.Descripcion ?? row.descripcion ?? null,
    idSource: String(row.IdSource ?? catalogTableIdColumn ?? ''),
    idCatalogoSolicitud: toNumber(row.IdCatalogoSolicitud ?? row.idCatalogoSolicitud),
    idCatalogo: toNumber(row.IdCatalogo ?? row.idCatalogo),
  }));
}

function shouldTryNextVariant(error: any): boolean {
  const message = String(
    error?.originalError?.info?.message || error?.message || '',
  ).toLowerCase();

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
  paramVariants: Array<Record<string, unknown>>,
) {
  const pool = await getPool();
  let lastError: any;

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

  throw lastError;
}

function normalizeCobertura(row: any): CoberturaAcceso {
  return {
    id: toNumber(firstDefined(row?.IdCobertura, row?.IdCoberturaAcceso, row?.Id)) ?? 0,
    nombre: String(firstDefined(row?.Nombre, row?.NombreCobertura, row?.Cobertura, '') ?? ''),
    descripcion: firstDefined(row?.Descripcion, row?.DescripcionCobertura) ?? null,
    tipoAlcance: String(firstDefined(row?.TipoAlcance, row?.Alcance, row?.Tipo, 'RESTRINGIDO') ?? 'RESTRINGIDO').trim().toUpperCase(),
    activo: toBoolean(firstDefined(row?.Activo, row?.Vigente, row?.Estado, 1)),
    vigenteDesde: firstDefined(row?.VigenteDesde, row?.FechaInicio, row?.Desde) ?? null,
    vigenteHasta: firstDefined(row?.VigenteHasta, row?.FechaFin, row?.Hasta) ?? null,
    fechaCreacion: firstDefined(row?.FechaCreacion, row?.CreadoEn) ?? null,
    totalUsuarios: toNumber(firstDefined(row?.TotalUsuarios, row?.CantidadUsuarios, row?.UsuariosAsignados)) ?? 0,
    totalAreas: toNumber(firstDefined(row?.TotalAreas, row?.CantidadAreas, row?.AreasAsignadas)) ?? 0,
    totalCatalogos: toNumber(firstDefined(row?.TotalCatalogos, row?.CantidadCatalogos, row?.CatalogosAsignados)) ?? 0,
  };
}

function normalizeCoberturaUsuario(row: any): CoberturaUsuario {
  return {
    idUsuario: toNumber(firstDefined(row?.IdUsuario, row?.UsuarioId, row?.Id)) ?? 0,
    nombreCompleto: String(firstDefined(row?.NombreCompleto, row?.Nombre, row?.Usuario, '') ?? ''),
    email: firstDefined(row?.Email, row?.Correo) ?? null,
    activo: toBoolean(firstDefined(row?.Activo, 1)),
  };
}

function normalizeCoberturaArea(row: any): CoberturaArea {
  return {
    idArea: toNumber(firstDefined(row?.IdArea, row?.AreaId, row?.Id)) ?? 0,
    codigo: firstDefined(row?.Codigo, row?.CodigoArea) ?? null,
    nombre: String(firstDefined(row?.Nombre, row?.NombreArea, row?.Area, '') ?? ''),
    activo: toBoolean(firstDefined(row?.Activo, 1)),
  };
}

function normalizeCatalogoSolicitud(row: any): CatalogoSolicitud {
  return {
    idCatalogoSolicitud: toNumber(firstDefined(row?.IdCatalogoSolicitud, row?.IdCatalogo, row?.Id)) ?? 0,
    codigo: firstDefined(row?.Codigo, row?.CodigoCatalogo) ?? null,
    nombre: String(firstDefined(row?.Nombre, row?.NombreCatalogo, row?.Catalogo, '') ?? ''),
    descripcion: firstDefined(row?.Descripcion, row?.DescripcionCatalogo) ?? null,
    activo: toBoolean(firstDefined(row?.Activo, 1)),
  };
}

export async function listarCoberturasAcceso(): Promise<CoberturaAcceso[]> {
  const rows = await callSpMany<any>('sp_ListarCoberturasAcceso');
  return rows.map(normalizeCobertura);
}

export async function obtenerConteosCoberturas(): Promise<Array<{ id: number; totalUsuarios: number; totalAreas: number; totalCatalogos: number }>> {
  const pool = await getPool();
  const request = createRequest(pool);
  const sql = `
DECLARE @sql NVARCHAR(MAX);
IF OBJECT_ID('dbo.CoberturasAcceso','U') IS NULL
BEGIN
  THROW 51000, 'Tabla dbo.CoberturasAcceso no existe', 1;
END

-- Variante con columnas IdCobertura en tablas relacionadas
IF COL_LENGTH('dbo.CoberturaUsuarios','IdCobertura') IS NOT NULL
BEGIN
  SET @sql = N'
    SELECT c.IdCobertura AS IdCobertura,
           ISNULL(u.TotalUsuarios,0) AS TotalUsuarios,
           ISNULL(a.TotalAreas,0) AS TotalAreas,
           ISNULL(cc.TotalCatalogos,0) AS TotalCatalogos
    FROM dbo.CoberturasAcceso c
    LEFT JOIN (
      SELECT IdCobertura, COUNT(*) AS TotalUsuarios FROM dbo.CoberturaUsuarios WHERE (Activo = 1 OR Activo IS NULL) GROUP BY IdCobertura
    ) u ON u.IdCobertura = c.IdCobertura
    LEFT JOIN (
      SELECT IdCobertura, COUNT(*) AS TotalAreas FROM dbo.CoberturaAreas WHERE (Activo = 1 OR Activo IS NULL) GROUP BY IdCobertura
    ) a ON a.IdCobertura = c.IdCobertura
    LEFT JOIN (
      SELECT IdCobertura, COUNT(*) AS TotalCatalogos FROM dbo.CoberturaCatalogos WHERE (Activo = 1 OR Activo IS NULL) GROUP BY IdCobertura
    ) cc ON cc.IdCobertura = c.IdCobertura;';
  EXEC sp_executesql @sql;
  RETURN;
END

-- Variante con columnas IdCoberturaAcceso en tablas relacionadas
IF COL_LENGTH('dbo.CoberturaUsuarios','IdCoberturaAcceso') IS NOT NULL
BEGIN
  SET @sql = N'
    SELECT c.IdCoberturaAcceso AS IdCobertura,
           ISNULL(u.TotalUsuarios,0) AS TotalUsuarios,
           ISNULL(a.TotalAreas,0) AS TotalAreas,
           ISNULL(cc.TotalCatalogos,0) AS TotalCatalogos
    FROM dbo.CoberturasAcceso c
    LEFT JOIN (
      SELECT IdCoberturaAcceso AS IdCobertura, COUNT(*) AS TotalUsuarios FROM dbo.CoberturaUsuarios WHERE (Activo = 1 OR Activo IS NULL) GROUP BY IdCoberturaAcceso
    ) u ON u.IdCobertura = c.IdCoberturaAcceso
    LEFT JOIN (
      SELECT IdCoberturaAcceso AS IdCobertura, COUNT(*) AS TotalAreas FROM dbo.CoberturaAreas WHERE (Activo = 1 OR Activo IS NULL) GROUP BY IdCoberturaAcceso
    ) a ON a.IdCobertura = c.IdCoberturaAcceso
    LEFT JOIN (
      SELECT IdCoberturaAcceso AS IdCobertura, COUNT(*) AS TotalCatalogos FROM dbo.CoberturaCatalogos WHERE (Activo = 1 OR Activo IS NULL) GROUP BY IdCoberturaAcceso
    ) cc ON cc.IdCobertura = c.IdCoberturaAcceso;';
  EXEC sp_executesql @sql;
  RETURN;
END

-- Variante con columnas CoberturaId en tablas relacionadas
IF COL_LENGTH('dbo.CoberturaUsuarios','CoberturaId') IS NOT NULL
BEGIN
  SET @sql = N'
    SELECT c.IdCobertura AS IdCobertura,
           ISNULL(u.TotalUsuarios,0) AS TotalUsuarios,
           ISNULL(a.TotalAreas,0) AS TotalAreas,
           ISNULL(cc.TotalCatalogos,0) AS TotalCatalogos
    FROM dbo.CoberturasAcceso c
    LEFT JOIN (
      SELECT CoberturaId AS IdCobertura, COUNT(*) AS TotalUsuarios FROM dbo.CoberturaUsuarios WHERE (Activo = 1 OR Activo IS NULL) GROUP BY CoberturaId
    ) u ON u.IdCobertura = c.IdCobertura
    LEFT JOIN (
      SELECT CoberturaId AS IdCobertura, COUNT(*) AS TotalAreas FROM dbo.CoberturaAreas WHERE (Activo = 1 OR Activo IS NULL) GROUP BY CoberturaId
    ) a ON a.IdCobertura = c.IdCobertura
    LEFT JOIN (
      SELECT CoberturaId AS IdCobertura, COUNT(*) AS TotalCatalogos FROM dbo.CoberturaCatalogos WHERE (Activo = 1 OR Activo IS NULL) GROUP BY CoberturaId
    ) cc ON cc.IdCobertura = c.IdCobertura;';
  EXEC sp_executesql @sql;
  RETURN;
END

RAISERROR('No se detectaron columnas compatibles en tablas de cobertura.',16,1);
`;

  const result = await request.query(sql);
  const rows = result.recordset ?? [];
  return (rows || []).map((r: any) => ({
    id: toNumber(firstDefined(r?.IdCobertura, r?.Id)) ?? 0,
    totalUsuarios: toNumber(firstDefined(r?.TotalUsuarios)) ?? 0,
    totalAreas: toNumber(firstDefined(r?.TotalAreas)) ?? 0,
    totalCatalogos: toNumber(firstDefined(r?.TotalCatalogos)) ?? 0,
  }));
}

export async function obtenerDetalleCobertura(idCobertura: number): Promise<CoberturaAccesoDetalle> {
  const result = await executeStoredProcedureWithVariants('sp_ObtenerDetalleCobertura', [
    { IdCobertura: idCobertura },
    { IdCoberturaAcceso: idCobertura },
  ]);

  const recordsets = Array.isArray((result as any)?.recordsets) ? (result as any).recordsets : [];
  const coberturaRow = recordsets[0]?.[0] ?? (result as any)?.recordset?.[0] ?? null;

  return {
    cobertura: coberturaRow ? normalizeCobertura(coberturaRow) : null,
    usuarios: (recordsets[1] ?? []).map(normalizeCoberturaUsuario).filter((u: CoberturaUsuario) => u.activo),
    areas: (recordsets[2] ?? []).map(normalizeCoberturaArea).filter((a: CoberturaArea) => a.activo),
    catalogos: (recordsets[3] ?? []).map(normalizeCatalogoSolicitud).filter((c: CatalogoSolicitud) => c.activo),
  };
}

export async function crearCoberturaAcceso(input: CrearCoberturaAccesoInput): Promise<number> {
  try {
    const result = await executeStoredProcedureWithVariants('sp_CrearCoberturaAcceso', [
      {
        Nombre: input.nombre,
        Descripcion: input.descripcion ?? null,
        TipoAlcance: input.tipoAlcance,
        Activo: input.activo ?? true,
      },
      {
        NombreCobertura: input.nombre,
        DescripcionCobertura: input.descripcion ?? null,
        Alcance: input.tipoAlcance,
        Vigente: input.activo ?? true,
      },
      {
        NombreCobertura: input.nombre,
        Descripcion: input.descripcion ?? null,
        Alcance: input.tipoAlcance,
        Vigente: input.activo ?? true,
      },
      {
        NombreCobertura: input.nombre,
        DescripcionCobertura: input.descripcion ?? null,
        TipoAlcance: input.tipoAlcance,
        Activo: input.activo ?? true,
      },
      {
        NombreCobertura: input.nombre,
        Descripcion: input.descripcion ?? null,
        Alcance: input.tipoAlcance,
        Activo: input.activo ?? true,
      },
      {
        Nombre: input.nombre,
        DescripcionCobertura: input.descripcion ?? null,
        Alcance: input.tipoAlcance,
        Vigente: input.activo ?? true,
      },
    ]);

    const row = (result as any)?.recordset?.[0] ?? (result as any)?.recordsets?.[0]?.[0] ?? null;
    return toNumber(firstDefined(row?.IdCobertura, row?.IdCoberturaAcceso, row?.Id)) ?? 0;
  } catch (error) {
    // fallback to direct insert
  }

  const pool = await getPool();
  const request = createRequest(pool);
  const sql = `
IF OBJECT_ID('dbo.CoberturasAcceso','U') IS NULL
BEGIN
    THROW 51000, 'Tabla dbo.CoberturasAcceso no existe', 1;
END

DECLARE @IdColumn SYSNAME = NULL;
DECLARE @NameColumn SYSNAME = NULL;
DECLARE @DescriptionColumn SYSNAME = NULL;
DECLARE @ScopeColumn SYSNAME = NULL;
DECLARE @StartDateColumn SYSNAME = NULL;
DECLARE @EndDateColumn SYSNAME = NULL;
DECLARE @ActiveColumn SYSNAME = NULL;
DECLARE @Columns NVARCHAR(MAX) = N'';
DECLARE @Values NVARCHAR(MAX) = N'';
DECLARE @Sql NVARCHAR(MAX) = N'';
DECLARE @CreatedId INT = NULL;

IF COL_LENGTH('dbo.CoberturasAcceso','IdCobertura') IS NOT NULL
    SET @IdColumn = 'IdCobertura';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','IdCoberturaAcceso') IS NOT NULL
    SET @IdColumn = 'IdCoberturaAcceso';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','CoberturaId') IS NOT NULL
    SET @IdColumn = 'CoberturaId';

IF COL_LENGTH('dbo.CoberturasAcceso','Nombre') IS NOT NULL
    SET @NameColumn = 'Nombre';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','NombreCobertura') IS NOT NULL
    SET @NameColumn = 'NombreCobertura';

IF COL_LENGTH('dbo.CoberturasAcceso','Descripcion') IS NOT NULL
    SET @DescriptionColumn = 'Descripcion';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','DescripcionCobertura') IS NOT NULL
    SET @DescriptionColumn = 'DescripcionCobertura';

IF COL_LENGTH('dbo.CoberturasAcceso','TipoAlcance') IS NOT NULL
    SET @ScopeColumn = 'TipoAlcance';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Alcance') IS NOT NULL
    SET @ScopeColumn = 'Alcance';

IF COL_LENGTH('dbo.CoberturasAcceso','VigenteDesde') IS NOT NULL
    SET @StartDateColumn = 'VigenteDesde';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','FechaInicio') IS NOT NULL
    SET @StartDateColumn = 'FechaInicio';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Desde') IS NOT NULL
    SET @StartDateColumn = 'Desde';

IF COL_LENGTH('dbo.CoberturasAcceso','VigenteHasta') IS NOT NULL
    SET @EndDateColumn = 'VigenteHasta';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','FechaFin') IS NOT NULL
    SET @EndDateColumn = 'FechaFin';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Hasta') IS NOT NULL
    SET @EndDateColumn = 'Hasta';

IF COL_LENGTH('dbo.CoberturasAcceso','Activo') IS NOT NULL
    SET @ActiveColumn = 'Activo';
ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Vigente') IS NOT NULL
    SET @ActiveColumn = 'Vigente';

IF @IdColumn IS NULL OR @NameColumn IS NULL
BEGIN
    RAISERROR('No se detectaron columnas mínimas compatibles para crear coberturas.',16,1);
    RETURN;
END

SET @Columns = QUOTENAME(@NameColumn);
SET @Values = N'@Nombre';

IF @DescriptionColumn IS NOT NULL
BEGIN
    SET @Columns += N', ' + QUOTENAME(@DescriptionColumn);
    SET @Values += N', @Descripcion';
END

IF @ScopeColumn IS NOT NULL
BEGIN
    SET @Columns += N', ' + QUOTENAME(@ScopeColumn);
    SET @Values += N', @TipoAlcance';
END

IF @StartDateColumn IS NOT NULL
BEGIN
    SET @Columns += N', ' + QUOTENAME(@StartDateColumn);
    SET @Values += N', @VigenteDesde';
END

IF @EndDateColumn IS NOT NULL
BEGIN
    SET @Columns += N', ' + QUOTENAME(@EndDateColumn);
    SET @Values += N', @VigenteHasta';
END

IF @ActiveColumn IS NOT NULL
BEGIN
    SET @Columns += N', ' + QUOTENAME(@ActiveColumn);
    SET @Values += N', @Activo';
END

SET @Sql = N'
DECLARE @Inserted TABLE (Id INT);
INSERT INTO dbo.CoberturasAcceso (' + @Columns + N')
OUTPUT INSERTED.' + QUOTENAME(@IdColumn) + N' INTO @Inserted(Id)
VALUES (' + @Values + N');

SELECT TOP (1) @IdOut = Id FROM @Inserted;';

EXEC sp_executesql
    @Sql,
    N'@Nombre NVARCHAR(255), @Descripcion NVARCHAR(MAX), @TipoAlcance NVARCHAR(50), @VigenteDesde DATE, @VigenteHasta DATE, @Activo BIT, @IdOut INT OUTPUT',
    @Nombre = @Nombre,
    @Descripcion = @Descripcion,
    @TipoAlcance = @TipoAlcance,
    @VigenteDesde = NULL,
    @VigenteHasta = NULL,
    @Activo = @Activo,
    @IdOut = @CreatedId OUTPUT;

SELECT @CreatedId AS IdCobertura;
`;

  const result = await request
    .input('Nombre', input.nombre)
    .input('Descripcion', input.descripcion ?? null)
    .input('TipoAlcance', input.tipoAlcance)
    .input('Activo', input.activo ?? true)
    .query(sql);

  const row = result.recordset?.[0] ?? null;
  return toNumber(firstDefined(row?.IdCobertura, row?.IdCoberturaAcceso, row?.Id, row?.CreatedId)) ?? 0;
}

export async function agregarUsuarioCobertura(idCobertura: number, idUsuario: number): Promise<void> {
  const today = new Date();
  const startDate = toSqlDateOnly(today);

  try {
    await executeStoredProcedureWithVariants('sp_AgregarUsuarioCobertura', [
      { IdCobertura: idCobertura, IdUsuario: idUsuario, FechaInicio: startDate, FechaFin: null, Activo: true },
      { IdCoberturaAcceso: idCobertura, IdUsuario: idUsuario, FechaInicio: startDate, FechaFin: null, Activo: true },
      { CoberturaId: idCobertura, UsuarioId: idUsuario, FechaInicio: startDate, FechaFin: null, Activo: true },
      { IdCobertura: idCobertura, IdUsuario: idUsuario, VigenteDesde: startDate, VigenteHasta: null, Vigente: true },
      { IdCoberturaAcceso: idCobertura, IdUsuario: idUsuario, VigenteDesde: startDate, VigenteHasta: null, Vigente: true },
      { CoberturaId: idCobertura, UsuarioId: idUsuario, VigenteDesde: startDate, VigenteHasta: null, Vigente: true },
      { IdCobertura: idCobertura, IdUsuario: idUsuario },
      { IdCoberturaAcceso: idCobertura, IdUsuario: idUsuario },
      { CoberturaId: idCobertura, UsuarioId: idUsuario },
    ]);
    return;
  } catch (error) {
    // fallback to direct upsert
  }

  const pool = await getPool();
  const request = createRequest(pool);
  const statement = `
IF OBJECT_ID('dbo.CoberturaUsuarios','U') IS NULL
BEGIN
  THROW 51000, 'Tabla dbo.CoberturaUsuarios no existe', 1;
END

DECLARE @CoverageColumn SYSNAME = NULL;
DECLARE @UserColumn SYSNAME = NULL;
DECLARE @ActiveColumn SYSNAME = NULL;
DECLARE @StartDateColumn SYSNAME = NULL;
DECLARE @EndDateColumn SYSNAME = NULL;
DECLARE @InsertColumns NVARCHAR(MAX) = N'';
DECLARE @InsertValues NVARCHAR(MAX) = N'';
DECLARE @UpdateAssignments NVARCHAR(MAX) = N'';
DECLARE @WhereActive NVARCHAR(MAX) = N'';
DECLARE @WhereInactive NVARCHAR(MAX) = N'';
DECLARE @Sql NVARCHAR(MAX) = N'';

IF COL_LENGTH('dbo.CoberturaUsuarios','IdCobertura') IS NOT NULL
  SET @CoverageColumn = 'IdCobertura';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','IdCoberturaAcceso') IS NOT NULL
  SET @CoverageColumn = 'IdCoberturaAcceso';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','CoberturaId') IS NOT NULL
  SET @CoverageColumn = 'CoberturaId';

IF COL_LENGTH('dbo.CoberturaUsuarios','IdUsuario') IS NOT NULL
  SET @UserColumn = 'IdUsuario';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','UsuarioId') IS NOT NULL
  SET @UserColumn = 'UsuarioId';

IF COL_LENGTH('dbo.CoberturaUsuarios','Activo') IS NOT NULL
  SET @ActiveColumn = 'Activo';

IF COL_LENGTH('dbo.CoberturaUsuarios','FechaInicio') IS NOT NULL
  SET @StartDateColumn = 'FechaInicio';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','VigenteDesde') IS NOT NULL
  SET @StartDateColumn = 'VigenteDesde';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','Desde') IS NOT NULL
  SET @StartDateColumn = 'Desde';

IF COL_LENGTH('dbo.CoberturaUsuarios','FechaFin') IS NOT NULL
  SET @EndDateColumn = 'FechaFin';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','VigenteHasta') IS NOT NULL
  SET @EndDateColumn = 'VigenteHasta';
ELSE IF COL_LENGTH('dbo.CoberturaUsuarios','Hasta') IS NOT NULL
  SET @EndDateColumn = 'Hasta';

IF @CoverageColumn IS NULL OR @UserColumn IS NULL
BEGIN
  RAISERROR('No se detectaron columnas compatibles en dbo.CoberturaUsuarios.',16,1);
  RETURN;
END

SET @InsertColumns = QUOTENAME(@CoverageColumn) + N', ' + QUOTENAME(@UserColumn);
SET @InsertValues = N'@IdCobertura, @IdUsuario';

IF @ActiveColumn IS NOT NULL
BEGIN
  SET @InsertColumns += N', ' + QUOTENAME(@ActiveColumn);
  SET @InsertValues += N', @Activo';
  SET @WhereActive = N' AND ISNULL(' + QUOTENAME(@ActiveColumn) + N', 1) = 1';
  SET @WhereInactive = N' AND ISNULL(' + QUOTENAME(@ActiveColumn) + N', 1) = 0';
  SET @UpdateAssignments = QUOTENAME(@ActiveColumn) + N' = @Activo';
END

IF @StartDateColumn IS NOT NULL
BEGIN
  SET @InsertColumns += N', ' + QUOTENAME(@StartDateColumn);
  SET @InsertValues += N', @FechaInicio';
  SET @UpdateAssignments += CASE WHEN LEN(@UpdateAssignments) > 0 THEN N', ' ELSE N'' END
    + QUOTENAME(@StartDateColumn) + N' = @FechaInicio';
END

IF @EndDateColumn IS NOT NULL
BEGIN
  SET @InsertColumns += N', ' + QUOTENAME(@EndDateColumn);
  SET @InsertValues += N', @FechaFin';
  SET @UpdateAssignments += CASE WHEN LEN(@UpdateAssignments) > 0 THEN N', ' ELSE N'' END
    + QUOTENAME(@EndDateColumn) + N' = @FechaFin';
END

SET @Sql = N'
IF EXISTS (
  SELECT 1
  FROM dbo.CoberturaUsuarios
  WHERE ' + QUOTENAME(@CoverageColumn) + N' = @IdCobertura
    AND ' + QUOTENAME(@UserColumn) + N' = @IdUsuario' + @WhereActive + N'
)
BEGIN
  RAISERROR(''El usuario ya está asignado a esta cobertura'', 16, 1);
  RETURN;
END';

IF @ActiveColumn IS NOT NULL
BEGIN
  SET @Sql += N'
IF EXISTS (
  SELECT 1
  FROM dbo.CoberturaUsuarios
  WHERE ' + QUOTENAME(@CoverageColumn) + N' = @IdCobertura
    AND ' + QUOTENAME(@UserColumn) + N' = @IdUsuario' + @WhereInactive + N'
)
BEGIN
  UPDATE TOP (1) dbo.CoberturaUsuarios
  SET ' + @UpdateAssignments + N'
  WHERE ' + QUOTENAME(@CoverageColumn) + N' = @IdCobertura
    AND ' + QUOTENAME(@UserColumn) + N' = @IdUsuario' + @WhereInactive + N';
  RETURN;
END';
END

SET @Sql += N'
INSERT INTO dbo.CoberturaUsuarios (' + @InsertColumns + N')
VALUES (' + @InsertValues + N');';

EXEC sp_executesql
  @Sql,
  N'@IdCobertura INT, @IdUsuario INT, @FechaInicio DATE, @FechaFin DATE, @Activo BIT',
  @IdCobertura = @IdCobertura,
  @IdUsuario = @IdUsuario,
  @FechaInicio = @FechaInicio,
  @FechaFin = @FechaFin,
  @Activo = @Activo;
`;

  await request
    .input('IdCobertura', sql.Int, idCobertura)
    .input('IdUsuario', sql.Int, idUsuario)
    .input('FechaInicio', sql.Date, today)
    .input('FechaFin', sql.Date, null)
    .input('Activo', sql.Bit, true)
    .query(statement);
}

async function agregarRelacionCoberturaFallback(args: {
  tableName: 'CoberturaAreas' | 'CoberturaCatalogos';
  targetColumnCandidates: string[];
  duplicateMessage: string;
  idCobertura: number;
  targetId: number;
}): Promise<void> {
  const { tableName, targetColumnCandidates, duplicateMessage, idCobertura, targetId } = args;
  const today = new Date();
  const request = createRequest(await getPool());
  const targetColumnsSql = targetColumnCandidates
    .map((columnName, index) => `${index === 0 ? 'IF' : 'ELSE IF'} COL_LENGTH('dbo.${tableName}','${columnName}') IS NOT NULL SET @TargetColumn = '${columnName}';`)
    .join('\n');
  const escapedDuplicateMessage = duplicateMessage.replace(/'/g, "''");

  const statement = `
IF OBJECT_ID('dbo.${tableName}','U') IS NULL
BEGIN
  THROW 51000, 'Tabla dbo.${tableName} no existe', 1;
END

DECLARE @CoverageColumn SYSNAME = NULL;
DECLARE @TargetColumn SYSNAME = NULL;
DECLARE @ActiveColumn SYSNAME = NULL;
DECLARE @StartDateColumn SYSNAME = NULL;
DECLARE @EndDateColumn SYSNAME = NULL;
DECLARE @InsertColumns NVARCHAR(MAX) = N'';
DECLARE @InsertValues NVARCHAR(MAX) = N'';
DECLARE @UpdateAssignments NVARCHAR(MAX) = N'';
DECLARE @WhereActive NVARCHAR(MAX) = N'';
DECLARE @WhereInactive NVARCHAR(MAX) = N'';
DECLARE @Sql NVARCHAR(MAX) = N'';

IF COL_LENGTH('dbo.${tableName}','IdCobertura') IS NOT NULL
  SET @CoverageColumn = 'IdCobertura';
ELSE IF COL_LENGTH('dbo.${tableName}','IdCoberturaAcceso') IS NOT NULL
  SET @CoverageColumn = 'IdCoberturaAcceso';
ELSE IF COL_LENGTH('dbo.${tableName}','CoberturaId') IS NOT NULL
  SET @CoverageColumn = 'CoberturaId';

${targetColumnsSql}

IF COL_LENGTH('dbo.${tableName}','Activo') IS NOT NULL
  SET @ActiveColumn = 'Activo';

IF COL_LENGTH('dbo.${tableName}','FechaInicio') IS NOT NULL
  SET @StartDateColumn = 'FechaInicio';
ELSE IF COL_LENGTH('dbo.${tableName}','VigenteDesde') IS NOT NULL
  SET @StartDateColumn = 'VigenteDesde';
ELSE IF COL_LENGTH('dbo.${tableName}','Desde') IS NOT NULL
  SET @StartDateColumn = 'Desde';

IF COL_LENGTH('dbo.${tableName}','FechaFin') IS NOT NULL
  SET @EndDateColumn = 'FechaFin';
ELSE IF COL_LENGTH('dbo.${tableName}','VigenteHasta') IS NOT NULL
  SET @EndDateColumn = 'VigenteHasta';
ELSE IF COL_LENGTH('dbo.${tableName}','Hasta') IS NOT NULL
  SET @EndDateColumn = 'Hasta';

IF @CoverageColumn IS NULL OR @TargetColumn IS NULL
BEGIN
  RAISERROR('No se detectaron columnas compatibles en dbo.${tableName}.',16,1);
  RETURN;
END

SET @InsertColumns = QUOTENAME(@CoverageColumn) + N', ' + QUOTENAME(@TargetColumn);
SET @InsertValues = N'@IdCobertura, @TargetId';

IF @ActiveColumn IS NOT NULL
BEGIN
  SET @InsertColumns += N', ' + QUOTENAME(@ActiveColumn);
  SET @InsertValues += N', @Activo';
  SET @WhereActive = N' AND ISNULL(' + QUOTENAME(@ActiveColumn) + N', 1) = 1';
  SET @WhereInactive = N' AND ISNULL(' + QUOTENAME(@ActiveColumn) + N', 1) = 0';
  SET @UpdateAssignments = QUOTENAME(@ActiveColumn) + N' = @Activo';
END

IF @StartDateColumn IS NOT NULL
BEGIN
  SET @InsertColumns += N', ' + QUOTENAME(@StartDateColumn);
  SET @InsertValues += N', @FechaInicio';
  SET @UpdateAssignments += CASE WHEN LEN(@UpdateAssignments) > 0 THEN N', ' ELSE N'' END
    + QUOTENAME(@StartDateColumn) + N' = @FechaInicio';
END

IF @EndDateColumn IS NOT NULL
BEGIN
  SET @InsertColumns += N', ' + QUOTENAME(@EndDateColumn);
  SET @InsertValues += N', @FechaFin';
  SET @UpdateAssignments += CASE WHEN LEN(@UpdateAssignments) > 0 THEN N', ' ELSE N'' END
    + QUOTENAME(@EndDateColumn) + N' = @FechaFin';
END

SET @Sql = N'
IF EXISTS (
  SELECT 1
  FROM dbo.${tableName}
  WHERE ' + QUOTENAME(@CoverageColumn) + N' = @IdCobertura
    AND ' + QUOTENAME(@TargetColumn) + N' = @TargetId' + @WhereActive + N'
)
BEGIN
  RAISERROR(''${escapedDuplicateMessage}'', 16, 1);
  RETURN;
END';

IF @ActiveColumn IS NOT NULL
BEGIN
  SET @Sql += N'
IF EXISTS (
  SELECT 1
  FROM dbo.${tableName}
  WHERE ' + QUOTENAME(@CoverageColumn) + N' = @IdCobertura
    AND ' + QUOTENAME(@TargetColumn) + N' = @TargetId' + @WhereInactive + N'
)
BEGIN
  UPDATE TOP (1) dbo.${tableName}
  SET ' + @UpdateAssignments + N'
  WHERE ' + QUOTENAME(@CoverageColumn) + N' = @IdCobertura
    AND ' + QUOTENAME(@TargetColumn) + N' = @TargetId' + @WhereInactive + N';
  RETURN;
END';
END

SET @Sql += N'
INSERT INTO dbo.${tableName} (' + @InsertColumns + N')
VALUES (' + @InsertValues + N');';

EXEC sp_executesql
  @Sql,
  N'@IdCobertura INT, @TargetId INT, @FechaInicio DATE, @FechaFin DATE, @Activo BIT',
  @IdCobertura = @IdCobertura,
  @TargetId = @TargetId,
  @FechaInicio = @FechaInicio,
  @FechaFin = @FechaFin,
  @Activo = @Activo;
`;

  await request
    .input('IdCobertura', sql.Int, idCobertura)
    .input('TargetId', sql.Int, targetId)
    .input('FechaInicio', sql.Date, today)
    .input('FechaFin', sql.Date, null)
    .input('Activo', sql.Bit, true)
    .query(statement);
}

export async function agregarAreaCobertura(idCobertura: number, idArea: number): Promise<void> {
  try {
    await executeStoredProcedureWithVariants('sp_AgregarAreaCobertura', [
      { IdCobertura: idCobertura, IdArea: idArea },
      { IdCoberturaAcceso: idCobertura, IdArea: idArea },
      { CoberturaId: idCobertura, IdArea: idArea },
    ]);
    return;
  } catch (error) {
    // fallback directo si el SP no existe o no coincide con el esquema real
  }

  await agregarRelacionCoberturaFallback({
    tableName: 'CoberturaAreas',
    targetColumnCandidates: ['IdArea'],
    duplicateMessage: 'El area ya esta asignada a esta cobertura',
    idCobertura,
    targetId: idArea,
  });
}

export async function agregarCatalogoCobertura(idCobertura: number, idCatalogoSolicitud: number): Promise<void> {
  try {
    await executeStoredProcedureWithVariants('sp_AgregarCatalogoCobertura', [
      { IdCobertura: idCobertura, IdCatalogoSolicitud: idCatalogoSolicitud },
      { IdCoberturaAcceso: idCobertura, IdCatalogoSolicitud: idCatalogoSolicitud },
      { CoberturaId: idCobertura, IdCatalogoSolicitud: idCatalogoSolicitud },
      { IdCobertura: idCobertura, IdCatalogo: idCatalogoSolicitud },
      { IdCoberturaAcceso: idCobertura, IdCatalogo: idCatalogoSolicitud },
      { CoberturaId: idCobertura, IdCatalogo: idCatalogoSolicitud },
    ]);
    return;
  } catch (error) {
    // fallback directo si el SP no existe o no coincide con el esquema real
  }

  await agregarRelacionCoberturaFallback({
    tableName: 'CoberturaCatalogos',
    targetColumnCandidates: ['IdCatalogoSolicitud', 'IdCatalogo'],
    duplicateMessage: 'El catalogo ya esta asignado a esta cobertura',
    idCobertura,
    targetId: idCatalogoSolicitud,
  });
}

export async function listarCatalogosSolicitud(): Promise<CatalogoSolicitud[]> {
  const pool = await getPool();
  const request = createRequest(pool);
  const result = await request.query('SELECT * FROM dbo.CatalogosSolicitud');
  return (result.recordset ?? []).map(normalizeCatalogoSolicitud);
}

export async function listarCatalogosPermitidosPorUsuarioArea(
  idUsuario: number,
  idArea: number,
): Promise<CatalogoPermitido[]> {
  try {
    return await listarCatalogosPermitidosPorUsuarioAreaDirecto(idUsuario, idArea);
  } catch (err: any) {
    console.error('Error listando catálogos permitidos por usuario/área', err);
    return [];
  }
}

export async function removerUsuarioCobertura(idCobertura: number, idUsuario: number): Promise<void> {
  // Try SP first with common parameter variants, fallback to direct DELETE
  try {
    await executeStoredProcedureWithVariants('sp_EliminarUsuarioCobertura', [
      { IdCobertura: idCobertura, IdUsuario: idUsuario },
      { IdCoberturaAcceso: idCobertura, IdUsuario: idUsuario },
      { CoberturaId: idCobertura, UsuarioId: idUsuario },
    ]);
    return;
  } catch (error) {
    // fallback to conditional delete
  }

  const pool = await getPool();
  const request = createRequest(pool);
    const sql = `
  DECLARE @sql NVARCHAR(MAX);

  IF OBJECT_ID('dbo.CoberturaUsuarios','U') IS NULL
  BEGIN
    THROW 51000, 'Tabla dbo.CoberturaUsuarios no existe', 1;
  END

  -- Preferimos soft-delete si existe columna Activo
  IF COL_LENGTH('dbo.CoberturaUsuarios','IdCobertura') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios','IdUsuario') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios','Activo') IS NOT NULL
  BEGIN
    SET @sql = N'UPDATE dbo.CoberturaUsuarios SET Activo = 0 WHERE IdCobertura = @IdCobertura AND IdUsuario = @IdUsuario AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdUsuario int', @IdCobertura=@IdCobertura, @IdUsuario=@IdUsuario;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaUsuarios','IdCobertura') IS NOT NULL AND COL_LENGTH('dbo.CoberturaUsuarios','IdUsuario') IS NOT NULL
  BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaUsuarios WHERE IdCobertura = @IdCobertura AND IdUsuario = @IdUsuario;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdUsuario int', @IdCobertura=@IdCobertura, @IdUsuario=@IdUsuario;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaUsuarios','IdCoberturaAcceso') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios','IdUsuario') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios','Activo') IS NOT NULL
  BEGIN
    SET @sql = N'UPDATE dbo.CoberturaUsuarios SET Activo = 0 WHERE IdCoberturaAcceso = @IdCobertura AND IdUsuario = @IdUsuario AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdUsuario int', @IdCobertura=@IdCobertura, @IdUsuario=@IdUsuario;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaUsuarios','IdCoberturaAcceso') IS NOT NULL AND COL_LENGTH('dbo.CoberturaUsuarios','IdUsuario') IS NOT NULL
  BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaUsuarios WHERE IdCoberturaAcceso = @IdCobertura AND IdUsuario = @IdUsuario;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdUsuario int', @IdCobertura=@IdCobertura, @IdUsuario=@IdUsuario;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaUsuarios','CoberturaId') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios','UsuarioId') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios','Activo') IS NOT NULL
  BEGIN
    SET @sql = N'UPDATE dbo.CoberturaUsuarios SET Activo = 0 WHERE CoberturaId = @IdCobertura AND UsuarioId = @IdUsuario AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdUsuario int', @IdCobertura=@IdCobertura, @IdUsuario=@IdUsuario;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaUsuarios','CoberturaId') IS NOT NULL AND COL_LENGTH('dbo.CoberturaUsuarios','UsuarioId') IS NOT NULL
  BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaUsuarios WHERE CoberturaId = @IdCobertura AND UsuarioId = @IdUsuario;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdUsuario int', @IdCobertura=@IdCobertura, @IdUsuario=@IdUsuario;
    RETURN;
  END

  RAISERROR('No se detectaron columnas compatibles en dbo.CoberturaUsuarios.',16,1);
  `;

    await request.input('IdCobertura', idCobertura).input('IdUsuario', idUsuario).query(sql);
}

export async function removerAreaCobertura(idCobertura: number, idArea: number): Promise<void> {
  try {
    await executeStoredProcedureWithVariants('sp_EliminarAreaCobertura', [
      { IdCobertura: idCobertura, IdArea: idArea },
      { IdCoberturaAcceso: idCobertura, IdArea: idArea },
    ]);
    return;
  } catch (error) {
    // fallback
  }

  const pool = await getPool();
  const request = createRequest(pool);
    const sql = `
  DECLARE @sql NVARCHAR(MAX);

  IF OBJECT_ID('dbo.CoberturaAreas','U') IS NULL
  BEGIN
    THROW 51000, 'Tabla dbo.CoberturaAreas no existe', 1;
  END

  -- Preferimos soft-delete si existe columna Activo
  IF COL_LENGTH('dbo.CoberturaAreas','IdCobertura') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas','IdArea') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
  BEGIN
    SET @sql = N'UPDATE dbo.CoberturaAreas SET Activo = 0 WHERE IdCobertura = @IdCobertura AND IdArea = @IdArea AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdArea int', @IdCobertura=@IdCobertura, @IdArea=@IdArea;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaAreas','IdCobertura') IS NOT NULL AND COL_LENGTH('dbo.CoberturaAreas','IdArea') IS NOT NULL
  BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaAreas WHERE IdCobertura = @IdCobertura AND IdArea = @IdArea;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdArea int', @IdCobertura=@IdCobertura, @IdArea=@IdArea;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaAreas','IdCoberturaAcceso') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas','IdArea') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
  BEGIN
    SET @sql = N'UPDATE dbo.CoberturaAreas SET Activo = 0 WHERE IdCoberturaAcceso = @IdCobertura AND IdArea = @IdArea AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdArea int', @IdCobertura=@IdCobertura, @IdArea=@IdArea;
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaAreas','IdCoberturaAcceso') IS NOT NULL AND COL_LENGTH('dbo.CoberturaAreas','IdArea') IS NOT NULL
  BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaAreas WHERE IdCoberturaAcceso = @IdCobertura AND IdArea = @IdArea;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdArea int', @IdCobertura=@IdCobertura, @IdArea=@IdArea;
    RETURN;
  END

  RAISERROR('No se detectaron columnas compatibles en dbo.CoberturaAreas.',16,1);
  `;

    await request.input('IdCobertura', idCobertura).input('IdArea', idArea).query(sql);
}

export async function removerCatalogoCobertura(idCobertura: number, idCatalogoSolicitud: number): Promise<void> {
  try {
    await executeStoredProcedureWithVariants('sp_EliminarCatalogoCobertura', [
      { IdCobertura: idCobertura, IdCatalogoSolicitud: idCatalogoSolicitud },
      { IdCoberturaAcceso: idCobertura, IdCatalogo: idCatalogoSolicitud },
    ]);
    return;
  } catch (error) {
    // fallback
  }

  const pool = await getPool();
  const request = createRequest(pool);
  const sql = `
DECLARE @sql NVARCHAR(MAX);

IF OBJECT_ID('dbo.CoberturaCatalogos','U') IS NULL
BEGIN
    THROW 51000, 'Tabla dbo.CoberturaCatalogos no existe', 1;
END

-- Si existe columna Activo preferimos soft-delete (más seguro)
IF COL_LENGTH('dbo.CoberturaCatalogos','IdCobertura') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaCatalogos','IdCatalogoSolicitud') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaCatalogos','Activo') IS NOT NULL
BEGIN
    SET @sql = N'UPDATE dbo.CoberturaCatalogos
                 SET Activo = 0
                 WHERE IdCobertura = @IdCobertura
                   AND IdCatalogoSolicitud = @IdCatalogoSolicitud
                   AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdCatalogoSolicitud int', @IdCobertura=@IdCobertura, @IdCatalogoSolicitud=@IdCatalogoSolicitud;
    RETURN;
END

IF COL_LENGTH('dbo.CoberturaCatalogos','IdCobertura') IS NOT NULL AND COL_LENGTH('dbo.CoberturaCatalogos','IdCatalogoSolicitud') IS NOT NULL
BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaCatalogos
                 WHERE IdCobertura = @IdCobertura
                   AND IdCatalogoSolicitud = @IdCatalogoSolicitud;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdCatalogoSolicitud int', @IdCobertura=@IdCobertura, @IdCatalogoSolicitud=@IdCatalogoSolicitud;
    RETURN;
END

-- Variantes históricas (IdCoberturaAcceso + IdCatalogo)
IF COL_LENGTH('dbo.CoberturaCatalogos','IdCoberturaAcceso') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaCatalogos','IdCatalogo') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaCatalogos','Activo') IS NOT NULL
BEGIN
    SET @sql = N'UPDATE dbo.CoberturaCatalogos
                 SET Activo = 0
                 WHERE IdCoberturaAcceso = @IdCobertura
                   AND IdCatalogo = @IdCatalogo
                   AND Activo = 1;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdCatalogo int', @IdCobertura=@IdCobertura, @IdCatalogo=@IdCatalogo;
    RETURN;
END

IF COL_LENGTH('dbo.CoberturaCatalogos','IdCoberturaAcceso') IS NOT NULL AND COL_LENGTH('dbo.CoberturaCatalogos','IdCatalogo') IS NOT NULL
BEGIN
    SET @sql = N'DELETE FROM dbo.CoberturaCatalogos
                 WHERE IdCoberturaAcceso = @IdCobertura
                   AND IdCatalogo = @IdCatalogo;';
    EXEC sp_executesql @sql, N'@IdCobertura int, @IdCatalogo int', @IdCobertura=@IdCobertura, @IdCatalogo=@IdCatalogo;
    RETURN;
END

RAISERROR('No se detectaron columnas compatibles en dbo.CoberturaCatalogos.',16,1);
`;

  // Pasar ambos nombres de parámetro para cubrir esquemas que usan `IdCatalogo` o `IdCatalogoSolicitud`.
  await request
    .input('IdCobertura', idCobertura)
    .input('IdCatalogoSolicitud', idCatalogoSolicitud)
    .input('IdCatalogo', idCatalogoSolicitud)
    .query(sql);
}

export async function actualizarCoberturaAcceso(idCobertura: number, input: Partial<CrearCoberturaAccesoInput> & { vigenteDesde?: string | null; vigenteHasta?: string | null; activo?: boolean }): Promise<void> {
  const setNombre = input.nombre !== undefined;
  const setDescripcion = input.descripcion !== undefined;
  const setTipoAlcance = input.tipoAlcance !== undefined;
  const setVigenteDesde = input.vigenteDesde !== undefined;
  const setVigenteHasta = input.vigenteHasta !== undefined;
  const setActivo = input.activo !== undefined;

  try {
    await executeStoredProcedureWithVariants('sp_ActualizarCoberturaAcceso', [
      {
        IdCobertura: idCobertura,
        Nombre: input.nombre ?? null,
        Descripcion: input.descripcion ?? null,
        TipoAlcance: input.tipoAlcance ?? null,
        VigenteDesde: input.vigenteDesde ?? null,
        VigenteHasta: input.vigenteHasta ?? null,
        Activo: input.activo ?? true,
      },
      {
        IdCoberturaAcceso: idCobertura,
        Nombre: input.nombre ?? null,
        Descripcion: input.descripcion ?? null,
        TipoAlcance: input.tipoAlcance ?? null,
        VigenteDesde: input.vigenteDesde ?? null,
        VigenteHasta: input.vigenteHasta ?? null,
        Activo: input.activo ?? true,
      },
      {
        IdCobertura: idCobertura,
        NombreCobertura: input.nombre ?? null,
        DescripcionCobertura: input.descripcion ?? null,
        Alcance: input.tipoAlcance ?? null,
        FechaInicio: input.vigenteDesde ?? null,
        FechaFin: input.vigenteHasta ?? null,
        Vigente: input.activo ?? true,
      },
      {
        IdCoberturaAcceso: idCobertura,
        NombreCobertura: input.nombre ?? null,
        DescripcionCobertura: input.descripcion ?? null,
        Alcance: input.tipoAlcance ?? null,
        FechaInicio: input.vigenteDesde ?? null,
        FechaFin: input.vigenteHasta ?? null,
        Vigente: input.activo ?? true,
      },
    ]);
    return;
  } catch (error) {
    // fallback to direct update
  }

  const pool = await getPool();
  const request = createRequest(pool);
    const sql = `
  IF OBJECT_ID('dbo.CoberturasAcceso','U') IS NULL
  BEGIN
    THROW 51000, 'Tabla dbo.CoberturasAcceso no existe', 1;
  END

  DECLARE @IdColumn SYSNAME = NULL;
  DECLARE @NameColumn SYSNAME = NULL;
  DECLARE @DescriptionColumn SYSNAME = NULL;
  DECLARE @ScopeColumn SYSNAME = NULL;
  DECLARE @StartDateColumn SYSNAME = NULL;
  DECLARE @EndDateColumn SYSNAME = NULL;
  DECLARE @ActiveColumn SYSNAME = NULL;
  DECLARE @Sql NVARCHAR(MAX) = N'UPDATE dbo.CoberturasAcceso SET ';
  DECLARE @HasAssignments BIT = 0;

  IF COL_LENGTH('dbo.CoberturasAcceso','IdCobertura') IS NOT NULL
    SET @IdColumn = 'IdCobertura';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','IdCoberturaAcceso') IS NOT NULL
    SET @IdColumn = 'IdCoberturaAcceso';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','CoberturaId') IS NOT NULL
    SET @IdColumn = 'CoberturaId';

  IF @IdColumn IS NULL
  BEGIN
    RAISERROR('No se detectó una columna identificadora compatible en dbo.CoberturasAcceso.',16,1);
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturasAcceso','Nombre') IS NOT NULL
    SET @NameColumn = 'Nombre';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','NombreCobertura') IS NOT NULL
    SET @NameColumn = 'NombreCobertura';

  IF COL_LENGTH('dbo.CoberturasAcceso','Descripcion') IS NOT NULL
    SET @DescriptionColumn = 'Descripcion';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','DescripcionCobertura') IS NOT NULL
    SET @DescriptionColumn = 'DescripcionCobertura';

  IF COL_LENGTH('dbo.CoberturasAcceso','TipoAlcance') IS NOT NULL
    SET @ScopeColumn = 'TipoAlcance';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Alcance') IS NOT NULL
    SET @ScopeColumn = 'Alcance';

  IF COL_LENGTH('dbo.CoberturasAcceso','VigenteDesde') IS NOT NULL
    SET @StartDateColumn = 'VigenteDesde';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','FechaInicio') IS NOT NULL
    SET @StartDateColumn = 'FechaInicio';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Desde') IS NOT NULL
    SET @StartDateColumn = 'Desde';

  IF COL_LENGTH('dbo.CoberturasAcceso','VigenteHasta') IS NOT NULL
    SET @EndDateColumn = 'VigenteHasta';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','FechaFin') IS NOT NULL
    SET @EndDateColumn = 'FechaFin';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Hasta') IS NOT NULL
    SET @EndDateColumn = 'Hasta';

  IF COL_LENGTH('dbo.CoberturasAcceso','Activo') IS NOT NULL
    SET @ActiveColumn = 'Activo';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Vigente') IS NOT NULL
    SET @ActiveColumn = 'Vigente';

  IF @SetNombre = 1 AND @NameColumn IS NOT NULL
  BEGIN
    SET @Sql += QUOTENAME(@NameColumn) + N' = @Nombre';
    SET @HasAssignments = 1;
  END

  IF @SetDescripcion = 1 AND @DescriptionColumn IS NOT NULL
  BEGIN
    SET @Sql += CASE WHEN @HasAssignments = 1 THEN N', ' ELSE N'' END + QUOTENAME(@DescriptionColumn) + N' = @Descripcion';
    SET @HasAssignments = 1;
  END

  IF @SetTipoAlcance = 1 AND @ScopeColumn IS NOT NULL
  BEGIN
    SET @Sql += CASE WHEN @HasAssignments = 1 THEN N', ' ELSE N'' END + QUOTENAME(@ScopeColumn) + N' = @TipoAlcance';
    SET @HasAssignments = 1;
  END

  IF @SetVigenteDesde = 1 AND @StartDateColumn IS NOT NULL
  BEGIN
    SET @Sql += CASE WHEN @HasAssignments = 1 THEN N', ' ELSE N'' END + QUOTENAME(@StartDateColumn) + N' = @VigenteDesde';
    SET @HasAssignments = 1;
  END

  IF @SetVigenteHasta = 1 AND @EndDateColumn IS NOT NULL
  BEGIN
    SET @Sql += CASE WHEN @HasAssignments = 1 THEN N', ' ELSE N'' END + QUOTENAME(@EndDateColumn) + N' = @VigenteHasta';
    SET @HasAssignments = 1;
  END

  IF @SetActivo = 1 AND @ActiveColumn IS NOT NULL
  BEGIN
    SET @Sql += CASE WHEN @HasAssignments = 1 THEN N', ' ELSE N'' END + QUOTENAME(@ActiveColumn) + N' = @Activo';
    SET @HasAssignments = 1;
  END

  IF @HasAssignments = 0
  BEGIN
    RAISERROR('No se detectaron columnas actualizables compatibles en dbo.CoberturasAcceso.',16,1);
    RETURN;
  END

  SET @Sql += N' WHERE ' + QUOTENAME(@IdColumn) + N' = @IdCobertura;';

  EXEC sp_executesql
    @Sql,
    N'@IdCobertura INT, @Nombre NVARCHAR(255), @Descripcion NVARCHAR(MAX), @TipoAlcance NVARCHAR(50), @VigenteDesde DATE, @VigenteHasta DATE, @Activo BIT',
    @IdCobertura = @IdCobertura,
    @Nombre = @Nombre,
    @Descripcion = @Descripcion,
    @TipoAlcance = @TipoAlcance,
    @VigenteDesde = @VigenteDesde,
    @VigenteHasta = @VigenteHasta,
    @Activo = @Activo;
  `;

  await request
    .input('IdCobertura', idCobertura)
    .input('Nombre', input.nombre ?? null)
    .input('Descripcion', input.descripcion ?? null)
    .input('TipoAlcance', input.tipoAlcance ?? null)
    .input('VigenteDesde', input.vigenteDesde ?? null)
    .input('VigenteHasta', input.vigenteHasta ?? null)
    .input('Activo', input.activo ?? true)
    .input('SetNombre', setNombre ? 1 : 0)
    .input('SetDescripcion', setDescripcion ? 1 : 0)
    .input('SetTipoAlcance', setTipoAlcance ? 1 : 0)
    .input('SetVigenteDesde', setVigenteDesde ? 1 : 0)
    .input('SetVigenteHasta', setVigenteHasta ? 1 : 0)
    .input('SetActivo', setActivo ? 1 : 0)
    .query(sql);
}

export async function eliminarCoberturaAcceso(idCobertura: number, softDelete = true): Promise<void> {
  try {
    await executeStoredProcedureWithVariants('sp_EliminarCoberturaAcceso', [
      { IdCobertura: idCobertura, SoftDelete: softDelete ? 1 : 0 },
      { IdCoberturaAcceso: idCobertura, SoftDelete: softDelete ? 1 : 0 },
    ]);
    return;
  } catch (error) {
    // fallback
  }

  const pool = await getPool();
  const request = createRequest(pool);
  const sql = `
IF OBJECT_ID('dbo.CoberturasAcceso','U') IS NULL
BEGIN
    THROW 51000, 'Tabla dbo.CoberturasAcceso no existe', 1;
END

IF @SoftDelete = 1
BEGIN
    IF COL_LENGTH('dbo.CoberturasAcceso','IdCobertura') IS NOT NULL AND COL_LENGTH('dbo.CoberturasAcceso','Activo') IS NOT NULL
    BEGIN
        UPDATE dbo.CoberturasAcceso SET Activo = 0 WHERE IdCobertura = @IdCobertura;
        RETURN;
    END

    IF COL_LENGTH('dbo.CoberturasAcceso','IdCoberturaAcceso') IS NOT NULL AND COL_LENGTH('dbo.CoberturasAcceso','Vigente') IS NOT NULL
    BEGIN
        UPDATE dbo.CoberturasAcceso SET Vigente = 0 WHERE IdCoberturaAcceso = @IdCobertura;
        RETURN;
    END

    RAISERROR('No se detectó columna para soft-delete (Activo/Vigente).',16,1);
    RETURN;
END

-- Hard delete
IF COL_LENGTH('dbo.CoberturasAcceso','IdCobertura') IS NOT NULL
BEGIN
    DELETE FROM dbo.CoberturasAcceso WHERE IdCobertura = @IdCobertura;
    RETURN;
END

IF COL_LENGTH('dbo.CoberturasAcceso','IdCoberturaAcceso') IS NOT NULL
BEGIN
    DELETE FROM dbo.CoberturasAcceso WHERE IdCoberturaAcceso = @IdCobertura;
    RETURN;
END

RAISERROR('No se detectaron columnas compatibles para borrar.',16,1);
`;

  await request
    .input('IdCobertura', idCobertura)
    .input('SoftDelete', softDelete ? 1 : 0)
    .query(sql);
}