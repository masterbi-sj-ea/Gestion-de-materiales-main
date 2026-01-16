import { Router } from 'express';
import { listarAuditoriaController } from './auditoria.controller';

const router = Router();

router.get('/', listarAuditoriaController);

export default router;
