import { Router } from 'express';
import {
	listarRecursosPorAreaController,
	obtenerCodigoCuentaController,
	listarRecursosPermitidosController,
	listarRecursosPorMaterialController,
} from './areaRecursoCuenta.controller';

const router = Router();

router.get('/codigo-cuenta', obtenerCodigoCuentaController);
router.get('/recursos', listarRecursosPorAreaController);
router.get('/permitidos', listarRecursosPermitidosController);
router.get('/material', listarRecursosPorMaterialController);

export default router;
