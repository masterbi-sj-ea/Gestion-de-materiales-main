const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_INPUT = 'imports/Usuarios & accesos de app materiales.xlsx';
const OUTPUT_SQL = path.resolve(__dirname, '../sql/manual/2026-04-01_migracion_coberturas_desde_excel.sql');
const OUTPUT_MD = path.resolve(__dirname, '../../docs/coberturas_excel_import_2026-04-01.md');

const BASE_COLUMNS = new Set(['Usuarios', 'Miembros', 'Áreas']);
const CATALOG_NAME_MAP = new Map([
  ['materiales y respuestos', 'Materiales y Repuestos'],
  ['materiales y repuestos', 'Materiales y Repuestos'],
  ['materiales y respuestos mtto', 'Materiales y Repuestos Mtto'],
  ['materiales y repuestos mtto', 'Materiales y Repuestos Mtto'],
  ['activos fijos', 'Activos Fijos'],
]);

const AREA_ALIAS_MAP = new Map([
  ['almacenamiento y despacho', ['Almacenaje y Despacho', 'DESP']],
  ['laboratorio', ['Laboratorio de Contril de Calidad', 'LAB']],
  ['recepcion de fruta', ['Recepción de fruta', 'RF']],
  ['tratamiento de agua', ['Tratamiento de Agua', 'TRAT.AGUA']],
  ['oficinas', ['Oficinas', 'OFIC']],
  ['administracion', ['Administración']],
  ['bascula', ['Báscula']],
]);

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isMarked(value) {
  const normalized = normalizeKey(value);
  return ['x', 'si', 'sí', '1', 'true'].includes(normalized);
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function toSqlNString(value) {
  return `N'${escapeSql(value)}'`;
}

function sanitizeSqlIdentifier(value) {
  return normalizeText(value).replace(/[^A-Za-z0-9]+/g, '_');
}

function joinHuman(items) {
  if (items.length === 0) return 'Sin datos';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function deriveCoverageName(group) {
  const sortedAreas = [...group.areas];
  const sortedCatalogs = [...group.catalogs];

  if (group.isGlobal && sortedCatalogs.length === 1 && sortedCatalogs[0] === 'Activos Fijos') {
    return 'Activos Fijos Global';
  }

  if (group.isGlobal) {
    const detail = sortedAreas.length > 0
      ? `Global / ${sortedAreas.join(' / ')}`
      : `Global / ${sortedCatalogs.join(' + ') || 'Sin catálogos'}`;
    return `Excel ${group.key} - ${detail}`;
  }

  if (sortedAreas.length === 0) {
    return `Excel ${group.key} - Sin áreas definidas`;
  }

  return `Excel ${group.key} - ${sortedAreas.join(' / ')}`;
}

function describeGroup(group) {
  const members = [...group.members];
  const areas = group.isGlobal
    ? ['Todas las áreas', ...group.areas]
    : [...group.areas];
  const catalogs = [...group.catalogs];

  return [
    `Migrado desde Excel de permisos. Grupo original: ${group.key}.`,
    `Filas Excel: ${group.rows.join(', ')}.`,
    `Miembros: ${members.length ? members.join('; ') : 'Sin miembros.'}.`,
    `Áreas: ${areas.length ? areas.join('; ') : 'Sin áreas.'}.`,
    `Catálogos: ${catalogs.length ? catalogs.join('; ') : 'Sin catálogos.'}.`,
  ].join(' ');
}

function lookupAreaSql(areaName) {
  const alternatives = [areaName, ...(AREA_ALIAS_MAP.get(normalizeKey(areaName)) || [])]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  const seen = new Set();
  const uniqueAlternatives = alternatives.filter((value) => {
    const key = normalizeKey(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const predicates = uniqueAlternatives.flatMap((value) => {
    const literal = toSqlNString(value);
    return [
      `LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = ${literal} COLLATE Latin1_General_CI_AI`,
      `LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = ${literal} COLLATE Latin1_General_CI_AI`,
      `ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + ${literal} + N'%'`,
    ];
  });

  const scoring = uniqueAlternatives.map((value, index) => {
    const literal = toSqlNString(value);
    return `WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = ${literal} COLLATE Latin1_General_CI_AI THEN ${index * 10}
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = ${literal} COLLATE Latin1_General_CI_AI THEN ${index * 10 + 1}
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + ${literal} + N'%' THEN ${index * 10 + 2}`;
  }).join('\n      ');

  return `(
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (${predicates.join('\n      OR ')})
    ORDER BY CASE
      ${scoring}
      ELSE 999
    END, a.IdArea
  )`;
}

function buildGroupBlocks(group) {
  const idVar = `@IdCobertura_${group.safeKey}`;
  const createTableVar = `@CoberturaCreada_${group.safeKey}`;
  const coverageNameLiteral = toSqlNString(group.name);
  const descriptionLiteral = toSqlNString(group.description);
  const lines = [];

  lines.push(`PRINT 'Procesando ${escapeSql(group.key)} -> ${escapeSql(group.name)}';`);
  lines.push(`DECLARE ${idVar} INT = NULL;`);
  lines.push(`DECLARE ${createTableVar} TABLE (IdCobertura INT);`);
  lines.push(`SELECT TOP (1) ${idVar} = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = ${coverageNameLiteral} COLLATE Latin1_General_CI_AI;`);
  lines.push(`IF ${idVar} IS NULL`);
  lines.push('BEGIN');
  lines.push('  BEGIN TRY');
  lines.push(`    INSERT INTO ${createTableVar} (IdCobertura)`);
  lines.push('    EXEC dbo.sp_CrearCoberturaAcceso');
  lines.push(`      @Nombre = ${coverageNameLiteral},`);
  lines.push(`      @Descripcion = ${descriptionLiteral},`);
  lines.push(`      @TipoAlcance = ${toSqlNString(group.scope)},`);
  lines.push('      @Activo = 1;');
  lines.push('  END TRY');
  lines.push('  BEGIN CATCH');
  lines.push('    BEGIN TRY');
  lines.push(`      INSERT INTO ${createTableVar} (IdCobertura)`);
  lines.push('      EXEC dbo.sp_CrearCoberturaAcceso');
  lines.push(`        @NombreCobertura = ${coverageNameLiteral},`);
  lines.push(`        @DescripcionCobertura = ${descriptionLiteral},`);
  lines.push(`        @Alcance = ${toSqlNString(group.scope)},`);
  lines.push('        @Vigente = 1;');
  lines.push('    END TRY');
  lines.push('    BEGIN CATCH');
  lines.push('      BEGIN TRY');
  lines.push(`        INSERT INTO ${createTableVar} (IdCobertura)`);
  lines.push('        EXEC dbo.sp_CrearCoberturaAcceso');
  lines.push(`          @NombreCobertura = ${coverageNameLiteral},`);
  lines.push(`          @Descripcion = ${descriptionLiteral},`);
  lines.push(`          @Alcance = ${toSqlNString(group.scope)},`);
  lines.push('          @Activo = 1;');
  lines.push('      END TRY');
  lines.push('      BEGIN CATCH');
  lines.push(`        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'COBERTURA', ${coverageNameLiteral}, ERROR_MESSAGE());`);
  lines.push('      END CATCH');
  lines.push('    END CATCH');
  lines.push('  END CATCH');
  lines.push(`  SELECT TOP (1) ${idVar} = IdCobertura FROM ${createTableVar};`);
  lines.push('END');
  lines.push(`IF ${idVar} IS NULL`);
  lines.push('BEGIN');
  lines.push(`  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'COBERTURA', ${coverageNameLiteral}, N'No se pudo crear o localizar la cobertura.');`);
  lines.push('END');
  lines.push('ELSE');
  lines.push('BEGIN');

  group.members.forEach((member, index) => {
    const userVar = `@IdUsuario_${group.safeKey}_${index + 1}`;
    const memberLiteral = toSqlNString(member);
    lines.push(`  DECLARE ${userVar} INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = ${memberLiteral} COLLATE Latin1_General_CI_AI);`);
    lines.push(`  IF ${userVar} IS NULL`);
    lines.push(`    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'USUARIO', ${memberLiteral}, N'Usuario no encontrado en dbo.Usuarios.');`);
    lines.push(`  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = ${idVar} AND cu.IdUsuario = ${userVar} AND ISNULL(cu.Activo, 1) = 1)`);
    lines.push('  BEGIN TRY');
    lines.push(`    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = ${userVar}, @IdCobertura = ${idVar};`);
    lines.push('  END TRY');
    lines.push('  BEGIN CATCH');
    lines.push('    IF ERROR_NUMBER() NOT IN (2601, 2627)');
    lines.push(`      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'USUARIO', ${memberLiteral}, ERROR_MESSAGE());`);
    lines.push('  END CATCH;');
  });

  if (!group.isGlobal) {
    group.areas.forEach((area, index) => {
      const areaVar = `@IdArea_${group.safeKey}_${index + 1}`;
      const areaLiteral = toSqlNString(area);
      lines.push(`  DECLARE ${areaVar} INT = ${lookupAreaSql(area)};`);
      lines.push(`  IF ${areaVar} IS NULL`);
      lines.push(`    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'AREA', ${areaLiteral}, N'Área no encontrada en dbo.Areas.');`);
      lines.push(`  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = ${idVar} AND ca.IdArea = ${areaVar} AND ISNULL(ca.Activo, 1) = 1)`);
      lines.push('  BEGIN TRY');
      lines.push(`    EXEC dbo.sp_AgregarAreaCobertura @IdArea = ${areaVar}, @IdCobertura = ${idVar};`);
      lines.push('  END TRY');
      lines.push('  BEGIN CATCH');
      lines.push('    IF ERROR_NUMBER() NOT IN (2601, 2627)');
      lines.push(`      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'AREA', ${areaLiteral}, ERROR_MESSAGE());`);
      lines.push('  END CATCH;');
    });
  }

  group.catalogs.forEach((catalog, index) => {
    const catalogVar = `@IdCatalogo_${group.safeKey}_${index + 1}`;
    const catalogLiteral = toSqlNString(catalog);
    lines.push(`  DECLARE ${catalogVar} INT;`);
    lines.push(`  SET ${catalogVar} = NULL;`);
    lines.push(`  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = ${catalogLiteral} COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';`);
    lines.push(`  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = ${catalogVar} OUTPUT;`);
    lines.push(`  IF ${catalogVar} IS NULL`);
    lines.push(`    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'CATALOGO', ${catalogLiteral}, N'Catálogo no encontrado en dbo.CatalogosSolicitud.');`);
    lines.push(`  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = ${idVar} AND cc.IdCatalogoSolicitud = ${catalogVar} AND ISNULL(cc.Activo, 1) = 1)`);
    lines.push('  BEGIN TRY');
    lines.push(`    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = ${catalogVar}, @IdCobertura = ${idVar};`);
    lines.push('  END TRY');
    lines.push('  BEGIN CATCH');
    lines.push('    IF ERROR_NUMBER() NOT IN (2601, 2627)');
    lines.push(`      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'CATALOGO', ${catalogLiteral}, ERROR_MESSAGE());`);
    lines.push('  END CATCH;');
  });

  if (group.warnings.length > 0) {
    group.warnings.forEach((warning, index) => {
      lines.push(`  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (${toSqlNString(group.key)}, N'ADVERTENCIA', ${toSqlNString(`warning_${index + 1}`)}, ${toSqlNString(warning)});`);
    });
  }

  lines.push('END');
  lines.push('');
  return lines.join('\n');
}

function buildSql(groups, sourceFile) {
  const header = `/*\n  Migración manual generada desde Excel de permisos.\n  Archivo fuente: ${sourceFile}\n  Coberturas detectadas: ${groups.length}\n\n  Convenciones de esta migración:\n  - Conserva el grupo original del Excel en la descripción.\n  - Usa nombres de cobertura derivados del grupo y sus áreas para que luego puedas renombrarlos en UI si quieres.\n  - Registra en @Pendientes los usuarios, áreas o catálogos que no pudo resolver.\n*/\n\nSET NOCOUNT ON;\n\nDECLARE @CatalogNameColumn SYSNAME = NULL;\nDECLARE @SqlCatalogo NVARCHAR(MAX) = NULL;\nDECLARE @Pendientes TABLE (\n  Grupo NVARCHAR(100),\n  Tipo NVARCHAR(50),\n  Valor NVARCHAR(255),\n  Detalle NVARCHAR(MAX)\n);\n\nIF COL_LENGTH('dbo.CatalogosSolicitud', 'NombreCatalogo') IS NOT NULL\n  SET @CatalogNameColumn = 'NombreCatalogo';\nELSE IF COL_LENGTH('dbo.CatalogosSolicitud', 'Nombre') IS NOT NULL\n  SET @CatalogNameColumn = 'Nombre';\nELSE\nBEGIN\n  RAISERROR('No se detectó una columna de nombre compatible en dbo.CatalogosSolicitud.', 16, 1);\n  RETURN;\nEND\n\nIF OBJECT_ID('dbo.CoberturasAcceso', 'U') IS NULL\n   OR OBJECT_ID('dbo.CoberturaUsuarios', 'U') IS NULL\n   OR OBJECT_ID('dbo.CoberturaAreas', 'U') IS NULL\n   OR OBJECT_ID('dbo.CoberturaCatalogos', 'U') IS NULL\nBEGIN\n  RAISERROR('No existen las tablas base de coberturas.', 16, 1);\n  RETURN;\nEND\n\n`;

  const body = groups.map((group) => buildGroupBlocks(group)).join('\n');

  const footer = `\nSELECT * FROM @Pendientes ORDER BY Grupo, Tipo, Valor;\n`;
  return `${header}${body}${footer}`;
}

function buildMarkdown(groups, sourceFile) {
  const lines = [];
  lines.push('# Resumen de Coberturas Importadas desde Excel');
  lines.push('');
  lines.push(`Archivo fuente: ${sourceFile}`);
  lines.push('');
  lines.push(`Coberturas detectadas: ${groups.length}`);
  lines.push('');

  groups.forEach((group) => {
    lines.push(`## ${group.name}`);
    lines.push('');
    lines.push(`- Grupo Excel: ${group.key}`);
    lines.push(`- Alcance: ${group.scope}`);
    lines.push(`- Filas: ${group.rows.join(', ')}`);
    lines.push(`- Miembros: ${group.members.length ? group.members.join('; ') : 'Sin miembros'}`);
    lines.push(`- Áreas: ${group.isGlobal ? ['Todas las áreas', ...group.areas].join('; ') : (group.areas.length ? group.areas.join('; ') : 'Sin áreas')}`);
    lines.push(`- Catálogos: ${group.catalogs.length ? group.catalogs.join('; ') : 'Sin catálogos'}`);
    if (group.warnings.length > 0) {
      lines.push(`- Advertencias: ${group.warnings.join(' | ')}`);
    }
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

function parseWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  const groups = new Map();
  let currentGroupKey = null;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const groupKey = normalizeText(row.Usuarios);
    if (groupKey) {
      currentGroupKey = groupKey;
    }

    if (!currentGroupKey) {
      return;
    }

    if (!groups.has(currentGroupKey)) {
      groups.set(currentGroupKey, {
        key: currentGroupKey,
        safeKey: sanitizeSqlIdentifier(currentGroupKey),
        rows: [],
        members: new Set(),
        areas: new Set(),
        catalogs: new Set(),
        warnings: [],
        isGlobal: false,
      });
    }

    const group = groups.get(currentGroupKey);
    group.rows.push(rowNumber);

    const member = normalizeText(row.Miembros);
    if (member) {
      group.members.add(member);
    }

    const area = normalizeText(row['Áreas']);
    if (area) {
      if (normalizeKey(area) === 'todas las areas') {
        group.isGlobal = true;
      } else {
        group.areas.add(area);
      }
    }

    for (const [key, value] of Object.entries(row)) {
      if (BASE_COLUMNS.has(key)) {
        continue;
      }

      if (!isMarked(value)) {
        continue;
      }

      const catalogName = CATALOG_NAME_MAP.get(normalizeKey(key)) || normalizeText(key);
      group.catalogs.add(catalogName);
    }
  });

  return [...groups.values()].map((group) => {
    const normalized = {
      key: group.key,
      safeKey: group.safeKey,
      rows: group.rows,
      members: [...group.members],
      areas: [...group.areas],
      catalogs: [...group.catalogs],
      isGlobal: group.isGlobal,
      warnings: [...group.warnings],
    };

    if (normalized.catalogs.length === 0) {
      normalized.warnings.push('No tiene catálogos marcados en el Excel.');
    }

    if (!normalized.isGlobal && normalized.areas.length === 0) {
      normalized.warnings.push('No tiene áreas específicas asociadas en el Excel.');
    }

    if (normalized.isGlobal && normalized.areas.length > 0) {
      normalized.warnings.push('Incluye "Todas las áreas" y además áreas específicas; la cobertura se generará como GLOBAL.');
    }

    normalized.name = deriveCoverageName(normalized);
    normalized.scope = normalized.isGlobal ? 'GLOBAL' : 'RESTRINGIDO';
    normalized.description = describeGroup(normalized);
    return normalized;
  });
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const input = process.argv[2] || DEFAULT_INPUT;
  const inputPath = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo Excel: ${inputPath}`);
  }

  const groups = parseWorkbook(inputPath);
  const sqlContent = buildSql(groups, inputPath);
  const markdownContent = buildMarkdown(groups, inputPath);

  ensureParentDir(OUTPUT_SQL);
  ensureParentDir(OUTPUT_MD);

  fs.writeFileSync(OUTPUT_SQL, sqlContent, 'utf8');
  fs.writeFileSync(OUTPUT_MD, markdownContent, 'utf8');

  console.log(JSON.stringify({
    input: inputPath,
    coverageCount: groups.length,
    sql: OUTPUT_SQL,
    markdown: OUTPUT_MD,
    groups: groups.map((group) => ({
      key: group.key,
      name: group.name,
      scope: group.scope,
      members: group.members.length,
      areas: group.areas.length,
      catalogs: group.catalogs,
      warnings: group.warnings,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}