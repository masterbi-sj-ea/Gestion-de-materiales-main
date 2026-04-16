import { Router } from 'express';
import {
  listarPendientesController,
  listarDespachadasController,
  obtenerDetalleController,
  registrarDespachoController,
  contarDespachosHoyController,
  generarPdfController,
  generarDevolucionPdfController,
  listarDevolucionesPorDespachoController,
  obtenerDetalleParaDevolucionController,
  registrarDevolucionController,
  anularDevolucionController,
} from './despachos.controller';
import { requireAnyModulePermission, requireModulePermission } from '../../middleware/accessControl';

const router = Router();

router.get('/pendientes', requireModulePermission('despacho', 'ver'), listarPendientesController);
router.get('/historial', requireModulePermission('despacho', 'ver'), listarDespachadasController);
router.get('/pendientes/:id', requireModulePermission('despacho', 'ver'), obtenerDetalleController);
router.post(
  '/',
  requireAnyModulePermission([
    { moduloCodigo: 'despacho', accion: 'crear' },
    { moduloCodigo: 'despacho', accion: 'aprobar' },
  ]),
  registrarDespachoController,
);
router.get('/metrics/hoy', requireModulePermission('despacho', 'ver'), contarDespachosHoyController);
router.get('/:id/pdf', requireModulePermission('despacho', 'ver'), generarPdfController);
router.get('/devoluciones/:id/pdf', requireModulePermission('despacho', 'ver'), generarDevolucionPdfController);

router.get(
  '/:id/devoluciones',
  requireModulePermission('despacho', 'editar'),
  listarDevolucionesPorDespachoController,
);

router.get(
  '/:id/devolucion-detalle',
  requireModulePermission('despacho', 'editar'),
  obtenerDetalleParaDevolucionController,
);

router.post(
  '/:id/devoluciones',
  requireModulePermission('despacho', 'editar'),
  registrarDevolucionController,
);

router.post(
  '/devoluciones/:id/anular',
  requireModulePermission('despacho', 'eliminar'),
  anularDevolucionController,
);

export default router;
