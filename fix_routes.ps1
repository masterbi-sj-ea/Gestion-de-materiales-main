
$c = Get-Content .\backend\src\modules\presupuestos\presupuestos.routes.ts;
$c = $c -replace "obtenerDetallePresupuestoController`n}", "obtenerDetallePresupuestoController,`n  importarPresupuestosController`n}";
$newRoute = @"

router.post(
  '/importar',
  requireModulePermission('presupuesto', 'crear'),
  importarPresupuestosController
);
"@
$c += $newRoute;
Set-Content .\backend\src\modules\presupuestos\presupuestos.routes.ts -Value $c;

