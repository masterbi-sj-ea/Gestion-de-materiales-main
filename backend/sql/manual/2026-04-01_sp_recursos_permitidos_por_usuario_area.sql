/*
  Recursos permitidos por usuario y área según coberturas.

  Este SP detecta mapeos compatibles entre catálogo y material en estos patrones:
  - dbo.Materiales.IdCatalogoSolicitud
  - dbo.Materiales.IdCatalogo
  - dbo.MaterialCatalogo(IdMaterial, IdCatalogoSolicitud|IdCatalogo)
  - dbo.CatalogoMateriales(IdMaterial, IdCatalogoSolicitud|IdCatalogo)
  - dbo.MaterialesCatalogos(IdMaterial, IdCatalogoSolicitud|IdCatalogo)
  - dbo.MaterialCatalogos(IdMaterial, IdCatalogoSolicitud|IdCatalogo)
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarRecursosPermitidosPorUsuarioArea
  @IdUsuario INT,
  @IdArea INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IdUsuario IS NULL OR @IdUsuario <= 0 OR @IdArea IS NULL OR @IdArea <= 0
  BEGIN
    RAISERROR('IdUsuario e IdArea son requeridos.', 16, 1);
    RETURN;
  END

  IF OBJECT_ID('dbo.CoberturasAcceso', 'U') IS NULL
     OR OBJECT_ID('dbo.CoberturaUsuarios', 'U') IS NULL
     OR OBJECT_ID('dbo.CoberturaAreas', 'U') IS NULL
     OR OBJECT_ID('dbo.CoberturaCatalogos', 'U') IS NULL
     OR OBJECT_ID('dbo.AreaRecursoCuenta', 'U') IS NULL
     OR OBJECT_ID('dbo.Recursos', 'U') IS NULL
     OR OBJECT_ID('dbo.MaterialRecurso', 'U') IS NULL
  BEGIN
    RAISERROR('No existen las tablas base para resolver recursos permitidos por cobertura.', 16, 1);
    RETURN;
  END

  DECLARE @CoverageKey SYSNAME = NULL;
  DECLARE @CoverageCatalogColumn SYSNAME = NULL;
  DECLARE @CoverageScopeColumn SYSNAME = NULL;

  DECLARE @UsuariosJoin NVARCHAR(MAX) = N'';
  DECLARE @CoverageActiveCond NVARCHAR(MAX) = N'';
  DECLARE @UsuarioCoberturaActiveCond NVARCHAR(MAX) = N'';
  DECLARE @AreaCoberturaActiveCond NVARCHAR(MAX) = N'';
  DECLARE @CatalogoCoberturaActiveCond NVARCHAR(MAX) = N'';
  DECLARE @AreaRecursoActiveCond NVARCHAR(MAX) = N'';
  DECLARE @RecursoActiveCond NVARCHAR(MAX) = N'';
  DECLARE @MaterialRecursoActiveCond NVARCHAR(MAX) = N'';
  DECLARE @MaterialActiveCond NVARCHAR(MAX) = N'';
  DECLARE @CuFechaInicioCond NVARCHAR(MAX) = N'';
  DECLARE @CuFechaFinCond NVARCHAR(MAX) = N'';
  DECLARE @MaterialJoinSql NVARCHAR(MAX) = NULL;
  DECLARE @ScopeCondition NVARCHAR(MAX) = N'';
  DECLARE @Sql NVARCHAR(MAX) = N'';

  IF COL_LENGTH('dbo.CoberturasAcceso', 'IdCobertura') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios', 'IdCobertura') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas', 'IdCobertura') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaCatalogos', 'IdCobertura') IS NOT NULL
  BEGIN
    SET @CoverageKey = 'IdCobertura';
  END
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso', 'IdCoberturaAcceso') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios', 'IdCoberturaAcceso') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas', 'IdCoberturaAcceso') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaCatalogos', 'IdCoberturaAcceso') IS NOT NULL
  BEGIN
    SET @CoverageKey = 'IdCoberturaAcceso';
  END
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso', 'CoberturaId') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaUsuarios', 'CoberturaId') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaAreas', 'CoberturaId') IS NOT NULL
     AND COL_LENGTH('dbo.CoberturaCatalogos', 'CoberturaId') IS NOT NULL
  BEGIN
    SET @CoverageKey = 'CoberturaId';
  END

  IF @CoverageKey IS NULL
  BEGIN
    RAISERROR('No se detectó una llave común de cobertura entre CoberturasAcceso, CoberturaUsuarios, CoberturaAreas y CoberturaCatalogos.', 16, 1);
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturaCatalogos', 'IdCatalogoSolicitud') IS NOT NULL
    SET @CoverageCatalogColumn = 'IdCatalogoSolicitud';
  ELSE IF COL_LENGTH('dbo.CoberturaCatalogos', 'IdCatalogo') IS NOT NULL
    SET @CoverageCatalogColumn = 'IdCatalogo';

  IF @CoverageCatalogColumn IS NULL
  BEGIN
    RAISERROR('No se detectó una columna de catálogo compatible en dbo.CoberturaCatalogos.', 16, 1);
    RETURN;
  END

  IF COL_LENGTH('dbo.CoberturasAcceso', 'TipoAlcance') IS NOT NULL
    SET @CoverageScopeColumn = 'TipoAlcance';
  ELSE IF COL_LENGTH('dbo.CoberturasAcceso', 'Alcance') IS NOT NULL
    SET @CoverageScopeColumn = 'Alcance';

  IF OBJECT_ID('dbo.Usuarios', 'U') IS NOT NULL AND COL_LENGTH('dbo.Usuarios', 'IdUsuario') IS NOT NULL
  BEGIN
    SET @UsuariosJoin = N'
      INNER JOIN dbo.Usuarios u
        ON u.IdUsuario = cu.IdUsuario';

    IF COL_LENGTH('dbo.Usuarios', 'Activo') IS NOT NULL
      SET @UsuariosJoin += N' AND ISNULL(u.Activo, 1) = 1';
  END

  IF COL_LENGTH('dbo.CoberturasAcceso', 'Activo') IS NOT NULL
    SET @CoverageActiveCond = N' AND ISNULL(c.Activo, 1) = 1';
  IF COL_LENGTH('dbo.CoberturaUsuarios', 'Activo') IS NOT NULL
    SET @UsuarioCoberturaActiveCond = N' AND ISNULL(cu.Activo, 1) = 1';
  IF COL_LENGTH('dbo.CoberturaAreas', 'Activo') IS NOT NULL
    SET @AreaCoberturaActiveCond = N' AND ISNULL(ca.Activo, 1) = 1';
  IF COL_LENGTH('dbo.CoberturaCatalogos', 'Activo') IS NOT NULL
    SET @CatalogoCoberturaActiveCond = N' AND ISNULL(cc.Activo, 1) = 1';
  IF COL_LENGTH('dbo.AreaRecursoCuenta', 'Activo') IS NOT NULL
    SET @AreaRecursoActiveCond = N' AND ISNULL(arc.Activo, 1) = 1';
  IF COL_LENGTH('dbo.Recursos', 'Activo') IS NOT NULL
    SET @RecursoActiveCond = N' AND ISNULL(r.Activo, 1) = 1';
  IF COL_LENGTH('dbo.MaterialRecurso', 'Activo') IS NOT NULL
    SET @MaterialRecursoActiveCond = N' AND ISNULL(mr.Activo, 1) = 1';

  IF COL_LENGTH('dbo.CoberturaUsuarios', 'FechaInicio') IS NOT NULL
    SET @CuFechaInicioCond = N' AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))';
  IF COL_LENGTH('dbo.CoberturaUsuarios', 'FechaFin') IS NOT NULL
    SET @CuFechaFinCond = N' AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))';

  IF COL_LENGTH('dbo.Materiales', 'Activo') IS NOT NULL
    SET @MaterialActiveCond = N' AND ISNULL(m.Activo, 1) = 1';

  IF COL_LENGTH('dbo.Materiales', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.Materiales', 'IdCatalogoSolicitud') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.Materiales m
      ON m.IdCatalogoSolicitud = cv.CatalogoId' + @MaterialActiveCond + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = m.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF COL_LENGTH('dbo.Materiales', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.Materiales', 'IdCatalogo') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.Materiales m
      ON m.IdCatalogo = cv.CatalogoId' + @MaterialActiveCond + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = m.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.MaterialCatalogo', 'U') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogo', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogo', 'IdCatalogoSolicitud') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.MaterialCatalogo mc
      ON mc.IdCatalogoSolicitud = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.MaterialCatalogo', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.MaterialCatalogo', 'U') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogo', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogo', 'IdCatalogo') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.MaterialCatalogo mc
      ON mc.IdCatalogo = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.MaterialCatalogo', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.CatalogoMateriales', 'U') IS NOT NULL AND COL_LENGTH('dbo.CatalogoMateriales', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.CatalogoMateriales', 'IdCatalogoSolicitud') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.CatalogoMateriales mc
      ON mc.IdCatalogoSolicitud = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.CatalogoMateriales', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.CatalogoMateriales', 'U') IS NOT NULL AND COL_LENGTH('dbo.CatalogoMateriales', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.CatalogoMateriales', 'IdCatalogo') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.CatalogoMateriales mc
      ON mc.IdCatalogo = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.CatalogoMateriales', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.MaterialesCatalogos', 'U') IS NOT NULL AND COL_LENGTH('dbo.MaterialesCatalogos', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.MaterialesCatalogos', 'IdCatalogoSolicitud') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.MaterialesCatalogos mc
      ON mc.IdCatalogoSolicitud = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.MaterialesCatalogos', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.MaterialesCatalogos', 'U') IS NOT NULL AND COL_LENGTH('dbo.MaterialesCatalogos', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.MaterialesCatalogos', 'IdCatalogo') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.MaterialesCatalogos mc
      ON mc.IdCatalogo = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.MaterialesCatalogos', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.MaterialCatalogos', 'U') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogos', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogos', 'IdCatalogoSolicitud') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.MaterialCatalogos mc
      ON mc.IdCatalogoSolicitud = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.MaterialCatalogos', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END
  ELSE IF OBJECT_ID('dbo.MaterialCatalogos', 'U') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogos', 'IdMaterial') IS NOT NULL AND COL_LENGTH('dbo.MaterialCatalogos', 'IdCatalogo') IS NOT NULL
  BEGIN
    SET @MaterialJoinSql = N'
    INNER JOIN dbo.MaterialCatalogos mc
      ON mc.IdCatalogo = cv.CatalogoId' + CASE WHEN COL_LENGTH('dbo.MaterialCatalogos', 'Activo') IS NOT NULL THEN N' AND ISNULL(mc.Activo, 1) = 1' ELSE N'' END + N'
    INNER JOIN dbo.MaterialRecurso mr
      ON mr.IdMaterial = mc.IdMaterial' + @MaterialRecursoActiveCond;
  END

  IF @MaterialJoinSql IS NULL
  BEGIN
    RAISERROR('No se detectó un mapeo compatible catálogo->material. Revise Materiales.IdCatalogoSolicitud/IdCatalogo o tablas MaterialCatalogo/CatalogoMateriales/MaterialesCatalogos/MaterialCatalogos.', 16, 1);
    RETURN;
  END

  IF @CoverageScopeColumn IS NOT NULL
  BEGIN
    SET @ScopeCondition = N'
        AND (
          UPPER(CONVERT(NVARCHAR(50), ISNULL(c.' + QUOTENAME(@CoverageScopeColumn) + N', ''RESTRINGIDO''))) = ''GLOBAL''
          OR (ca.IdArea = @IdArea' + @AreaCoberturaActiveCond + N')
        )';
  END
  ELSE
  BEGIN
    SET @ScopeCondition = N'
        AND ca.IdArea = @IdArea' + @AreaCoberturaActiveCond;
  END

  SET @Sql = N'
    WITH CoberturasVigentes AS (
      SELECT DISTINCT
        cc.' + QUOTENAME(@CoverageCatalogColumn) + N' AS CatalogoId
      FROM dbo.CoberturaUsuarios cu
      INNER JOIN dbo.CoberturasAcceso c
        ON c.' + QUOTENAME(@CoverageKey) + N' = cu.' + QUOTENAME(@CoverageKey) + N'' + @CoverageActiveCond + @UsuariosJoin + N'
      LEFT JOIN dbo.CoberturaAreas ca
        ON ca.' + QUOTENAME(@CoverageKey) + N' = c.' + QUOTENAME(@CoverageKey) + N'
      INNER JOIN dbo.CoberturaCatalogos cc
        ON cc.' + QUOTENAME(@CoverageKey) + N' = c.' + QUOTENAME(@CoverageKey) + N'' + @CatalogoCoberturaActiveCond + N'
      WHERE cu.IdUsuario = @IdUsuario' + @UsuarioCoberturaActiveCond + @CuFechaInicioCond + @CuFechaFinCond + @ScopeCondition + N'
    )
    SELECT
      r.IdRecurso,
      r.Nombre,
      arc.CodigoCuenta,
      arc.NombreCuenta,
      MIN(cv.CatalogoId) AS IdCatalogoSolicitud
    FROM CoberturasVigentes cv' + @MaterialJoinSql + N'
    INNER JOIN dbo.AreaRecursoCuenta arc
      ON arc.IdArea = @IdArea
     AND arc.IdRecurso = mr.IdRecurso' + @AreaRecursoActiveCond + N'
    INNER JOIN dbo.Recursos r
      ON r.IdRecurso = arc.IdRecurso' + @RecursoActiveCond + N'
    GROUP BY r.IdRecurso, r.Nombre, arc.CodigoCuenta, arc.NombreCuenta
    ORDER BY r.Nombre;';

  EXEC sp_executesql
    @Sql,
    N'@IdUsuario INT, @IdArea INT',
    @IdUsuario = @IdUsuario,
    @IdArea = @IdArea;
END
GO

/*
  Ejemplo de prueba:
  EXEC dbo.sp_ListarRecursosPermitidosPorUsuarioArea @IdUsuario = 3, @IdArea = 19;
*/