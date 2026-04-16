/*
Diagnóstico de cuenta por Usuario + Área + Catálogo.

Uso:
1) Ajusta los 3 parámetros de abajo.
2) Ejecuta el script completo.
3) Pégame todos los resultsets.

Objetivo:
- Confirmar si el usuario tiene cobertura activa sobre el área y el catálogo.
- Confirmar si el catálogo tiene materiales en MaterialCatalogo.
- Confirmar qué recursos salen desde MaterialRecurso para esos materiales.
- Confirmar cuántos CodigoCuenta distintos devuelve AreaRecursoCuenta para esa combinación.
*/

SET NOCOUNT ON;

DECLARE @IdUsuario INT = 0;
DECLARE @IdArea INT = 0;
DECLARE @IdCatalogoSolicitud INT = 0;

IF @IdUsuario <= 0 OR @IdArea <= 0 OR @IdCatalogoSolicitud <= 0
BEGIN
  RAISERROR('Debes asignar @IdUsuario, @IdArea y @IdCatalogoSolicitud antes de ejecutar el script.', 16, 1);
  RETURN;
END;

IF OBJECT_ID('dbo.CatalogosSolicitud', 'U') IS NULL
   OR OBJECT_ID('dbo.MaterialCatalogo', 'U') IS NULL
   OR OBJECT_ID('dbo.Materiales', 'U') IS NULL
   OR OBJECT_ID('dbo.MaterialRecurso', 'U') IS NULL
   OR OBJECT_ID('dbo.AreaRecursoCuenta', 'U') IS NULL
   OR OBJECT_ID('dbo.Recursos', 'U') IS NULL
BEGIN
  RAISERROR('Faltan tablas base esperadas: CatalogosSolicitud, MaterialCatalogo, Materiales, MaterialRecurso, AreaRecursoCuenta o Recursos.', 16, 1);
  RETURN;
END;

SELECT
  @IdUsuario AS IdUsuario,
  @IdArea AS IdArea,
  @IdCatalogoSolicitud AS IdCatalogoSolicitud;

SELECT TOP (1)
  a.IdArea,
  a.Nombre AS AreaNombre,
  a.Codigo AS AreaCodigo,
  a.IdCentroCosto,
  a.CodigoCuenta AS CodigoCuentaArea
FROM dbo.Areas a
WHERE a.IdArea = @IdArea;

SELECT TOP (1)
  c.IdCatalogoSolicitud,
  c.NombreCatalogo,
  c.Descripcion,
  c.Activo
FROM dbo.CatalogosSolicitud c
WHERE c.IdCatalogoSolicitud = @IdCatalogoSolicitud;

/* 1. Cobertura activa del usuario para el área */
IF OBJECT_ID('dbo.CoberturasAcceso', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.CoberturaUsuarios', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.CoberturaAreas', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.CoberturaCatalogos', 'U') IS NOT NULL
BEGIN
  SELECT DISTINCT
    c.IdCobertura,
    c.Nombre AS CoberturaNombre,
    c.Alcance,
    cu.IdUsuario,
    cu.FechaInicio,
    cu.FechaFin,
    ca.IdArea,
    cc.IdCatalogoSolicitud,
    cat.NombreCatalogo
  FROM dbo.CoberturaUsuarios cu
  INNER JOIN dbo.CoberturasAcceso c
    ON c.IdCobertura = cu.IdCobertura
  INNER JOIN dbo.CoberturaAreas ca
    ON ca.IdCobertura = c.IdCobertura
  INNER JOIN dbo.CoberturaCatalogos cc
    ON cc.IdCobertura = c.IdCobertura
  LEFT JOIN dbo.CatalogosSolicitud cat
    ON cat.IdCatalogoSolicitud = cc.IdCatalogoSolicitud
  WHERE cu.IdUsuario = @IdUsuario
    AND ca.IdArea = @IdArea
    AND cc.IdCatalogoSolicitud = @IdCatalogoSolicitud
    AND ISNULL(c.Activo, 1) = 1
    AND ISNULL(cu.Activo, 1) = 1
    AND ISNULL(ca.Activo, 1) = 1
    AND ISNULL(cc.Activo, 1) = 1
    AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))
    AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE));
END
ELSE
BEGIN
  SELECT 'Cobertura* no existe con el esquema esperado en esta BD' AS CoberturaDiagnostico;
END;

/* 2. Materiales asociados al catálogo */
SELECT
  COUNT(*) AS FilasMaterialCatalogo,
  COUNT(DISTINCT mc.IdMaterial) AS MaterialesDistintos
FROM dbo.MaterialCatalogo mc
WHERE mc.IdCatalogoSolicitud = @IdCatalogoSolicitud
  AND ISNULL(mc.Activo, 1) = 1;

SELECT TOP (100)
  mc.IdMaterial,
  m.NumeroArticulo,
  m.DescripcionArticulo,
  m.GrupoArticulos,
  mc.IdCatalogoSolicitud,
  mc.Activo,
  mc.FechaAsignacion
FROM dbo.MaterialCatalogo mc
INNER JOIN dbo.Materiales m
  ON m.IdMaterial = mc.IdMaterial
WHERE mc.IdCatalogoSolicitud = @IdCatalogoSolicitud
  AND ISNULL(mc.Activo, 1) = 1
ORDER BY m.NumeroArticulo;

/* 3. Recursos de esos materiales en el área */
;WITH MaterialesCatalogo AS (
  SELECT DISTINCT mc.IdMaterial
  FROM dbo.MaterialCatalogo mc
  WHERE mc.IdCatalogoSolicitud = @IdCatalogoSolicitud
    AND ISNULL(mc.Activo, 1) = 1
), RecursosCatalogoArea AS (
  SELECT DISTINCT
    mc.IdMaterial,
    mr.IdRecurso,
    r.Nombre AS RecursoNombre,
    NULLIF(LTRIM(RTRIM(arc.CodigoCuenta)), '') AS CodigoCuenta,
    NULLIF(LTRIM(RTRIM(arc.NombreCuenta)), '') AS NombreCuenta
  FROM MaterialesCatalogo mc
  INNER JOIN dbo.MaterialRecurso mr
    ON mr.IdMaterial = mc.IdMaterial
   AND ISNULL(mr.Activo, 1) = 1
  INNER JOIN dbo.AreaRecursoCuenta arc
    ON arc.IdArea = @IdArea
   AND arc.IdRecurso = mr.IdRecurso
   AND ISNULL(arc.Activo, 1) = 1
  INNER JOIN dbo.Recursos r
    ON r.IdRecurso = arc.IdRecurso
   AND ISNULL(r.Activo, 1) = 1
)
SELECT
  COUNT(DISTINCT IdMaterial) AS MaterialesConRecurso,
  COUNT(DISTINCT IdRecurso) AS RecursosDistintos,
  COUNT(DISTINCT CodigoCuenta) AS CodigosCuentaDistintos
FROM RecursosCatalogoArea;

;WITH MaterialesCatalogo AS (
  SELECT DISTINCT mc.IdMaterial
  FROM dbo.MaterialCatalogo mc
  WHERE mc.IdCatalogoSolicitud = @IdCatalogoSolicitud
    AND ISNULL(mc.Activo, 1) = 1
), RecursosCatalogoArea AS (
  SELECT DISTINCT
    mc.IdMaterial,
    mr.IdRecurso,
    r.Nombre AS RecursoNombre,
    NULLIF(LTRIM(RTRIM(arc.CodigoCuenta)), '') AS CodigoCuenta,
    NULLIF(LTRIM(RTRIM(arc.NombreCuenta)), '') AS NombreCuenta
  FROM MaterialesCatalogo mc
  INNER JOIN dbo.MaterialRecurso mr
    ON mr.IdMaterial = mc.IdMaterial
   AND ISNULL(mr.Activo, 1) = 1
  INNER JOIN dbo.AreaRecursoCuenta arc
    ON arc.IdArea = @IdArea
   AND arc.IdRecurso = mr.IdRecurso
   AND ISNULL(arc.Activo, 1) = 1
  INNER JOIN dbo.Recursos r
    ON r.IdRecurso = arc.IdRecurso
   AND ISNULL(r.Activo, 1) = 1
)
SELECT
  IdRecurso,
  RecursoNombre,
  CodigoCuenta,
  NombreCuenta,
  COUNT(DISTINCT IdMaterial) AS MaterialesQueCaenEnEsteRecurso
FROM RecursosCatalogoArea
GROUP BY IdRecurso, RecursoNombre, CodigoCuenta, NombreCuenta
ORDER BY CodigoCuenta, RecursoNombre;

;WITH MaterialesCatalogo AS (
  SELECT DISTINCT mc.IdMaterial
  FROM dbo.MaterialCatalogo mc
  WHERE mc.IdCatalogoSolicitud = @IdCatalogoSolicitud
    AND ISNULL(mc.Activo, 1) = 1
)
SELECT TOP (200)
  m.IdMaterial,
  m.NumeroArticulo,
  m.DescripcionArticulo,
  mr.IdRecurso,
  r.Nombre AS RecursoNombre,
  NULLIF(LTRIM(RTRIM(arc.CodigoCuenta)), '') AS CodigoCuenta,
  NULLIF(LTRIM(RTRIM(arc.NombreCuenta)), '') AS NombreCuenta
FROM MaterialesCatalogo mc
INNER JOIN dbo.Materiales m
  ON m.IdMaterial = mc.IdMaterial
INNER JOIN dbo.MaterialRecurso mr
  ON mr.IdMaterial = mc.IdMaterial
 AND ISNULL(mr.Activo, 1) = 1
INNER JOIN dbo.AreaRecursoCuenta arc
  ON arc.IdArea = @IdArea
 AND arc.IdRecurso = mr.IdRecurso
 AND ISNULL(arc.Activo, 1) = 1
INNER JOIN dbo.Recursos r
  ON r.IdRecurso = arc.IdRecurso
 AND ISNULL(r.Activo, 1) = 1
ORDER BY CodigoCuenta, RecursoNombre, m.NumeroArticulo;

/* 4. Comparación contra columnas legacy en Materiales, si existen */
IF COL_LENGTH('dbo.Materiales', 'IdCatalogoSolicitud') IS NOT NULL
BEGIN
  SELECT
    COUNT(*) AS MaterialesConIdCatalogoSolicitudLegacy
  FROM dbo.Materiales m
  WHERE TRY_CONVERT(INT, m.IdCatalogoSolicitud) = @IdCatalogoSolicitud;
END;

IF COL_LENGTH('dbo.Materiales', 'IdCatalogo') IS NOT NULL
BEGIN
  SELECT
    COUNT(*) AS MaterialesConIdCatalogoLegacy
  FROM dbo.Materiales m
  WHERE TRY_CONVERT(INT, m.IdCatalogo) = @IdCatalogoSolicitud;
END;