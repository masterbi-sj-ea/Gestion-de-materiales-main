import { Router } from 'express';
import {
  listarUsuariosController,
  obtenerUsuarioController,
  crearUsuarioController,
  actualizarUsuarioController,
  desactivarUsuarioController
} from './usuarios.controller';

const router = Router();

router.get('/', listarUsuariosController);
router.get('/:id', obtenerUsuarioController);
router.post('/', crearUsuarioController);
router.put('/:id', actualizarUsuarioController);
router.delete('/:id', desactivarUsuarioController);

export default router;
