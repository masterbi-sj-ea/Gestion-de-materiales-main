import { Router } from 'express';
import { listarCentrosCostoController, crearCentroCostoController } from './centrosCosto.controller';

const router = Router();

router.get('/', listarCentrosCostoController);
router.post('/', crearCentroCostoController);

export default router;
