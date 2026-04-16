/*
Diagnóstico de presupuesto para solicitudes por área.

Objetivo:
- Ver si una solicitud APROBADA / DESPACHADA del área realmente está entrando al comprometido/consumo.
- Confirmar estado, fecha, área y monto de las solicitudes recientes del período.
- Replicar el agregado que usa el backend para calcular Comprometido / Consumo.

Uso:
1) Ajusta @IdArea.
2) Si quieres revisar una solicitud puntual, llena @CodigoSolicitud.
3) Ejecuta el script completo.
4) Pégame TODOS los resultsets.
*/

SET NOCOUNT ON;

DECLARE @IdArea INT = 0;
DECLARE @CodigoSolicitud NVARCHAR(50) = NULL;
DECLARE @Anio INT = YEAR(GETDATE());
DECLARE @Mes INT = MONTH(GETDATE());

IF @IdArea <= 0
BEGIN
  RAISERROR('Debes asignar @IdArea antes de ejecutar el script.', 16, 1);
  RETURN;
END;

SELECT
  @IdArea AS IdArea,
  @CodigoSolicitud AS CodigoSolicitud,
  @Anio AS Anio,
  @Mes AS Mes;

SELECT TOP (1)
  a.IdArea,
  a.Nombre AS AreaNombre,
  a.IdCentroCosto,
  cc.Codigo AS CodigoCentroCosto,
  cc.Nombre AS NombreCentroCosto
FROM dbo.Areas a
LEFT JOIN dbo.CentrosCosto cc
  ON cc.IdCentroCosto = a.IdCentroCosto
WHERE a.IdArea = @IdArea;

SELECT
  p.IdPresupuesto,
  p.Anio,
  p.Mes,
  p.MontoTotal AS Presupuesto,
  p.Moneda,
  p.Activo
FROM dbo.Presupuestos p
WHERE p.IdArea = @IdArea
  AND p.Activo = 1
  AND p.Anio = @Anio
  AND (p.Mes = @Mes OR p.Mes IS NULL)
ORDER BY CASE WHEN p.Mes = @Mes THEN 0 ELSE 1 END, p.IdPresupuesto DESC;

;WITH SolicitudesPeriodo AS (
  SELECT
    s.IdSolicitud,
    s.CodigoSolicitud,
    s.FechaSolicitud,
    s.Estado,
    COALESCE(d.IdArea, s.IdArea) AS IdAreaMovimiento,
    SUM(ISNULL(d.CantidadSolicitada, 0)) AS TotalCantidadSolicitada,
    SUM(ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0)) AS TotalMontoSolicitud,
    SUM(CASE WHEN s.Estado IN ('PENDIENTE', 'APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA', 'COMPLETADA')
             THEN ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0)
             ELSE 0 END) AS AportaComprometido,
    SUM(CASE WHEN s.Estado IN ('PARCIALMENTE_DESPACHADA', 'COMPLETADA')
             THEN ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0)
             ELSE 0 END) AS AportaConsumo
  FROM dbo.SolicitudesMaterial s
  INNER JOIN dbo.DetalleSolicitudesMaterial d
    ON d.IdSolicitud = s.IdSolicitud
  LEFT JOIN dbo.StockActual sa
    ON sa.IdMaterial = d.IdMaterial
  WHERE COALESCE(d.IdArea, s.IdArea) = @IdArea
    AND YEAR(s.FechaSolicitud) = @Anio
    AND MONTH(s.FechaSolicitud) = @Mes
  GROUP BY
    s.IdSolicitud,
    s.CodigoSolicitud,
    s.FechaSolicitud,
    s.Estado,
    COALESCE(d.IdArea, s.IdArea)
)
SELECT
  IdSolicitud,
  CodigoSolicitud,
  FechaSolicitud,
  Estado,
  IdAreaMovimiento,
  TotalCantidadSolicitada,
  TotalMontoSolicitud,
  AportaComprometido,
  AportaConsumo
FROM SolicitudesPeriodo
WHERE @CodigoSolicitud IS NULL OR CodigoSolicitud = @CodigoSolicitud
ORDER BY FechaSolicitud DESC, IdSolicitud DESC;

;WITH MovimientoArea AS (
  SELECT
    COALESCE(d.IdArea, s.IdArea) AS IdArea,
    YEAR(s.FechaSolicitud) AS Anio,
    MONTH(s.FechaSolicitud) AS Mes,
    SUM(CASE WHEN s.Estado IN ('PENDIENTE', 'APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA', 'COMPLETADA')
             THEN ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0)
             ELSE 0 END) AS Comprometido,
    SUM(CASE WHEN s.Estado IN ('PARCIALMENTE_DESPACHADA', 'COMPLETADA')
             THEN ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0)
             ELSE 0 END) AS Ejecutado,
    SUM(CASE WHEN s.Estado IN ('PARCIALMENTE_DESPACHADA', 'COMPLETADA')
             THEN ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0)
             ELSE 0 END) AS Consumo
  FROM dbo.SolicitudesMaterial s
  INNER JOIN dbo.DetalleSolicitudesMaterial d
    ON d.IdSolicitud = s.IdSolicitud
  LEFT JOIN dbo.StockActual sa
    ON sa.IdMaterial = d.IdMaterial
  WHERE COALESCE(d.IdArea, s.IdArea) = @IdArea
    AND YEAR(s.FechaSolicitud) = @Anio
    AND MONTH(s.FechaSolicitud) = @Mes
  GROUP BY COALESCE(d.IdArea, s.IdArea), YEAR(s.FechaSolicitud), MONTH(s.FechaSolicitud)
)
SELECT
  IdArea,
  Anio,
  Mes,
  Comprometido,
  Ejecutado,
  Consumo
FROM MovimientoArea;

SELECT TOP (50)
  s.IdSolicitud,
  s.CodigoSolicitud,
  s.FechaSolicitud,
  s.Estado,
  s.IdArea,
  a.Nombre AS AreaCabecera,
  d.IdDetalleSolicitud,
  d.IdMaterial,
  d.IdArea AS AreaDetalle,
  m.NumeroArticulo,
  d.CantidadSolicitada,
  d.CantidadAprobada,
  sa.UltimoPrecioCompra,
  ISNULL(d.CantidadSolicitada * ISNULL(sa.UltimoPrecioCompra, 0), 0) AS MontoLinea
FROM dbo.SolicitudesMaterial s
INNER JOIN dbo.DetalleSolicitudesMaterial d
  ON d.IdSolicitud = s.IdSolicitud
LEFT JOIN dbo.Areas a
  ON a.IdArea = s.IdArea
LEFT JOIN dbo.Materiales m
  ON m.IdMaterial = d.IdMaterial
LEFT JOIN dbo.StockActual sa
  ON sa.IdMaterial = d.IdMaterial
WHERE COALESCE(d.IdArea, s.IdArea) = @IdArea
  AND YEAR(s.FechaSolicitud) = @Anio
  AND MONTH(s.FechaSolicitud) = @Mes
  AND (@CodigoSolicitud IS NULL OR s.CodigoSolicitud = @CodigoSolicitud)
ORDER BY s.FechaSolicitud DESC, s.IdSolicitud DESC, d.IdDetalleSolicitud ASC;