import { Router } from 'express';
import {
  listarPresupuestosController,
  guardarPresupuestoController,
  guardarPresupuestoDetalleController,
  obtenerDetallePresupuestoController,
  importarPresupuestosController
} from './presupuestos.controller';
import { requireAnyModulePermission, requireModulePermission } from '../../middleware/accessControl';

const router = Router();

router.get('/', requireModulePermission('presupuesto', 'ver'), listarPresupuestosController);
router.post(
  '/guardar',
  requireAnyModulePermission([
    { moduloCodigo: 'presupuesto', accion: 'crear' },
    { moduloCodigo: 'presupuesto', accion: 'editar' },
  ]),
  guardarPresupuestoController,
);
router.get('/:id/detalle', requireModulePermission('presupuesto', 'ver'), obtenerDetallePresupuestoController);
router.post(
  '/detalle/guardar',
  requireAnyModulePermission([
    { moduloCodigo: 'presupuesto', accion: 'crear' },
    { moduloCodigo: 'presupuesto', accion: 'editar' },
  ]),
  guardarPresupuestoDetalleController,
);

router.post(
  '/importar',
  requireAnyModulePermission([
    { moduloCodigo: 'presupuesto', accion: 'crear' },
    { moduloCodigo: 'presupuesto', accion: 'editar' },
  ]),
  importarPresupuestosController
);

export default router;
