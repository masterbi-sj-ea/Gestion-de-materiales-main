import { Router } from 'express';
import { listarMovimientosController } from './kardex.controller';

const router = Router();

router.get('/', listarMovimientosController);

export default router;
