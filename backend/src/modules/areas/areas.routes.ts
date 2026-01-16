import { Router } from 'express';
import { listarAreasController, crearAreaController, actualizarAreaController, eliminarAreaController } from './areas.controller';

const router = Router();

router.get('/', listarAreasController);
router.post('/', crearAreaController);
router.put('/:id', actualizarAreaController);
router.delete('/:id', eliminarAreaController);

export default router;
