import { Router } from 'express';
import {
  listarPresupuestosController,
  guardarPresupuestoController,
  guardarPresupuestoDetalleController,
  obtenerDetallePresupuestoController
} from './presupuestos.controller';

const router = Router();

router.get('/', listarPresupuestosController);
router.post('/guardar', guardarPresupuestoController);
router.get('/:id/detalle', obtenerDetallePresupuestoController);
router.post('/detalle/guardar', guardarPresupuestoDetalleController);

export default router;
