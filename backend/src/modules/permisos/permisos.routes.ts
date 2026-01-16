import { Router } from 'express';
import { getPermisosPorRolController, guardarPermisosRolController } from './permisos.controller';

const router = Router();

// GET /api/permisos/rol/:idRol
router.get('/rol/:idRol', getPermisosPorRolController);

// POST /api/permisos/rol/:idRol
router.post('/rol/:idRol', guardarPermisosRolController);

export default router;
