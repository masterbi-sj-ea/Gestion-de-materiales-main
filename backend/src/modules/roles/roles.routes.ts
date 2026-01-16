import { Router } from 'express';
import {
  listarRolesController,
  obtenerRolController,
  crearRolController,
  actualizarRolController,
  eliminarRolController
} from './roles.controller';

const router = Router();

router.get('/', listarRolesController);
router.get('/:id', obtenerRolController);
router.post('/', crearRolController);
router.put('/:id', actualizarRolController);
router.delete('/:id', eliminarRolController);

export default router;
