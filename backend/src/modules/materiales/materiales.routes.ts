import { Router } from 'express';
import multer from 'multer';
import {
  listarMaterialesController,
  listarMaterialesConStockController,
  crearMaterialController,
  actualizarMaterialController,
  eliminarMaterialController,
  importarMaterialesController,
  verImagenMaterialController,
  obtenerImagenMaterialPorNumeroArticuloController,
  obtenerArchivoImagenMaterialController,
  obtenerArchivoImagenMaterialPorNumeroArticuloController,
} from './materiales.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Evita consumir demasiada memoria si suben archivos enormes.
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

const router = Router();

router.get('/', listarMaterialesController);
router.get('/con-stock', listarMaterialesConStockController);
router.get('/imagen', verImagenMaterialController);
router.get('/imagen/:numeroArticulo', obtenerImagenMaterialPorNumeroArticuloController);
router.get('/archivo/:filename', obtenerArchivoImagenMaterialController);
router.get('/archivo/por-numero/:numeroArticulo', obtenerArchivoImagenMaterialPorNumeroArticuloController);
router.get('/imagen-archivo/:numeroArticulo', obtenerArchivoImagenMaterialPorNumeroArticuloController);
router.post('/', crearMaterialController);
router.put('/:id', actualizarMaterialController);
router.delete('/:id', eliminarMaterialController);
router.post('/importar', upload.single('file'), importarMaterialesController);

export default router;
