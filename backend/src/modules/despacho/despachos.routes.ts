import { Router } from 'express';
import { 
  listarPendientesController, 
  listarDespachadasController,
  obtenerDetalleController, 
  registrarDespachoController 
} from './despachos.controller';

const router = Router();

router.get('/pendientes', listarPendientesController);
router.get('/historial', listarDespachadasController);
router.get('/pendientes/:id', obtenerDetalleController);
router.post('/', registrarDespachoController);

export default router;
