import { Router } from 'express';
import {
  listarPresupuestosController,
  crearPresupuestoController,
  actualizarPresupuestoController,
} from './presupuestos.controller';

const router = Router();

router.get('/', listarPresupuestosController);
router.post('/', crearPresupuestoController);
router.put('/:id', actualizarPresupuestoController);

export default router;
