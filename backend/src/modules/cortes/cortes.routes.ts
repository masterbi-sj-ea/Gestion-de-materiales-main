import { Router } from 'express';
import { listarCortesController, crearCorteController, actualizarCorteController, eliminarCorteController } from './cortes.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// Todas las rutas de cortes requieren autenticación
router.get('/', authMiddleware, listarCortesController);
router.post('/', authMiddleware, crearCorteController);
router.put('/:id', authMiddleware, actualizarCorteController);
router.delete('/:id', authMiddleware, eliminarCorteController);

export default router;
