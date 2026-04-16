
$newService = @"

export interface ImportarPresupuestoFila {
  Anio: number;
  Mes: number;
  IdArea: number;
  MontoTotal: number;
}

export async function importarPresupuestoMasivo(
  filas: ImportarPresupuestoFila[],
  idUsuarioAudit: number
): Promise<{ procesados: number }> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let procesados = 0;

    for (const fila of filas) {
      if (!fila.Anio || !fila.Mes || !fila.IdArea || !fila.MontoTotal) continue;

      const mesNum = Number(fila.Mes);
      if (mesNum < 1 || mesNum > 12) continue;

      // Check duplicate
      const duplicate = await request
        .input(`"pAnio"`, sql.Int, fila.Anio)
        .input(`"pMes"`, sql.Int, fila.Mes)
        .input(`"pIdArea"`, sql.Int, fila.IdArea)
        .query(`
          SELECT TOP 1 IdPresupuesto
          FROM dbo.Presupuestos
          WHERE Anio = @pAnio AND Mes = @pMes AND IdArea = @pIdArea AND Activo = 1
        `);

      const existingId = duplicate.recordset?.[0]?.IdPresupuesto ?? null;

      if (existingId) {
        await request
          .input(`"uIdPres"`, sql.Int, existingId)
          .input(`"uMonto"`, sql.Decimal(18, 2), fila.MontoTotal)
          .query(`
            UPDATE dbo.Presupuestos
            SET MontoTotal = @uMonto
            WHERE IdPresupuesto = @uIdPres;
          `);
      } else {
        await request
          .input(`"iAnio"`, sql.Int, fila.Anio)
          .input(`"iMes"`, sql.Int, fila.Mes)
          .input(`"iIdArea"`, sql.Int, fila.IdArea)
          .input(`"iMonto"`, sql.Decimal(18, 2), fila.MontoTotal)
          .query(`
            INSERT INTO dbo.Presupuestos (Anio, Mes, IdArea, MontoTotal, Moneda, Activo)
            VALUES (@iAnio, @iMes, @iIdArea, @iMonto, 'USD', 1);
          `);
      }
      procesados++;
    }
    
    await transaction.commit();
    return { procesados };
  } catch (err) {
    if (transaction) await transaction.rollback();
    throw err;
  }
}
"@
Add-Content -Path .\backend\src\modules\presupuestos\presupuestos.service.ts -Value $newService

