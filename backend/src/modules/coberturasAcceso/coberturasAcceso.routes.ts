import { Router } from 'express';
import { requireModulePermission } from '../../middleware/accessControl';
import {
  agregarAreaCoberturaController,
  agregarCatalogoCoberturaController,
  agregarUsuarioCoberturaController,
  crearCoberturaAccesoController,
  listarAreasCoberturaController,
  listarCatalogosPermitidosController,
  listarCatalogosSolicitudController,
  listarCoberturasAccesoController,
  listarUsuariosCoberturaController,
  obtenerDetalleCoberturaController,
  removerUsuarioCoberturaController,
  removerAreaCoberturaController,
  removerCatalogoCoberturaController,
  actualizarCoberturaAccesoController,
  eliminarCoberturaAccesoController,
} from './coberturasAcceso.controller';

const router = Router();

router.get('/catalogos-solicitud', requireModulePermission('coberturas-acceso', 'ver'), listarCatalogosSolicitudController);
router.get('/usuarios-disponibles', requireModulePermission('coberturas-acceso', 'ver'), listarUsuariosCoberturaController);
router.get('/areas-disponibles', requireModulePermission('coberturas-acceso', 'ver'), listarAreasCoberturaController);
router.get('/permitidos', listarCatalogosPermitidosController);
router.get('/', requireModulePermission('coberturas-acceso', 'ver'), listarCoberturasAccesoController);
router.get('/:id', requireModulePermission('coberturas-acceso', 'ver'), obtenerDetalleCoberturaController);
router.post('/', requireModulePermission('coberturas-acceso', 'crear'), crearCoberturaAccesoController);
router.post('/:id/usuarios', requireModulePermission('coberturas-acceso', 'editar'), agregarUsuarioCoberturaController);
router.post('/:id/areas', requireModulePermission('coberturas-acceso', 'editar'), agregarAreaCoberturaController);
router.post('/:id/catalogos', requireModulePermission('coberturas-acceso', 'editar'), agregarCatalogoCoberturaController);

router.delete('/:id/usuarios/:idUsuario', requireModulePermission('coberturas-acceso', 'editar'), removerUsuarioCoberturaController);
router.delete('/:id/areas/:idArea', requireModulePermission('coberturas-acceso', 'editar'), removerAreaCoberturaController);
router.delete('/:id/catalogos/:idCatalogo', requireModulePermission('coberturas-acceso', 'editar'), removerCatalogoCoberturaController);

router.put('/:id', requireModulePermission('coberturas-acceso', 'editar'), actualizarCoberturaAccesoController);
router.delete('/:id', requireModulePermission('coberturas-acceso', 'editar'), eliminarCoberturaAccesoController);

export default router;