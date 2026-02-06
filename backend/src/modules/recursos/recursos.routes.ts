import { Router } from 'express';
import { listarRecursosController } from './recursos.controller';

const router = Router();

router.get('/', listarRecursosController);

export default router;
