/*
  Corrige instalaciones donde dbo.sp_CrearSolicitudMaterial sigue apuntando
  a una versión antigua que referencia dbo.Kardex.

  Ejecuta este script en la base de datos activa del sistema.
*/

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

    IF NOT EXISTS (SELECT 1 FROM @Detalle)
    BEGIN
        RAISERROR('La solicitud debe tener al menos una línea de detalle.', 16, 1);
        RETURN;
    END

    DECLARE @IdSolicitud INT;
    DECLARE @CodigoSolicitud NVARCHAR(50);

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
            NULL,
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
