import { Router } from 'express';
import {
  crearSolicitudController,
  listarSolicitudesController,
  obtenerSolicitudController,
  actualizarSolicitudController,
  registrarAprobacionSolicitudController,
  listarAprobacionesPorSolicitudController,
  actualizarEstadoSolicitudController,
  registrarDespachoSolicitudController,
} from './solicitudes.controller';

const router = Router();

router.get('/', listarSolicitudesController);
router.post('/', crearSolicitudController);
router.put('/:id', actualizarSolicitudController);
router.get('/:id', obtenerSolicitudController);
router.post('/:id/aprobaciones', registrarAprobacionSolicitudController);
router.get('/:id/aprobaciones', listarAprobacionesPorSolicitudController);
router.put('/:id/estado', actualizarEstadoSolicitudController);
router.post('/:id/despacho', registrarDespachoSolicitudController);

export default router;
