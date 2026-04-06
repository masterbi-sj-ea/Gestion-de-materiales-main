/*
  Hardening manual para control de acceso por coberturas.
  Aplicar en la BD del ambiente correspondiente.

  Este script refleja la versión validada manualmente en SSMS
  para autorización por áreas basada en coberturas.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_UsuarioTieneAccesoArea
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
     OR OBJECT_ID('dbo.Areas', 'U') IS NULL
  BEGIN
    RAISERROR('No existen las tablas base de coberturas o áreas.', 16, 1);
    RETURN;
  END

  ;WITH CoberturasVigentes AS
  (
    SELECT DISTINCT
      c.IdCobertura,
      UPPER(ISNULL(c.TipoAlcance, 'RESTRINGIDO')) AS TipoAlcance
    FROM dbo.CoberturasAcceso c
    INNER JOIN dbo.CoberturaUsuarios cu
      ON cu.IdCobertura = c.IdCobertura
    INNER JOIN dbo.Usuarios u
      ON u.IdUsuario = cu.IdUsuario
    WHERE cu.IdUsuario = @IdUsuario
      AND ISNULL(u.Activo, 1) = 1
      AND ISNULL(c.Activo, 1) = 1
      AND ISNULL(cu.Activo, 1) = 1
      AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))
      AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))
  )
  SELECT CAST(
    CASE
      WHEN EXISTS
      (
        SELECT 1
        FROM dbo.Areas a
        WHERE a.IdArea = @IdArea
          AND ISNULL(a.Activo, 1) = 1
          AND
          (
            EXISTS
            (
              SELECT 1
              FROM CoberturasVigentes cv
              WHERE cv.TipoAlcance = 'GLOBAL'
            )
            OR EXISTS
            (
              SELECT 1
              FROM CoberturasVigentes cv
              INNER JOIN dbo.CoberturaAreas ca
                ON ca.IdCobertura = cv.IdCobertura
              WHERE cv.TipoAlcance <> 'GLOBAL'
                AND ISNULL(ca.Activo, 1) = 1
                AND ca.IdArea = @IdArea
            )
          )
      )
      THEN 1 ELSE 0
    END AS BIT
  ) AS TieneAcceso;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarAreasPermitidasPorUsuario
  @IdUsuario INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IdUsuario IS NULL OR @IdUsuario <= 0
  BEGIN
    RAISERROR('IdUsuario inválido.', 16, 1);
    RETURN;
  END

  IF OBJECT_ID('dbo.CoberturasAcceso', 'U') IS NULL
     OR OBJECT_ID('dbo.CoberturaUsuarios', 'U') IS NULL
     OR OBJECT_ID('dbo.CoberturaAreas', 'U') IS NULL
     OR OBJECT_ID('dbo.Areas', 'U') IS NULL
  BEGIN
    RAISERROR('No existen las tablas base de coberturas o áreas.', 16, 1);
    RETURN;
  END

  ;WITH CoberturasVigentes AS
  (
    SELECT DISTINCT
      c.IdCobertura,
      UPPER(ISNULL(c.TipoAlcance, 'RESTRINGIDO')) AS TipoAlcance
    FROM dbo.CoberturasAcceso c
    INNER JOIN dbo.CoberturaUsuarios cu
      ON cu.IdCobertura = c.IdCobertura
    INNER JOIN dbo.Usuarios u
      ON u.IdUsuario = cu.IdUsuario
    WHERE cu.IdUsuario = @IdUsuario
      AND ISNULL(u.Activo, 1) = 1
      AND ISNULL(c.Activo, 1) = 1
      AND ISNULL(cu.Activo, 1) = 1
      AND (cu.FechaInicio IS NULL OR cu.FechaInicio <= CAST(GETDATE() AS DATE))
      AND (cu.FechaFin IS NULL OR cu.FechaFin >= CAST(GETDATE() AS DATE))
  )
  SELECT DISTINCT
    a.IdArea,
    a.Codigo,
    a.Nombre,
    a.Descripcion,
    a.Activo,
    a.IdCentroCosto,
    cc.Nombre AS CentroCostoNombre
  FROM dbo.Areas a
  LEFT JOIN dbo.CentrosCosto cc
    ON cc.IdCentroCosto = a.IdCentroCosto
  WHERE ISNULL(a.Activo, 1) = 1
    AND
    (
      EXISTS
      (
        SELECT 1
        FROM CoberturasVigentes cv
        WHERE cv.TipoAlcance = 'GLOBAL'
      )
      OR EXISTS
      (
        SELECT 1
        FROM CoberturasVigentes cv
        INNER JOIN dbo.CoberturaAreas ca
          ON ca.IdCobertura = cv.IdCobertura
        WHERE cv.TipoAlcance <> 'GLOBAL'
          AND ISNULL(ca.Activo, 1) = 1
          AND ca.IdArea = a.IdArea
      )
    )
  ORDER BY a.Codigo, a.Nombre;
END
GO