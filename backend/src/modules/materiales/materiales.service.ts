import sql from 'mssql';
import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';
import { env } from '../../config/env';
import { usuarioTieneCoberturaActivaEnArea } from '../areaRecursoCuenta/areaRecursoCuenta.service';
import { listarCatalogosPermitidosPorUsuarioArea } from '../coberturasAcceso/coberturasAcceso.service';

export interface Material {
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedida: string;
  GrupoArticulos: string | null;
  Activo?: boolean | number | null;
}

export interface MaterialConStock extends Material {
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
  UltimaMonedaCompra: string | null;
  id_imagen?: number | null;
  RutaImagenFinal?: string | null;
  TieneImagen?: number | boolean | null;
  FuenteImagen?: string | null;
}

export interface MaterialesPermitidosResult {
  materiales: MaterialConStock[];
  applied: boolean;
}

type TableColumnsMap = Map<string, Set<string>>;

export interface MaterialImportRow {
  NumeroArticulo: string;
  DescripcionArticulo: string;
  EnStock: number;
  UnidadMedida: string;
  GrupoArticulos?: string | null;
  UltimaFechaCompra?: string | null;
  UltimoPrecioCompra?: number | null;
  UltimaMonedaCompra?: string | null;
}

export interface MaterialImagen {
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  id_producto: number | null;
  CodigoSAP: string | null;
  CodigoSAP_Original: string | null;
  NumeroParte: string | null;
  DescripcionCatalogo: string | null;
  id_imagen: number | null;
  RutaImagenFinal: string | null;
  DescripcionImagen: string | null;
  es_principal: boolean | number | null;
  TieneImagen: boolean | number | null;
  FuenteImagen: string | null;
}

export interface ReactivarMaterialResult {
  IdMaterial: number;
  Resultado: string;
}

type CanonicalCurrency = 'USD' | 'COR';

function normalizeImportCurrency(value?: string | null): CanonicalCurrency {
  const raw = String(value ?? '').trim().toUpperCase();

  if (!raw) return 'COR';

  if (
    raw.includes('USD') ||
    raw === 'US$' ||
    raw === '$'
  ) {
    return 'USD';
  }

  if (
    raw.includes('COR') ||
    raw.includes('CORD') ||
    raw.includes('CORDOBA') ||
    raw.includes('C$') ||
    raw.includes('NIO')
  ) {
    return 'COR';
  }

  // Politica segura para la operacion actual:
  // lo no reconocido se asume como COR para no romper la carga semanal.
  return 'COR';
}

function roundMoney(value: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function convertImportPriceToUsd(
  precio: number | null | undefined,
  monedaOriginal: CanonicalCurrency,
  tipoCambioUsdToCord: number,
): number | null {
  if (precio === null || precio === undefined || !Number.isFinite(precio)) {
    return null;
  }

  if (monedaOriginal === 'USD') {
    return roundMoney(precio, 4);
  }

  return roundMoney(precio / tipoCambioUsdToCord, 4);
}

export async function listarMateriales(): Promise<Material[]> {
  return callSpMany<Material>('sp_ListarMateriales');
}

export async function listarMaterialesConStock(options: { incluirInactivos?: boolean } = {}): Promise<MaterialConStock[]> {
  if (options.incluirInactivos) {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos,
        sa.EnStock,
        sa.UltimaFechaCompra,
        sa.UltimoPrecioCompra,
        sa.UltimaMonedaCompra,
        ISNULL(m.Activo, 1) AS Activo
      FROM dbo.Materiales m WITH (NOLOCK)
      LEFT JOIN dbo.StockActual sa WITH (NOLOCK)
        ON sa.IdMaterial = m.IdMaterial
      ORDER BY m.NumeroArticulo;
    `);

    return (result.recordset ?? []) as MaterialConStock[];
  }

  return callSpMany<MaterialConStock>('sp_ListarMaterialesConStock');
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

function activeCondition(alias: string, columns: TableColumnsMap, tableName: string): string {
  return hasColumn(columns, tableName, 'Activo') ? ` AND ISNULL(${alias}.Activo, 1) = 1` : '';
}

function buildCatalogColumnPreference(preferredCatalogColumn: string | null): string[] {
  const base = ['IdCatalogoSolicitud', 'IdCatalogo'];
  if (!preferredCatalogColumn || !base.includes(preferredCatalogColumn)) {
    return base;
  }

  return [preferredCatalogColumn, ...base.filter((column) => column !== preferredCatalogColumn)];
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

function isAnyMaterialsGroup(value: unknown): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return true;
  }

  return normalized.includes('material') || normalized.includes('repuesto');
}

function catalogMatchesMaterialGroup(catalogName: string, materialGroup: string | null | undefined): boolean {
  const normalizedCatalog = normalizeLabel(catalogName);
  const normalizedGroup = normalizeLabel(materialGroup);

  if (isFixedAssetsCategory(normalizedCatalog)) {
    return isFixedAssetsCategory(normalizedGroup);
  }

  if (isMaintenanceCategory(normalizedCatalog)) {
    return isMaintenanceCategory(normalizedGroup)
      || (
        normalizedGroup.includes('materiales')
        && normalizedGroup.includes('repuestos')
        && isMaintenanceCategory(normalizedGroup)
      );
  }

  if (isStandardMaterialsCategory(normalizedCatalog)) {
    if (!normalizedGroup) {
      return true;
    }

    return !isMaintenanceCategory(normalizedGroup)
      && !isFixedAssetsCategory(normalizedGroup)
      && (normalizedGroup.includes('material') || normalizedGroup.includes('repuesto'));
  }

  if (!normalizedCatalog || !normalizedGroup) {
    return false;
  }

  return normalizedCatalog === normalizedGroup
    || normalizedCatalog.includes(normalizedGroup)
    || normalizedGroup.includes(normalizedCatalog);
}

function filtrarMaterialesPorCatalogosHeuristico(
  materiales: MaterialConStock[],
  catalogNames: string[],
): MaterialConStock[] {
  const normalizedCatalogs = catalogNames
    .map((catalogName) => String(catalogName || '').trim())
    .filter(Boolean);

  if (normalizedCatalogs.length === 0) {
    return [];
  }

  const directMatches = materiales.filter((material) =>
    normalizedCatalogs.some((catalogName) => catalogMatchesMaterialGroup(catalogName, material.GrupoArticulos ?? null)),
  );

  if (directMatches.length > 0) {
    return directMatches;
  }

  const allowsMaintenanceMaterials = normalizedCatalogs.some((catalogName) => isMaintenanceCategory(catalogName));
  if (allowsMaintenanceMaterials) {
    const maintenanceFallback = materiales.filter((material) => {
      const normalizedGroup = normalizeLabel(material.GrupoArticulos ?? null);
      if (!normalizedGroup) {
        return true;
      }

      return !isFixedAssetsCategory(normalizedGroup) && isAnyMaterialsGroup(normalizedGroup);
    });

    if (maintenanceFallback.length > 0) {
      return maintenanceFallback;
    }
  }

  const allowsStandardMaterials = normalizedCatalogs.some((catalogName) => isStandardMaterialsCategory(catalogName));
  if (!allowsStandardMaterials) {
    return [];
  }

  return materiales.filter((material) => {
    const normalizedGroup = normalizeLabel(material.GrupoArticulos ?? null);
    if (!normalizedGroup) {
      return true;
    }

    return !isMaintenanceCategory(normalizedGroup) && !isFixedAssetsCategory(normalizedGroup);
  });
}

async function loadCoverageTableColumns(): Promise<TableColumnsMap> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN (
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

async function cargarIdsMaterialPermitidosPorCatalogo(
  catalogIds: number[],
  preferredCatalogColumn: string | null = null,
): Promise<Set<number>> {
  if (catalogIds.length === 0) {
    return new Set<number>();
  }

  const columns = await loadCoverageTableColumns();
  const catalogColumnCandidates = buildCatalogColumnPreference(preferredCatalogColumn);
  const pool = await getPool();
  const request = pool.request();
  const placeholders = catalogIds.map((catalogId, index) => {
    const paramName = `Catalogo${index}`;
    request.input(paramName, sql.Int, catalogId);
    return `@${paramName}`;
  }).join(', ');

  const queries: string[] = [];
  const catalogBridgeTables = ['MaterialCatalogo', 'CatalogoMateriales', 'MaterialesCatalogos', 'MaterialCatalogos'];
  const bridgeQueries: string[] = [];

  for (const tableName of catalogBridgeTables) {
    const catalogColumn = pickFirstColumn(columns, tableName, catalogColumnCandidates);
    if (hasColumn(columns, tableName, 'IdMaterial') && catalogColumn) {
      bridgeQueries.push(`
        SELECT DISTINCT mc.IdMaterial
        FROM dbo.${tableName} mc
        WHERE mc.${catalogColumn} IN (${placeholders})${activeCondition('mc', columns, tableName)}
      `);
    }
  }

  if (bridgeQueries.length > 0) {
    queries.push(...bridgeQueries);
  } else {
    const materialCatalogColumn = pickFirstColumn(columns, 'Materiales', catalogColumnCandidates);
    if (hasColumn(columns, 'Materiales', 'IdMaterial') && materialCatalogColumn) {
      queries.push(`
        SELECT DISTINCT m.IdMaterial
        FROM dbo.Materiales m
        WHERE m.${materialCatalogColumn} IN (${placeholders})${activeCondition('m', columns, 'Materiales')}
      `);
    }
  }

  if (queries.length === 0) {
    return new Set<number>();
  }

  const result = await request.query(queries.join('\nUNION\n'));
  return new Set(
    (result.recordset ?? [])
      .map((row: any) => Number(row.IdMaterial ?? 0))
      .filter((idMaterial: number) => Number.isInteger(idMaterial) && idMaterial > 0),
  );
}

export async function listarMaterialesPermitidosPorUsuarioArea(
  idUsuario: number,
  idArea: number,
  idCatalogoSolicitud: number | null = null,
): Promise<MaterialesPermitidosResult> {
  const coberturaActiva = await usuarioTieneCoberturaActivaEnArea(idUsuario, idArea);
  const materiales = await listarMaterialesConStock();

  if (!coberturaActiva) {
    return {
      materiales,
      applied: false,
    };
  }

  const catalogos = await listarCatalogosPermitidosPorUsuarioArea(idUsuario, idArea);
  const catalogosSeleccionados = idCatalogoSolicitud && Number.isInteger(idCatalogoSolicitud) && idCatalogoSolicitud > 0
    ? (catalogos ?? []).filter((catalogo) => Number(catalogo.id ?? 0) === idCatalogoSolicitud)
    : (catalogos ?? []);
  const preferredCatalogColumn = catalogosSeleccionados.find((catalogo) => typeof catalogo.idSource === 'string' && catalogo.idSource.length > 0)?.idSource ?? null;
  const catalogIds = Array.from(
    new Set(
      catalogosSeleccionados
        .map((catalogo) => Number(catalogo.id ?? 0))
        .filter((catalogoId) => Number.isInteger(catalogoId) && catalogoId > 0),
    ),
  );

  if (catalogIds.length === 0) {
    return {
      materiales: [],
      applied: true,
    };
  }

  try {
    const materialIds = await cargarIdsMaterialPermitidosPorCatalogo(catalogIds, preferredCatalogColumn);
    if (materialIds.size === 0) {
      const materialesHeuristicos = filtrarMaterialesPorCatalogosHeuristico(
        materiales,
        catalogosSeleccionados.map((catalogo) => catalogo.nombre ?? ''),
      );

      if (materialesHeuristicos.length > 0) {
        const usesMaintenanceFallback = catalogosSeleccionados.some((catalogo) => isMaintenanceCategory(catalogo.nombre ?? ''));
        console.warn('[CoberturasAcceso] Se aplicó fallback heurístico catálogo->GrupoArticulos para materiales permitidos.', {
          idUsuario,
          idArea,
          catalogos: catalogosSeleccionados.map((catalogo) => catalogo.nombre ?? ''),
          preferredCatalogColumn,
          usesMaintenanceFallback,
          totalMateriales: materialesHeuristicos.length,
        });

        return {
          materiales: materialesHeuristicos,
          applied: true,
        };
      }

      console.warn('[CoberturasAcceso] No se detectaron materiales para los catálogos permitidos del usuario.', {
        idUsuario,
        idArea,
        idCatalogoSolicitud,
        preferredCatalogColumn,
        catalogos: catalogosSeleccionados.map((catalogo) => ({
          id: catalogo.id,
          nombre: catalogo.nombre,
          idSource: catalogo.idSource ?? null,
          idCatalogoSolicitud: catalogo.idCatalogoSolicitud ?? null,
          idCatalogo: catalogo.idCatalogo ?? null,
        })),
      });

      return {
        materiales: [],
        applied: true,
      };
    }

    return {
      materiales: materiales.filter((material) => materialIds.has(Number(material.IdMaterial))),
      applied: true,
    };
  } catch (error) {
    console.error('Error filtrando materiales permitidos por cobertura', error);
    const materialesHeuristicos = filtrarMaterialesPorCatalogosHeuristico(
      materiales,
      catalogosSeleccionados.map((catalogo) => catalogo.nombre ?? ''),
    );

    if (materialesHeuristicos.length > 0) {
      return {
        materiales: materialesHeuristicos,
        applied: true,
      };
    }

    return {
      materiales: [],
      applied: true,
    };
  }
}

export async function obtenerImagenMaterialPorNumeroArticulo(
  numeroArticulo: string
): Promise<MaterialImagen | null> {
  const rows = await callSpMany<MaterialImagen>(
    'sp_ObtenerImagenMaterialPorNumeroArticulo',
    { NumeroArticulo: numeroArticulo }
  );

  return rows[0] ?? null;
}

export async function crearMaterial(input: {
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedida: string;
  GrupoArticulos?: string | null;
}): Promise<number> {
  const result = await callSpOne<{ IdMaterial: number }>('sp_CrearMaterial', {
    NumeroArticulo: input.NumeroArticulo,
    DescripcionArticulo: input.DescripcionArticulo,
    UnidadMedida: input.UnidadMedida,
    GrupoArticulos: input.GrupoArticulos ?? null,
  });
  return result?.IdMaterial ?? 0;
}

export async function actualizarMaterial(
  idMaterial: number,
  input: {
    NumeroArticulo: string;
    DescripcionArticulo: string;
    UnidadMedida: string;
    GrupoArticulos?: string | null;
  },
): Promise<void> {
  await callSpOne('sp_ActualizarMaterial', {
    IdMaterial: idMaterial,
    NumeroArticulo: input.NumeroArticulo,
    DescripcionArticulo: input.DescripcionArticulo,
    UnidadMedida: input.UnidadMedida,
    GrupoArticulos: input.GrupoArticulos ?? null,
  });
}

export async function eliminarMaterial(idMaterial: number): Promise<void> {
  await callSpOne('sp_EliminarMaterial', { IdMaterial: idMaterial });
}

export async function reactivarMaterial(idMaterial: number): Promise<ReactivarMaterialResult | null> {
  return callSpOne<ReactivarMaterialResult>('sp_ReactivarMaterial', { IdMaterial: idMaterial });
}

export async function importarMaterialesYStock(
  datos: MaterialImportRow[],
  idUsuario?: number,
  modo: 'ACTUALIZAR' | 'REEMPLAZAR' = 'ACTUALIZAR'
): Promise<void> {
  const pool = await getPool();
  const tvp = new sql.Table('dbo.TMaterialCarga');

  tvp.columns.add('NumeroArticulo', sql.NVarChar(50));
  tvp.columns.add('DescripcionArticulo', sql.NVarChar(255));
  tvp.columns.add('EnStock', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(50));
  tvp.columns.add('GrupoArticulos', sql.NVarChar(100));
  tvp.columns.add('UltimaFechaCompra', sql.Date);
  tvp.columns.add('UltimoPrecioCompra', sql.Decimal(18, 4));
  tvp.columns.add('UltimaMonedaCompra', sql.NVarChar(10));

  const tipoCambioUsdToCord = env.MATERIALES_TIPO_CAMBIO_USD_TO_CORD;

  const parseFecha = (value?: string | null): Date | null => {
    if (!value) return null;

    const str = String(value).trim();
    if (!str) return null;

    let y: number;
    let m: number;
    let d: number;

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      y = Number(isoMatch[1]);
      m = Number(isoMatch[2]);
      d = Number(isoMatch[3]);
    } else {
      const slashParts = str.split('/');
      if (slashParts.length === 3) {
        d = Number(slashParts[0]);
        m = Number(slashParts[1]);
        y = Number(slashParts[2]);
      } else {
        const dashParts = str.split('-');
        if (dashParts.length === 3) {
          y = Number(dashParts[0]);
          m = Number(dashParts[1]);
          d = Number(dashParts[2]);
        } else {
          return null;
        }
      }
    }

    if (!y || !m || !d) return null;

    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;

    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return null;
    }

    return date;
  };

  for (const row of datos) {
    const monedaOriginal = normalizeImportCurrency(row.UltimaMonedaCompra);
    const precioUsd = convertImportPriceToUsd(
      row.UltimoPrecioCompra,
      monedaOriginal,
      tipoCambioUsdToCord,
    );

    tvp.rows.add(
      row.NumeroArticulo,
      row.DescripcionArticulo,
      row.EnStock ?? 0,
      row.UnidadMedida,
      row.GrupoArticulos ?? null,
      parseFecha(row.UltimaFechaCompra ?? null),
      precioUsd,
      precioUsd === null ? null : 'USD',
    );
  }

  const request = pool.request();
  (request as any).timeout = env.DB_REQUEST_TIMEOUT_MS;
  request.input('Datos', tvp as any);
  if (idUsuario) {
    request.input('IdUsuario', sql.Int, idUsuario);
  }
  request.input('Modo', sql.NVarChar(20), modo);

  await request.execute('sp_ImportarMaterialesYStock');
}
