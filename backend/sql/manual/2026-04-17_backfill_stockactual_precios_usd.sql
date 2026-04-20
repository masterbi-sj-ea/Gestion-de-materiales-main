USE [GestionMateriales];
GO

DECLARE @TipoCambioUsdToCord DECIMAL(18,6) = 36.80;

-- Vista previa
SELECT TOP (50)
    IdMaterial,
    EnStock,
    UltimoPrecioCompra,
    UltimaMonedaCompra,
    CASE
        WHEN ISNULL(UltimaMonedaCompra, 'COR') LIKE '%USD%' THEN UltimoPrecioCompra
        ELSE ROUND(UltimoPrecioCompra / @TipoCambioUsdToCord, 4)
    END AS PrecioUSDPropuesto
FROM dbo.StockActual
WHERE UltimoPrecioCompra IS NOT NULL
ORDER BY IdMaterial;
GO

-- Aplicacion real
UPDATE dbo.StockActual
SET
    UltimoPrecioCompra = CASE
        WHEN ISNULL(UltimaMonedaCompra, 'COR') LIKE '%USD%' THEN UltimoPrecioCompra
        ELSE ROUND(UltimoPrecioCompra / @TipoCambioUsdToCord, 4)
    END,
    UltimaMonedaCompra = CASE
        WHEN UltimoPrecioCompra IS NULL THEN UltimaMonedaCompra
        ELSE 'USD'
    END
WHERE UltimoPrecioCompra IS NOT NULL;
GO