import { Router } from 'express';
import {
  crearSolicitudController,
  listarSolicitudesController,
  obtenerSolicitudController,
  previewPresupuestoSolicitudController,
  actualizarSolicitudController,
  registrarAprobacionSolicitudController,
  listarAprobacionesPorSolicitudController,
  actualizarEstadoSolicitudController,
  registrarDespachoSolicitudController,
  generarPdfSolicitudController,
} from './solicitudes.controller';
import { requireAnyModulePermission, requireModulePermission } from '../../middleware/accessControl';

const router = Router();

router.get(
  '/',
  requireAnyModulePermission([
    { moduloCodigo: 'solicitudes', accion: 'ver' },
    { moduloCodigo: 'aprobaciones', accion: 'ver' },
  ]),
  listarSolicitudesController,
);
router.post(
  '/presupuesto-preview',
  requireAnyModulePermission([
    { moduloCodigo: 'crear-solicitud', accion: 'ver' },
    { moduloCodigo: 'crear-solicitud', accion: 'crear' },
    { moduloCodigo: 'solicitudes', accion: 'ver' },
    { moduloCodigo: 'solicitudes', accion: 'crear' },
    { moduloCodigo: 'solicitudes', accion: 'editar' },
  ]),
  previewPresupuestoSolicitudController,
);
router.post(
  '/',
  requireAnyModulePermission([
    { moduloCodigo: 'crear-solicitud', accion: 'ver' },
    { moduloCodigo: 'crear-solicitud', accion: 'crear' },
    { moduloCodigo: 'solicitudes', accion: 'crear' },
  ]),
  crearSolicitudController,
);
router.put('/:id', requireModulePermission('solicitudes', 'editar'), actualizarSolicitudController);
router.get(
  '/:id',
  requireAnyModulePermission([
    { moduloCodigo: 'solicitudes', accion: 'ver' },
    { moduloCodigo: 'aprobaciones', accion: 'ver' },
    { moduloCodigo: 'despacho', accion: 'ver' },
  ]),
  obtenerSolicitudController,
);
router.get(
  '/:id/pdf',
  requireAnyModulePermission([
    { moduloCodigo: 'solicitudes', accion: 'ver' },
    { moduloCodigo: 'aprobaciones', accion: 'ver' },
    { moduloCodigo: 'despacho', accion: 'ver' },
  ]),
  generarPdfSolicitudController,
);
router.post('/:id/aprobaciones', requireModulePermission('aprobaciones', 'aprobar'), registrarAprobacionSolicitudController);
router.get(
  '/:id/aprobaciones',
  requireAnyModulePermission([
    { moduloCodigo: 'solicitudes', accion: 'ver' },
    { moduloCodigo: 'aprobaciones', accion: 'ver' },
    { moduloCodigo: 'despacho', accion: 'ver' },
  ]),
  listarAprobacionesPorSolicitudController,
);
router.put('/:id/estado', requireModulePermission('aprobaciones', 'aprobar'), actualizarEstadoSolicitudController);
router.post(
  '/:id/despacho',
  requireAnyModulePermission([
    { moduloCodigo: 'despacho', accion: 'crear' },
    { moduloCodigo: 'despacho', accion: 'aprobar' },
  ]),
  registrarDespachoSolicitudController,
);

export default router;
