import { Router } from 'express';
import multer from 'multer';
import {
  listarMaterialesController,
  listarMaterialesConStockController,
  crearMaterialController,
  actualizarMaterialController,
  eliminarMaterialController,
  importarMaterialesController,
} from './materiales.controller';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.get('/', listarMaterialesController);
router.get('/con-stock', listarMaterialesConStockController);
router.post('/', crearMaterialController);
router.put('/:id', actualizarMaterialController);
router.delete('/:id', eliminarMaterialController);
router.post('/importar', upload.single('file'), importarMaterialesController);

export default router;
