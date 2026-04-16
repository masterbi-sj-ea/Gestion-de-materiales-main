
$c = Get-Content .\backend\src\modules\presupuestos\presupuestos.controller.ts;
$c = $c -replace "obtenerDetallePresupuesto`n}", "obtenerDetallePresupuesto,`n  importarPresupuestoMasivo`n}";
$newController = @"

export async function importarPresupuestosController(req: AuthRequest, res: Response) {
  const { filas } = req.body || {};

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ message: "No se enviaron filas para importar." });
  }

  const userId = req.user?.idUsuario;
  if (!userId) {
    return res.status(401).json({ message: "Usuario no autenticado" });
  }

  try {
    const result = await importarPresupuestoMasivo(filas, userId);
    
    await registrarAuditoria(
      userId,
      "CRITICA",
      "presupuesto",
      null,
      "IMPORTAR_PRESUPUESTO_EXCEL",
      "Se importó lista masiva de presupuestos desde Excel",
      { totalFilas: result.procesados }
    );

    return res.status(200).json({ message: "Importación exitosa", procesados: result.procesados });
  } catch (error: any) {
    console.error("Error importando presupuestos masivos:", error);
    return res.status(500).json({ message: "Error al importar presupuestos", error: error.message });
  }
}
"@
$c += $newController;
Set-Content .\backend\src\modules\presupuestos\presupuestos.controller.ts -Value $c;

