import { Router } from 'express';
import { listarModulosController } from './modulos.controller';

const router = Router();

router.get('/', listarModulosController);

export default router;
