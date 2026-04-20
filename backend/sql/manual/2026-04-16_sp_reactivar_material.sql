USE [GestionMateriales];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ReactivarMaterial
    @IdMaterial INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @IdMaterial IS NULL OR @IdMaterial <= 0
    BEGIN
        RAISERROR('IdMaterial inválido.', 16, 1);
        RETURN;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Materiales
        WHERE IdMaterial = @IdMaterial
    )
    BEGIN
        RAISERROR('El material indicado no existe.', 16, 1);
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.Materiales
        WHERE IdMaterial = @IdMaterial
          AND ISNULL(Activo, 1) = 1
    )
    BEGIN
        SELECT
            @IdMaterial AS IdMaterial,
            'YA_ACTIVO' AS Resultado;
        RETURN;
    END;

    /*
      Blindaje extra:
      si por alguna inconsistencia histórica existiera otro activo
      con el mismo NumeroArticulo, bloqueamos la reactivación.
    */
    IF EXISTS (
        SELECT 1
        FROM dbo.Materiales mInactivo
        INNER JOIN dbo.Materiales mActivo
            ON LTRIM(RTRIM(mActivo.NumeroArticulo)) = LTRIM(RTRIM(mInactivo.NumeroArticulo))
           AND mActivo.IdMaterial <> mInactivo.IdMaterial
        WHERE mInactivo.IdMaterial = @IdMaterial
          AND ISNULL(mInactivo.Activo, 1) = 0
          AND ISNULL(mActivo.Activo, 1) = 1
    )
    BEGIN
        RAISERROR('No se puede reactivar porque ya existe otro material activo con el mismo número de artículo.', 16, 1);
        RETURN;
    END;

    UPDATE dbo.Materiales
    SET Activo = 1
    WHERE IdMaterial = @IdMaterial;

    SELECT
        @IdMaterial AS IdMaterial,
        'REACTIVADO' AS Resultado;
END
GO