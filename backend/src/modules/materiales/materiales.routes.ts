import { Router } from 'express';
import multer from 'multer';
import {
  listarMaterialesController,
  listarMaterialesConStockController,
  listarMaterialesPermitidosController,
  crearMaterialController,
  actualizarMaterialController,
  eliminarMaterialController,
  reactivarMaterialController,
  importarMaterialesController,
  obtenerImagenMaterialPorNumeroArticuloController,
  obtenerArchivoImagenMaterialPorNumeroArticuloController,
} from './materiales.controller';
import { requireModulePermission } from '../../middleware/accessControl';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Evita consumir demasiada memoria si suben archivos enormes.
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

const router = Router();

router.get('/', requireModulePermission('materiales', 'ver'), listarMaterialesController);
router.get('/con-stock', requireModulePermission('materiales', 'ver'), listarMaterialesConStockController);
router.get('/permitidos', requireModulePermission('materiales', 'ver'), listarMaterialesPermitidosController);
router.get('/imagen/:numeroArticulo', requireModulePermission('materiales', 'ver'), obtenerImagenMaterialPorNumeroArticuloController);
router.get('/archivo/por-numero/:numeroArticulo', requireModulePermission('materiales', 'ver'), obtenerArchivoImagenMaterialPorNumeroArticuloController);
router.get('/imagen-archivo/:numeroArticulo', requireModulePermission('materiales', 'ver'), obtenerArchivoImagenMaterialPorNumeroArticuloController);
router.post('/', requireModulePermission('materiales', 'crear'), crearMaterialController);
router.put('/:id', requireModulePermission('materiales', 'editar'), actualizarMaterialController);
router.put('/:id/reactivar', requireModulePermission('materiales', 'editar'), reactivarMaterialController);
router.delete('/:id', requireModulePermission('materiales', 'eliminar'), eliminarMaterialController);
router.post('/importar', requireModulePermission('materiales', 'crear'), upload.single('file'), importarMaterialesController);

export default router;
