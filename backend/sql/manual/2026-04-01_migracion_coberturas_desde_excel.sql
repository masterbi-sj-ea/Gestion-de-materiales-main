/*
  Migración manual generada desde Excel de permisos.
  Archivo fuente: C:\Users\drivas\Desktop\Gestion-de-materiales-main1\backend\imports\Usuarios & accesos de app materiales.xlsx
  Coberturas detectadas: 10

  Convenciones de esta migración:
  - Conserva el grupo original del Excel en la descripción.
  - Usa nombres de cobertura derivados del grupo y sus áreas para que luego puedas renombrarlos en UI si quieres.
  - Registra en @Pendientes los usuarios, áreas o catálogos que no pudo resolver.
*/

SET NOCOUNT ON;

DECLARE @CatalogNameColumn SYSNAME = NULL;
DECLARE @SqlCatalogo NVARCHAR(MAX) = NULL;
DECLARE @Pendientes TABLE (
  Grupo NVARCHAR(100),
  Tipo NVARCHAR(50),
  Valor NVARCHAR(255),
  Detalle NVARCHAR(MAX)
);

IF COL_LENGTH('dbo.CatalogosSolicitud', 'NombreCatalogo') IS NOT NULL
  SET @CatalogNameColumn = 'NombreCatalogo';
ELSE IF COL_LENGTH('dbo.CatalogosSolicitud', 'Nombre') IS NOT NULL
  SET @CatalogNameColumn = 'Nombre';
ELSE
BEGIN
  RAISERROR('No se detectó una columna de nombre compatible en dbo.CatalogosSolicitud.', 16, 1);
  RETURN;
END

IF OBJECT_ID('dbo.CoberturasAcceso', 'U') IS NULL
   OR OBJECT_ID('dbo.CoberturaUsuarios', 'U') IS NULL
   OR OBJECT_ID('dbo.CoberturaAreas', 'U') IS NULL
   OR OBJECT_ID('dbo.CoberturaCatalogos', 'U') IS NULL
BEGIN
  RAISERROR('No existen las tablas base de coberturas.', 16, 1);
  RETURN;
END

PRINT 'Procesando Usuario_1 -> Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado';
DECLARE @IdCobertura_Usuario_1 INT = NULL;
DECLARE @CoberturaCreada_Usuario_1 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_1 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_1 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_1 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_1. Filas Excel: 2, 3, 4. Miembros: Jonathan Aguilar; Wilmara Espinoza; Seyling Saenz. Áreas: Laguna y biodigestores; Riego Lexiviado. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_1 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_1. Filas Excel: 2, 3, 4. Miembros: Jonathan Aguilar; Wilmara Espinoza; Seyling Saenz. Áreas: Laguna y biodigestores; Riego Lexiviado. Catálogos: Materiales y Repuestos.',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_1 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_1. Filas Excel: 2, 3, 4. Miembros: Jonathan Aguilar; Wilmara Espinoza; Seyling Saenz. Áreas: Laguna y biodigestores; Riego Lexiviado. Catálogos: Materiales y Repuestos.',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'COBERTURA', N'Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_1 = IdCobertura FROM @CoberturaCreada_Usuario_1;
END
IF @IdCobertura_Usuario_1 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'COBERTURA', N'Excel Usuario_1 - Laguna y biodigestores / Riego Lexiviado', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_1_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Jonathan Aguilar' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_1_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'USUARIO', N'Jonathan Aguilar', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_1 AND cu.IdUsuario = @IdUsuario_Usuario_1_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_1_1, @IdCobertura = @IdCobertura_Usuario_1;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'USUARIO', N'Jonathan Aguilar', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_1_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Wilmara Espinoza' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_1_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'USUARIO', N'Wilmara Espinoza', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_1 AND cu.IdUsuario = @IdUsuario_Usuario_1_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_1_2, @IdCobertura = @IdCobertura_Usuario_1;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'USUARIO', N'Wilmara Espinoza', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_1_3 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Seyling Saenz' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_1_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'USUARIO', N'Seyling Saenz', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_1 AND cu.IdUsuario = @IdUsuario_Usuario_1_3 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_1_3, @IdCobertura = @IdCobertura_Usuario_1;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'USUARIO', N'Seyling Saenz', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_1_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Laguna y biodigestores' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Laguna y biodigestores' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Laguna y biodigestores' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Laguna y biodigestores' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Laguna y biodigestores' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Laguna y biodigestores' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_1_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'AREA', N'Laguna y biodigestores', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_1 AND ca.IdArea = @IdArea_Usuario_1_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_1_1, @IdCobertura = @IdCobertura_Usuario_1;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'AREA', N'Laguna y biodigestores', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_1_2 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Riego Lexiviado' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Riego Lexiviado' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Riego Lexiviado' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Riego Lexiviado' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Riego Lexiviado' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Riego Lexiviado' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_1_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'AREA', N'Riego Lexiviado', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_1 AND ca.IdArea = @IdArea_Usuario_1_2 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_1_2, @IdCobertura = @IdCobertura_Usuario_1;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'AREA', N'Riego Lexiviado', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_1_1 INT;
  SET @IdCatalogo_Usuario_1_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_1_1 OUTPUT;
  IF @IdCatalogo_Usuario_1_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_1 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_1_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_1_1, @IdCobertura = @IdCobertura_Usuario_1;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_1', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_2 -> Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula';
DECLARE @IdCobertura_Usuario_2 INT = NULL;
DECLARE @CoberturaCreada_Usuario_2 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_2 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_2 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_2 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_2. Filas Excel: 5, 6, 7, 8, 9, 10. Miembros: Paola Lopez; Jerry Murillo; Sayder Jalina; Myrtle Saenz. Áreas: Tratamiento de agua; Recepción de fruta; Almacenamiento y Despacho; Laboratorio; Báscula. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_2 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_2. Filas Excel: 5, 6, 7, 8, 9, 10. Miembros: Paola Lopez; Jerry Murillo; Sayder Jalina; Myrtle Saenz. Áreas: Tratamiento de agua; Recepción de fruta; Almacenamiento y Despacho; Laboratorio; Báscula. Catálogos: Materiales y Repuestos.',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_2 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_2. Filas Excel: 5, 6, 7, 8, 9, 10. Miembros: Paola Lopez; Jerry Murillo; Sayder Jalina; Myrtle Saenz. Áreas: Tratamiento de agua; Recepción de fruta; Almacenamiento y Despacho; Laboratorio; Báscula. Catálogos: Materiales y Repuestos.',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'COBERTURA', N'Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_2 = IdCobertura FROM @CoberturaCreada_Usuario_2;
END
IF @IdCobertura_Usuario_2 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'COBERTURA', N'Excel Usuario_2 - Tratamiento de agua / Recepción de fruta / Almacenamiento y Despacho / Laboratorio / Báscula', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_2_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Paola Lopez' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_2_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Paola Lopez', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_2 AND cu.IdUsuario = @IdUsuario_Usuario_2_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_2_1, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Paola Lopez', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_2_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Jerry Murillo' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_2_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Jerry Murillo', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_2 AND cu.IdUsuario = @IdUsuario_Usuario_2_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_2_2, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Jerry Murillo', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_2_3 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Sayder Jalina' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_2_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Sayder Jalina', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_2 AND cu.IdUsuario = @IdUsuario_Usuario_2_3 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_2_3, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Sayder Jalina', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_2_4 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Myrtle Saenz' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_2_4 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Myrtle Saenz', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_2 AND cu.IdUsuario = @IdUsuario_Usuario_2_4 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_2_4, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'USUARIO', N'Myrtle Saenz', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_2_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Tratamiento de agua' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Tratamiento de agua' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Tratamiento de agua' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'TRAT.AGUA' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'TRAT.AGUA' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'TRAT.AGUA' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Tratamiento de agua' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Tratamiento de agua' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Tratamiento de agua' + N'%' THEN 2
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'TRAT.AGUA' COLLATE Latin1_General_CI_AI THEN 10
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'TRAT.AGUA' COLLATE Latin1_General_CI_AI THEN 11
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'TRAT.AGUA' + N'%' THEN 12
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_2_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Tratamiento de agua', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_2 AND ca.IdArea = @IdArea_Usuario_2_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_2_1, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Tratamiento de agua', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_2_2 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Recepción de fruta' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Recepción de fruta' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Recepción de fruta' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'RF' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'RF' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'RF' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Recepción de fruta' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Recepción de fruta' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Recepción de fruta' + N'%' THEN 2
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'RF' COLLATE Latin1_General_CI_AI THEN 10
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'RF' COLLATE Latin1_General_CI_AI THEN 11
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'RF' + N'%' THEN 12
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_2_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Recepción de fruta', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_2 AND ca.IdArea = @IdArea_Usuario_2_2 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_2_2, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Recepción de fruta', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_2_3 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Almacenamiento y Despacho' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Almacenamiento y Despacho' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Almacenamiento y Despacho' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Almacenaje y Despacho' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Almacenaje y Despacho' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Almacenaje y Despacho' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'DESP' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'DESP' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'DESP' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Almacenamiento y Despacho' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Almacenamiento y Despacho' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Almacenamiento y Despacho' + N'%' THEN 2
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Almacenaje y Despacho' COLLATE Latin1_General_CI_AI THEN 10
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Almacenaje y Despacho' COLLATE Latin1_General_CI_AI THEN 11
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Almacenaje y Despacho' + N'%' THEN 12
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'DESP' COLLATE Latin1_General_CI_AI THEN 20
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'DESP' COLLATE Latin1_General_CI_AI THEN 21
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'DESP' + N'%' THEN 22
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_2_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Almacenamiento y Despacho', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_2 AND ca.IdArea = @IdArea_Usuario_2_3 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_2_3, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Almacenamiento y Despacho', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_2_4 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Laboratorio' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio de Contril de Calidad' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio de Contril de Calidad' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Laboratorio de Contril de Calidad' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'LAB' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'LAB' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'LAB' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Laboratorio' + N'%' THEN 2
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio de Contril de Calidad' COLLATE Latin1_General_CI_AI THEN 10
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Laboratorio de Contril de Calidad' COLLATE Latin1_General_CI_AI THEN 11
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Laboratorio de Contril de Calidad' + N'%' THEN 12
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'LAB' COLLATE Latin1_General_CI_AI THEN 20
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'LAB' COLLATE Latin1_General_CI_AI THEN 21
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'LAB' + N'%' THEN 22
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_2_4 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Laboratorio', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_2 AND ca.IdArea = @IdArea_Usuario_2_4 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_2_4, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Laboratorio', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_2_5 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Báscula' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Báscula' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Báscula' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Báscula' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Báscula' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Báscula' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_2_5 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Báscula', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_2 AND ca.IdArea = @IdArea_Usuario_2_5 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_2_5, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'AREA', N'Báscula', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_2_1 INT;
  SET @IdCatalogo_Usuario_2_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_2_1 OUTPUT;
  IF @IdCatalogo_Usuario_2_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_2 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_2_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_2_1, @IdCobertura = @IdCobertura_Usuario_2;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_2', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_3 -> Excel Usuario_3 - Bodega';
DECLARE @IdCobertura_Usuario_3 INT = NULL;
DECLARE @CoberturaCreada_Usuario_3 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_3 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_3 - Bodega' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_3 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_3 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_3 - Bodega',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_3. Filas Excel: 11. Miembros: Reynaldo Reyes. Áreas: Bodega. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_3 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_3 - Bodega',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_3. Filas Excel: 11. Miembros: Reynaldo Reyes. Áreas: Bodega. Catálogos: Materiales y Repuestos.',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_3 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_3 - Bodega',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_3. Filas Excel: 11. Miembros: Reynaldo Reyes. Áreas: Bodega. Catálogos: Materiales y Repuestos.',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'COBERTURA', N'Excel Usuario_3 - Bodega', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_3 = IdCobertura FROM @CoberturaCreada_Usuario_3;
END
IF @IdCobertura_Usuario_3 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'COBERTURA', N'Excel Usuario_3 - Bodega', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_3_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Reynaldo Reyes' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_3_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'USUARIO', N'Reynaldo Reyes', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_3 AND cu.IdUsuario = @IdUsuario_Usuario_3_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_3_1, @IdCobertura = @IdCobertura_Usuario_3;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'USUARIO', N'Reynaldo Reyes', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_3_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Bodega' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Bodega' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Bodega' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Bodega' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Bodega' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Bodega' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_3_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'AREA', N'Bodega', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_3 AND ca.IdArea = @IdArea_Usuario_3_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_3_1, @IdCobertura = @IdCobertura_Usuario_3;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'AREA', N'Bodega', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_3_1 INT;
  SET @IdCatalogo_Usuario_3_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_3_1 OUTPUT;
  IF @IdCatalogo_Usuario_3_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_3 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_3_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_3_1, @IdCobertura = @IdCobertura_Usuario_3;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_3', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_4 -> Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje';
DECLARE @IdCobertura_Usuario_4 INT = NULL;
DECLARE @CoberturaCreada_Usuario_4 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_4 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_4 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_4 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_4. Filas Excel: 12, 13, 14, 15. Miembros: Melvin; Diana Espinoza; Jerald Ramos. Áreas: Nutrifibra; PKO; Harina; Compostaje. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_4 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_4. Filas Excel: 12, 13, 14, 15. Miembros: Melvin; Diana Espinoza; Jerald Ramos. Áreas: Nutrifibra; PKO; Harina; Compostaje. Catálogos: Materiales y Repuestos.',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_4 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_4. Filas Excel: 12, 13, 14, 15. Miembros: Melvin; Diana Espinoza; Jerald Ramos. Áreas: Nutrifibra; PKO; Harina; Compostaje. Catálogos: Materiales y Repuestos.',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'COBERTURA', N'Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_4 = IdCobertura FROM @CoberturaCreada_Usuario_4;
END
IF @IdCobertura_Usuario_4 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'COBERTURA', N'Excel Usuario_4 - Nutrifibra / PKO / Harina / Compostaje', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_4_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Melvin' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_4_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'USUARIO', N'Melvin', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_4 AND cu.IdUsuario = @IdUsuario_Usuario_4_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_4_1, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'USUARIO', N'Melvin', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_4_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Diana Espinoza' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_4_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'USUARIO', N'Diana Espinoza', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_4 AND cu.IdUsuario = @IdUsuario_Usuario_4_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_4_2, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'USUARIO', N'Diana Espinoza', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_4_3 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Jerald Ramos' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_4_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'USUARIO', N'Jerald Ramos', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_4 AND cu.IdUsuario = @IdUsuario_Usuario_4_3 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_4_3, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'USUARIO', N'Jerald Ramos', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_4_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Nutrifibra' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Nutrifibra' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Nutrifibra' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Nutrifibra' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Nutrifibra' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Nutrifibra' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_4_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'Nutrifibra', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_4 AND ca.IdArea = @IdArea_Usuario_4_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_4_1, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'Nutrifibra', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_4_2 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'PKO' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'PKO' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'PKO' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'PKO' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'PKO' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'PKO' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_4_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'PKO', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_4 AND ca.IdArea = @IdArea_Usuario_4_2 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_4_2, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'PKO', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_4_3 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Harina' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Harina' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Harina' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Harina' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Harina' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Harina' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_4_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'Harina', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_4 AND ca.IdArea = @IdArea_Usuario_4_3 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_4_3, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'Harina', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_4_4 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Compostaje' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Compostaje' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Compostaje' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Compostaje' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Compostaje' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Compostaje' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_4_4 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'Compostaje', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_4 AND ca.IdArea = @IdArea_Usuario_4_4 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_4_4, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'AREA', N'Compostaje', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_4_1 INT;
  SET @IdCatalogo_Usuario_4_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_4_1 OUTPUT;
  IF @IdCatalogo_Usuario_4_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_4 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_4_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_4_1, @IdCobertura = @IdCobertura_Usuario_4;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_4', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_5 -> Excel Usuario_5 - HSO';
DECLARE @IdCobertura_Usuario_5 INT = NULL;
DECLARE @CoberturaCreada_Usuario_5 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_5 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_5 - HSO' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_5 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_5 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_5 - HSO',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_5. Filas Excel: 16, 17. Miembros: Isabon Aragón; Janier Meza. Áreas: HSO. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_5 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_5 - HSO',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_5. Filas Excel: 16, 17. Miembros: Isabon Aragón; Janier Meza. Áreas: HSO. Catálogos: Materiales y Repuestos.',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_5 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_5 - HSO',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_5. Filas Excel: 16, 17. Miembros: Isabon Aragón; Janier Meza. Áreas: HSO. Catálogos: Materiales y Repuestos.',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'COBERTURA', N'Excel Usuario_5 - HSO', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_5 = IdCobertura FROM @CoberturaCreada_Usuario_5;
END
IF @IdCobertura_Usuario_5 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'COBERTURA', N'Excel Usuario_5 - HSO', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_5_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Isabon Aragón' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_5_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'USUARIO', N'Isabon Aragón', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_5 AND cu.IdUsuario = @IdUsuario_Usuario_5_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_5_1, @IdCobertura = @IdCobertura_Usuario_5;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'USUARIO', N'Isabon Aragón', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_5_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Janier Meza' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_5_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'USUARIO', N'Janier Meza', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_5 AND cu.IdUsuario = @IdUsuario_Usuario_5_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_5_2, @IdCobertura = @IdCobertura_Usuario_5;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'USUARIO', N'Janier Meza', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_5_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'HSO' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'HSO' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'HSO' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'HSO' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'HSO' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'HSO' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_5_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'AREA', N'HSO', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_5 AND ca.IdArea = @IdArea_Usuario_5_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_5_1, @IdCobertura = @IdCobertura_Usuario_5;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'AREA', N'HSO', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_5_1 INT;
  SET @IdCatalogo_Usuario_5_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_5_1 OUTPUT;
  IF @IdCatalogo_Usuario_5_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_5 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_5_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_5_1, @IdCobertura = @IdCobertura_Usuario_5;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_5', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_6 -> Excel Usuario_6 - Global / Mantenimiento Extractora';
DECLARE @IdCobertura_Usuario_6 INT = NULL;
DECLARE @CoberturaCreada_Usuario_6 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_6 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_6 - Global / Mantenimiento Extractora' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_6 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_6 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_6 - Global / Mantenimiento Extractora',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_6. Filas Excel: 18, 19, 20, 21. Miembros: Gabriel Ubeda; Luis Balladares; Leonel Villalta; Juan Celis. Áreas: Todas las áreas; Mantenimiento Extractora. Catálogos: Materiales y Repuestos Mtto; Materiales y Repuestos.',
      @TipoAlcance = N'GLOBAL',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_6 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_6 - Global / Mantenimiento Extractora',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_6. Filas Excel: 18, 19, 20, 21. Miembros: Gabriel Ubeda; Luis Balladares; Leonel Villalta; Juan Celis. Áreas: Todas las áreas; Mantenimiento Extractora. Catálogos: Materiales y Repuestos Mtto; Materiales y Repuestos.',
        @Alcance = N'GLOBAL',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_6 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_6 - Global / Mantenimiento Extractora',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_6. Filas Excel: 18, 19, 20, 21. Miembros: Gabriel Ubeda; Luis Balladares; Leonel Villalta; Juan Celis. Áreas: Todas las áreas; Mantenimiento Extractora. Catálogos: Materiales y Repuestos Mtto; Materiales y Repuestos.',
          @Alcance = N'GLOBAL',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'COBERTURA', N'Excel Usuario_6 - Global / Mantenimiento Extractora', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_6 = IdCobertura FROM @CoberturaCreada_Usuario_6;
END
IF @IdCobertura_Usuario_6 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'COBERTURA', N'Excel Usuario_6 - Global / Mantenimiento Extractora', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_6_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Gabriel Ubeda' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_6_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Gabriel Ubeda', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_6 AND cu.IdUsuario = @IdUsuario_Usuario_6_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_6_1, @IdCobertura = @IdCobertura_Usuario_6;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Gabriel Ubeda', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_6_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Luis Balladares' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_6_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Luis Balladares', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_6 AND cu.IdUsuario = @IdUsuario_Usuario_6_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_6_2, @IdCobertura = @IdCobertura_Usuario_6;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Luis Balladares', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_6_3 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Leonel Villalta' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_6_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Leonel Villalta', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_6 AND cu.IdUsuario = @IdUsuario_Usuario_6_3 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_6_3, @IdCobertura = @IdCobertura_Usuario_6;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Leonel Villalta', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_6_4 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Juan Celis' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_6_4 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Juan Celis', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_6 AND cu.IdUsuario = @IdUsuario_Usuario_6_4 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_6_4, @IdCobertura = @IdCobertura_Usuario_6;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'USUARIO', N'Juan Celis', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_6_1 INT;
  SET @IdCatalogo_Usuario_6_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos Mtto' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_6_1 OUTPUT;
  IF @IdCatalogo_Usuario_6_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'CATALOGO', N'Materiales y Repuestos Mtto', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_6 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_6_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_6_1, @IdCobertura = @IdCobertura_Usuario_6;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'CATALOGO', N'Materiales y Repuestos Mtto', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_6_2 INT;
  SET @IdCatalogo_Usuario_6_2 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_6_2 OUTPUT;
  IF @IdCatalogo_Usuario_6_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_6 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_6_2 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_6_2, @IdCobertura = @IdCobertura_Usuario_6;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_6', N'ADVERTENCIA', N'warning_1', N'Incluye "Todas las áreas" y además áreas específicas; la cobertura se generará como GLOBAL.');
END

PRINT 'Procesando Usuario_7 -> Excel Usuario_7 - Global / Materiales y Repuestos';
DECLARE @IdCobertura_Usuario_7 INT = NULL;
DECLARE @CoberturaCreada_Usuario_7 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_7 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_7 - Global / Materiales y Repuestos' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_7 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_7 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_7 - Global / Materiales y Repuestos',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_7. Filas Excel: 22, 23. Miembros: Javier Morales. Áreas: Todas las áreas. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'GLOBAL',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_7 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_7 - Global / Materiales y Repuestos',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_7. Filas Excel: 22, 23. Miembros: Javier Morales. Áreas: Todas las áreas. Catálogos: Materiales y Repuestos.',
        @Alcance = N'GLOBAL',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_7 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_7 - Global / Materiales y Repuestos',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_7. Filas Excel: 22, 23. Miembros: Javier Morales. Áreas: Todas las áreas. Catálogos: Materiales y Repuestos.',
          @Alcance = N'GLOBAL',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_7', N'COBERTURA', N'Excel Usuario_7 - Global / Materiales y Repuestos', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_7 = IdCobertura FROM @CoberturaCreada_Usuario_7;
END
IF @IdCobertura_Usuario_7 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_7', N'COBERTURA', N'Excel Usuario_7 - Global / Materiales y Repuestos', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_7_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Javier Morales' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_7_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_7', N'USUARIO', N'Javier Morales', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_7 AND cu.IdUsuario = @IdUsuario_Usuario_7_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_7_1, @IdCobertura = @IdCobertura_Usuario_7;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_7', N'USUARIO', N'Javier Morales', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_7_1 INT;
  SET @IdCatalogo_Usuario_7_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_7_1 OUTPUT;
  IF @IdCatalogo_Usuario_7_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_7', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_7 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_7_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_7_1, @IdCobertura = @IdCobertura_Usuario_7;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_7', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_8 -> Excel Usuario_8 - Oficinas / Administración';
DECLARE @IdCobertura_Usuario_8 INT = NULL;
DECLARE @CoberturaCreada_Usuario_8 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_8 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_8 - Oficinas / Administración' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_8 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_8 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_8 - Oficinas / Administración',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_8. Filas Excel: 24, 25, 26, 27, 28, 29. Miembros: Niridia Martínez; Ruth Salmeron; Noel García; Denis Rivas; Gohany Tapia; Jessenia Alvarez. Áreas: Oficinas; Administración. Catálogos: Materiales y Repuestos.',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_8 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_8 - Oficinas / Administración',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_8. Filas Excel: 24, 25, 26, 27, 28, 29. Miembros: Niridia Martínez; Ruth Salmeron; Noel García; Denis Rivas; Gohany Tapia; Jessenia Alvarez. Áreas: Oficinas; Administración. Catálogos: Materiales y Repuestos.',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_8 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_8 - Oficinas / Administración',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_8. Filas Excel: 24, 25, 26, 27, 28, 29. Miembros: Niridia Martínez; Ruth Salmeron; Noel García; Denis Rivas; Gohany Tapia; Jessenia Alvarez. Áreas: Oficinas; Administración. Catálogos: Materiales y Repuestos.',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'COBERTURA', N'Excel Usuario_8 - Oficinas / Administración', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_8 = IdCobertura FROM @CoberturaCreada_Usuario_8;
END
IF @IdCobertura_Usuario_8 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'COBERTURA', N'Excel Usuario_8 - Oficinas / Administración', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_8_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Niridia Martínez' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_8_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Niridia Martínez', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_8 AND cu.IdUsuario = @IdUsuario_Usuario_8_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_8_1, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Niridia Martínez', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_8_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Ruth Salmeron' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_8_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Ruth Salmeron', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_8 AND cu.IdUsuario = @IdUsuario_Usuario_8_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_8_2, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Ruth Salmeron', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_8_3 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Noel García' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_8_3 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Noel García', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_8 AND cu.IdUsuario = @IdUsuario_Usuario_8_3 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_8_3, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Noel García', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_8_4 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Denis Rivas' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_8_4 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Denis Rivas', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_8 AND cu.IdUsuario = @IdUsuario_Usuario_8_4 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_8_4, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Denis Rivas', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_8_5 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Gohany Tapia' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_8_5 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Gohany Tapia', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_8 AND cu.IdUsuario = @IdUsuario_Usuario_8_5 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_8_5, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Gohany Tapia', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_8_6 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Jessenia Alvarez' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_8_6 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Jessenia Alvarez', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_8 AND cu.IdUsuario = @IdUsuario_Usuario_8_6 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_8_6, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'USUARIO', N'Jessenia Alvarez', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_8_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Oficinas' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Oficinas' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Oficinas' + N'%'
      OR LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'OFIC' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'OFIC' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'OFIC' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Oficinas' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Oficinas' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Oficinas' + N'%' THEN 2
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'OFIC' COLLATE Latin1_General_CI_AI THEN 10
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'OFIC' COLLATE Latin1_General_CI_AI THEN 11
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'OFIC' + N'%' THEN 12
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_8_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'AREA', N'Oficinas', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_8 AND ca.IdArea = @IdArea_Usuario_8_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_8_1, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'AREA', N'Oficinas', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_8_2 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Administración' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Administración' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Administración' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Administración' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Administración' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Administración' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_8_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'AREA', N'Administración', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_8 AND ca.IdArea = @IdArea_Usuario_8_2 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_8_2, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'AREA', N'Administración', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_8_1 INT;
  SET @IdCatalogo_Usuario_8_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Materiales y Repuestos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_8_1 OUTPUT;
  IF @IdCatalogo_Usuario_8_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'CATALOGO', N'Materiales y Repuestos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_8 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_8_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_8_1, @IdCobertura = @IdCobertura_Usuario_8;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_8', N'CATALOGO', N'Materiales y Repuestos', ERROR_MESSAGE());
  END CATCH;
END

PRINT 'Procesando Usuario_9 -> Excel Usuario_9 - Proyectos';
DECLARE @IdCobertura_Usuario_9 INT = NULL;
DECLARE @CoberturaCreada_Usuario_9 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_9 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Excel Usuario_9 - Proyectos' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_9 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_9 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Excel Usuario_9 - Proyectos',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_9. Filas Excel: 30, 31. Miembros: Juan Celis; Javier Morales. Áreas: Proyectos. Catálogos: Sin catálogos..',
      @TipoAlcance = N'RESTRINGIDO',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_9 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Excel Usuario_9 - Proyectos',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_9. Filas Excel: 30, 31. Miembros: Juan Celis; Javier Morales. Áreas: Proyectos. Catálogos: Sin catálogos..',
        @Alcance = N'RESTRINGIDO',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_9 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Excel Usuario_9 - Proyectos',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_9. Filas Excel: 30, 31. Miembros: Juan Celis; Javier Morales. Áreas: Proyectos. Catálogos: Sin catálogos..',
          @Alcance = N'RESTRINGIDO',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'COBERTURA', N'Excel Usuario_9 - Proyectos', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_9 = IdCobertura FROM @CoberturaCreada_Usuario_9;
END
IF @IdCobertura_Usuario_9 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'COBERTURA', N'Excel Usuario_9 - Proyectos', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_9_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Juan Celis' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_9_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'USUARIO', N'Juan Celis', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_9 AND cu.IdUsuario = @IdUsuario_Usuario_9_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_9_1, @IdCobertura = @IdCobertura_Usuario_9;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'USUARIO', N'Juan Celis', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdUsuario_Usuario_9_2 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Javier Morales' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_9_2 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'USUARIO', N'Javier Morales', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_9 AND cu.IdUsuario = @IdUsuario_Usuario_9_2 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_9_2, @IdCobertura = @IdCobertura_Usuario_9;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'USUARIO', N'Javier Morales', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdArea_Usuario_9_1 INT = (
    SELECT TOP (1) a.IdArea
    FROM dbo.Areas a
    WHERE (LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Proyectos' COLLATE Latin1_General_CI_AI
      OR LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Proyectos' COLLATE Latin1_General_CI_AI
      OR ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Proyectos' + N'%')
    ORDER BY CASE
      WHEN LTRIM(RTRIM(ISNULL(a.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Proyectos' COLLATE Latin1_General_CI_AI THEN 0
      WHEN LTRIM(RTRIM(ISNULL(a.Codigo, ''))) COLLATE Latin1_General_CI_AI = N'Proyectos' COLLATE Latin1_General_CI_AI THEN 1
      WHEN ISNULL(a.Nombre, '') COLLATE Latin1_General_CI_AI LIKE N'%' + N'Proyectos' + N'%' THEN 2
      ELSE 999
    END, a.IdArea
  );
  IF @IdArea_Usuario_9_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'AREA', N'Proyectos', N'Área no encontrada en dbo.Areas.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaAreas ca WHERE ca.IdCobertura = @IdCobertura_Usuario_9 AND ca.IdArea = @IdArea_Usuario_9_1 AND ISNULL(ca.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarAreaCobertura @IdArea = @IdArea_Usuario_9_1, @IdCobertura = @IdCobertura_Usuario_9;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'AREA', N'Proyectos', ERROR_MESSAGE());
  END CATCH;
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_9', N'ADVERTENCIA', N'warning_1', N'No tiene catálogos marcados en el Excel.');
END

PRINT 'Procesando Usuario_10 -> Activos Fijos Global';
DECLARE @IdCobertura_Usuario_10 INT = NULL;
DECLARE @CoberturaCreada_Usuario_10 TABLE (IdCobertura INT);
SELECT TOP (1) @IdCobertura_Usuario_10 = c.IdCobertura FROM dbo.CoberturasAcceso c WHERE LTRIM(RTRIM(ISNULL(c.Nombre, ''))) COLLATE Latin1_General_CI_AI = N'Activos Fijos Global' COLLATE Latin1_General_CI_AI;
IF @IdCobertura_Usuario_10 IS NULL
BEGIN
  BEGIN TRY
    INSERT INTO @CoberturaCreada_Usuario_10 (IdCobertura)
    EXEC dbo.sp_CrearCoberturaAcceso
      @Nombre = N'Activos Fijos Global',
      @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_10. Filas Excel: 32. Miembros: Noel García. Áreas: Todas las áreas. Catálogos: Activos Fijos.',
      @TipoAlcance = N'GLOBAL',
      @Activo = 1;
  END TRY
  BEGIN CATCH
    BEGIN TRY
      INSERT INTO @CoberturaCreada_Usuario_10 (IdCobertura)
      EXEC dbo.sp_CrearCoberturaAcceso
        @NombreCobertura = N'Activos Fijos Global',
        @DescripcionCobertura = N'Migrado desde Excel de permisos. Grupo original: Usuario_10. Filas Excel: 32. Miembros: Noel García. Áreas: Todas las áreas. Catálogos: Activos Fijos.',
        @Alcance = N'GLOBAL',
        @Vigente = 1;
    END TRY
    BEGIN CATCH
      BEGIN TRY
        INSERT INTO @CoberturaCreada_Usuario_10 (IdCobertura)
        EXEC dbo.sp_CrearCoberturaAcceso
          @NombreCobertura = N'Activos Fijos Global',
          @Descripcion = N'Migrado desde Excel de permisos. Grupo original: Usuario_10. Filas Excel: 32. Miembros: Noel García. Áreas: Todas las áreas. Catálogos: Activos Fijos.',
          @Alcance = N'GLOBAL',
          @Activo = 1;
      END TRY
      BEGIN CATCH
        INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_10', N'COBERTURA', N'Activos Fijos Global', ERROR_MESSAGE());
      END CATCH
    END CATCH
  END CATCH
  SELECT TOP (1) @IdCobertura_Usuario_10 = IdCobertura FROM @CoberturaCreada_Usuario_10;
END
IF @IdCobertura_Usuario_10 IS NULL
BEGIN
  INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_10', N'COBERTURA', N'Activos Fijos Global', N'No se pudo crear o localizar la cobertura.');
END
ELSE
BEGIN
  DECLARE @IdUsuario_Usuario_10_1 INT = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuarios u WHERE LTRIM(RTRIM(ISNULL(u.NombreCompleto, ''))) COLLATE Latin1_General_CI_AI = N'Noel García' COLLATE Latin1_General_CI_AI);
  IF @IdUsuario_Usuario_10_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_10', N'USUARIO', N'Noel García', N'Usuario no encontrado en dbo.Usuarios.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaUsuarios cu WHERE cu.IdCobertura = @IdCobertura_Usuario_10 AND cu.IdUsuario = @IdUsuario_Usuario_10_1 AND ISNULL(cu.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarUsuarioCobertura @IdUsuario = @IdUsuario_Usuario_10_1, @IdCobertura = @IdCobertura_Usuario_10;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_10', N'USUARIO', N'Noel García', ERROR_MESSAGE());
  END CATCH;
  DECLARE @IdCatalogo_Usuario_10_1 INT;
  SET @IdCatalogo_Usuario_10_1 = NULL;
  SET @SqlCatalogo = N'SELECT TOP (1) @IdCatalogoOut = IdCatalogoSolicitud FROM dbo.CatalogosSolicitud WHERE LTRIM(RTRIM(ISNULL(' + QUOTENAME(@CatalogNameColumn) + ', ''''))) COLLATE Latin1_General_CI_AI = N'Activos Fijos' COLLATE Latin1_General_CI_AI ORDER BY IdCatalogoSolicitud;';
  EXEC sp_executesql @SqlCatalogo, N'@IdCatalogoOut INT OUTPUT', @IdCatalogoOut = @IdCatalogo_Usuario_10_1 OUTPUT;
  IF @IdCatalogo_Usuario_10_1 IS NULL
    INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_10', N'CATALOGO', N'Activos Fijos', N'Catálogo no encontrado en dbo.CatalogosSolicitud.');
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.CoberturaCatalogos cc WHERE cc.IdCobertura = @IdCobertura_Usuario_10 AND cc.IdCatalogoSolicitud = @IdCatalogo_Usuario_10_1 AND ISNULL(cc.Activo, 1) = 1)
  BEGIN TRY
    EXEC dbo.sp_AgregarCatalogoCobertura @IdCatalogoSolicitud = @IdCatalogo_Usuario_10_1, @IdCobertura = @IdCobertura_Usuario_10;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (2601, 2627)
      INSERT INTO @Pendientes (Grupo, Tipo, Valor, Detalle) VALUES (N'Usuario_10', N'CATALOGO', N'Activos Fijos', ERROR_MESSAGE());
  END CATCH;
END

SELECT * FROM @Pendientes ORDER BY Grupo, Tipo, Valor;
