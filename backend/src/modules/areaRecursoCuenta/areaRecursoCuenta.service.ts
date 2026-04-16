import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';
import { env } from '../../config/env';
import sql from 'mssql';

export interface AreaRecursoCuenta {
  CodigoCuenta: string;
}

export interface RecursoPorArea {
  IdRecurso: number;
  Nombre: string;
  IdCatalogoSolicitud?: number | null;
  IdCatalogo?: number | null;
}

export interface RecursoVisible {
  id: number;
  nombre: string;
  codigoCuenta?: string | null;
  nombreCuenta?: string | null;
  catalogoId?: number | null;
}

export interface RecursosVisiblesResult {
  recursos: RecursoVisible[];
  applied: boolean;
}

export interface RecursosMaterialResult {
  recursos: RecursoVisible[];
  resolved: RecursoVisible | null;
}

export interface CodigoCuentaPreviewResult {
  codigoCuenta: string | null;
  idCentroCosto: number | null;
  idRecurso: number | null;
  source: 'catalogo' | 'catalogo-ambiguous' | 'area' | 'centroCosto' | 'none';
  recursos?: RecursoVisible[];
}

type TableColumnsMap = Map<string, Set<string>>;

interface MaterialCatalogMappingPlan {
  source: string;
  joinSql: string;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return value == null ? null : String(value);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isMaintenanceCategory(value: unknown): boolean {
  const normalized = normalizeLabel(value);
  return normalized.includes('mantenimiento') || normalized.includes('mtto');
}

function isFixedAssetsCategory(value: unknown): boolean {
  const normalized = normalizeLabel(value);
  return normalized.includes('activo fijo') || (normalized.includes('activos') && normalized.includes('fijos'));
}

function isStandardMaterialsCategory(value: unknown): boolean {
  const normalized = normalizeLabel(value);
  return normalized.includes('materiales') && normalized.includes('repuestos') && !isMaintenanceCategory(normalized) && !isFixedAssetsCategory(normalized);
}

function filtrarRecursosPorNombreCatalogo(recursos: RecursoVisible[], nombreCatalogo: string): RecursoVisible[] {
  const normalizedCatalog = normalizeLabel(nombreCatalogo);
  if (!normalizedCatalog) {
    return [];
  }

  const exactMatches = recursos.filter((recurso) => normalizeLabel(recurso.nombre) === normalizedCatalog);
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  if (isFixedAssetsCategory(normalizedCatalog)) {
    return recursos.filter((recurso) => isFixedAssetsCategory(recurso.nombre));
  }

  if (isMaintenanceCategory(normalizedCatalog)) {
    return recursos.filter((recurso) => isMaintenanceCategory(recurso.nombre));
  }

  if (isStandardMaterialsCategory(normalizedCatalog)) {
    const standardMatches = recursos.filter((recurso) => isStandardMaterialsCategory(recurso.nombre));
    if (standardMatches.length > 0) {
      return standardMatches;
    }
  }

  return recursos.filter((recurso) => {
    const normalizedResource = normalizeLabel(recurso.nombre);
    return normalizedResource.includes(normalizedCatalog) || normalizedCatalog.includes(normalizedResource);
  });
}

async function obtenerNombreCatalogo(idCatalogo: number): Promise<string | null> {
  const columns = await loadFallbackTableColumns();
  const idCandidates = listExistingColumns(columns, 'CatalogosSolicitud', ['IdCatalogoSolicitud', 'IdCatalogo', 'Id']);
  const nameColumn = pickFirstColumn(columns, 'CatalogosSolicitud', ['NombreCatalogo', 'Nombre']);

  if (idCandidates.length === 0 || !nameColumn) {
    return null;
  }

  const whereConditions = idCandidates
    .map((columnName) => `TRY_CONVERT(INT, cs.${columnName}) = @IdCatalogo`)
    .join(' OR ');

  const pool = await getPool();
  const result = await pool.request()
    .input('IdCatalogo', sql.Int, idCatalogo)
    .query(`
      IF OBJECT_ID('dbo.CatalogosSolicitud', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS NVARCHAR(255)) AS NombreCatalogo;
        RETURN;
      END

      SELECT TOP 1 NULLIF(LTRIM(RTRIM(cs.${nameColumn})), '') AS NombreCatalogo
      FROM dbo.CatalogosSolicitud cs
      WHERE ${whereConditions};
    `);

  return normalizeOptionalText(result.recordset?.[0]?.NombreCatalogo ?? null);
}

function normalizeRecurso(row: any): RecursoVisible {
  return {
    id: Number(row?.IdRecurso ?? row?.id ?? 0),
    nombre: String(row?.Nombre ?? row?.nombre ?? ''),
    codigoCuenta: normalizeOptionalText(row?.CodigoCuenta ?? row?.codigoCuenta ?? null),
    nombreCuenta: normalizeOptionalText(row?.NombreCuenta ?? row?.nombreCuenta ?? null),
    catalogoId: row?.IdCatalogoSolicitud ?? row?.IdCatalogo ?? row?.catalogoId ?? null,
  };
}

async function buscarIdCentroCostoPorCodigo(codigoCuenta: string | null): Promise<number | null> {
  if (!codigoCuenta) {
    return null;
  }

  const pool = await getPool();
  const request = pool.request();
  const ccResult = await request.input('Codigo', codigoCuenta).query(`
    IF OBJECT_ID('dbo.CentrosCosto', 'U') IS NULL
    BEGIN
      SELECT CAST(NULL AS int) AS IdCentroCosto;
      RETURN;
    END

    IF COL_LENGTH('dbo.CentrosCosto', 'Codigo') IS NOT NULL
    BEGIN
      SELECT TOP 1 IdCentroCosto
      FROM dbo.CentrosCosto
      WHERE LTRIM(RTRIM(ISNULL(Codigo, ''))) = @Codigo;
      RETURN;
    END

    SELECT CAST(NULL AS int) AS IdCentroCosto;
  `);

  return ccResult.recordset?.[0]?.IdCentroCosto ?? null;
}

async function obtenerCodigoCuentaDirecto(idArea: number, idRecurso: number): Promise<string | null> {
  const pool = await getPool();
  const request = pool.request();
  const result = await request
    .input('IdArea', sql.Int, idArea)
    .input('IdRecurso', sql.Int, idRecurso)
    .query(`
      IF OBJECT_ID('dbo.AreaRecursoCuenta', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS nvarchar(50)) AS CodigoCuenta;
        RETURN;
      END

      DECLARE @sql NVARCHAR(MAX) = N'
        SELECT TOP 1 LTRIM(RTRIM(arc.CodigoCuenta)) AS CodigoCuenta
        FROM dbo.AreaRecursoCuenta arc
        WHERE arc.IdArea = @IdArea
          AND arc.IdRecurso = @IdRecurso
          AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''''))) <> '''''';

      IF COL_LENGTH('dbo.AreaRecursoCuenta', 'Activo') IS NOT NULL
        SET @sql += N' AND ISNULL(arc.Activo, 1) = 1';

      SET @sql += N' ORDER BY arc.IdAreaRecursoCuenta DESC';

      EXEC sp_executesql @sql, N'@IdArea int, @IdRecurso int', @IdArea = @IdArea, @IdRecurso = @IdRecurso;
    `);

  return normalizeOptionalText(result.recordset?.[0]?.CodigoCuenta ?? null);
}

async function obtenerCodigoCuentaPreviewDirectoPorArea(idArea: number): Promise<{ codigoCuenta: string | null; idRecurso: number | null }> {
  const pool = await getPool();
  const request = pool.request();
  const result = await request
    .input('IdArea', sql.Int, idArea)
    .query(`
      IF OBJECT_ID('dbo.AreaRecursoCuenta', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS int) AS IdRecurso, CAST(NULL AS nvarchar(50)) AS CodigoCuenta;
        RETURN;
      END

      IF COL_LENGTH('dbo.AreaRecursoCuenta', 'Activo') IS NOT NULL
      BEGIN
        SELECT TOP 1
          arc.IdRecurso,
          LTRIM(RTRIM(arc.CodigoCuenta)) AS CodigoCuenta
        FROM dbo.AreaRecursoCuenta arc
        WHERE arc.IdArea = @IdArea
          AND ISNULL(arc.Activo, 1) = 1
          AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''))) <> ''
        ORDER BY CASE WHEN arc.IdRecurso = 1 THEN 0 ELSE 1 END, arc.IdAreaRecursoCuenta DESC;
        RETURN;
      END

      SELECT TOP 1
        arc.IdRecurso,
        LTRIM(RTRIM(arc.CodigoCuenta)) AS CodigoCuenta
      FROM dbo.AreaRecursoCuenta arc
      WHERE arc.IdArea = @IdArea
        AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta, ''))) <> ''
      ORDER BY CASE WHEN arc.IdRecurso = 1 THEN 0 ELSE 1 END, arc.IdAreaRecursoCuenta DESC;
    `);

  return {
    idRecurso: Number.isInteger(Number(result.recordset?.[0]?.IdRecurso)) ? Number(result.recordset?.[0]?.IdRecurso) : null,
    codigoCuenta: normalizeOptionalText(result.recordset?.[0]?.CodigoCuenta ?? null),
  };
}

async function obtenerCodigoCuentaPorCentroCostoArea(idArea: number): Promise<{ codigoCuenta: string | null; idCentroCosto: number | null }> {
  const pool = await getPool();
  const request = pool.request();
  const result = await request
    .input('IdArea', sql.Int, idArea)
    .query(`
      IF OBJECT_ID('dbo.Areas', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS int) AS IdCentroCosto, CAST(NULL AS nvarchar(50)) AS CodigoCuenta;
        RETURN;
      END

      IF COL_LENGTH('dbo.Areas', 'IdCentroCosto') IS NOT NULL
         AND OBJECT_ID('dbo.CentrosCosto', 'U') IS NOT NULL
         AND COL_LENGTH('dbo.CentrosCosto', 'IdCentroCosto') IS NOT NULL
         AND COL_LENGTH('dbo.CentrosCosto', 'Codigo') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.Areas', 'CodigoCuenta') IS NOT NULL
        BEGIN
          IF COL_LENGTH('dbo.Areas', 'Activo') IS NOT NULL
          BEGIN
            SELECT TOP 1
              a.IdCentroCosto,
              COALESCE(NULLIF(LTRIM(RTRIM(a.CodigoCuenta)), ''), NULLIF(LTRIM(RTRIM(cc.Codigo)), '')) AS CodigoCuenta
            FROM dbo.Areas a
            LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = a.IdCentroCosto
            WHERE a.IdArea = @IdArea
              AND ISNULL(a.Activo, 1) = 1;
            RETURN;
          END

          SELECT TOP 1
            a.IdCentroCosto,
            COALESCE(NULLIF(LTRIM(RTRIM(a.CodigoCuenta)), ''), NULLIF(LTRIM(RTRIM(cc.Codigo)), '')) AS CodigoCuenta
          FROM dbo.Areas a
          LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = a.IdCentroCosto
          WHERE a.IdArea = @IdArea;
          RETURN;
        END

        IF COL_LENGTH('dbo.Areas', 'Activo') IS NOT NULL
        BEGIN
          SELECT TOP 1
            a.IdCentroCosto,
            NULLIF(LTRIM(RTRIM(cc.Codigo)), '') AS CodigoCuenta
          FROM dbo.Areas a
          LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = a.IdCentroCosto
          WHERE a.IdArea = @IdArea
            AND ISNULL(a.Activo, 1) = 1;
          RETURN;
        END

        SELECT TOP 1
          a.IdCentroCosto,
          NULLIF(LTRIM(RTRIM(cc.Codigo)), '') AS CodigoCuenta
        FROM dbo.Areas a
        LEFT JOIN dbo.CentrosCosto cc ON cc.IdCentroCosto = a.IdCentroCosto
        WHERE a.IdArea = @IdArea;
        RETURN;
      END

      IF COL_LENGTH('dbo.Areas', 'CodigoCuenta') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.Areas', 'Activo') IS NOT NULL
        BEGIN
          SELECT TOP 1
            CAST(NULL AS int) AS IdCentroCosto,
            NULLIF(LTRIM(RTRIM(a.CodigoCuenta)), '') AS CodigoCuenta
          FROM dbo.Areas a
          WHERE a.IdArea = @IdArea
            AND ISNULL(a.Activo, 1) = 1;
          RETURN;
        END

        SELECT TOP 1
          CAST(NULL AS int) AS IdCentroCosto,
          NULLIF(LTRIM(RTRIM(a.CodigoCuenta)), '') AS CodigoCuenta
        FROM dbo.Areas a
        WHERE a.IdArea = @IdArea;
        RETURN;
      END

      SELECT CAST(NULL AS int) AS IdCentroCosto, CAST(NULL AS nvarchar(50)) AS CodigoCuenta;
    `);

  return {
    idCentroCosto: Number.isInteger(Number(result.recordset?.[0]?.IdCentroCosto)) ? Number(result.recordset?.[0]?.IdCentroCosto) : null,
    codigoCuenta: normalizeOptionalText(result.recordset?.[0]?.CodigoCuenta ?? null),
  };
}

async function completarCodigosCuentaRecursos(idArea: number, recursos: RecursoVisible[]): Promise<RecursoVisible[]> {
  if (!Array.isArray(recursos) || recursos.length === 0) {
    return [];
  }

  return Promise.all(
    recursos.map(async (recurso) => {
      if (recurso.codigoCuenta) {
        return recurso;
      }

      const { codigoCuenta } = await obtenerCodigoCuenta(idArea, recurso.id);
      return {
        ...recurso,
        codigoCuenta: codigoCuenta ?? null,
      };
    }),
  );
}

function buildIntPlaceholders(request: sql.Request, values: number[], prefix: string): string {
  return values.map((value, index) => {
    const paramName = `${prefix}${index}`;
    request.input(paramName, sql.Int, value);
    return `@${paramName}`;
  }).join(', ');
}

function dedupeRecursosById(recursos: RecursoVisible[]): RecursoVisible[] {
  const resourceMap = new Map<number, RecursoVisible>();

  for (const recurso of recursos) {
    if (!Number.isInteger(recurso.id) || recurso.id <= 0) {
      continue;
    }

    if (!resourceMap.has(recurso.id)) {
      resourceMap.set(recurso.id, recurso);
      continue;
    }

    const current = resourceMap.get(recurso.id)!;
    if (!current.codigoCuenta && recurso.codigoCuenta) {
      resourceMap.set(recurso.id, recurso);
    }
  }

  return Array.from(resourceMap.values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'));
}

async function resolveCatalogValuesForTargetColumn(
  idCatalogo: number,
  targetColumn: string,
  columns?: TableColumnsMap,
): Promise<number[]> {
  const resolvedColumns = columns ?? await loadFallbackTableColumns();
  const candidateColumns = listExistingColumns(resolvedColumns, 'CatalogosSolicitud', ['IdCatalogoSolicitud', 'IdCatalogo', 'Id']);

  if (candidateColumns.length === 0) {
    return [idCatalogo];
  }

  const selectColumnsSet = new Set<string>(candidateColumns);
  if (hasColumn(resolvedColumns, 'CatalogosSolicitud', targetColumn)) {
    selectColumnsSet.add(targetColumn);
  }

  const selectColumns = Array.from(selectColumnsSet)
    .map((columnName) => `TRY_CONVERT(INT, cs.${columnName}) AS ${columnName}`)
    .join(', ');
  const whereConditions = candidateColumns
    .map((columnName) => `TRY_CONVERT(INT, cs.${columnName}) = @CatalogoId`)
    .join(' OR ');

  const pool = await getPool();
  const result = await pool.request()
    .input('CatalogoId', sql.Int, idCatalogo)
    .query(`
      IF OBJECT_ID('dbo.CatalogosSolicitud', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS INT) AS IdCatalogoSolicitud, CAST(NULL AS INT) AS IdCatalogo, CAST(NULL AS INT) AS Id;
        RETURN;
      END

      SELECT DISTINCT ${selectColumns}
      FROM dbo.CatalogosSolicitud cs
      WHERE ${whereConditions};
    `);

  const ids = new Set<number>();
  for (const row of result.recordset ?? []) {
    const value = Number(row?.[targetColumn] ?? 0);
    if (Number.isInteger(value) && value > 0) {
      ids.add(value);
    }
  }

  if (ids.size === 0) {
    ids.add(idCatalogo);
  }

  return Array.from(ids.values());
}

export async function obtenerCodigoCuentaPreviewPorArea(idArea: number): Promise<CodigoCuentaPreviewResult> {
  try {
    const preview = await obtenerCodigoCuentaPreviewDirectoPorArea(idArea);
    if (preview.codigoCuenta) {
      const idCentroCosto = await buscarIdCentroCostoPorCodigo(preview.codigoCuenta);
      return {
        codigoCuenta: preview.codigoCuenta,
        idCentroCosto,
        idRecurso: preview.idRecurso,
        source: 'area',
      };
    }

    const previewCentroCosto = await obtenerCodigoCuentaPorCentroCostoArea(idArea);
    return {
      codigoCuenta: previewCentroCosto.codigoCuenta,
      idCentroCosto: previewCentroCosto.idCentroCosto,
      idRecurso: preview.idRecurso,
      source: previewCentroCosto.codigoCuenta ? 'centroCosto' : 'none',
    };
  } catch (error) {
    console.error('Error obteniendo preview de CCO por área:', error);
    return {
      codigoCuenta: null,
      idCentroCosto: null,
      idRecurso: null,
      source: 'none',
    };
  }
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

function activeCondition(alias: string, columns: TableColumnsMap, tableName: string): string {
  return hasColumn(columns, tableName, 'Activo') ? ` AND ISNULL(${alias}.Activo, 1) = 1` : '';
}

function detectMaterialCatalogMapping(columns: TableColumnsMap): MaterialCatalogMappingPlan | null {
  if (!hasColumn(columns, 'MaterialRecurso', 'IdMaterial') || !hasColumn(columns, 'MaterialRecurso', 'IdRecurso')) {
    return null;
  }

  for (const tableName of ['MaterialCatalogo', 'CatalogoMateriales', 'MaterialesCatalogos', 'MaterialCatalogos']) {
    const catalogColumn = pickFirstColumn(columns, tableName, ['IdCatalogoSolicitud', 'IdCatalogo']);
    if (hasColumn(columns, tableName, 'IdMaterial') && catalogColumn) {
      return {
        source: `${tableName}.${catalogColumn}`,
        joinSql: `
    INNER JOIN dbo.${tableName} mc
      ON mc.${catalogColumn} = cv.CatalogoId${activeCondition('mc', columns, tableName)}
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial${activeCondition('mr', columns, 'MaterialRecurso')}`,
      };
    }
  }

  const materialCatalogColumn = pickFirstColumn(columns, 'Materiales', ['IdCatalogoSolicitud', 'IdCatalogo']);
  if (hasColumn(columns, 'Materiales', 'IdMaterial') && materialCatalogColumn) {
    return {
      source: `Materiales.${materialCatalogColumn}`,
      joinSql: `
    INNER JOIN dbo.Materiales m
      ON m.${materialCatalogColumn} = cv.CatalogoId${activeCondition('m', columns, 'Materiales')}
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = m.IdMaterial${activeCondition('mr', columns, 'MaterialRecurso')}`,
    };
  }

  return null;
}

async function loadFallbackTableColumns(): Promise<TableColumnsMap> {
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
        'CatalogosSolicitud',
        'AreaRecursoCuenta',
        'Recursos',
        'MaterialRecurso',
        'Materiales',
        'MaterialCatalogo',
        'CatalogoMateriales',
        'MaterialesCatalogos',
        'MaterialCatalogos'
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

async function listarRecursosPermitidosPorUsuarioAreaFallback(idUsuario: number, idArea: number, idCatalogo?: number): Promise<RecursoVisible[]> {
  const columns = await loadFallbackTableColumns();

  const coverageKey = pickCommonColumn(
    columns,
    ['CoberturasAcceso', 'CoberturaUsuarios', 'CoberturaAreas', 'CoberturaCatalogos'],
    ['IdCobertura', 'IdCoberturaAcceso', 'CoberturaId'],
  );
  const coverageScopeColumn = pickFirstColumn(columns, 'CoberturasAcceso', ['TipoAlcance', 'Alcance']);
  const coverageCatalogColumn = pickFirstColumn(columns, 'CoberturaCatalogos', ['IdCatalogoSolicitud', 'IdCatalogo']);
  const mappingPlan = detectMaterialCatalogMapping(columns);

  if (
    !coverageKey
    || !coverageCatalogColumn
    || !mappingPlan
    || !hasColumn(columns, 'CoberturaAreas', 'IdArea')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdArea')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'Nombre')
  ) {
    console.warn(
      '[CoberturasAcceso] No se detectó un mapeo compatible catálogo->material->recurso para listar recursos permitidos.',
      {
        coverageKey,
        coverageCatalogColumn,
        mappingSource: mappingPlan?.source ?? null,
      },
    );
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

  const pool = await getPool();
  const request = pool.request()
    .input('IdUsuario', sql.Int, idUsuario)
    .input('IdArea', sql.Int, idArea);

  let coverageCatalogFilter = '';
  if (Number.isInteger(idCatalogo) && Number(idCatalogo) > 0) {
    const candidateIds = await resolveCatalogValuesForTargetColumn(Number(idCatalogo), coverageCatalogColumn, columns);
    if (candidateIds.length === 0) {
      return [];
    }

    const placeholders = buildIntPlaceholders(request, candidateIds, 'CoverageCatalog');
    coverageCatalogFilter = `
        AND TRY_CONVERT(INT, cc.${coverageCatalogColumn}) IN (${placeholders})`;
  }

  const query = `
    WITH CoberturasVigentes AS (
      SELECT DISTINCT
        cc.${coverageCatalogColumn} AS CatalogoId
      FROM dbo.CoberturaUsuarios cu
      INNER JOIN dbo.CoberturasAcceso c
        ON c.${coverageKey} = cu.${coverageKey}${activeCondition('c', columns, 'CoberturasAcceso')}
      ${usuariosJoin}
      LEFT JOIN dbo.CoberturaAreas ca
        ON ca.${coverageKey} = c.${coverageKey}
      INNER JOIN dbo.CoberturaCatalogos cc
        ON cc.${coverageKey} = c.${coverageKey}${activeCondition('cc', columns, 'CoberturaCatalogos')}
      WHERE cu.IdUsuario = @IdUsuario${activeCondition('cu', columns, 'CoberturaUsuarios')}
        ${hasColumn(columns, 'CoberturaUsuarios', 'FechaInicio') ? "AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))" : ''}
        ${hasColumn(columns, 'CoberturaUsuarios', 'FechaFin') ? "AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))" : ''}${scopeCondition}${coverageCatalogFilter}
    )
    SELECT
      r.IdRecurso,
      r.Nombre,
      arc.CodigoCuenta,
      arc.NombreCuenta,
      MIN(cv.CatalogoId) AS IdCatalogoSolicitud
    FROM CoberturasVigentes cv${mappingPlan.joinSql}
    INNER JOIN dbo.AreaRecursoCuenta arc
      ON arc.IdArea = @IdArea
     AND arc.IdRecurso = mr.IdRecurso${activeCondition('arc', columns, 'AreaRecursoCuenta')}
    INNER JOIN dbo.Recursos r
      ON r.IdRecurso = arc.IdRecurso${activeCondition('r', columns, 'Recursos')}
    GROUP BY r.IdRecurso, r.Nombre, arc.CodigoCuenta, arc.NombreCuenta
    ORDER BY r.Nombre;
  `;

  const result = await request.query(query);

  return (result.recordset ?? []).map(normalizeRecurso);
}

async function listarRecursosDisponiblesPorAreaFallback(idArea: number): Promise<RecursoVisible[]> {
  const columns = await loadFallbackTableColumns();

  if (
    !hasColumn(columns, 'AreaRecursoCuenta', 'IdArea')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'Nombre')
  ) {
    return [];
  }

  const query = `
    SELECT DISTINCT
      r.IdRecurso,
      r.Nombre,
      arc.CodigoCuenta,
      arc.NombreCuenta
    FROM dbo.AreaRecursoCuenta arc
    INNER JOIN dbo.Recursos r
      ON r.IdRecurso = arc.IdRecurso${activeCondition('r', columns, 'Recursos')}
    WHERE arc.IdArea = @IdArea${activeCondition('arc', columns, 'AreaRecursoCuenta')}
    ORDER BY r.Nombre;
  `;

  const pool = await getPool();
  const result = await pool.request()
    .input('IdArea', sql.Int, idArea)
    .query(query);

  return (result.recordset ?? []).map(normalizeRecurso);
}

async function listarRecursosPorMaterialEnAreaFallback(idArea: number, idMaterial: number): Promise<RecursoVisible[]> {
  const columns = await loadFallbackTableColumns();

  if (
    !hasColumn(columns, 'MaterialRecurso', 'IdMaterial')
    || !hasColumn(columns, 'MaterialRecurso', 'IdRecurso')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdArea')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'Nombre')
  ) {
    return [];
  }

  const query = `
    SELECT DISTINCT
      r.IdRecurso,
      r.Nombre,
      arc.CodigoCuenta,
      arc.NombreCuenta
    FROM dbo.MaterialRecurso mr
    INNER JOIN dbo.AreaRecursoCuenta arc
      ON arc.IdArea = @IdArea
     AND arc.IdRecurso = mr.IdRecurso${activeCondition('arc', columns, 'AreaRecursoCuenta')}
    INNER JOIN dbo.Recursos r
      ON r.IdRecurso = arc.IdRecurso${activeCondition('r', columns, 'Recursos')}
    WHERE mr.IdMaterial = @IdMaterial${activeCondition('mr', columns, 'MaterialRecurso')}
    ORDER BY r.Nombre;
  `;

  const pool = await getPool();
  const result = await pool.request()
    .input('IdArea', sql.Int, idArea)
    .input('IdMaterial', sql.Int, idMaterial)
    .query(query);

  return (result.recordset ?? []).map(normalizeRecurso);
}

async function listarRecursosPorCatalogoEnAreaFallback(idArea: number, idCatalogo: number): Promise<RecursoVisible[]> {
  const columns = await loadFallbackTableColumns();

  if (
    !hasColumn(columns, 'MaterialRecurso', 'IdMaterial')
    || !hasColumn(columns, 'MaterialRecurso', 'IdRecurso')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdArea')
    || !hasColumn(columns, 'AreaRecursoCuenta', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'IdRecurso')
    || !hasColumn(columns, 'Recursos', 'Nombre')
  ) {
    return [];
  }

  const pool = await getPool();
  const request = pool.request().input('IdArea', sql.Int, idArea);
  const queries: string[] = [];
  const catalogBridgeTables = ['MaterialCatalogo', 'CatalogoMateriales', 'MaterialesCatalogos', 'MaterialCatalogos'];
  const bridgeQueries: string[] = [];

  for (const tableName of catalogBridgeTables) {
    if (!hasColumn(columns, tableName, 'IdMaterial')) {
      continue;
    }

    for (const catalogColumn of listExistingColumns(columns, tableName, ['IdCatalogoSolicitud', 'IdCatalogo'])) {
      const candidateIds = await resolveCatalogValuesForTargetColumn(idCatalogo, catalogColumn, columns);
      if (candidateIds.length === 0) {
        continue;
      }

      const placeholders = buildIntPlaceholders(request, candidateIds, `${tableName}${catalogColumn}CatalogoPreview`);
      bridgeQueries.push(`
        SELECT DISTINCT
          r.IdRecurso,
          r.Nombre,
          arc.CodigoCuenta,
          arc.NombreCuenta
        FROM dbo.${tableName} mc
        INNER JOIN dbo.MaterialRecurso mr
          ON mr.IdMaterial = mc.IdMaterial${activeCondition('mr', columns, 'MaterialRecurso')}
        INNER JOIN dbo.AreaRecursoCuenta arc
          ON arc.IdArea = @IdArea
         AND arc.IdRecurso = mr.IdRecurso${activeCondition('arc', columns, 'AreaRecursoCuenta')}
        INNER JOIN dbo.Recursos r
          ON r.IdRecurso = arc.IdRecurso${activeCondition('r', columns, 'Recursos')}
        WHERE TRY_CONVERT(INT, mc.${catalogColumn}) IN (${placeholders})${activeCondition('mc', columns, tableName)}
      `);
    }
  }

  if (bridgeQueries.length > 0) {
    queries.push(...bridgeQueries);
  } else if (hasColumn(columns, 'Materiales', 'IdMaterial')) {
    for (const catalogColumn of listExistingColumns(columns, 'Materiales', ['IdCatalogoSolicitud', 'IdCatalogo'])) {
      const candidateIds = await resolveCatalogValuesForTargetColumn(idCatalogo, catalogColumn, columns);
      if (candidateIds.length === 0) {
        continue;
      }

      const placeholders = buildIntPlaceholders(request, candidateIds, `Materiales${catalogColumn}CatalogoPreview`);
      queries.push(`
        SELECT DISTINCT
          r.IdRecurso,
          r.Nombre,
          arc.CodigoCuenta,
          arc.NombreCuenta
        FROM dbo.Materiales m
        INNER JOIN dbo.MaterialRecurso mr
          ON mr.IdMaterial = m.IdMaterial${activeCondition('mr', columns, 'MaterialRecurso')}
        INNER JOIN dbo.AreaRecursoCuenta arc
          ON arc.IdArea = @IdArea
         AND arc.IdRecurso = mr.IdRecurso${activeCondition('arc', columns, 'AreaRecursoCuenta')}
        INNER JOIN dbo.Recursos r
          ON r.IdRecurso = arc.IdRecurso${activeCondition('r', columns, 'Recursos')}
        WHERE TRY_CONVERT(INT, m.${catalogColumn}) IN (${placeholders})${activeCondition('m', columns, 'Materiales')}
      `);
    }
  }

  if (queries.length === 0) {
    return [];
  }

  const result = await request.query(queries.join('\nUNION\n'));
  return dedupeRecursosById((result.recordset ?? []).map(normalizeRecurso));
}

async function obtenerPreviewSeguroPorArea(idArea: number): Promise<CodigoCuentaPreviewResult | null> {
  const recursosArea = await completarCodigosCuentaRecursos(idArea, await listarRecursosDisponiblesPorArea(idArea));
  const recursosConCuenta = recursosArea.filter((recurso) => typeof recurso.codigoCuenta === 'string' && recurso.codigoCuenta.trim().length > 0);

  if (recursosConCuenta.length === 1) {
    const codigoCuenta = recursosConCuenta[0].codigoCuenta ?? null;
    return {
      codigoCuenta,
      idCentroCosto: await buscarIdCentroCostoPorCodigo(codigoCuenta),
      idRecurso: recursosConCuenta[0].id,
      source: 'area',
      recursos: recursosArea,
    };
  }

  if (recursosConCuenta.length > 1) {
    const codigosUnicos = Array.from(new Set(recursosConCuenta.map((recurso) => recurso.codigoCuenta).filter(Boolean)));
    if (codigosUnicos.length === 1) {
      const codigoCuenta = codigosUnicos[0] ?? null;
      return {
        codigoCuenta,
        idCentroCosto: await buscarIdCentroCostoPorCodigo(codigoCuenta),
        idRecurso: null,
        source: 'area',
        recursos: recursosArea,
      };
    }

    return null;
  }

  const previewCentroCosto = await obtenerCodigoCuentaPorCentroCostoArea(idArea);
  if (previewCentroCosto.codigoCuenta) {
    return {
      codigoCuenta: previewCentroCosto.codigoCuenta,
      idCentroCosto: previewCentroCosto.idCentroCosto,
      idRecurso: null,
      source: 'centroCosto',
      recursos: recursosArea,
    };
  }

  return null;
}

export async function obtenerCodigoCuentaPreviewPorAreaCatalogo(idArea: number, idCatalogo: number, idUsuario?: number): Promise<CodigoCuentaPreviewResult> {
  try {
    let recursosBase: RecursoVisible[] = [];
    let resolutionPath = 'catalogo-fallback';
    const nombreCatalogo = await obtenerNombreCatalogo(idCatalogo);

    if (Number.isInteger(idUsuario) && Number(idUsuario) > 0) {
      const tieneCobertura = await usuarioTieneCoberturaActivaEnArea(Number(idUsuario), idArea);
      if (tieneCobertura) {
        recursosBase = await listarRecursosPermitidosPorUsuarioAreaFallback(Number(idUsuario), idArea, idCatalogo);
        resolutionPath = 'usuario-cobertura-catalogo';
      }
    }

    if (recursosBase.length === 0) {
      recursosBase = await listarRecursosPorCatalogoEnAreaFallback(idArea, idCatalogo);
      resolutionPath = 'catalogo-material-recurso';
    }
    
    // Si la BD no tiene tablas de mapeo de catálogos y falla, aplicamos heurística por nombre
    if (recursosBase.length === 0) {
      // Usamos directamente "listarRecursosDisponiblesPorArea" y emparejamos por nombre
      const recursosArea = await listarRecursosDisponiblesPorArea(idArea);
      if (nombreCatalogo) {
        recursosBase = filtrarRecursosPorNombreCatalogo(recursosArea, nombreCatalogo);
        resolutionPath = 'heuristica-nombre-catalogo';
      }
    }
    const recursos = await completarCodigosCuentaRecursos(idArea, recursosBase);
    const recursosConCuenta = recursos.filter((recurso) => typeof recurso.codigoCuenta === 'string' && recurso.codigoCuenta.trim().length > 0);
    const codigosUnicos = Array.from(new Set(recursosConCuenta.map((recurso) => recurso.codigoCuenta).filter(Boolean)));

    if (env.NODE_ENV !== 'production') {
      console.log('[CCO preview area+catalogo]', {
        idUsuario: Number.isInteger(idUsuario) ? idUsuario : null,
        idArea,
        idCatalogo,
        resolutionPath,
        totalRecursosBase: recursosBase.length,
        totalRecursosConCuenta: recursosConCuenta.length,
        codigosUnicos,
        recursos: recursos.map((recurso) => ({
          id: recurso.id,
          nombre: recurso.nombre,
          catalogoId: recurso.catalogoId ?? null,
          codigoCuenta: recurso.codigoCuenta ?? null,
          nombreCuenta: recurso.nombreCuenta ?? null,
        })),
        nombreCatalogo,
      });
    }

    if (recursosConCuenta.length === 1) {
      const codigoCuenta = recursosConCuenta[0].codigoCuenta ?? null;
      return {
        codigoCuenta,
        idCentroCosto: await buscarIdCentroCostoPorCodigo(codigoCuenta),
        idRecurso: recursosConCuenta[0].id,
        source: 'catalogo',
        recursos,
      };
    }

    if (recursosConCuenta.length > 1) {
      const recursosEmpatadosPorNombre = nombreCatalogo
        ? filtrarRecursosPorNombreCatalogo(recursosConCuenta, nombreCatalogo)
        : [];

      if (recursosEmpatadosPorNombre.length === 1) {
        const codigoCuenta = recursosEmpatadosPorNombre[0].codigoCuenta ?? null;
        return {
          codigoCuenta,
          idCentroCosto: await buscarIdCentroCostoPorCodigo(codigoCuenta),
          idRecurso: recursosEmpatadosPorNombre[0].id,
          source: 'catalogo',
          recursos,
        };
      }

      if (recursosEmpatadosPorNombre.length > 1) {
        const codigosEmpatados = Array.from(new Set(recursosEmpatadosPorNombre.map((recurso) => recurso.codigoCuenta).filter(Boolean)));
        if (codigosEmpatados.length === 1) {
          const codigoCuenta = codigosEmpatados[0] ?? null;
          return {
            codigoCuenta,
            idCentroCosto: await buscarIdCentroCostoPorCodigo(codigoCuenta),
            idRecurso: null,
            source: 'catalogo',
            recursos,
          };
        }
      }

      if (codigosUnicos.length === 1) {
        const codigoCuenta = codigosUnicos[0] ?? null;
        return {
          codigoCuenta,
          idCentroCosto: await buscarIdCentroCostoPorCodigo(codigoCuenta),
          idRecurso: null,
          source: 'catalogo',
          recursos,
        };
      }

      return {
        codigoCuenta: null,
        idCentroCosto: null,
        idRecurso: null,
        source: 'catalogo-ambiguous',
        recursos,
      };
    }

    return {
      codigoCuenta: null,
      idCentroCosto: null,
      idRecurso: null,
      source: 'none',
      recursos,
    };
  } catch (error) {
    console.error('Error obteniendo preview de CCO por área/catálogo:', error);
    return {
      codigoCuenta: null,
      idCentroCosto: null,
      idRecurso: null,
      source: 'none',
      recursos: [],
    };
  }
}

export async function obtenerCodigoCuenta(idArea: number, idRecurso: number): Promise<{ codigoCuenta: string | null; idCentroCosto: number | null }> {
  try {
      const result = await callSpOne<AreaRecursoCuenta>('sp_ObtenerCodigoCuentaAreaRecurso', {
        IdArea: idArea,
        IdRecurso: idRecurso,
      });

      let codigoCuenta = normalizeOptionalText(result?.CodigoCuenta ?? null);
      if (!codigoCuenta) {
        codigoCuenta = await obtenerCodigoCuentaDirecto(idArea, idRecurso);
      }

      const idCentroCosto = await buscarIdCentroCostoPorCodigo(codigoCuenta);

      return { codigoCuenta, idCentroCosto };
  } catch (error) {
      console.error('Error obteniendo CCO para Area/Recurso:', error);

      try {
        const codigoCuenta = await obtenerCodigoCuentaDirecto(idArea, idRecurso);
        const idCentroCosto = await buscarIdCentroCostoPorCodigo(codigoCuenta);
        return { codigoCuenta, idCentroCosto };
      } catch (fallbackError) {
        console.error('Error en fallback directo de CCO para Area/Recurso:', fallbackError);
        return { codigoCuenta: null, idCentroCosto: null };
      }
  }
}


export async function listarRecursosPorArea(idArea: number): Promise<RecursoPorArea[]> {
  return callSpMany<RecursoPorArea>('sp_ListarRecursosPorArea', {
    IdArea: idArea,
  });
}

export async function listarRecursosDisponiblesPorArea(idArea: number): Promise<RecursoVisible[]> {
  try {
    const rows = await listarRecursosPorArea(idArea);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(normalizeRecurso);
    }
  } catch (error) {
    // fallback directo si el SP no existe o está desactualizado
  }

  try {
    return await listarRecursosDisponiblesPorAreaFallback(idArea);
  } catch (error) {
    console.error('Error listando recursos disponibles por área (fallback)', error);
    return [];
  }
}

export async function resolverRecursosMaterialEnArea(idArea: number, idMaterial: number): Promise<RecursosMaterialResult> {
  try {
    const recursosBase = await listarRecursosPorMaterialEnAreaFallback(idArea, idMaterial);
    const recursos = await completarCodigosCuentaRecursos(idArea, recursosBase);
    return {
      recursos,
      resolved: recursos.length === 1 ? recursos[0] : null,
    };
  } catch (error) {
    console.error('Error resolviendo recursos por material/área', error);
    return {
      recursos: [],
      resolved: null,
    };
  }
}

export async function usuarioTieneCoberturaActivaEnArea(idUsuario: number, idArea: number): Promise<boolean> {
  const pool = await getPool();
  const request = pool.request();
  const query = `
DECLARE @sql NVARCHAR(MAX) = N'';

IF OBJECT_ID('dbo.CoberturasAcceso','U') IS NULL
   OR OBJECT_ID('dbo.CoberturaUsuarios','U') IS NULL
   OR OBJECT_ID('dbo.CoberturaAreas','U') IS NULL
BEGIN
  SELECT CAST(0 AS bit) AS TieneCobertura;
  RETURN;
END

IF COL_LENGTH('dbo.CoberturasAcceso','IdCobertura') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaUsuarios','IdCobertura') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaAreas','IdCobertura') IS NOT NULL
BEGIN
  SET @sql = N'
    SELECT CAST(CASE WHEN EXISTS (
      SELECT 1
      FROM dbo.CoberturaUsuarios cu
      INNER JOIN dbo.CoberturasAcceso c
        ON c.IdCobertura = cu.IdCobertura
      LEFT JOIN dbo.CoberturaAreas ca
        ON ca.IdCobertura = c.IdCobertura
      WHERE cu.IdUsuario = @IdUsuario';

  IF COL_LENGTH('dbo.CoberturaUsuarios','Activo') IS NOT NULL
    SET @sql += N' AND ISNULL(cu.Activo,1) = 1';
  IF COL_LENGTH('dbo.CoberturaUsuarios','FechaInicio') IS NOT NULL
    SET @sql += N' AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturaUsuarios','FechaFin') IS NOT NULL
    SET @sql += N' AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))';

  IF COL_LENGTH('dbo.CoberturasAcceso','Activo') IS NOT NULL
    SET @sql += N' AND ISNULL(c.Activo,1) = 1';
  IF COL_LENGTH('dbo.CoberturasAcceso','Vigente') IS NOT NULL
    SET @sql += N' AND ISNULL(c.Vigente,1) = 1';
  IF COL_LENGTH('dbo.CoberturasAcceso','VigenteDesde') IS NOT NULL
    SET @sql += N' AND (c.VigenteDesde IS NULL OR c.VigenteDesde <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturasAcceso','VigenteHasta') IS NOT NULL
    SET @sql += N' AND (c.VigenteHasta IS NULL OR c.VigenteHasta >= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturasAcceso','FechaInicio') IS NOT NULL
    SET @sql += N' AND (c.FechaInicio IS NULL OR c.FechaInicio <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturasAcceso','FechaFin') IS NOT NULL
    SET @sql += N' AND (c.FechaFin IS NULL OR c.FechaFin >= CAST(GETDATE() AS DATE))';

  IF COL_LENGTH('dbo.CoberturasAcceso','TipoAlcance') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.TipoAlcance,''RESTRINGIDO''))) = ''GLOBAL'' OR (ca.IdArea = @IdArea AND ISNULL(ca.Activo,1) = 1))';
    ELSE
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.TipoAlcance,''RESTRINGIDO''))) = ''GLOBAL'' OR ca.IdArea = @IdArea)';
  END
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Alcance') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.Alcance,''RESTRINGIDO''))) = ''GLOBAL'' OR (ca.IdArea = @IdArea AND ISNULL(ca.Activo,1) = 1))';
    ELSE
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.Alcance,''RESTRINGIDO''))) = ''GLOBAL'' OR ca.IdArea = @IdArea)';
  END
  ELSE
  BEGIN
    IF COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
      SET @sql += N' AND ca.IdArea = @IdArea AND ISNULL(ca.Activo,1) = 1';
    ELSE
      SET @sql += N' AND ca.IdArea = @IdArea';
  END

  SET @sql += N'
    ) THEN 1 ELSE 0 END AS bit) AS TieneCobertura;';

  EXEC sp_executesql @sql, N'@IdUsuario int, @IdArea int', @IdUsuario = @IdUsuario, @IdArea = @IdArea;
  RETURN;
END

IF COL_LENGTH('dbo.CoberturasAcceso','IdCoberturaAcceso') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaUsuarios','IdCoberturaAcceso') IS NOT NULL
   AND COL_LENGTH('dbo.CoberturaAreas','IdCoberturaAcceso') IS NOT NULL
BEGIN
  SET @sql = N'
    SELECT CAST(CASE WHEN EXISTS (
      SELECT 1
      FROM dbo.CoberturaUsuarios cu
      INNER JOIN dbo.CoberturasAcceso c
        ON c.IdCoberturaAcceso = cu.IdCoberturaAcceso
      LEFT JOIN dbo.CoberturaAreas ca
        ON ca.IdCoberturaAcceso = c.IdCoberturaAcceso
      WHERE cu.IdUsuario = @IdUsuario';

  IF COL_LENGTH('dbo.CoberturaUsuarios','Activo') IS NOT NULL
    SET @sql += N' AND ISNULL(cu.Activo,1) = 1';
  IF COL_LENGTH('dbo.CoberturaUsuarios','FechaInicio') IS NOT NULL
    SET @sql += N' AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturaUsuarios','FechaFin') IS NOT NULL
    SET @sql += N' AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))';

  IF COL_LENGTH('dbo.CoberturasAcceso','Activo') IS NOT NULL
    SET @sql += N' AND ISNULL(c.Activo,1) = 1';
  IF COL_LENGTH('dbo.CoberturasAcceso','Vigente') IS NOT NULL
    SET @sql += N' AND ISNULL(c.Vigente,1) = 1';
  IF COL_LENGTH('dbo.CoberturasAcceso','VigenteDesde') IS NOT NULL
    SET @sql += N' AND (c.VigenteDesde IS NULL OR c.VigenteDesde <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturasAcceso','VigenteHasta') IS NOT NULL
    SET @sql += N' AND (c.VigenteHasta IS NULL OR c.VigenteHasta >= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturasAcceso','FechaInicio') IS NOT NULL
    SET @sql += N' AND (c.FechaInicio IS NULL OR c.FechaInicio <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturasAcceso','FechaFin') IS NOT NULL
    SET @sql += N' AND (c.FechaFin IS NULL OR c.FechaFin >= CAST(GETDATE() AS DATE))';

  IF COL_LENGTH('dbo.CoberturasAcceso','TipoAlcance') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.TipoAlcance,''RESTRINGIDO''))) = ''GLOBAL'' OR (ca.IdArea = @IdArea AND ISNULL(ca.Activo,1) = 1))';
    ELSE
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.TipoAlcance,''RESTRINGIDO''))) = ''GLOBAL'' OR ca.IdArea = @IdArea)';
  END
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso','Alcance') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.Alcance,''RESTRINGIDO''))) = ''GLOBAL'' OR (ca.IdArea = @IdArea AND ISNULL(ca.Activo,1) = 1))';
    ELSE
      SET @sql += N' AND (UPPER(CONVERT(NVARCHAR(50), ISNULL(c.Alcance,''RESTRINGIDO''))) = ''GLOBAL'' OR ca.IdArea = @IdArea)';
  END
  ELSE
  BEGIN
    IF COL_LENGTH('dbo.CoberturaAreas','Activo') IS NOT NULL
      SET @sql += N' AND ca.IdArea = @IdArea AND ISNULL(ca.Activo,1) = 1';
    ELSE
      SET @sql += N' AND ca.IdArea = @IdArea';
  END

  SET @sql += N'
    ) THEN 1 ELSE 0 END AS bit) AS TieneCobertura;';

  EXEC sp_executesql @sql, N'@IdUsuario int, @IdArea int', @IdUsuario = @IdUsuario, @IdArea = @IdArea;
  RETURN;
END

SELECT CAST(0 AS bit) AS TieneCobertura;
`;

  const result = await request
    .input('IdUsuario', sql.Int, idUsuario)
    .input('IdArea', sql.Int, idArea)
    .query(query);

  return Boolean(result.recordset?.[0]?.TieneCobertura);
}

export async function listarRecursosPermitidosPorUsuarioArea(idUsuario: number, idArea: number): Promise<RecursoVisible[]> {
  // Intentar un stored procedure primero (si existe)
  try {
    const rows = await callSpMany<any>('sp_ListarRecursosPermitidosPorUsuarioArea', { IdUsuario: idUsuario, IdArea: idArea });
    if (Array.isArray(rows)) {
      return (rows || []).map(normalizeRecurso);
    }
  } catch (spErr) {
    // si falla, caemos al fallback con la consulta directa
  }

  try {
    return await listarRecursosPermitidosPorUsuarioAreaFallback(idUsuario, idArea);
  } catch (err: any) {
    console.error('Error listando recursos permitidos por usuario/área (fallback)', err);
    return [];
  }
}

export async function obtenerRecursosVisiblesPorUsuarioArea(idUsuario: number, idArea: number): Promise<RecursosVisiblesResult> {
  const applied = await usuarioTieneCoberturaActivaEnArea(idUsuario, idArea);

  if (applied) {
    const recursosFiltrados = await listarRecursosPermitidosPorUsuarioArea(idUsuario, idArea);
    return {
      recursos: recursosFiltrados,
      applied: true,
    };
  }

  return {
    recursos: await listarRecursosDisponiblesPorArea(idArea),
    applied: false,
  };
}

export async function usuarioPuedeUsarRecursoEnArea(idUsuario: number, idArea: number, idRecurso: number): Promise<boolean> {
  const { recursos } = await obtenerRecursosVisiblesPorUsuarioArea(idUsuario, idArea);
  return recursos.some((recurso) => recurso.id === idRecurso);
}
