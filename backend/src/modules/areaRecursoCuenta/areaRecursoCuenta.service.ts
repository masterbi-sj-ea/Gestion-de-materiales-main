import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';
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

type TableColumnsMap = Map<string, Set<string>>;

interface MaterialCatalogMappingPlan {
  source: string;
  joinSql: string;
}

function normalizeRecurso(row: any): RecursoVisible {
  return {
    id: Number(row?.IdRecurso ?? row?.id ?? 0),
    nombre: String(row?.Nombre ?? row?.nombre ?? ''),
    codigoCuenta: row?.CodigoCuenta ?? row?.codigoCuenta ?? null,
    nombreCuenta: row?.NombreCuenta ?? row?.nombreCuenta ?? null,
    catalogoId: row?.IdCatalogoSolicitud ?? row?.IdCatalogo ?? row?.catalogoId ?? null,
  };
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

function activeCondition(alias: string, columns: TableColumnsMap, tableName: string): string {
  return hasColumn(columns, tableName, 'Activo') ? ` AND ISNULL(${alias}.Activo, 1) = 1` : '';
}

function detectMaterialCatalogMapping(columns: TableColumnsMap): MaterialCatalogMappingPlan | null {
  if (!hasColumn(columns, 'MaterialRecurso', 'IdMaterial') || !hasColumn(columns, 'MaterialRecurso', 'IdRecurso')) {
    return null;
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

async function listarRecursosPermitidosPorUsuarioAreaFallback(idUsuario: number, idArea: number): Promise<RecursoVisible[]> {
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
        ${hasColumn(columns, 'CoberturaUsuarios', 'FechaFin') ? "AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))" : ''}${scopeCondition}
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

  const pool = await getPool();
  const result = await pool.request()
    .input('IdUsuario', sql.Int, idUsuario)
    .input('IdArea', sql.Int, idArea)
    .query(query);

  return (result.recordset ?? []).map(normalizeRecurso);
}

export async function obtenerCodigoCuenta(idArea: number, idRecurso: number): Promise<{ codigoCuenta: string | null; idCentroCosto: number | null }> {
  try {
      const result = await callSpOne<AreaRecursoCuenta>('sp_ObtenerCodigoCuentaAreaRecurso', {
        IdArea: idArea,
        IdRecurso: idRecurso,
      });

      const codigoCuenta = result?.CodigoCuenta ?? null;
      let idCentroCosto: number | null = null;
    
      if (codigoCuenta) {
        const pool = await getPool();
        const request = pool.request();
        // Buscar el CCO que coincida con el código de cuenta.
        // Nota: Asumimos que la columna 'Codigo' en CentrosCosto es el código contable.
        // Si no, habría que ver dónde se guarda el código contable en CentrosCosto.
        const ccResult = await request.input('Codigo', codigoCuenta).query(`
            SELECT TOP 1 IdCentroCosto FROM CentrosCosto WHERE Codigo = @Codigo
        `);
        
        if (ccResult.recordset.length > 0) {
            idCentroCosto = ccResult.recordset[0].IdCentroCosto;
        }
      }
    
      return { codigoCuenta, idCentroCosto };
  } catch (error) {
      console.error('Error obteniendo CCO para Area/Recurso:', error);
      return { codigoCuenta: null, idCentroCosto: null };
  }
}


export async function listarRecursosPorArea(idArea: number): Promise<RecursoPorArea[]> {
  return callSpMany<RecursoPorArea>('sp_ListarRecursosPorArea', {
    IdArea: idArea,
  });
}

export async function listarRecursosDisponiblesPorArea(idArea: number): Promise<RecursoVisible[]> {
  const rows = await listarRecursosPorArea(idArea);
  return (rows || []).map(normalizeRecurso);
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
    return {
      recursos: await listarRecursosPermitidosPorUsuarioArea(idUsuario, idArea),
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
