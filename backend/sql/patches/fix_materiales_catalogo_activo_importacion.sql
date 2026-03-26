/*
  Corrige el catálogo de materiales para trabajar con desactivación lógica
  y dos modos de importación:

  - ACTUALIZAR: solo procesa materiales presentes en el archivo.
  - REEMPLAZAR: desactiva ausentes y pone su stock en 0.

  Ejecuta este script en la base de datos activa del sistema.
*/

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
