import { Router } from 'express';
import {
	listarCortesController,
	crearCorteController,
	actualizarCorteController,
	eliminarCorteController,
	obtenerDetalleCorteController,
	cargarSnapshotCorteController,
	registrarConteoCorteController,
} from './cortes.controller';
import { authMiddleware } from '../../middleware/auth';
import { requireModulePermission } from '../../middleware/accessControl';

const router = Router();

router.get('/', authMiddleware, requireModulePermission('cortes', 'ver'), listarCortesController);
router.post('/', authMiddleware, requireModulePermission('cortes', 'crear'), crearCorteController);
router.get('/:id/detalle', authMiddleware, requireModulePermission('cortes', 'ver'), obtenerDetalleCorteController);
router.post('/:id/snapshot', authMiddleware, requireModulePermission('cortes', 'crear'), cargarSnapshotCorteController);
router.post('/:id/conteo', authMiddleware, requireModulePermission('cortes', 'editar'), registrarConteoCorteController);
router.put('/:id', authMiddleware, requireModulePermission('cortes', 'editar'), actualizarCorteController);
router.delete('/:id', authMiddleware, requireModulePermission('cortes', 'eliminar'), eliminarCorteController);

export default router;
