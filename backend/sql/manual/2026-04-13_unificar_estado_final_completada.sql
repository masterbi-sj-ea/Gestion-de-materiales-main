/*
Objetivo:
- Unificar COMPLETADA como estado final oficial de dbo.SolicitudesMaterial.
- Mantener PARCIALMENTE_DESPACHADA como estado intermedio cuando el despacho no cierra toda la solicitud.

Uso:
1. Revisar primero en ambiente de pruebas.
2. Ejecutar completo en la BD real.
*/

BEGIN TRY
    BEGIN TRAN;

    -- Normaliza estados finales legacy si todavía existieran.
    UPDATE dbo.SolicitudesMaterial
    SET Estado = 'COMPLETADA'
    WHERE Estado = 'DESPACHADA';

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

    EXEC(''
    CREATE OR ALTER PROCEDURE dbo.sp_RegistrarDespachoSolicitud
        @IdSolicitud INT,
        @DetalleDesp dbo.TDespachoSolicitudDetalle READONLY,
        @NuevoEstado NVARCHAR(30) = ''''COMPLETADA''''
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM @DetalleDesp)
        BEGIN
            RAISERROR(''''El despacho debe contener al menos una línea.'''', 16, 1);
            RETURN;
        END

        BEGIN TRY
            BEGIN TRAN;

            UPDATE ds
            SET
                ds.CantidadAprobada = d.CantidadAprobada,
                ds.ComentarioLinea  = ISNULL(d.ComentarioLinea, ds.ComentarioLinea)
            FROM dbo.DetalleSolicitudesMaterial ds
            JOIN @DetalleDesp d
              ON ds.IdMaterial = d.IdMaterial
             AND ds.IdSolicitud = @IdSolicitud;

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
    '');

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