-- Active: 1771352313269@@srvbsclsrvbscl@1433
------------------------------------------------------------
-- 1. Crear Base de Datos
------------------------------------------------------------
IF DB_ID('GestionMateriales') IS NULL
BEGIN
    CREATE DATABASE GestionMateriales;
END
GO

USE GestionMateriales;
GO

------------------------------------------------------------
-- 2. Tablas de Seguridad / Configuración
------------------------------------------------------------

-- Roles del sistema
IF OBJECT_ID('dbo.Roles', 'U') IS NULL
    CREATE TABLE dbo.Roles
(
    IdRol INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(100) NOT NULL,
    Descripcion NVARCHAR(255) NULL,
    EsAdmin BIT NOT NULL DEFAULT(0),
    Activo BIT NOT NULL DEFAULT(1)
);
GO

------------------------------------------------------------
-- 10. SPs de administración: Usuarios, Roles y Permisos
------------------------------------------------------------

-- CRUD de Usuarios
CREATE OR ALTER PROCEDURE dbo.sp_ListarUsuarios
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.IdUsuario,
        u.NombreCompleto,
        u.Email,
        u.Activo,
        u.FechaCreacion
    FROM dbo.Usuarios u
    ORDER BY u.NombreCompleto;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerUsuario
    @IdUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.IdUsuario,
        u.NombreCompleto,
        u.Email,
        u.Activo,
        u.FechaCreacion
    FROM dbo.Usuarios u
    WHERE u.IdUsuario = @IdUsuario;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearUsuario
    @NombreCompleto NVARCHAR(200),
    @Email          NVARCHAR(150),
    @HashPassword   NVARCHAR(200) = NULL,
    @Activo         BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Usuarios
        (NombreCompleto, Email, HashPassword, Activo)
    VALUES
        (
            @NombreCompleto,
            @Email,
            CASE
            WHEN @HashPassword IS NULL THEN NULL
            ELSE CONVERT(VARBINARY(500), @HashPassword)
        END,
            @Activo
    );

    SELECT SCOPE_IDENTITY() AS IdUsuario;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarUsuario
    @IdUsuario      INT,
    @NombreCompleto NVARCHAR(200),
    @Email          NVARCHAR(150),
    @Activo         BIT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Usuarios
    SET
        NombreCompleto = @NombreCompleto,
        Email          = @Email,
        Activo         = @Activo
    WHERE IdUsuario = @IdUsuario;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_DesactivarUsuario
    @IdUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Usuarios
    SET Activo = 0
    WHERE IdUsuario = @IdUsuario;
END
GO

------------------------------------------------------------
-- CRUD de Roles
------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_ListarRoles
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IdRol, Nombre, Descripcion
    FROM dbo.Roles
    ORDER BY Nombre;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerRol
    @IdRol INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IdRol, Nombre, Descripcion
    FROM dbo.Roles
    WHERE IdRol = @IdRol;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearRol
    @Nombre      NVARCHAR(100),
    @Descripcion NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Roles
        (Nombre, Descripcion)
    VALUES
        (@Nombre, @Descripcion);

    SELECT SCOPE_IDENTITY() AS IdRol;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarRol
    @IdRol       INT,
    @Nombre      NVARCHAR(100),
    @Descripcion NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Roles
    SET
        Nombre      = @Nombre,
        Descripcion = @Descripcion
    WHERE IdRol = @IdRol;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_EliminarRol
    @IdRol INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Solo permite eliminar el rol si no tiene usuarios asociados
    IF EXISTS (SELECT 1
    FROM dbo.UsuariosRoles
    WHERE IdRol = @IdRol)
    BEGIN
        RAISERROR('No se puede eliminar el rol porque tiene usuarios asignados.', 16, 1);
        RETURN;
    END

    DELETE FROM dbo.PermisosRolModulo WHERE IdRol = @IdRol;
    DELETE FROM dbo.Roles WHERE IdRol = @IdRol;
END
GO

------------------------------------------------------------
-- Guardar permisos de un rol (alta/baja/cambio masivo)
------------------------------------------------------------

-- Tipo de tabla para pasar la lista de permisos desde la app
IF TYPE_ID('dbo.TPermisosRolModulo') IS NULL
BEGIN
    CREATE TYPE dbo.TPermisosRolModulo AS TABLE
    (
        IdModulo INT NOT NULL,
        PuedeVer BIT NOT NULL,
        PuedeCrear BIT NOT NULL,
        PuedeEditar BIT NOT NULL,
        PuedeAprobar BIT NOT NULL,
        PuedeEliminar BIT NOT NULL
    );
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_GuardarPermisosRol
    @IdRol INT,
    @Permisos dbo.TPermisosRolModulo READONLY
AS
BEGIN
    SET NOCOUNT ON;

    -- Borramos permisos existentes de ese rol
    DELETE FROM dbo.PermisosRolModulo
    WHERE IdRol = @IdRol;

    -- Insertamos los nuevos permisos
    INSERT INTO dbo.PermisosRolModulo
        (
        IdRol,
        IdModulo,
        PuedeVer,
        PuedeCrear,
        PuedeEditar,
        PuedeAprobar,
        PuedeEliminar
        )
    SELECT
        @IdRol,
        p.IdModulo,
        p.PuedeVer,
        p.PuedeCrear,
        p.PuedeEditar,
        p.PuedeAprobar,
        p.PuedeEliminar
    FROM @Permisos p;
END
GO


-- Usuarios del sistema
IF OBJECT_ID('dbo.Usuarios', 'U') IS NULL
    CREATE TABLE dbo.Usuarios
(
    IdUsuario INT IDENTITY(1,1) PRIMARY KEY,
    NombreCompleto NVARCHAR(150) NOT NULL,
    Email NVARCHAR(150) NOT NULL UNIQUE,
    HashPassword VARBINARY(500) NULL,
    Activo BIT NOT NULL DEFAULT(1),
    FechaCreacion DATETIME2 NOT NULL DEFAULT(SYSDATETIME())
);
GO

-- Relación Usuarios-Roles (multi-rol)
IF OBJECT_ID('dbo.UsuariosRoles', 'U') IS NULL
    CREATE TABLE dbo.UsuariosRoles
(
    IdUsuarioRol INT IDENTITY(1,1) PRIMARY KEY,
    IdUsuario INT NOT NULL,
    IdRol INT NOT NULL,
    CONSTRAINT FK_UsuariosRoles_Usuarios
            FOREIGN KEY (IdUsuario) REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT FK_UsuariosRoles_Roles
            FOREIGN KEY (IdRol) REFERENCES dbo.Roles(IdRol),
    CONSTRAINT UQ_UsuariosRoles UNIQUE (IdUsuario, IdRol)
);
GO

-- Módulos / pantallas del sistema
IF OBJECT_ID('dbo.Modulos', 'U') IS NULL
    CREATE TABLE dbo.Modulos
(
    IdModulo INT IDENTITY(1,1) PRIMARY KEY,
    Codigo NVARCHAR(50) NOT NULL UNIQUE,
    -- ej: 'dashboard', 'materiales'
    Nombre NVARCHAR(100) NOT NULL,
    Path NVARCHAR(200) NULL,
    -- ruta frontend: /materiales
    Descripcion NVARCHAR(255) NULL,
    EsMenu BIT NOT NULL DEFAULT(1)
);
GO

-- Permisos por Rol y Módulo
IF OBJECT_ID('dbo.PermisosRolModulo', 'U') IS NULL
    CREATE TABLE dbo.PermisosRolModulo
(
    IdRol INT NOT NULL,
    IdModulo INT NOT NULL,
    PuedeVer BIT NOT NULL DEFAULT(0),
    PuedeCrear BIT NOT NULL DEFAULT(0),
    PuedeEditar BIT NOT NULL DEFAULT(0),
    PuedeAprobar BIT NOT NULL DEFAULT(0),
    PuedeEliminar BIT NOT NULL DEFAULT(0),
    CONSTRAINT PK_PermisosRolModulo PRIMARY KEY (IdRol, IdModulo),
    CONSTRAINT FK_PermisosRolModulo_Roles
            FOREIGN KEY (IdRol) REFERENCES dbo.Roles(IdRol),
    CONSTRAINT FK_PermisosRolModulo_Modulos
            FOREIGN KEY (IdModulo) REFERENCES dbo.Modulos(IdModulo)
);
GO

-- Parámetros globales del sistema
IF OBJECT_ID('dbo.ParametrosSistema', 'U') IS NULL
    CREATE TABLE dbo.ParametrosSistema
(
    Clave NVARCHAR(100) NOT NULL PRIMARY KEY,
    Valor NVARCHAR(500) NOT NULL,
    Descripcion NVARCHAR(255) NULL
);
GO

-- Preferencias por Usuario
IF OBJECT_ID('dbo.PreferenciasUsuario', 'U') IS NULL
    CREATE TABLE dbo.PreferenciasUsuario
(
    IdPreferencia INT IDENTITY(1,1) PRIMARY KEY,
    IdUsuario INT NOT NULL,
    Clave NVARCHAR(100) NOT NULL,
    Valor NVARCHAR(500) NOT NULL,
    CONSTRAINT FK_PreferenciasUsuario_Usuarios
            FOREIGN KEY (IdUsuario) REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT UQ_PreferenciasUsuario UNIQUE (IdUsuario, Clave)
);
GO

------------------------------------------------------------
-- 3. Tablas de Cortes de Stock
------------------------------------------------------------

-- Cortes de stock (marca cada nueva foto de stock cargada desde Excel)
IF OBJECT_ID('dbo.CortesStock', 'U') IS NULL
    CREATE TABLE dbo.CortesStock
(
    IdCorte INT IDENTITY(1,1) PRIMARY KEY,
    FechaCorte DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
    Descripcion NVARCHAR(200) NULL
);
GO

------------------------------------------------------------
-- 4. Tablas de Materiales / Stock / Ubicaciones
------------------------------------------------------------

-- Maestro de Materiales (estable, NO se trunca)
IF OBJECT_ID('dbo.Materiales', 'U') IS NULL
    CREATE TABLE dbo.Materiales
(
    IdMaterial INT IDENTITY(1,1) PRIMARY KEY,
    NumeroArticulo NVARCHAR(50) NOT NULL UNIQUE,
    -- Número de artículo (Excel)
    DescripcionArticulo NVARCHAR(255) NOT NULL,
    -- Descripción del artículo
    UnidadMedida NVARCHAR(50) NOT NULL,
    -- Unidad de Medida
    GrupoArticulos NVARCHAR(100) NULL
    -- Grupo de artículos
);
GO

-- Stock actual (TRUNCATE + recarga desde Excel)
IF OBJECT_ID('dbo.StockActual', 'U') IS NULL
    CREATE TABLE dbo.StockActual
(
    IdMaterial INT NOT NULL PRIMARY KEY,
    EnStock DECIMAL(18,4) NOT NULL,
    -- En stock
    UltimaFechaCompra DATE NULL,
    -- Última fecha de compra
    UltimoPrecioCompra DECIMAL(18,4) NULL,
    -- Último precio de compra
    UltimaMonedaCompra NVARCHAR(10) NULL,
    -- Última moneda de compra
    FechaActualizacion DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_StockActual_Materiales
            FOREIGN KEY (IdMaterial) REFERENCES dbo.Materiales(IdMaterial)
);
GO

-- Ubicaciones físicas (catálogo)
IF OBJECT_ID('dbo.Ubicaciones', 'U') IS NULL
    CREATE TABLE dbo.Ubicaciones
(
    IdUbicacion INT IDENTITY(1,1) PRIMARY KEY,
    Codigo NVARCHAR(50) NOT NULL UNIQUE,
    -- Código (Excel ubicaciones)
    Descripcion NVARCHAR(255) NOT NULL
    -- Descripción
);
GO

-- Relación Material-Ubicación (desde Excel de ubicaciones)
IF OBJECT_ID('dbo.MaterialUbicacion', 'U') IS NULL
    CREATE TABLE dbo.MaterialUbicacion
(
    IdMaterialUbicacion INT IDENTITY(1,1) PRIMARY KEY,
    IdMaterial INT NOT NULL,
    IdUbicacion INT NOT NULL,
    NumeroParte NVARCHAR(100) NULL,
    -- N° parte
    UnidadMedida NVARCHAR(50) NULL,
    -- Unidad de medida
    UbicacionTexto NVARCHAR(100) NULL,
    -- Ubicación libre si viene en texto
    CONSTRAINT FK_MaterialUbicacion_Materiales
            FOREIGN KEY (IdMaterial) REFERENCES dbo.Materiales(IdMaterial),
    CONSTRAINT FK_MaterialUbicacion_Ubicaciones
            FOREIGN KEY (IdUbicacion) REFERENCES dbo.Ubicaciones(IdUbicacion)
);
GO

------------------------------------------------------------
-- 5. Solicitudes / Aprobaciones / Auditoría
------------------------------------------------------------

-- Solicitud de materiales (cabecera)
IF OBJECT_ID('dbo.SolicitudesMaterial', 'U') IS NULL
    CREATE TABLE dbo.SolicitudesMaterial
(
    IdSolicitud INT IDENTITY(1,1) PRIMARY KEY,
    CodigoSolicitud NVARCHAR(50) NOT NULL UNIQUE,
    IdSolicitante INT NOT NULL,
    FechaSolicitud DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
    Estado NVARCHAR(30) NOT NULL,
    -- PENDIENTE, APROBADA, RECHAZADA, EN_DESPACHO, PARCIALMENTE_DESPACHADA, COMPLETADA
    Area NVARCHAR(100) NULL,
    -- texto libre histórico
    Comentario NVARCHAR(500) NULL,
    IdCorteStock INT NULL,
    -- corte de stock vigente al crear la solicitud
    CONSTRAINT FK_SolicitudesMaterial_Usuarios
            FOREIGN KEY (IdSolicitante) REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT FK_SolicitudesMaterial_CortesStock
            FOREIGN KEY (IdCorteStock) REFERENCES dbo.CortesStock(IdCorte)
);
GO

-- Detalle de solicitudes
IF OBJECT_ID('dbo.DetalleSolicitudesMaterial', 'U') IS NULL
    CREATE TABLE dbo.DetalleSolicitudesMaterial
(
    IdDetalleSolicitud INT IDENTITY(1,1) PRIMARY KEY,
    IdSolicitud INT NOT NULL,
    IdMaterial INT NOT NULL,
    -- referencia a Materiales
    IdArea INT NULL,
    IdRecurso INT NULL,
    CantidadSolicitada DECIMAL(18,4) NOT NULL,
    CantidadAprobada DECIMAL(18,4) NULL,
    UnidadMedida NVARCHAR(50) NULL,
    ComentarioLinea NVARCHAR(255) NULL,
    CONSTRAINT FK_DetalleSolicitudesMaterial_Solicitud
            FOREIGN KEY (IdSolicitud) REFERENCES dbo.SolicitudesMaterial(IdSolicitud),
    CONSTRAINT FK_DetalleSolicitudesMaterial_Material
            FOREIGN KEY (IdMaterial) REFERENCES dbo.Materiales(IdMaterial)
);
GO

-- Aprobaciones
IF OBJECT_ID('dbo.Aprobaciones', 'U') IS NULL
    CREATE TABLE dbo.Aprobaciones
(
    IdAprobacion INT IDENTITY(1,1) PRIMARY KEY,
    IdSolicitud INT NOT NULL,
    IdAprobador INT NOT NULL,
    FechaAprobacion DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
    Estado NVARCHAR(30) NOT NULL,
    -- APROBADA / RECHAZADA
    Comentario NVARCHAR(500) NULL,
    CONSTRAINT FK_Aprobaciones_Solicitudes
            FOREIGN KEY (IdSolicitud) REFERENCES dbo.SolicitudesMaterial(IdSolicitud),
    CONSTRAINT FK_Aprobaciones_Usuarios
            FOREIGN KEY (IdAprobador) REFERENCES dbo.Usuarios(IdUsuario)
);
GO

-- Auditoría
IF OBJECT_ID('dbo.AuditoriaAcciones', 'U') IS NULL
    CREATE TABLE dbo.AuditoriaAcciones
(
    IdAuditoria INT IDENTITY(1,1) PRIMARY KEY,
    IdUsuario INT NULL,
    FechaAccion DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
    TipoAccion NVARCHAR(50) NOT NULL,
    -- LOGIN, CREAR_SOLICITUD, APROBAR, etc.
    DetalleJson NVARCHAR(MAX) NULL,
    CONSTRAINT FK_AuditoriaAcciones_Usuarios
            FOREIGN KEY (IdUsuario) REFERENCES dbo.Usuarios(IdUsuario)
);
GO

-- Listar auditoría con datos de usuario y rol principal
CREATE OR ALTER PROCEDURE dbo.sp_ListarAuditoriaAcciones
    @Page     INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    ;
    WITH
        OrderedAuditoria
        AS
        (
            SELECT
                aa.IdAuditoria,
                aa.IdUsuario,
                aa.FechaAccion,
                aa.TipoAccion,
                aa.DetalleJson,
                u.NombreCompleto   AS UsuarioNombre,
                u.Email            AS Email,
                -- Rol principal (primer rol asociado)
                (SELECT TOP 1
                    r.Nombre
                FROM dbo.UsuariosRoles ur
                    JOIN dbo.Roles r ON r.IdRol = ur.IdRol
                WHERE ur.IdUsuario = aa.IdUsuario
                ORDER BY r.Nombre) AS RolNombre,
                ROW_NUMBER() OVER (ORDER BY aa.FechaAccion DESC, aa.IdAuditoria DESC) AS RowNum
            FROM dbo.AuditoriaAcciones aa
                LEFT JOIN dbo.Usuarios u ON u.IdUsuario = aa.IdUsuario
        )
    SELECT
        IdAuditoria,
        IdUsuario,
        FechaAccion,
        TipoAccion,
        DetalleJson,
        UsuarioNombre,
        Email,
        RolNombre
    FROM OrderedAuditoria
    WHERE RowNum BETWEEN ((@Page - 1) * @PageSize + 1) AND (@Page * @PageSize);

    -- Total de registros para paginación
    SELECT COUNT(1) AS TotalRegistros
    FROM dbo.AuditoriaAcciones;
END
GO

------------------------------------------------------------
-- 7. Índices adicionales
------------------------------------------------------------

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE name = 'IX_Usuarios_Email' AND object_id = OBJECT_ID('dbo.Usuarios'))
BEGIN
    CREATE UNIQUE INDEX IX_Usuarios_Email ON dbo.Usuarios(Email);
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE name = 'IX_SolicitudesMaterial_Estado_Fecha' AND object_id = OBJECT_ID('dbo.SolicitudesMaterial'))
BEGIN
    CREATE INDEX IX_SolicitudesMaterial_Estado_Fecha
    ON dbo.SolicitudesMaterial(Estado, FechaSolicitud);
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE name = 'IX_PermisosRolModulo_Rol_Modulo' AND object_id = OBJECT_ID('dbo.PermisosRolModulo'))
BEGIN
    CREATE INDEX IX_PermisosRolModulo_Rol_Modulo
    ON dbo.PermisosRolModulo(IdRol, IdModulo);
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE name = 'IX_Materiales_NumeroArticulo' AND object_id = OBJECT_ID('dbo.Materiales'))
BEGIN
    CREATE INDEX IX_Materiales_NumeroArticulo
    ON dbo.Materiales(NumeroArticulo);
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE name = 'IX_Materiales_GrupoArticulos' AND object_id = OBJECT_ID('dbo.Materiales'))
BEGIN
    CREATE INDEX IX_Materiales_GrupoArticulos
    ON dbo.Materiales(GrupoArticulos);
END
GO

------------------------------------------------------------
-- 9. Stored Procedures (lógica de negocio)
------------------------------------------------------------

-- Login de usuario básico por email (password se manejará más adelante)
CREATE OR ALTER PROCEDURE dbo.sp_LoginUsuario
    @Email       NVARCHAR(150),
    @Password    NVARCHAR(200) = NULL
-- reservado para futura validación de hash
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        u.IdUsuario,
        u.NombreCompleto,
        u.Email,
        u.Activo,
        u.HashPassword,
        STRING_AGG(r.Nombre, ',') WITHIN GROUP (ORDER BY r.Nombre) AS Roles
    FROM dbo.Usuarios u
        LEFT JOIN dbo.UsuariosRoles ur ON ur.IdUsuario = u.IdUsuario
        LEFT JOIN dbo.Roles r ON r.IdRol = ur.IdRol
    WHERE u.Email = @Email
    GROUP BY u.IdUsuario, u.NombreCompleto, u.Email, u.Activo, u.HashPassword;
END
GO

-- Obtener módulos y permisos por rol
CREATE OR ALTER PROCEDURE dbo.sp_ObtenerPermisosPorRol
    @IdRol INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdModulo,
        m.Codigo,
        m.Nombre,
        m.Path,
        m.Descripcion,
        prm.PuedeVer,
        prm.PuedeCrear,
        prm.PuedeEditar,
        prm.PuedeAprobar,
        prm.PuedeEliminar
    FROM dbo.Modulos m
        LEFT JOIN dbo.PermisosRolModulo prm
        ON prm.IdModulo = m.IdModulo AND prm.IdRol = @IdRol
    ORDER BY m.IdModulo;
END
GO

-- Crear un nuevo corte de stock
CREATE OR ALTER PROCEDURE dbo.sp_CrearCorteStock
    @Descripcion NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.CortesStock
        (FechaCorte, Descripcion)
    VALUES
        (SYSDATETIME(), @Descripcion);

    SELECT SCOPE_IDENTITY() AS IdCorte;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarCortesStock
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IdCorte,
        FechaCorte,
        Descripcion
    FROM dbo.CortesStock
    ORDER BY FechaCorte DESC, IdCorte DESC;
END
GO

-- Obtener stock disponible por material, considerando solo solicitudes del corte actual
CREATE OR ALTER PROCEDURE dbo.sp_ObtenerStockDisponible
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IdCorteActual INT = (
        SELECT MAX(IdCorte)
    FROM dbo.CortesStock
    );

    DECLARE @EnStock DECIMAL(18,4) = (
        SELECT sa.EnStock
    FROM dbo.StockActual sa
    WHERE sa.IdMaterial = @IdMaterial
    );

    DECLARE @Comprometido DECIMAL(18,4) = (
        SELECT ISNULL(SUM(ds.CantidadAprobada), 0)
    FROM dbo.DetalleSolicitudesMaterial ds
        JOIN dbo.SolicitudesMaterial s ON s.IdSolicitud = ds.IdSolicitud
    WHERE ds.IdMaterial = @IdMaterial
        AND s.IdCorteStock = @IdCorteActual
        AND s.Estado IN ('PENDIENTE', 'APROBADA', 'EN_DESPACHO')
    );

    SELECT
        @IdMaterial AS IdMaterial,
        ISNULL(@EnStock, 0) AS EnStock,
        ISNULL(@Comprometido, 0) AS CantidadComprometida,
        ISNULL(@EnStock, 0) - ISNULL(@Comprometido, 0) AS StockDisponible,
        @IdCorteActual AS IdCorteActual;
END
GO

------------------------------------------------------------
-- CRUD básicos para Materiales
------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_ListarMateriales
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos
    FROM dbo.Materiales m
    ORDER BY m.NumeroArticulo;
END
GO

------------------------------------------------------------
-- Lista de Materiales con información de StockActual
------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_ListarMaterialesConStock
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos,
        sa.EnStock,
        sa.UltimaFechaCompra,
        sa.UltimoPrecioCompra,
        sa.UltimaMonedaCompra
    FROM dbo.Materiales m WITH (NOLOCK)
        LEFT JOIN dbo.StockActual sa WITH (NOLOCK)
        ON sa.IdMaterial = m.IdMaterial
    ORDER BY m.NumeroArticulo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerMaterialPorId
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos
    FROM dbo.Materiales m
    WHERE m.IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearMaterial
    @NumeroArticulo      NVARCHAR(50),
    @DescripcionArticulo NVARCHAR(255),
    @UnidadMedida        NVARCHAR(50),
    @GrupoArticulos      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Materiales
        (
        NumeroArticulo, DescripcionArticulo, UnidadMedida, GrupoArticulos
        )
    VALUES
        (
            @NumeroArticulo, @DescripcionArticulo, @UnidadMedida, @GrupoArticulos
    );

    SELECT SCOPE_IDENTITY() AS IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarMaterial
    @IdMaterial          INT,
    @NumeroArticulo      NVARCHAR(50),
    @DescripcionArticulo NVARCHAR(255),
    @UnidadMedida        NVARCHAR(50),
    @GrupoArticulos      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Materiales
    SET
        NumeroArticulo      = @NumeroArticulo,
        DescripcionArticulo = @DescripcionArticulo,
        UnidadMedida        = @UnidadMedida,
        GrupoArticulos      = @GrupoArticulos
    WHERE IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_EliminarMaterial
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.Materiales
    WHERE IdMaterial = @IdMaterial;
END
GO
------------------------------------------------------------
-- CRUD básicos para Áreas y Centros de Costo
------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_ListarAreas
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.IdArea,
        a.Codigo,
        a.Nombre,
        a.Descripcion,
        a.Activo,
        a.IdCentroCosto,
        cc.Nombre AS CentroCostoNombre
    FROM dbo.Areas a WITH (NOLOCK)
        LEFT JOIN dbo.CentrosCosto cc WITH (NOLOCK)
        ON cc.IdCentroCosto = a.IdCentroCosto
    ORDER BY a.Codigo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarCentrosCosto
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IdCentroCosto, Codigo, Nombre, Descripcion, Activo
    FROM dbo.CentrosCosto
    ORDER BY Codigo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearCentroCosto
    @Codigo      NVARCHAR(50),
    @Nombre      NVARCHAR(150),
    @Descripcion NVARCHAR(255) = NULL,
    @Activo      BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.CentrosCosto
        (Codigo, Nombre, Descripcion, Activo)
    VALUES
        (@Codigo, @Nombre, @Descripcion, @Activo);

    SELECT SCOPE_IDENTITY() AS IdCentroCosto;
END
GO

-- Crear Área
CREATE OR ALTER PROCEDURE dbo.sp_CrearArea
    @Codigo       NVARCHAR(50),
    @Nombre       NVARCHAR(150),
    @Descripcion  NVARCHAR(255) = NULL,
    @Activo       BIT = 1,
    @IdCentroCosto INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Areas
        (Codigo, Nombre, Descripcion, Activo, IdCentroCosto)
    VALUES
        (@Codigo, @Nombre, @Descripcion, @Activo, @IdCentroCosto);

    SELECT SCOPE_IDENTITY() AS IdArea;
END
GO

-- Actualizar Área
CREATE OR ALTER PROCEDURE dbo.sp_ActualizarArea
    @IdArea       INT,
    @Codigo       NVARCHAR(50),
    @Nombre       NVARCHAR(150),
    @Descripcion  NVARCHAR(255) = NULL,
    @Activo       BIT = 1,
    @IdCentroCosto INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Areas
    SET
        Codigo       = @Codigo,
        Nombre       = @Nombre,
        Descripcion  = @Descripcion,
        Activo       = @Activo,
        IdCentroCosto = @IdCentroCosto
    WHERE IdArea = @IdArea;
END
GO

-- Eliminar Área (o podrías cambiar a baja lógica si prefieres)
CREATE OR ALTER PROCEDURE dbo.sp_EliminarArea
    @IdArea INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.Areas
    WHERE IdArea = @IdArea;
END
GO

------------------------------------------------------------
-- 8. Nuevas tablas: Áreas, Centros de Costo y Presupuestos
--    y ALTERs sobre tablas existentes
------------------------------------------------------------

-- Áreas del negocio
IF OBJECT_ID('dbo.Areas', 'U') IS NULL
    CREATE TABLE dbo.Areas
(
    IdArea INT IDENTITY(1,1) PRIMARY KEY,
    Codigo NVARCHAR(50) NOT NULL UNIQUE,
    Nombre NVARCHAR(150) NOT NULL,
    Descripcion NVARCHAR(255) NULL,
    Activo BIT NOT NULL DEFAULT(1),
    IdCentroCosto INT NULL,
    CONSTRAINT FK_Areas_CentrosCosto
            FOREIGN KEY (IdCentroCosto) REFERENCES dbo.CentrosCosto(IdCentroCosto)
);
GO

-- Centros de Costo
IF OBJECT_ID('dbo.CentrosCosto', 'U') IS NULL
    CREATE TABLE dbo.CentrosCosto
(
    IdCentroCosto INT IDENTITY(1,1) PRIMARY KEY,
    Codigo NVARCHAR(50) NOT NULL UNIQUE,
    Nombre NVARCHAR(150) NOT NULL,
    Descripcion NVARCHAR(255) NULL,
    Activo BIT NOT NULL DEFAULT(1)
);
GO

-- Agregar columnas IdArea e IdCentroCosto a SolicitudesMaterial si no existen
IF COL_LENGTH('dbo.SolicitudesMaterial', 'IdArea') IS NULL
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD IdArea INT NULL;
END
GO

IF COL_LENGTH('dbo.SolicitudesMaterial', 'IdCentroCosto') IS NULL
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD IdCentroCosto INT NULL;
END
GO

-- Agregar FKs desde SolicitudesMaterial a Areas y CentrosCosto si no existen
IF NOT EXISTS (SELECT 1
FROM sys.foreign_keys
WHERE name = 'FK_SolicitudesMaterial_Areas')
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD CONSTRAINT FK_SolicitudesMaterial_Areas
        FOREIGN KEY (IdArea) REFERENCES dbo.Areas(IdArea);
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.foreign_keys
WHERE name = 'FK_SolicitudesMaterial_CentrosCosto')
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD CONSTRAINT FK_SolicitudesMaterial_CentrosCosto
        FOREIGN KEY (IdCentroCosto) REFERENCES dbo.CentrosCosto(IdCentroCosto);
END
GO

-- Cabecera de Presupuesto
IF OBJECT_ID('dbo.Presupuestos', 'U') IS NULL
    CREATE TABLE dbo.Presupuestos
(
    IdPresupuesto INT IDENTITY(1,1) PRIMARY KEY,
    Anio INT NOT NULL,
    Mes INT NULL,
    -- opcional: null = anual
    IdArea INT NULL,
    IdCentroCosto INT NULL,
    MontoTotal DECIMAL(18,2) NOT NULL,
    Moneda NVARCHAR(10) NOT NULL DEFAULT('USD'),
    Activo BIT NOT NULL DEFAULT(1),
    FechaCreacion DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_Presupuestos_Areas
            FOREIGN KEY (IdArea) REFERENCES dbo.Areas(IdArea),
    CONSTRAINT FK_Presupuestos_CentrosCosto
            FOREIGN KEY (IdCentroCosto) REFERENCES dbo.CentrosCosto(IdCentroCosto)
);
GO

-- Detalle de Presupuesto (por material o grupo de artículos)
IF OBJECT_ID('dbo.PresupuestoDetalle', 'U') IS NULL
    CREATE TABLE dbo.PresupuestoDetalle
(
    IdPresupuestoDetalle INT IDENTITY(1,1) PRIMARY KEY,
    IdPresupuesto INT NOT NULL,
    IdMaterial INT NULL,
    -- si se desea por material específico
    GrupoArticulos NVARCHAR(100) NULL,
    -- o por grupo de artículos
    MontoPermitido DECIMAL(18,2) NOT NULL,
    CONSTRAINT FK_PresupuestoDetalle_Presupuestos
            FOREIGN KEY (IdPresupuesto) REFERENCES dbo.Presupuestos(IdPresupuesto),
    CONSTRAINT FK_PresupuestoDetalle_Materiales
            FOREIGN KEY (IdMaterial) REFERENCES dbo.Materiales(IdMaterial)
);
GO

-------------------------------------------------------------
-- Stored Procedures de Presupuestos (cabecera)
-------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_ListarPresupuestos
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.IdPresupuesto,
        p.Anio,
        p.Mes,
        p.MontoTotal,
        p.Moneda,
        p.IdArea,
        a.Nombre AS AreaNombre
    FROM dbo.Presupuestos p
        LEFT JOIN dbo.Areas a ON a.IdArea = p.IdArea
    WHERE p.Activo = 1
    ORDER BY p.Anio, p.Mes, a.Nombre;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearPresupuesto
    @Anio       INT,
    @Mes        INT = NULL,
    -- podemos usar 1..4 como trimestre si se desea
    @IdArea     INT = NULL,
    @IdCentroCosto INT = NULL,
    @MontoTotal DECIMAL(18,2),
    @Moneda     NVARCHAR(10) = 'USD'
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Presupuestos
        (Anio, Mes, IdArea, IdCentroCosto, MontoTotal, Moneda, Activo)
    VALUES
        (@Anio, @Mes, @IdArea, @IdCentroCosto, @MontoTotal, @Moneda, 1);

    SELECT SCOPE_IDENTITY() AS IdPresupuesto;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarPresupuesto
    @IdPresupuesto INT,
    @Anio          INT,
    @Mes           INT = NULL,
    @IdArea        INT = NULL,
    @IdCentroCosto INT = NULL,
    @MontoTotal    DECIMAL(18,2),
    @Moneda        NVARCHAR(10) = 'USD'
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Presupuestos
    SET
        Anio = @Anio,
        Mes = @Mes,
        IdArea = @IdArea,
        IdCentroCosto = @IdCentroCosto,
        MontoTotal = @MontoTotal,
        Moneda = @Moneda
    WHERE IdPresupuesto = @IdPresupuesto;
END
GO

------------------------------------------------------------

IF COL_LENGTH('dbo.Usuarios', 'IdArea') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD IdArea INT NULL;
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.foreign_keys
WHERE name = 'FK_Usuarios_Areas')
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD CONSTRAINT FK_Usuarios_Areas
        FOREIGN KEY (IdArea) REFERENCES dbo.Areas(IdArea);
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarUsuarios
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.IdUsuario,
        u.NombreCompleto,
        u.Email,
        u.Activo,
        u.FechaCreacion,
        -- Rol principal (primer rol que encuentres)
        r.Nombre AS RolPrincipal,
        r.IdRol   AS IdRolPrincipal,
        a.Nombre  AS AreaNombre,
        u.IdArea
    FROM dbo.Usuarios u
        LEFT JOIN dbo.UsuariosRoles ur ON ur.IdUsuario = u.IdUsuario
        LEFT JOIN dbo.Roles r ON r.IdRol = ur.IdRol
        LEFT JOIN dbo.Areas a ON a.IdArea = u.IdArea;
END
GO



CREATE OR ALTER PROCEDURE dbo.sp_CrearUsuario
    @NombreCompleto NVARCHAR(200),
    @Email          NVARCHAR(150),
    @HashPassword   NVARCHAR(200) = NULL,
    @Activo         BIT = 1,
    @IdArea         INT = NULL,
    @IdRolPrincipal INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Usuarios
        (NombreCompleto, Email, HashPassword, Activo, IdArea)
    VALUES
        (
            @NombreCompleto,
            @Email,
            CASE WHEN @HashPassword IS NULL THEN NULL ELSE CONVERT(VARBINARY(500), @HashPassword) END,
            @Activo,
            @IdArea
    );

    DECLARE @IdUsuario INT = SCOPE_IDENTITY();

    IF @IdRolPrincipal IS NOT NULL
    BEGIN
        INSERT INTO dbo.UsuariosRoles
            (IdUsuario, IdRol)
        VALUES
            (@IdUsuario, @IdRolPrincipal);
    END

    SELECT @IdUsuario AS IdUsuario;
END
GO


CREATE OR ALTER PROCEDURE dbo.sp_ActualizarUsuario
    @IdUsuario      INT,
    @NombreCompleto NVARCHAR(200),
    @Email          NVARCHAR(150),
    @Activo         BIT,
    @IdArea         INT = NULL,
    @IdRolPrincipal INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Usuarios
    SET
        NombreCompleto = @NombreCompleto,
        Email          = @Email,
        Activo         = @Activo,
        IdArea         = @IdArea
    WHERE IdUsuario = @IdUsuario;

    -- Rol principal: dejamos un solo registro en UsuariosRoles
    DELETE FROM dbo.UsuariosRoles WHERE IdUsuario = @IdUsuario;

    IF @IdRolPrincipal IS NOT NULL
    BEGIN
        INSERT INTO dbo.UsuariosRoles
            (IdUsuario, IdRol)
        VALUES
            (@IdUsuario, @IdRolPrincipal);
    END
END
GO


------------------------------------------------------------
-- 1. Seguridad / Login / Permisos
------------------------------------------------------------

-- Login por email (ya lo tienes, aquí para referencia)
CREATE OR ALTER PROCEDURE dbo.sp_LoginUsuario
    @Email       NVARCHAR(150),
    @Password    NVARCHAR(200) = NULL
-- reservado para futura validación de hash
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        u.IdUsuario,
        u.NombreCompleto,
        u.Email,
        u.Activo,
        u.HashPassword,
        STRING_AGG(r.Nombre, ',') WITHIN GROUP (ORDER BY r.Nombre) AS Roles
    FROM dbo.Usuarios u
        LEFT JOIN dbo.UsuariosRoles ur ON ur.IdUsuario = u.IdUsuario
        LEFT JOIN dbo.Roles r ON r.IdRol = ur.IdRol
    WHERE u.Email = @Email
    GROUP BY u.IdUsuario, u.NombreCompleto, u.Email, u.Activo, u.HashPassword;
END
GO

-- Obtener módulos y permisos por rol (para PermisosPage y PermisosContext)
CREATE OR ALTER PROCEDURE dbo.sp_ObtenerPermisosPorRol
    @IdRol INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdModulo,
        m.Codigo,
        m.Nombre,
        m.Path,
        m.Descripcion,
        prm.PuedeVer,
        prm.PuedeCrear,
        prm.PuedeEditar,
        prm.PuedeAprobar,
        prm.PuedeEliminar
    FROM dbo.Modulos m
        LEFT JOIN dbo.PermisosRolModulo prm
        ON prm.IdModulo = m.IdModulo AND prm.IdRol = @IdRol
    ORDER BY m.IdModulo;
END
GO



-- Guardar permisos de un rol (usado por POST /api/permisos/rol/:idRol)
CREATE OR ALTER PROCEDURE dbo.sp_GuardarPermisosRol
    @IdRol INT,
    @Permisos dbo.TPermisosRolModulo READONLY
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.PermisosRolModulo
    WHERE IdRol = @IdRol;

    INSERT INTO dbo.PermisosRolModulo
        (
        IdRol,
        IdModulo,
        PuedeVer,
        PuedeCrear,
        PuedeEditar,
        PuedeAprobar,
        PuedeEliminar
        )
    SELECT
        @IdRol,
        p.IdModulo,
        p.PuedeVer,
        p.PuedeCrear,
        p.PuedeEditar,
        p.PuedeAprobar,
        p.PuedeEliminar
    FROM @Permisos p;
END
GO


------------------------------------------------------------
-- 2. Usuarios + Roles + Áreas
------------------------------------------------------------

-- Asegurar columna IdArea en Usuarios y FK
IF COL_LENGTH('dbo.Usuarios', 'IdArea') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD IdArea INT NULL;
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.foreign_keys
WHERE name = 'FK_Usuarios_Areas')
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD CONSTRAINT FK_Usuarios_Areas
        FOREIGN KEY (IdArea) REFERENCES dbo.Areas(IdArea);
END
GO

-- Listar usuarios con rol principal y área
CREATE OR ALTER PROCEDURE dbo.sp_ListarUsuarios
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.IdUsuario,
        u.NombreCompleto,
        u.Email,
        u.Activo,
        u.FechaCreacion,
        r.Nombre AS RolPrincipal,
        r.IdRol   AS IdRolPrincipal,
        a.Nombre  AS AreaNombre,
        u.IdArea
    FROM dbo.Usuarios u
        LEFT JOIN dbo.UsuariosRoles ur ON ur.IdUsuario = u.IdUsuario
        LEFT JOIN dbo.Roles r ON r.IdRol = ur.IdRol
        LEFT JOIN dbo.Areas a ON a.IdArea = u.IdArea;
END
GO

-- Crear usuario con IdArea e IdRolPrincipal
CREATE OR ALTER PROCEDURE dbo.sp_CrearUsuario
    @NombreCompleto NVARCHAR(200),
    @Email          NVARCHAR(150),
    @HashPassword   NVARCHAR(200) = NULL,
    @Activo         BIT = 1,
    @IdArea         INT = NULL,
    @IdRolPrincipal INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Usuarios
        (NombreCompleto, Email, HashPassword, Activo, IdArea)
    VALUES
        (
            @NombreCompleto,
            @Email,
            CASE WHEN @HashPassword IS NULL THEN NULL ELSE CONVERT(VARBINARY(500), @HashPassword) END,
            @Activo,
            @IdArea
    );

    DECLARE @IdUsuario INT = SCOPE_IDENTITY();

    IF @IdRolPrincipal IS NOT NULL
    BEGIN
        INSERT INTO dbo.UsuariosRoles
            (IdUsuario, IdRol)
        VALUES
            (@IdUsuario, @IdRolPrincipal);
    END

    SELECT @IdUsuario AS IdUsuario;
END
GO

-- Actualizar usuario + rol principal
CREATE OR ALTER PROCEDURE dbo.sp_ActualizarUsuario
    @IdUsuario      INT,
    @NombreCompleto NVARCHAR(200),
    @Email          NVARCHAR(150),
    @Activo         BIT,
    @IdArea         INT = NULL,
    @IdRolPrincipal INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Usuarios
    SET
        NombreCompleto = @NombreCompleto,
        Email          = @Email,
        Activo         = @Activo,
        IdArea         = @IdArea
    WHERE IdUsuario = @IdUsuario;

    DELETE FROM dbo.UsuariosRoles WHERE IdUsuario = @IdUsuario;

    IF @IdRolPrincipal IS NOT NULL
    BEGIN
        INSERT INTO dbo.UsuariosRoles
            (IdUsuario, IdRol)
        VALUES
            (@IdUsuario, @IdRolPrincipal);
    END
END
GO

-- Desactivar usuario (baja lógica)
CREATE OR ALTER PROCEDURE dbo.sp_DesactivarUsuario
    @IdUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Usuarios
    SET Activo = 0
    WHERE IdUsuario = @IdUsuario;
END
GO

-- CRUD de Roles
CREATE OR ALTER PROCEDURE dbo.sp_ListarRoles
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IdRol, Nombre, Descripcion
    FROM dbo.Roles
    ORDER BY Nombre;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerRol
    @IdRol INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IdRol, Nombre, Descripcion
    FROM dbo.Roles
    WHERE IdRol = @IdRol;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearRol
    @Nombre      NVARCHAR(100),
    @Descripcion NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Roles
        (Nombre, Descripcion)
    VALUES
        (@Nombre, @Descripcion);

    SELECT SCOPE_IDENTITY() AS IdRol;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarRol
    @IdRol       INT,
    @Nombre      NVARCHAR(100),
    @Descripcion NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Roles
    SET
        Nombre      = @Nombre,
        Descripcion = @Descripcion
    WHERE IdRol = @IdRol;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_EliminarRol
    @IdRol INT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1
    FROM dbo.UsuariosRoles
    WHERE IdRol = @IdRol)
    BEGIN
        RAISERROR('No se puede eliminar el rol porque tiene usuarios asignados.', 16, 1);
        RETURN;
    END

    DELETE FROM dbo.PermisosRolModulo WHERE IdRol = @IdRol;
    DELETE FROM dbo.Roles WHERE IdRol = @IdRol;
END
GO


------------------------------------------------------------
-- 3. Áreas y Centros de Costo (para CRUD de ÁreasPage)
------------------------------------------------------------

-- Listar Áreas (ya lo tenías, lo incluyo para referencia)
CREATE OR ALTER PROCEDURE dbo.sp_ListarAreas
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
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
    ORDER BY a.Codigo;
END
GO

-- Crear Área
CREATE OR ALTER PROCEDURE dbo.sp_CrearArea
    @Codigo       NVARCHAR(50),
    @Nombre       NVARCHAR(150),
    @Descripcion  NVARCHAR(255) = NULL,
    @Activo       BIT = 1,
    @IdCentroCosto INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Areas
        (Codigo, Nombre, Descripcion, Activo, IdCentroCosto)
    VALUES
        (@Codigo, @Nombre, @Descripcion, @Activo, @IdCentroCosto);

    SELECT SCOPE_IDENTITY() AS IdArea;
END
GO

-- Actualizar Área
CREATE OR ALTER PROCEDURE dbo.sp_ActualizarArea
    @IdArea       INT,
    @Codigo       NVARCHAR(50),
    @Nombre       NVARCHAR(150),
    @Descripcion  NVARCHAR(255) = NULL,
    @Activo       BIT = 1,
    @IdCentroCosto INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Areas
    SET
        Codigo       = @Codigo,
        Nombre       = @Nombre,
        Descripcion  = @Descripcion,
        Activo       = @Activo,
        IdCentroCosto = @IdCentroCosto
    WHERE IdArea = @IdArea;
END
GO

-- Eliminar Área (o podrías cambiar a baja lógica si prefieres)
CREATE OR ALTER PROCEDURE dbo.sp_EliminarArea
    @IdArea INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.Areas
    WHERE IdArea = @IdArea;
END
GO

-- (Opcional) Lista rápida de Centros de Costo (ya lo tenías)
CREATE OR ALTER PROCEDURE dbo.sp_ListarCentrosCosto
AS
BEGIN
    SET NOCOUNT ON;

    SELECT IdCentroCosto, Codigo, Nombre, Descripcion, Activo
    FROM dbo.CentrosCosto
    ORDER BY Codigo;
END
GO


------------------------------------------------------------
-- 4. Stock / Cortes / Materiales (para endpoints futuros)
------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_CrearCorteStock
    @Descripcion NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.CortesStock
        (FechaCorte, Descripcion)
    VALUES
        (SYSDATETIME(), @Descripcion);

    SELECT SCOPE_IDENTITY() AS IdCorte;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerStockDisponible
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IdCorteActual INT =
    (
        SELECT MAX(IdCorte)
    FROM dbo.CortesStock
    );

    DECLARE @EnStock DECIMAL(18,4) =
    (
        SELECT sa.EnStock
    FROM dbo.StockActual sa
    WHERE sa.IdMaterial = @IdMaterial
    );

    DECLARE @Comprometido DECIMAL(18,4) =
    (
        SELECT ISNULL(SUM(ds.CantidadAprobada), 0)
    FROM dbo.DetalleSolicitudesMaterial ds
        JOIN dbo.SolicitudesMaterial s ON s.IdSolicitud = ds.IdSolicitud
    WHERE ds.IdMaterial = @IdMaterial
        AND s.IdCorteStock = @IdCorteActual
        AND s.Estado IN ('PENDIENTE', 'APROBADA', 'EN_DESPACHO')
    );

    SELECT
        @IdMaterial AS IdMaterial,
        ISNULL(@EnStock, 0) AS EnStock,
        ISNULL(@Comprometido, 0) AS CantidadComprometida,
        ISNULL(@EnStock, 0) - ISNULL(@Comprometido, 0) AS StockDisponible,
        @IdCorteActual AS IdCorteActual;
END
GO

-- CRUD básicos de Materiales (si aún no los tenías aplicados)
CREATE OR ALTER PROCEDURE dbo.sp_ListarMateriales
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos
    FROM dbo.Materiales m
    ORDER BY m.NumeroArticulo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerMaterialPorId
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos
    FROM dbo.Materiales m
    WHERE m.IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearMaterial
    @NumeroArticulo      NVARCHAR(50),
    @DescripcionArticulo NVARCHAR(255),
    @UnidadMedida        NVARCHAR(50),
    @GrupoArticulos      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Materiales
        (
        NumeroArticulo, DescripcionArticulo, UnidadMedida, GrupoArticulos
        )
    VALUES
        (
            @NumeroArticulo, @DescripcionArticulo, @UnidadMedida, @GrupoArticulos
    );

    SELECT SCOPE_IDENTITY() AS IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarMaterial
    @IdMaterial          INT,
    @NumeroArticulo      NVARCHAR(50),
    @DescripcionArticulo NVARCHAR(255),
    @UnidadMedida        NVARCHAR(50),
    @GrupoArticulos      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Materiales
    SET
        NumeroArticulo      = @NumeroArticulo,
        DescripcionArticulo = @DescripcionArticulo,
        UnidadMedida        = @UnidadMedida,
        GrupoArticulos      = @GrupoArticulos
    WHERE IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_EliminarMaterial
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.Materiales
    WHERE IdMaterial = @IdMaterial;
END
GO












------------------------------------------------------------
-- 1) Agregar columna Icono a Modulos
------------------------------------------------------------
IF COL_LENGTH('dbo.Modulos', 'Icono') IS NULL
BEGIN
    ALTER TABLE dbo.Modulos
    ADD Icono NVARCHAR(50) NULL;
END
GO

------------------------------------------------------------
-- 2) (Opcional) Agregar columna IconoRol a Roles
--    No es estrictamente necesaria hoy, pero la dejo lista
------------------------------------------------------------
IF COL_LENGTH('dbo.Roles', 'IconoRol') IS NULL
BEGIN
    ALTER TABLE dbo.Roles
    ADD IconoRol NVARCHAR(50) NULL;
END
GO

------------------------------------------------------------
-- 3) Upsert de módulos usados en la app (dashboard, usuarios, roles, áreas, etc.)
--    Esto asegura que existan en Modulos con sus paths e iconos
------------------------------------------------------------

-- Dashboard
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'dashboard')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('dashboard', 'Dashboard', '/', 'Panel principal con KPIs y gráficos', 'LayoutDashboard');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Dashboard',
        Path = '/',
        Descripcion = 'Panel principal con KPIs y gráficos',
        Icono = 'LayoutDashboard'
    WHERE Codigo = 'dashboard';
END
GO

-- Materiales
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'materiales')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('materiales', 'Materiales', '/materiales', 'Catálogo de materiales e inventario', 'Package');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Materiales',
        Path = '/materiales',
        Descripcion = 'Catálogo de materiales e inventario',
        Icono = 'Package'
    WHERE Codigo = 'materiales';
END
GO

-- Crear Solicitud
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'crear-solicitud')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('crear-solicitud', 'Crear Solicitud', '/solicitudes/crear', 'Formulario para nuevas solicitudes', 'FileText');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Crear Solicitud',
        Path = '/solicitudes/crear',
        Descripcion = 'Formulario para nuevas solicitudes',
        Icono = 'FileText'
    WHERE Codigo = 'crear-solicitud';
END
GO

-- Solicitudes
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'solicitudes')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('solicitudes', 'Solicitudes', '/solicitudes', 'Visualizar y gestionar solicitudes', 'FileText');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Solicitudes',
        Path = '/solicitudes',
        Descripcion = 'Visualizar y gestionar solicitudes',
        Icono = 'FileText'
    WHERE Codigo = 'solicitudes';
END
GO

-- Aprobaciones
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'aprobaciones')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('aprobaciones', 'Aprobaciones', '/aprobaciones', 'Aprobar o rechazar solicitudes', 'CheckSquare');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Aprobaciones',
        Path = '/aprobaciones',
        Descripcion = 'Aprobar o rechazar solicitudes',
        Icono = 'CheckSquare'
    WHERE Codigo = 'aprobaciones';
END
GO

-- Despacho
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'despacho')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('despacho', 'Despacho', '/despacho', 'Gestión de despachos de bodega', 'Truck');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Despacho',
        Path = '/despacho',
        Descripcion = 'Gestión de despachos de bodega',
        Icono = 'Truck'
    WHERE Codigo = 'despacho';
END
GO

-- Presupuesto
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'presupuesto')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('presupuesto', 'Presupuesto', '/presupuesto', 'Control presupuestario por área', 'DollarSign');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Presupuesto',
        Path = '/presupuesto',
        Descripcion = 'Control presupuestario por área',
        Icono = 'DollarSign'
    WHERE Codigo = 'presupuesto';
END
GO

-- Auditoría
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'auditoria')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('auditoria', 'Auditoría', '/auditoria', 'Registro de auditoría del sistema', 'ClipboardList');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Auditoría',
        Path = '/auditoria',
        Descripcion = 'Registro de auditoría del sistema',
        Icono = 'ClipboardList'
    WHERE Codigo = 'auditoria';
END
GO

-- Reportes
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'reportes')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('reportes', 'Reportes', '/reportes', 'Configuración de reportes automáticos', 'FileBarChart');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Reportes',
        Path = '/reportes',
        Descripcion = 'Configuración de reportes automáticos',
        Icono = 'FileBarChart'
    WHERE Codigo = 'reportes';
END
GO

-- Usuarios
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'usuarios')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('usuarios', 'Usuarios', '/usuarios', 'Gestión de usuarios del sistema', 'Users');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Usuarios',
        Path = '/usuarios',
        Descripcion = 'Gestión de usuarios del sistema',
        Icono = 'Users'
    WHERE Codigo = 'usuarios';
END
GO

-- Roles
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'roles')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('roles', 'Roles', '/roles', 'Gestión de roles del sistema', 'Shield');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Roles',
        Path = '/roles',
        Descripcion = 'Gestión de roles del sistema',
        Icono = 'Shield'
    WHERE Codigo = 'roles';
END
GO

-- Áreas
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'areas')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('areas', 'Áreas', '/areas', 'Gestión de áreas del negocio', 'ClipboardList');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Áreas',
        Path = '/areas',
        Descripcion = 'Gestión de áreas del negocio',
        Icono = 'ClipboardList'
    WHERE Codigo = 'areas';
END
GO

-- Coberturas de Acceso
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'coberturas-acceso')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('coberturas-acceso', 'Coberturas de Acceso', '/coberturas-acceso', 'Administración de coberturas por usuarios, áreas y catálogos', 'Shield');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Coberturas de Acceso',
        Path = '/coberturas-acceso',
        Descripcion = 'Administración de coberturas por usuarios, áreas y catálogos',
        Icono = 'Shield'
    WHERE Codigo = 'coberturas-acceso';
END
GO

-- Permisos
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'permisos')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('permisos', 'Permisos', '/permisos', 'Configuración de permisos por rol', 'Shield');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Permisos',
        Path = '/permisos',
        Descripcion = 'Configuración de permisos por rol',
        Icono = 'Shield'
    WHERE Codigo = 'permisos';
END
GO

-- Cortes de Stock
IF NOT EXISTS (SELECT 1
FROM dbo.Modulos
WHERE Codigo = 'cortes')
BEGIN
    INSERT INTO dbo.Modulos
        (Codigo, Nombre, Path, Descripcion, Icono)
    VALUES
        ('cortes', 'Cortes de Stock', '/cortes', 'Gestión de cortes de stock para solicitudes, stock y presupuestos', 'Calendar');
END
ELSE
BEGIN
    UPDATE dbo.Modulos
    SET Nombre = 'Cortes de Stock',
        Path = '/cortes',
        Descripcion = 'Gestión de cortes de stock para solicitudes, stock y presupuestos',
        Icono = 'Calendar'
    WHERE Codigo = 'cortes';
END
GO

  -- Kardex
  IF NOT EXISTS (SELECT 1
  FROM dbo.Modulos
  WHERE Codigo = 'kardex')
  BEGIN
      INSERT INTO dbo.Modulos
          (Codigo, Nombre, Path, Descripcion, Icono)
      VALUES
          ('kardex', 'Kardex', '/kardex', 'Movimientos de Inventario', 'Activity');
  END
  ELSE
  BEGIN
      UPDATE dbo.Modulos
      SET Nombre = 'Kardex',
          Path = '/kardex',
          Descripcion = 'Movimientos de Inventario',
          Icono = 'Activity'
      WHERE Codigo = 'kardex';
  END
  GO

CREATE OR ALTER PROCEDURE dbo.sp_RegistrarAuditoriaAccion
    @IdUsuario  INT = NULL,
    @TipoAccion NVARCHAR(50),
    @DetalleJson NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.AuditoriaAcciones
        (IdUsuario, TipoAccion, DetalleJson)
    VALUES
        (@IdUsuario, @TipoAccion, @DetalleJson);
END





-------------------------------------------------------------
-- 1) Ampliar tabla CortesStock
-------------------------------------------------------------
IF COL_LENGTH('dbo.CortesStock', 'FechaInicio') IS NULL
BEGIN
    ALTER TABLE dbo.CortesStock
    ADD FechaInicio DATETIME2 NULL;
END;

IF COL_LENGTH('dbo.CortesStock', 'FechaFin') IS NULL
BEGIN
    ALTER TABLE dbo.CortesStock
    ADD FechaFin DATETIME2 NULL;
END;

-- Ámbito de uso del corte: STOCK, SOLICITUDES, PRESUPUESTO, GENERAL, etc.
IF COL_LENGTH('dbo.CortesStock', 'Ambito') IS NULL
BEGIN
    ALTER TABLE dbo.CortesStock
    ADD Ambito NVARCHAR(50) NULL;
END;

-- Marca si este corte se considera el “máximo / actual” dentro de su ámbito
IF COL_LENGTH('dbo.CortesStock', 'EsMaximo') IS NULL
BEGIN
    ALTER TABLE dbo.CortesStock
    ADD EsMaximo BIT NOT NULL CONSTRAINT DF_CortesStock_EsMaximo DEFAULT(0);
END;
GO

-------------------------------------------------------------
-- 2) Backfill de datos existentes
--    - FechaInicio = FechaCorte si está NULL
--    - Ambito = 'STOCK' por defecto (puedes cambiarlo luego)
-------------------------------------------------------------
UPDATE dbo.CortesStock
SET
    FechaInicio = ISNULL(FechaInicio, FechaCorte),
    Ambito      = ISNULL(Ambito, 'STOCK')
WHERE FechaInicio IS NULL OR Ambito IS NULL;
GO

-------------------------------------------------------------
-- 3) Hacer obligatorios algunos campos nuevos
-------------------------------------------------------------
ALTER TABLE dbo.CortesStock
ALTER COLUMN FechaInicio DATETIME2 NOT NULL;
GO

ALTER TABLE dbo.CortesStock
ALTER COLUMN Ambito NVARCHAR(50) NOT NULL;
GO



-------------------------------------------------------------
-- Crear/Actualizar SP de creación de cortes
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_CrearCorteStock
    @Descripcion NVARCHAR(200) = NULL,
    @FechaInicio DATETIME2 = NULL,
    @FechaFin DATETIME2 = NULL,
    @Ambito NVARCHAR(50) = NULL,
    @EsMaximo BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Si marcamos este corte como máximo, opcionalmente podrías
    -- limpiar otros máximos del mismo ámbito (comenta o activa según tu criterio)
    IF @EsMaximo = 1 AND @Ambito IS NOT NULL
    BEGIN
        UPDATE dbo.CortesStock
        SET EsMaximo = 0
        WHERE Ambito = @Ambito;
    END;

    INSERT INTO dbo.CortesStock
        (
        FechaCorte,
        Descripcion,
        FechaInicio,
        FechaFin,
        Ambito,
        EsMaximo
        )
    VALUES
        (
            SYSDATETIME(), -- FechaCorte (timestamp de creación)
            @Descripcion,
            ISNULL(@FechaInicio, SYSDATETIME()), -- Inicio = ahora si no se envía
            @FechaFin, -- Puede ser NULL
            ISNULL(@Ambito, 'STOCK'), -- Ambito por defecto
            @EsMaximo
    );

    SELECT SCOPE_IDENTITY() AS IdCorte;
END
GO



CREATE OR ALTER PROCEDURE dbo.sp_ListarCortesStock
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IdCorte,
        FechaCorte,
        Descripcion,
        FechaInicio,
        FechaFin,
        Ambito,
        EsMaximo
    FROM dbo.CortesStock
    ORDER BY FechaCorte DESC, IdCorte DESC;
END
GO




-------------------------------------------------------------
-- Actualizar corte de stock
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ActualizarCorteStock
    @IdCorte     INT,
    @Descripcion NVARCHAR(200) = NULL,
    @FechaInicio DATETIME2 = NULL,
    @FechaFin    DATETIME2 = NULL,
    @Ambito      NVARCHAR(50) = NULL,
    @EsMaximo    BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Normalizamos ámbito: si no viene, dejamos el que ya tiene el corte
    DECLARE @AmbitoFinal NVARCHAR(50);

    SELECT @AmbitoFinal = Ambito
    FROM dbo.CortesStock
    WHERE IdCorte = @IdCorte;

    IF @Ambito IS NOT NULL
        SET @AmbitoFinal = @Ambito;

    -- Si vamos a marcar este corte como máximo, limpiamos otros máximos del mismo ámbito
    IF @EsMaximo = 1 AND @AmbitoFinal IS NOT NULL
    BEGIN
        UPDATE dbo.CortesStock
        SET EsMaximo = 0
        WHERE Ambito = @AmbitoFinal
            AND IdCorte <> @IdCorte;
    END;

    UPDATE dbo.CortesStock
    SET
        Descripcion = @Descripcion,
        FechaInicio = ISNULL(@FechaInicio, FechaInicio),
        FechaFin    = @FechaFin,              -- puede ser NULL
        Ambito      = ISNULL(@Ambito, Ambito),
        EsMaximo    = @EsMaximo
    WHERE IdCorte = @IdCorte;
END
GO


-------------------------------------------------------------
-- Eliminar / anular corte de stock
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_EliminarCorteStock
    @IdCorte INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Aquí podrías validar que el corte no esté referenciado por solicitudes/presupuesto
    -- por ahora hacemos un delete directo.

    DELETE FROM dbo.CortesStock
    WHERE IdCorte = @IdCorte;
END
GO



-------------------------------------------------------------
-- Tipo tabla para carga masiva de materiales + stock
-------------------------------------------------------------
IF TYPE_ID('dbo.TMaterialCarga') IS NULL
BEGIN
    CREATE TYPE dbo.TMaterialCarga AS TABLE
    (
        NumeroArticulo NVARCHAR(50) NOT NULL,
        DescripcionArticulo NVARCHAR(255) NOT NULL,
        EnStock DECIMAL(18,4) NOT NULL,
        UnidadMedida NVARCHAR(50) NOT NULL,
        GrupoArticulos NVARCHAR(100) NULL,
        UltimaFechaCompra DATE NULL,
        UltimoPrecioCompra DECIMAL(18,4) NULL,
        UltimaMonedaCompra NVARCHAR(10) NULL
    );
END
GO




-------------------------------------------------------------
-- Importar materiales + stock desde CSV (carga masiva)
-------------------------------------------------------------








CREATE OR ALTER PROCEDURE dbo.sp_ImportarMaterialesYStock
    @Datos dbo.TMaterialCarga READONLY,
    @IdUsuario INT = NULL -- Agregado para registrar en Kardex
AS
BEGIN
    SET NOCOUNT ON;

    ---------------------------------------------------------
    -- 1) Upsert de Materiales (maestro estable)
    ---------------------------------------------------------

    -- Actualizar existentes
    UPDATE m
    SET
        m.DescripcionArticulo = s.DescripcionArticulo,
        m.UnidadMedida        = s.UnidadMedida,
        m.GrupoArticulos      = s.GrupoArticulos
    FROM dbo.Materiales m
        JOIN (
        SELECT DISTINCT
            NumeroArticulo,
            DescripcionArticulo,
            UnidadMedida,
            GrupoArticulos
        FROM @Datos
    ) AS s
        ON s.NumeroArticulo = m.NumeroArticulo;

    -- Insertar nuevos
    INSERT INTO dbo.Materiales
        (
        NumeroArticulo,
        DescripcionArticulo,
        UnidadMedida,
        GrupoArticulos
        )
    SELECT
        s.NumeroArticulo,
        s.DescripcionArticulo,
        s.UnidadMedida,
        s.GrupoArticulos
    FROM (
        SELECT DISTINCT
            NumeroArticulo,
            DescripcionArticulo,
            UnidadMedida,
            GrupoArticulos
        FROM @Datos
    ) AS s
        LEFT JOIN dbo.Materiales m
        ON m.NumeroArticulo = s.NumeroArticulo
    WHERE m.IdMaterial IS NULL;

    ---------------------------------------------------------
    -- 2) Registrar Movimientos en Kardex (AJUSTE)
    ---------------------------------------------------------
    -- Calculamos la diferencia entre el stock nuevo y el actual
    -- Si no hay stock actual, asumimos 0.
    INSERT INTO dbo.MovimientosInventario (
        IdMaterial,
        TipoMovimiento,
        Cantidad,
        StockAnterior,
        StockNuevo,
        FechaMovimiento,
        IdUsuario,
        Referencia
    )
    SELECT 
        m.IdMaterial,
        'AJUSTE',
        d.EnStock - ISNULL(sa.EnStock, 0), -- Cantidad ajustada (puede ser positiva o negativa)
        ISNULL(sa.EnStock, 0),             -- Stock Anterior
        d.EnStock,                         -- Stock Nuevo
        SYSDATETIME(),
        @IdUsuario,
        'CARGA_CSV'
    FROM @Datos d
    JOIN dbo.Materiales m ON m.NumeroArticulo = d.NumeroArticulo
    LEFT JOIN dbo.StockActual sa ON sa.IdMaterial = m.IdMaterial
    WHERE d.EnStock <> ISNULL(sa.EnStock, 0); -- Solo registrar si hubo cambio

    ---------------------------------------------------------
    -- 3) Truncar y recargar StockActual
    ---------------------------------------------------------
    TRUNCATE TABLE dbo.StockActual;

    INSERT INTO dbo.StockActual
        (
        IdMaterial,
        EnStock,
        UltimaFechaCompra,
        UltimoPrecioCompra,
        UltimaMonedaCompra
        )
    SELECT
        m.IdMaterial,
        d.EnStock,
        d.UltimaFechaCompra,
        d.UltimoPrecioCompra,
        d.UltimaMonedaCompra
    FROM @Datos d
        JOIN dbo.Materiales m
        ON m.NumeroArticulo = d.NumeroArticulo;
END
GO


IF COL_LENGTH('dbo.Areas', 'IdCentroCosto') IS NULL
BEGIN
    ALTER TABLE dbo.Areas
    ADD IdCentroCosto INT NULL;
END
GO

IF NOT EXISTS (SELECT 1
FROM sys.foreign_keys
WHERE name = 'FK_Areas_CentrosCosto')
BEGIN
    ALTER TABLE dbo.Areas
    ADD CONSTRAINT FK_Areas_CentrosCosto
        FOREIGN KEY (IdCentroCosto) REFERENCES dbo.CentrosCosto(IdCentroCosto);
END
GO




-------------------------------------------------------------
-- TYPEs para Solicitudes
-------------------------------------------------------------

-- Detalle de solicitud: materiales solicitados
IF TYPE_ID('dbo.TDetalleSolicitudMaterial') IS NULL
BEGIN
    CREATE TYPE dbo.TDetalleSolicitudMaterial AS TABLE
    (
        IdMaterial INT NOT NULL,
        CantidadSolicitada DECIMAL(18,4) NOT NULL,
        UnidadMedida NVARCHAR(50) NULL,
        ComentarioLinea NVARCHAR(255) NULL,
        IdArea INT NULL,
        IdRecurso INT NULL
    );
END
GO

-- Detalle de despacho: cantidades aprobadas/despachadas
IF TYPE_ID('dbo.TDespachoSolicitudDetalle') IS NULL
BEGIN
    CREATE TYPE dbo.TDespachoSolicitudDetalle AS TABLE
    (
        IdMaterial INT NOT NULL,
        CantidadAprobada DECIMAL(18,4) NOT NULL,
        ComentarioLinea NVARCHAR(255) NULL
    );
END
GO


-------------------------------------------------------------
-- 1) Crear Solicitud de Material
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_CrearSolicitudMaterial
    @IdSolicitante   INT,
    @FechaSolicitud  DATETIME2 = NULL,
    @Estado          NVARCHAR(30) = 'PENDIENTE',
    @Area            NVARCHAR(100) = NULL,
    @Comentario      NVARCHAR(500) = NULL,
    @IdCorteStock    INT = NULL,
    @IdArea          INT = NULL,
    @IdCentroCosto   INT = NULL,
    @Detalle         dbo.TDetalleSolicitudMaterial READONLY
AS
BEGIN
    SET NOCOUNT ON;

    IF @FechaSolicitud IS NULL
    BEGIN
        SET @FechaSolicitud = SYSDATETIME();
    END

    IF NOT EXISTS (SELECT 1
    FROM @Detalle)
    BEGIN
        RAISERROR('La solicitud debe tener al menos una línea de detalle.', 16, 1);
        RETURN;
    END

    DECLARE @IdSolicitud INT;
    DECLARE @CodigoSolicitud NVARCHAR(50);

    -- Generar código secuencial por día (SOL-yyyymmdd-000001, ...)
    -- Nota: se calcula dentro de la transacción con locks para evitar duplicados por concurrencia.

    BEGIN TRY
        BEGIN TRAN;

        DECLARE @Hoy DATE = CONVERT(DATE, @FechaSolicitud);
        DECLARE @Prefijo NVARCHAR(20) = N'SOL-' + CONVERT(NVARCHAR(8), @Hoy, 112) + N'-';
        DECLARE @UltimoNumero INT;

        SELECT
        @UltimoNumero = ISNULL(MAX(TRY_CAST(RIGHT(s.CodigoSolicitud, 6) AS INT)), 0)
    FROM dbo.SolicitudesMaterial s WITH (UPDLOCK, HOLDLOCK)
    WHERE CONVERT(DATE, s.FechaSolicitud) = @Hoy
        AND s.CodigoSolicitud LIKE @Prefijo + N'%';

        DECLARE @NuevoNumero INT = @UltimoNumero + 1;
        SET @CodigoSolicitud = @Prefijo + RIGHT(N'000000' + CAST(@NuevoNumero AS NVARCHAR(6)), 6);

        INSERT INTO dbo.SolicitudesMaterial
        (
        CodigoSolicitud,
        IdSolicitante,
        FechaSolicitud,
        Estado,
        Area,
        Comentario,
        IdCorteStock,
        IdArea,
        IdCentroCosto
        )
    VALUES
        (
            @CodigoSolicitud,
            @IdSolicitante,
            @FechaSolicitud,
            @Estado,
            @Area,
            @Comentario,
            @IdCorteStock,
            @IdArea,
            @IdCentroCosto
        );

        SET @IdSolicitud = SCOPE_IDENTITY();

        INSERT INTO dbo.DetalleSolicitudesMaterial
        (
        IdSolicitud,
        IdMaterial,
        IdArea,
        IdRecurso,
        CantidadSolicitada,
        CantidadAprobada,
        UnidadMedida,
        ComentarioLinea
        )
    SELECT
        @IdSolicitud,
        d.IdMaterial,
        d.IdArea,
        d.IdRecurso,
        d.CantidadSolicitada,
        NULL, -- CantidadAprobada se llenará en aprobación/despacho
        d.UnidadMedida,
        d.ComentarioLinea
    FROM @Detalle d;

        COMMIT TRAN;

        SELECT
        @IdSolicitud AS IdSolicitud,
        @CodigoSolicitud AS CodigoSolicitud;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRAN;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END
GO


-------------------------------------------------------------
-- 2) Obtener Solicitud (cabecera + detalle con JOINs)
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ObtenerSolicitudMaterial
    @IdSolicitud INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Cabecera con datos de usuario, rol, área y centro de costo
    SELECT
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.IdSolicitante,
        u.NombreCompleto       AS NombreSolicitante,
        u.Email                AS EmailSolicitante,
        -- Rol principal (primer rol asociado)
        (SELECT TOP 1
            r.Nombre
        FROM dbo.UsuariosRoles ur
            JOIN dbo.Roles r ON r.IdRol = ur.IdRol
        WHERE ur.IdUsuario = s.IdSolicitante
        ORDER BY r.Nombre)   AS RolSolicitante,
        s.FechaSolicitud,
        s.Estado,
        s.Area, -- texto libre histórico
        s.Comentario,
        s.IdCorteStock,
        s.IdArea,
        a.Nombre               AS AreaNombre,
        s.IdCentroCosto,
        cc.Codigo              AS CentroCostoCodigo,
        cc.Nombre              AS CentroCostoNombre
    FROM dbo.SolicitudesMaterial s
        JOIN dbo.Usuarios u
        ON u.IdUsuario = s.IdSolicitante
        LEFT JOIN dbo.Areas a
        ON a.IdArea = s.IdArea
        LEFT JOIN dbo.CentrosCosto cc
        ON cc.IdCentroCosto = s.IdCentroCosto
    WHERE s.IdSolicitud = @IdSolicitud;

    -- Detalle con Materiales y StockActual
    SELECT
        d.IdDetalleSolicitud,
        d.IdSolicitud,
        d.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida       AS UnidadMedidaMaterial,
        m.GrupoArticulos,
        d.CantidadSolicitada,
        d.CantidadAprobada,
        d.UnidadMedida       AS UnidadMedidaDetalle,
        d.ComentarioLinea,
        sa.EnStock,
        sa.UltimaFechaCompra,
        sa.UltimoPrecioCompra,
        sa.UltimaMonedaCompra
    FROM dbo.DetalleSolicitudesMaterial d
        JOIN dbo.Materiales m
        ON m.IdMaterial = d.IdMaterial
        LEFT JOIN dbo.StockActual sa
        ON sa.IdMaterial = d.IdMaterial
    WHERE d.IdSolicitud = @IdSolicitud
    ORDER BY d.IdDetalleSolicitud;
END
GO


-------------------------------------------------------------
-- 3) Listar Solicitudes (resumen con filtros)
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ListarSolicitudesMaterial
    @IdSolicitante INT = NULL,
    @Estado        NVARCHAR(30) = NULL,
    @IdArea        INT = NULL,
    @FechaDesde    DATE = NULL,
    @FechaHasta    DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.FechaSolicitud,
        s.Estado,
        s.IdSolicitante,
        u.NombreCompleto       AS NombreSolicitante,
        -- Rol principal
        (SELECT TOP 1
            r.Nombre
        FROM dbo.UsuariosRoles ur
            JOIN dbo.Roles r ON r.IdRol = ur.IdRol
        WHERE ur.IdUsuario = s.IdSolicitante
        ORDER BY r.Nombre)   AS RolSolicitante,
        s.IdArea,
        a.Nombre               AS AreaNombre,
        s.IdCentroCosto,
        cc.Codigo              AS CentroCostoCodigo,
        cc.Nombre              AS CentroCostoNombre,
        s.Comentario,
        -- Totales calculados
        ISNULL(SUM(d.CantidadSolicitada), 0)                                       AS TotalItems,
        ISNULL(SUM(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0)), 0.0)  AS TotalMonto
    FROM dbo.SolicitudesMaterial s
        JOIN dbo.Usuarios u
        ON u.IdUsuario = s.IdSolicitante
        LEFT JOIN dbo.Areas a
        ON a.IdArea = s.IdArea
        LEFT JOIN dbo.CentrosCosto cc
        ON cc.IdCentroCosto = s.IdCentroCosto
        LEFT JOIN dbo.DetalleSolicitudesMaterial d
        ON d.IdSolicitud = s.IdSolicitud
        LEFT JOIN dbo.StockActual sa
        ON sa.IdMaterial = d.IdMaterial
    WHERE
        (@IdSolicitante IS NULL OR s.IdSolicitante = @IdSolicitante)
        AND (@Estado IS NULL OR s.Estado = @Estado)
        AND (@IdArea IS NULL OR s.IdArea = @IdArea)
        AND (@FechaDesde IS NULL OR CONVERT(DATE, s.FechaSolicitud) >= @FechaDesde)
        AND (@FechaHasta IS NULL OR CONVERT(DATE, s.FechaSolicitud) <= @FechaHasta)
    GROUP BY
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.FechaSolicitud,
        s.Estado,
        s.IdSolicitante,
        u.NombreCompleto,
        s.IdArea,
        a.Nombre,
        s.IdCentroCosto,
        cc.Codigo,
        cc.Nombre,
        s.Comentario;
END
GO


-------------------------------------------------------------
-- 4) Registrar Aprobación de Solicitud
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_RegistrarAprobacionSolicitud
    @IdSolicitud  INT,
    @IdAprobador  INT,
    @Estado       NVARCHAR(30),
    -- APROBADA / RECHAZADA
    @Comentario   NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Estado NOT IN ('APROBADA', 'RECHAZADA')
    BEGIN
        RAISERROR('Estado inválido para aprobación. Use APROBADA o RECHAZADA.', 16, 1);
        RETURN;
    END

    SET @Comentario = NULLIF(LTRIM(RTRIM(ISNULL(@Comentario, ''))), '');

    IF @Estado = 'RECHAZADA' AND @Comentario IS NULL
    BEGIN
        RAISERROR('Debes ingresar un comentario al rechazar la solicitud.', 16, 1);
        RETURN;
    END

    BEGIN TRY
        BEGIN TRAN;

        DECLARE @CodigoSolicitud NVARCHAR(50) = NULL;
        DECLARE @EstadoActual NVARCHAR(30) = NULL;

        SELECT
            @CodigoSolicitud = s.CodigoSolicitud,
            @EstadoActual = UPPER(LTRIM(RTRIM(ISNULL(s.Estado, ''))))
        FROM dbo.SolicitudesMaterial s WITH (UPDLOCK, HOLDLOCK)
        WHERE s.IdSolicitud = @IdSolicitud;

        IF @CodigoSolicitud IS NULL
        BEGIN
            RAISERROR('Solicitud no encontrada', 16, 1);
        END

        IF @EstadoActual <> 'PENDIENTE'
        BEGIN
            DECLARE @ErrorEstado NVARCHAR(4000) = CONCAT(
                'La solicitud ',
                ISNULL(@CodigoSolicitud, CONCAT('#', @IdSolicitud)),
                ' ya no está pendiente y no puede procesarse nuevamente.'
            );
            RAISERROR(@ErrorEstado, 16, 1);
        END

        INSERT INTO dbo.Aprobaciones
        (
        IdSolicitud,
        IdAprobador,
        FechaAprobacion,
        Estado,
        Comentario
        )
    VALUES
        (
            @IdSolicitud,
            @IdAprobador,
            SYSDATETIME(),
            @Estado,
            @Comentario
        );

        UPDATE dbo.SolicitudesMaterial
        SET Estado = @Estado
        WHERE IdSolicitud = @IdSolicitud;

        SELECT
            @IdSolicitud AS IdSolicitud,
            @CodigoSolicitud AS CodigoSolicitud,
            @Estado AS Estado;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRAN;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END
GO


-------------------------------------------------------------
-- 5) Listar Aprobaciones de una Solicitud
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ListarAprobacionesPorSolicitud
    @IdSolicitud INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.IdAprobacion,
        a.IdSolicitud,
        a.IdAprobador,
        u.NombreCompleto   AS NombreAprobador,
        u.Email            AS EmailAprobador,
        a.FechaAprobacion,
        a.Estado,
        a.Comentario
    FROM dbo.Aprobaciones a
        JOIN dbo.Usuarios u
        ON u.IdUsuario = a.IdAprobador
    WHERE a.IdSolicitud = @IdSolicitud
    ORDER BY a.FechaAprobacion DESC, a.IdAprobacion DESC;
END
GO


-------------------------------------------------------------
-- 6) Actualizar Estado de una Solicitud (flujo general)
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ActualizarEstadoSolicitudMaterial
    @IdSolicitud INT,
    @NuevoEstado NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;

    -- Aquí podrías validar transiciones válidas si lo deseas
    UPDATE dbo.SolicitudesMaterial
    SET Estado = @NuevoEstado
    WHERE IdSolicitud = @IdSolicitud;
END
GO


-------------------------------------------------------------
-- 7) Registrar Despacho de Solicitud
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_RegistrarDespachoSolicitud
    @IdSolicitud INT,
    @DetalleDesp dbo.TDespachoSolicitudDetalle READONLY,
    @NuevoEstado NVARCHAR(30) = 'COMPLETADA'
-- EN_DESPACHO / COMPLETADA
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1
    FROM @DetalleDesp)
    BEGIN
        RAISERROR('El despacho debe contener al menos una línea.', 16, 1);
        RETURN;
    END

    BEGIN TRY
        BEGIN TRAN;

        -- Actualizar cantidades aprobadas/despachadas en el detalle
        UPDATE ds
        SET
            ds.CantidadAprobada = d.CantidadAprobada,
            ds.ComentarioLinea  = ISNULL(d.ComentarioLinea, ds.ComentarioLinea)
        FROM dbo.DetalleSolicitudesMaterial ds
        JOIN @DetalleDesp d
        ON ds.IdMaterial = d.IdMaterial
            AND ds.IdSolicitud = @IdSolicitud;

        -- Actualizar estado de la solicitud
        UPDATE dbo.SolicitudesMaterial
        SET Estado = @NuevoEstado
        WHERE IdSolicitud = @IdSolicitud;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRAN;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END
GO

-------------------------------------------------------------
-- 8) Tablas y Tipos para Despachos (MEJORADO)
-------------------------------------------------------------

IF OBJECT_ID('dbo.Despachos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Despachos (
        IdDespacho INT IDENTITY(1,1) PRIMARY KEY,
        IdSolicitud INT NOT NULL,
        IdUsuarioDespacha INT NOT NULL,
        FechaDespacho DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
        Observaciones NVARCHAR(500) NULL,
        Estado NVARCHAR(30) NOT NULL DEFAULT('COMPLETO'), -- COMPLETO, PARCIAL
        CONSTRAINT FK_Despachos_Solicitudes FOREIGN KEY (IdSolicitud) REFERENCES dbo.SolicitudesMaterial(IdSolicitud),
        CONSTRAINT FK_Despachos_Usuarios FOREIGN KEY (IdUsuarioDespacha) REFERENCES dbo.Usuarios(IdUsuario)
    );
END
GO

IF OBJECT_ID('dbo.DetalleDespachos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DetalleDespachos (
        IdDetalleDespacho INT IDENTITY(1,1) PRIMARY KEY,
        IdDespacho INT NOT NULL,
        IdDetalleSolicitud INT NULL,
        IdMaterial INT NOT NULL,
        CantidadDespachada DECIMAL(18,4) NOT NULL,
        CONSTRAINT FK_DetalleDespachos_Despachos FOREIGN KEY (IdDespacho) REFERENCES dbo.Despachos(IdDespacho),
        CONSTRAINT FK_DetalleDespachos_DetalleSolicitudesMaterial FOREIGN KEY (IdDetalleSolicitud) REFERENCES dbo.DetalleSolicitudesMaterial(IdDetalleSolicitud),
        CONSTRAINT FK_DetalleDespachos_Materiales FOREIGN KEY (IdMaterial) REFERENCES dbo.Materiales(IdMaterial)
    );
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_DetalleDespachos_IdDespacho_DetalleSolicitud_Material'
      AND object_id = OBJECT_ID('dbo.DetalleDespachos')
)
BEGIN
    CREATE INDEX IX_DetalleDespachos_IdDespacho_DetalleSolicitud_Material
        ON dbo.DetalleDespachos (IdDespacho, IdDetalleSolicitud, IdMaterial)
        INCLUDE (CantidadDespachada);
END
GO

IF TYPE_ID('dbo.TDetalleDespacho') IS NULL
BEGIN
    CREATE TYPE dbo.TDetalleDespacho AS TABLE (
        IdDetalleSolicitud INT NOT NULL,
        CantidadDespachada DECIMAL(18,4) NOT NULL
    );
END
GO

-------------------------------------------------------------
-- 9) Procedimiento de Registro de Despacho (MEJORADO)
-------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_RegistrarDespacho
    @IdSolicitud INT,
    @IdUsuarioDespacha INT,
    @Observaciones NVARCHAR(500),
    @Detalle dbo.TDetalleDespacho READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Insertar cabecera de despacho
        INSERT INTO dbo.Despachos (IdSolicitud, IdUsuarioDespacha, Observaciones, Estado)
        VALUES (@IdSolicitud, @IdUsuarioDespacha, @Observaciones, 'COMPLETO');

        DECLARE @IdDespacho INT = SCOPE_IDENTITY();

        -- 2. Insertar detalle de despacho
        -- Obtenemos IdMaterial desde DetalleSolicitudesMaterial para el registro
        INSERT INTO dbo.DetalleDespachos (IdDespacho, IdDetalleSolicitud, IdMaterial, CantidadDespachada)
        SELECT @IdDespacho, d.IdDetalleSolicitud, ds.IdMaterial, d.CantidadDespachada
        FROM @Detalle d
        JOIN dbo.DetalleSolicitudesMaterial ds ON d.IdDetalleSolicitud = ds.IdDetalleSolicitud;

        -- 3. Actualizar CantidadAprobada en DetalleSolicitudesMaterial (acumulativo)
        UPDATE ds
        SET ds.CantidadAprobada = ISNULL(ds.CantidadAprobada, 0) + d.CantidadDespachada
        FROM dbo.DetalleSolicitudesMaterial ds
        JOIN @Detalle d ON ds.IdDetalleSolicitud = d.IdDetalleSolicitud
        WHERE ds.IdSolicitud = @IdSolicitud;

        -- 4. Descontar del StockActual
        UPDATE sa
        SET sa.EnStock = sa.EnStock - d.CantidadDespachada,
            sa.FechaActualizacion = SYSDATETIME()
        FROM dbo.StockActual sa
        JOIN dbo.DetalleSolicitudesMaterial ds ON sa.IdMaterial = ds.IdMaterial
        JOIN @Detalle d ON ds.IdDetalleSolicitud = d.IdDetalleSolicitud;

        -- 5. Determinar nuevo estado de la solicitud
        DECLARE @TotalSolicitado DECIMAL(18,4);
        DECLARE @TotalDespachado DECIMAL(18,4);

        SELECT @TotalSolicitado = SUM(CantidadSolicitada) FROM dbo.DetalleSolicitudesMaterial WHERE IdSolicitud = @IdSolicitud;
        SELECT @TotalDespachado = SUM(ISNULL(CantidadAprobada, 0)) FROM dbo.DetalleSolicitudesMaterial WHERE IdSolicitud = @IdSolicitud;

        DECLARE @NuevoEstado NVARCHAR(30) = 'COMPLETADA';
        IF @TotalDespachado < @TotalSolicitado
        BEGIN
            SET @NuevoEstado = 'PARCIALMENTE_DESPACHADA';
            UPDATE dbo.Despachos SET Estado = 'PARCIAL' WHERE IdDespacho = @IdDespacho;
        END

        UPDATE dbo.SolicitudesMaterial
        SET Estado = @NuevoEstado
        WHERE IdSolicitud = @IdSolicitud;

        SELECT @NuevoEstado AS NuevoEstado, @IdDespacho AS IdDespachoGenerado;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END
GO

-- Agregar columna OT a SolicitudesMaterial si no existe
IF COL_LENGTH('dbo.SolicitudesMaterial', 'OT') IS NULL
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD OT NVARCHAR(50) NULL;
END
GO

-------------------------------------------------------------
-- Corrección final: catálogo activo/inactivo + importación por modo
-------------------------------------------------------------
IF COL_LENGTH('dbo.Materiales', 'Activo') IS NULL
BEGIN
    ALTER TABLE dbo.Materiales
    ADD Activo BIT NOT NULL CONSTRAINT DF_Materiales_Activo DEFAULT(1);
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarMateriales
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos
    FROM dbo.Materiales m
    WHERE ISNULL(m.Activo, 1) = 1
    ORDER BY m.NumeroArticulo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ListarMaterialesConStock
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos,
        sa.EnStock,
        sa.UltimaFechaCompra,
        sa.UltimoPrecioCompra,
        sa.UltimaMonedaCompra
    FROM dbo.Materiales m WITH (NOLOCK)
        LEFT JOIN dbo.StockActual sa WITH (NOLOCK)
            ON sa.IdMaterial = m.IdMaterial
    WHERE ISNULL(m.Activo, 1) = 1
    ORDER BY m.NumeroArticulo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ObtenerMaterialPorId
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        m.IdMaterial,
        m.NumeroArticulo,
        m.DescripcionArticulo,
        m.UnidadMedida,
        m.GrupoArticulos,
        ISNULL(m.Activo, 1) AS Activo
    FROM dbo.Materiales m
    WHERE m.IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CrearMaterial
    @NumeroArticulo      NVARCHAR(50),
    @DescripcionArticulo NVARCHAR(255),
    @UnidadMedida        NVARCHAR(50),
    @GrupoArticulos      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IdMaterialExistente INT;

    SELECT @IdMaterialExistente = m.IdMaterial
    FROM dbo.Materiales m
    WHERE m.NumeroArticulo = @NumeroArticulo;

    IF @IdMaterialExistente IS NOT NULL
    BEGIN
        UPDATE dbo.Materiales
        SET
            DescripcionArticulo = @DescripcionArticulo,
            UnidadMedida = @UnidadMedida,
            GrupoArticulos = @GrupoArticulos,
            Activo = 1
        WHERE IdMaterial = @IdMaterialExistente;

        SELECT @IdMaterialExistente AS IdMaterial;
        RETURN;
    END

    INSERT INTO dbo.Materiales
    (
        NumeroArticulo,
        DescripcionArticulo,
        UnidadMedida,
        GrupoArticulos,
        Activo
    )
    VALUES
    (
        @NumeroArticulo,
        @DescripcionArticulo,
        @UnidadMedida,
        @GrupoArticulos,
        1
    );

    SELECT SCOPE_IDENTITY() AS IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ActualizarMaterial
    @IdMaterial          INT,
    @NumeroArticulo      NVARCHAR(50),
    @DescripcionArticulo NVARCHAR(255),
    @UnidadMedida        NVARCHAR(50),
    @GrupoArticulos      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Materiales
    SET
        NumeroArticulo = @NumeroArticulo,
        DescripcionArticulo = @DescripcionArticulo,
        UnidadMedida = @UnidadMedida,
        GrupoArticulos = @GrupoArticulos,
        Activo = 1
    WHERE IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_EliminarMaterial
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Materiales
    SET Activo = 0
    WHERE IdMaterial = @IdMaterial;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ImportarMaterialesYStock
    @Datos dbo.TMaterialCarga READONLY,
    @IdUsuario INT = NULL,
    @Modo NVARCHAR(20) = 'ACTUALIZAR'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ModoNormalizado NVARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@Modo, 'ACTUALIZAR'))));
    IF @ModoNormalizado NOT IN ('ACTUALIZAR', 'REEMPLAZAR')
        SET @ModoNormalizado = 'ACTUALIZAR';

    BEGIN TRY
        BEGIN TRANSACTION;

        ;WITH DatosPreparados AS
        (
            SELECT
                NumeroArticulo = LTRIM(RTRIM(d.NumeroArticulo)),
                DescripcionArticulo = LTRIM(RTRIM(d.DescripcionArticulo)),
                EnStock = ISNULL(d.EnStock, 0),
                UnidadMedida = LTRIM(RTRIM(d.UnidadMedida)),
                GrupoArticulos = NULLIF(LTRIM(RTRIM(d.GrupoArticulos)), ''),
                UltimaFechaCompra = d.UltimaFechaCompra,
                UltimoPrecioCompra = d.UltimoPrecioCompra,
                UltimaMonedaCompra = NULLIF(UPPER(LTRIM(RTRIM(d.UltimaMonedaCompra))), ''),
                RN = ROW_NUMBER() OVER (PARTITION BY LTRIM(RTRIM(d.NumeroArticulo)) ORDER BY LTRIM(RTRIM(d.NumeroArticulo)))
            FROM @Datos d
            WHERE LTRIM(RTRIM(d.NumeroArticulo)) <> ''
        ),
        Fuente AS
        (
            SELECT
                NumeroArticulo,
                DescripcionArticulo,
                EnStock,
                UnidadMedida,
                GrupoArticulos,
                UltimaFechaCompra,
                UltimoPrecioCompra,
                UltimaMonedaCompra
            FROM DatosPreparados
            WHERE RN = 1
        )
        UPDATE m
        SET
            m.DescripcionArticulo = f.DescripcionArticulo,
            m.UnidadMedida = f.UnidadMedida,
            m.GrupoArticulos = f.GrupoArticulos,
            m.Activo = 1
        FROM dbo.Materiales m
            INNER JOIN Fuente f
                ON f.NumeroArticulo = m.NumeroArticulo;

        ;WITH DatosPreparados AS
        (
            SELECT
                NumeroArticulo = LTRIM(RTRIM(d.NumeroArticulo)),
                DescripcionArticulo = LTRIM(RTRIM(d.DescripcionArticulo)),
                EnStock = ISNULL(d.EnStock, 0),
                UnidadMedida = LTRIM(RTRIM(d.UnidadMedida)),
                GrupoArticulos = NULLIF(LTRIM(RTRIM(d.GrupoArticulos)), ''),
                UltimaFechaCompra = d.UltimaFechaCompra,
                UltimoPrecioCompra = d.UltimoPrecioCompra,
                UltimaMonedaCompra = NULLIF(UPPER(LTRIM(RTRIM(d.UltimaMonedaCompra))), ''),
                RN = ROW_NUMBER() OVER (PARTITION BY LTRIM(RTRIM(d.NumeroArticulo)) ORDER BY LTRIM(RTRIM(d.NumeroArticulo)))
            FROM @Datos d
            WHERE LTRIM(RTRIM(d.NumeroArticulo)) <> ''
        ),
        Fuente AS
        (
            SELECT
                NumeroArticulo,
                DescripcionArticulo,
                EnStock,
                UnidadMedida,
                GrupoArticulos,
                UltimaFechaCompra,
                UltimoPrecioCompra,
                UltimaMonedaCompra
            FROM DatosPreparados
            WHERE RN = 1
        )
        INSERT INTO dbo.Materiales
        (
            NumeroArticulo,
            DescripcionArticulo,
            UnidadMedida,
            GrupoArticulos,
            Activo
        )
        SELECT
            f.NumeroArticulo,
            f.DescripcionArticulo,
            f.UnidadMedida,
            f.GrupoArticulos,
            1
        FROM Fuente f
            LEFT JOIN dbo.Materiales m
                ON m.NumeroArticulo = f.NumeroArticulo
        WHERE m.IdMaterial IS NULL;

        IF @ModoNormalizado = 'REEMPLAZAR'
        BEGIN
            ;WITH DatosPreparados AS
            (
                SELECT
                    NumeroArticulo = LTRIM(RTRIM(d.NumeroArticulo)),
                    RN = ROW_NUMBER() OVER (PARTITION BY LTRIM(RTRIM(d.NumeroArticulo)) ORDER BY LTRIM(RTRIM(d.NumeroArticulo)))
                FROM @Datos d
                WHERE LTRIM(RTRIM(d.NumeroArticulo)) <> ''
            ),
            Fuente AS
            (
                SELECT NumeroArticulo
                FROM DatosPreparados
                WHERE RN = 1
            )
            UPDATE m
            SET m.Activo = 0
            FROM dbo.Materiales m
                LEFT JOIN Fuente f
                    ON f.NumeroArticulo = m.NumeroArticulo
            WHERE f.NumeroArticulo IS NULL
              AND ISNULL(m.Activo, 1) <> 0;
        END

        DECLARE @StockObjetivo TABLE
        (
            IdMaterial INT PRIMARY KEY,
            EnStock DECIMAL(18,4) NOT NULL,
            UltimaFechaCompra DATE NULL,
            UltimoPrecioCompra DECIMAL(18,4) NULL,
            UltimaMonedaCompra NVARCHAR(10) NULL,
            VinoEnArchivo BIT NOT NULL
        );

        IF @ModoNormalizado = 'REEMPLAZAR'
        BEGIN
            ;WITH DatosPreparados AS
            (
                SELECT
                    NumeroArticulo = LTRIM(RTRIM(d.NumeroArticulo)),
                    DescripcionArticulo = LTRIM(RTRIM(d.DescripcionArticulo)),
                    EnStock = ISNULL(d.EnStock, 0),
                    UnidadMedida = LTRIM(RTRIM(d.UnidadMedida)),
                    GrupoArticulos = NULLIF(LTRIM(RTRIM(d.GrupoArticulos)), ''),
                    UltimaFechaCompra = d.UltimaFechaCompra,
                    UltimoPrecioCompra = d.UltimoPrecioCompra,
                    UltimaMonedaCompra = NULLIF(UPPER(LTRIM(RTRIM(d.UltimaMonedaCompra))), ''),
                    RN = ROW_NUMBER() OVER (PARTITION BY LTRIM(RTRIM(d.NumeroArticulo)) ORDER BY LTRIM(RTRIM(d.NumeroArticulo)))
                FROM @Datos d
                WHERE LTRIM(RTRIM(d.NumeroArticulo)) <> ''
            ),
            Fuente AS
            (
                SELECT
                    NumeroArticulo,
                    DescripcionArticulo,
                    EnStock,
                    UnidadMedida,
                    GrupoArticulos,
                    UltimaFechaCompra,
                    UltimoPrecioCompra,
                    UltimaMonedaCompra
                FROM DatosPreparados
                WHERE RN = 1
            )
            INSERT INTO @StockObjetivo
            (
                IdMaterial,
                EnStock,
                UltimaFechaCompra,
                UltimoPrecioCompra,
                UltimaMonedaCompra,
                VinoEnArchivo
            )
            SELECT
                m.IdMaterial,
                CASE WHEN f.NumeroArticulo IS NULL THEN 0 ELSE f.EnStock END,
                CASE WHEN f.NumeroArticulo IS NULL THEN NULL ELSE f.UltimaFechaCompra END,
                CASE WHEN f.NumeroArticulo IS NULL THEN NULL ELSE f.UltimoPrecioCompra END,
                CASE WHEN f.NumeroArticulo IS NULL THEN NULL ELSE f.UltimaMonedaCompra END,
                CASE WHEN f.NumeroArticulo IS NULL THEN 0 ELSE 1 END
            FROM dbo.Materiales m
                LEFT JOIN Fuente f
                    ON f.NumeroArticulo = m.NumeroArticulo;
        END
        ELSE
        BEGIN
            ;WITH DatosPreparados AS
            (
                SELECT
                    NumeroArticulo = LTRIM(RTRIM(d.NumeroArticulo)),
                    DescripcionArticulo = LTRIM(RTRIM(d.DescripcionArticulo)),
                    EnStock = ISNULL(d.EnStock, 0),
                    UnidadMedida = LTRIM(RTRIM(d.UnidadMedida)),
                    GrupoArticulos = NULLIF(LTRIM(RTRIM(d.GrupoArticulos)), ''),
                    UltimaFechaCompra = d.UltimaFechaCompra,
                    UltimoPrecioCompra = d.UltimoPrecioCompra,
                    UltimaMonedaCompra = NULLIF(UPPER(LTRIM(RTRIM(d.UltimaMonedaCompra))), ''),
                    RN = ROW_NUMBER() OVER (PARTITION BY LTRIM(RTRIM(d.NumeroArticulo)) ORDER BY LTRIM(RTRIM(d.NumeroArticulo)))
                FROM @Datos d
                WHERE LTRIM(RTRIM(d.NumeroArticulo)) <> ''
            ),
            Fuente AS
            (
                SELECT
                    NumeroArticulo,
                    DescripcionArticulo,
                    EnStock,
                    UnidadMedida,
                    GrupoArticulos,
                    UltimaFechaCompra,
                    UltimoPrecioCompra,
                    UltimaMonedaCompra
                FROM DatosPreparados
                WHERE RN = 1
            )
            INSERT INTO @StockObjetivo
            (
                IdMaterial,
                EnStock,
                UltimaFechaCompra,
                UltimoPrecioCompra,
                UltimaMonedaCompra,
                VinoEnArchivo
            )
            SELECT
                m.IdMaterial,
                f.EnStock,
                f.UltimaFechaCompra,
                f.UltimoPrecioCompra,
                f.UltimaMonedaCompra,
                1
            FROM Fuente f
                INNER JOIN dbo.Materiales m
                    ON m.NumeroArticulo = f.NumeroArticulo;
        END

        INSERT INTO dbo.MovimientosInventario
        (
            IdMaterial,
            TipoMovimiento,
            Cantidad,
            StockAnterior,
            StockNuevo,
            FechaMovimiento,
            IdUsuario,
            Referencia
        )
        SELECT
            so.IdMaterial,
            'AJUSTE',
            so.EnStock - ISNULL(sa.EnStock, 0),
            ISNULL(sa.EnStock, 0),
            so.EnStock,
            SYSDATETIME(),
            @IdUsuario,
            CASE
                WHEN @ModoNormalizado = 'REEMPLAZAR' AND so.VinoEnArchivo = 0 THEN 'CARGA_REEMPLAZAR_AUSENTE'
                WHEN @ModoNormalizado = 'REEMPLAZAR' THEN 'CARGA_REEMPLAZAR'
                ELSE 'CARGA_ACTUALIZAR'
            END
        FROM @StockObjetivo so
            LEFT JOIN dbo.StockActual sa
                ON sa.IdMaterial = so.IdMaterial
        WHERE so.EnStock <> ISNULL(sa.EnStock, 0);

        MERGE dbo.StockActual AS target
        USING @StockObjetivo AS source
            ON target.IdMaterial = source.IdMaterial
        WHEN MATCHED THEN
            UPDATE SET
                EnStock = source.EnStock,
                UltimaFechaCompra = source.UltimaFechaCompra,
                UltimoPrecioCompra = source.UltimoPrecioCompra,
                UltimaMonedaCompra = source.UltimaMonedaCompra,
                FechaActualizacion = SYSDATETIME()
        WHEN NOT MATCHED BY TARGET THEN
            INSERT
            (
                IdMaterial,
                EnStock,
                UltimaFechaCompra,
                UltimoPrecioCompra,
                UltimaMonedaCompra,
                FechaActualizacion
            )
            VALUES
            (
                source.IdMaterial,
                source.EnStock,
                source.UltimaFechaCompra,
                source.UltimoPrecioCompra,
                source.UltimaMonedaCompra,
                SYSDATETIME()
            );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END
GO
