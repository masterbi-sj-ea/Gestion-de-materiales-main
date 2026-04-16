/*
Objetivo:
1. Persistir IdDetalleSolicitud en dbo.DetalleDespachos para que los cálculos usen primero la línea real despachada.
2. Mantener compatibilidad con históricos legacy que solo tienen IdMaterial.

Notas:
- Los históricos solo se rellenan automáticamente cuando la solicitud tiene una única línea para ese material.
- Si una solicitud repite el mismo material en varias líneas, esos despachos legacy quedan con IdDetalleSolicitud = NULL
  y el backend seguirá usando el respaldo por IdMaterial para no inventar una trazabilidad incorrecta.
*/

SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRAN;

    IF COL_LENGTH('dbo.DetalleDespachos', 'IdDetalleSolicitud') IS NULL
    BEGIN
        ALTER TABLE dbo.DetalleDespachos
        ADD IdDetalleSolicitud INT NULL;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = 'FK_DetalleDespachos_DetalleSolicitudesMaterial'
          AND parent_object_id = OBJECT_ID('dbo.DetalleDespachos')
    )
    BEGIN
        ALTER TABLE dbo.DetalleDespachos
        ADD CONSTRAINT FK_DetalleDespachos_DetalleSolicitudesMaterial
            FOREIGN KEY (IdDetalleSolicitud) REFERENCES dbo.DetalleSolicitudesMaterial(IdDetalleSolicitud);
    END;

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
    END;

    ;WITH LineasUnicas AS (
        SELECT
            ds.IdSolicitud,
            ds.IdMaterial,
            MIN(ds.IdDetalleSolicitud) AS IdDetalleSolicitud
        FROM dbo.DetalleSolicitudesMaterial ds
        GROUP BY ds.IdSolicitud, ds.IdMaterial
        HAVING COUNT(*) = 1
    )
    UPDATE dd
    SET dd.IdDetalleSolicitud = lu.IdDetalleSolicitud
    FROM dbo.DetalleDespachos dd
    INNER JOIN dbo.Despachos desp
        ON desp.IdDespacho = dd.IdDespacho
    INNER JOIN LineasUnicas lu
        ON lu.IdSolicitud = desp.IdSolicitud
       AND lu.IdMaterial = dd.IdMaterial
    WHERE dd.IdDetalleSolicitud IS NULL;

    EXEC(''
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

            INSERT INTO dbo.Despachos (IdSolicitud, IdUsuarioDespacha, Observaciones, Estado)
            VALUES (@IdSolicitud, @IdUsuarioDespacha, @Observaciones, ''''COMPLETO'''');

            DECLARE @IdDespacho INT = SCOPE_IDENTITY();

            INSERT INTO dbo.DetalleDespachos (IdDespacho, IdDetalleSolicitud, IdMaterial, CantidadDespachada)
            SELECT @IdDespacho, d.IdDetalleSolicitud, ds.IdMaterial, d.CantidadDespachada
            FROM @Detalle d
            JOIN dbo.DetalleSolicitudesMaterial ds ON d.IdDetalleSolicitud = ds.IdDetalleSolicitud;

            UPDATE ds
            SET ds.CantidadAprobada = ISNULL(ds.CantidadAprobada, 0) + d.CantidadDespachada
            FROM dbo.DetalleSolicitudesMaterial ds
            JOIN @Detalle d ON ds.IdDetalleSolicitud = d.IdDetalleSolicitud
            WHERE ds.IdSolicitud = @IdSolicitud;

            UPDATE sa
            SET sa.EnStock = sa.EnStock - d.CantidadDespachada,
                sa.FechaActualizacion = SYSDATETIME()
            FROM dbo.StockActual sa
            JOIN dbo.DetalleSolicitudesMaterial ds ON sa.IdMaterial = ds.IdMaterial
            JOIN @Detalle d ON ds.IdDetalleSolicitud = d.IdDetalleSolicitud;

            DECLARE @TotalSolicitado DECIMAL(18,4);
            DECLARE @TotalDespachado DECIMAL(18,4);

            SELECT @TotalSolicitado = SUM(CantidadSolicitada)
            FROM dbo.DetalleSolicitudesMaterial
            WHERE IdSolicitud = @IdSolicitud;

            SELECT @TotalDespachado = SUM(ISNULL(CantidadAprobada, 0))
            FROM dbo.DetalleSolicitudesMaterial
            WHERE IdSolicitud = @IdSolicitud;

            DECLARE @NuevoEstado NVARCHAR(30) = ''''COMPLETADA'''';
            IF @TotalDespachado < @TotalSolicitado
            BEGIN
                SET @NuevoEstado = ''''PARCIALMENTE_DESPACHADA'''';
                UPDATE dbo.Despachos SET Estado = ''''PARCIAL'''' WHERE IdDespacho = @IdDespacho;
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
    '');

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    THROW;
END CATCH;