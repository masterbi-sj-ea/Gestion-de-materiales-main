import { Router } from 'express';
import { 
  listarPendientesController, 
  listarDespachadasController,
  obtenerDetalleController, 
  registrarDespachoController,
  contarDespachosHoyController 
} from './despachos.controller';

const router = Router();

router.get('/pendientes', listarPendientesController);
router.get('/historial', listarDespachadasController);
router.get('/pendientes/:id', obtenerDetalleController);
router.post('/', registrarDespachoController);
router.get('/metrics/hoy', contarDespachosHoyController);

export default router;
