import { Router } from 'express';
import {
	listarAreasController,
	listarMisAreasPermitidasController,
	crearAreaController,
	actualizarAreaController,
	eliminarAreaController,
} from './areas.controller';

const router = Router();

router.get('/mis-areas-permitidas', listarMisAreasPermitidasController);
router.get('/', listarAreasController);
router.post('/', crearAreaController);
router.put('/:id', actualizarAreaController);
router.delete('/:id', eliminarAreaController);

export default router;
