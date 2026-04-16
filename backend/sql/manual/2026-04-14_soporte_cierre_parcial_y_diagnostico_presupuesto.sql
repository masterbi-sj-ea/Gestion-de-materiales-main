/*
Objetivo:
1. Agregar soporte de columnas para CERRADA_PARCIAL si la BD todavía no las tiene.
2. Diagnosticar el impacto presupuestario usando:
   - reserva pendiente de solicitudes activas
   - ejecutado real desde DetalleDespachos

Notas:
- La lógica de ejecutado real usa IdDetalleSolicitud primero y cae a IdMaterial solo para históricos legacy.
- Si una misma solicitud repite el mismo material en varias líneas/áreas,
  los despachos legacy sin IdDetalleSolicitud siguen siendo ambiguos y se leen por respaldo con IdMaterial.
*/

SET NOCOUNT ON;

IF COL_LENGTH('dbo.SolicitudesMaterial', 'MotivoCierreParcial') IS NULL
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD MotivoCierreParcial NVARCHAR(500) NULL;
END;

IF COL_LENGTH('dbo.SolicitudesMaterial', 'FechaCierreParcial') IS NULL
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD FechaCierreParcial DATETIME2(0) NULL;
END;

IF COL_LENGTH('dbo.SolicitudesMaterial', 'IdUsuarioCierreParcial') IS NULL
BEGIN
    ALTER TABLE dbo.SolicitudesMaterial
    ADD IdUsuarioCierreParcial INT NULL;
END;

DECLARE @IdSolicitud INT = NULL;
DECLARE @IdArea INT = NULL;
DECLARE @Anio INT = NULL;
DECLARE @Mes INT = NULL;

DECLARE @DespachoMatch NVARCHAR(MAX) = CASE
    WHEN COL_LENGTH('dbo.DetalleDespachos', 'IdDetalleSolicitud') IS NULL
        THEN N'dd.IdMaterial = d.IdMaterial'
    ELSE N'(
        dd.IdDetalleSolicitud = d.IdDetalleSolicitud
        OR (
            dd.IdDetalleSolicitud IS NULL
            AND dd.IdMaterial = d.IdMaterial
        )
    )'
END;

DECLARE @Sql NVARCHAR(MAX) = N'
;WITH MovimientoDetalle AS (
    SELECT
        s.IdSolicitud,
        s.CodigoSolicitud,
        s.Estado,
        COALESCE(d.IdArea, s.IdArea) AS IdArea,
        YEAR(s.FechaSolicitud) AS Anio,
        MONTH(s.FechaSolicitud) AS Mes,
        d.IdMaterial,
        ISNULL(sa.UltimoPrecioCompra, 0) AS UltimoPrecioCompra,
        CASE
            WHEN s.Estado IN (''PENDIENTE'', ''APROBADA'', ''EN_DESPACHO'', ''PARCIALMENTE_DESPACHADA'')
                THEN CASE
                    WHEN (
                        ISNULL(d.CantidadAprobada, d.CantidadSolicitada)
                        - ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                    ) > 0
                        THEN (
                            ISNULL(d.CantidadAprobada, d.CantidadSolicitada)
                            - ISNULL(despachosPrevios.CantidadYaDespachada, 0)
                        ) * ISNULL(sa.UltimoPrecioCompra, 0)
                    ELSE 0
                END
            ELSE 0
        END AS ReservaPendiente,
        ISNULL(despachosPrevios.CantidadYaDespachada, 0) * ISNULL(sa.UltimoPrecioCompra, 0) AS EjecutadoReal
    FROM dbo.SolicitudesMaterial s
    INNER JOIN dbo.DetalleSolicitudesMaterial d ON d.IdSolicitud = s.IdSolicitud
    LEFT JOIN dbo.StockActual sa ON sa.IdMaterial = d.IdMaterial
    OUTER APPLY (
        SELECT SUM(dd.CantidadDespachada) AS CantidadYaDespachada
        FROM dbo.DetalleDespachos dd
        INNER JOIN dbo.Despachos desp ON desp.IdDespacho = dd.IdDespacho
        WHERE desp.IdSolicitud = s.IdSolicitud
          AND ' + @DespachoMatch + N'
    ) despachosPrevios
    WHERE COALESCE(d.IdArea, s.IdArea) IS NOT NULL
      AND (@IdSolicitud IS NULL OR s.IdSolicitud = @IdSolicitud)
      AND (@IdArea IS NULL OR COALESCE(d.IdArea, s.IdArea) = @IdArea)
      AND (@Anio IS NULL OR YEAR(s.FechaSolicitud) = @Anio)
      AND (@Mes IS NULL OR MONTH(s.FechaSolicitud) = @Mes)
)
SELECT
    md.IdSolicitud,
    md.CodigoSolicitud,
    md.Estado,
    md.IdArea,
    a.Nombre AS AreaNombre,
    md.Anio,
    md.Mes,
    CAST(SUM(md.ReservaPendiente) AS DECIMAL(18,2)) AS ReservaPendiente,
    CAST(SUM(md.EjecutadoReal) AS DECIMAL(18,2)) AS EjecutadoReal,
    CAST(SUM(md.ReservaPendiente + md.EjecutadoReal) AS DECIMAL(18,2)) AS ImpactoTotal
FROM MovimientoDetalle md
LEFT JOIN dbo.Areas a ON a.IdArea = md.IdArea
GROUP BY
    md.IdSolicitud,
    md.CodigoSolicitud,
    md.Estado,
    md.IdArea,
    a.Nombre,
    md.Anio,
    md.Mes
ORDER BY md.Anio DESC, md.Mes DESC, md.IdSolicitud DESC, md.IdArea ASC;

SELECT
    d.IdSolicitud,
    d.IdMaterial,
    COUNT(*) AS LineasConMismoMaterial,
    STRING_AGG(CAST(ISNULL(d.IdArea, s.IdArea) AS NVARCHAR(20)), '', '') AS AreasInvolucradas
FROM dbo.DetalleSolicitudesMaterial d
INNER JOIN dbo.SolicitudesMaterial s ON s.IdSolicitud = d.IdSolicitud
GROUP BY d.IdSolicitud, d.IdMaterial
HAVING COUNT(*) > 1
ORDER BY d.IdSolicitud DESC, d.IdMaterial ASC;
';

EXEC sp_executesql
    @Sql,
    N'@IdSolicitud INT, @IdArea INT, @Anio INT, @Mes INT',
    @IdSolicitud = @IdSolicitud,
    @IdArea = @IdArea,
    @Anio = @Anio,
    @Mes = @Mes;