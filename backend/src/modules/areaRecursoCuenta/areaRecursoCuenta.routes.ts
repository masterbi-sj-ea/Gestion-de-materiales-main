import { Router } from 'express';
import { listarRecursosPorAreaController, obtenerCodigoCuentaController } from './areaRecursoCuenta.controller';

const router = Router();

router.get('/codigo-cuenta', obtenerCodigoCuentaController);
router.get('/recursos', listarRecursosPorAreaController);

export default router;
