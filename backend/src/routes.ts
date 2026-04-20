import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import permisosRoutes from './modules/permisos/permisos.routes';
import usuariosRoutes from './modules/usuarios/usuarios.routes';
import rolesRoutes from './modules/roles/roles.routes';
import areasRoutes from './modules/areas/areas.routes';
import modulosRoutes from './modules/modulos/modulos.routes';
import auditoriaRoutes from './modules/auditoria/auditoria.routes';
import cortesRoutes from './modules/cortes/cortes.routes';
import materialesRoutes from './modules/materiales/materiales.routes';
import presupuestosRoutes from './modules/presupuestos/presupuestos.routes';
import centrosCostoRoutes from './modules/centrosCosto/centrosCosto.routes';
import solicitudesRoutes from './modules/solicitudes/solicitudes.routes';
import despachosRoutes from './modules/despacho/despachos.routes';
import recursosRoutes from './modules/recursos/recursos.routes';
import areaRecursoCuentaRoutes from './modules/areaRecursoCuenta/areaRecursoCuenta.routes';
import kardexRoutes from './modules/kardex/kardex.routes';
import coberturasAccesoRoutes from './modules/coberturasAcceso/coberturasAcceso.routes';
import pushRoutes from './modules/push/push.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { authMiddleware } from './middleware/auth';

const router = Router();

router.use('/auth', authRoutes);

// Rutas protegidas con JWT
router.use('/usuarios', authMiddleware, usuariosRoutes);
router.use('/roles', authMiddleware, rolesRoutes);
router.use('/permisos', authMiddleware, permisosRoutes);
router.use('/areas', authMiddleware, areasRoutes);
router.use('/centros-costo', authMiddleware, centrosCostoRoutes);
router.use('/modulos', authMiddleware, modulosRoutes);
router.use('/auditoria', authMiddleware, auditoriaRoutes);
router.use('/materiales', authMiddleware, materialesRoutes);
router.use('/presupuestos', authMiddleware, presupuestosRoutes);
router.use('/solicitudes', authMiddleware, solicitudesRoutes);
router.use('/despachos', authMiddleware, despachosRoutes);
router.use('/recursos', authMiddleware, recursosRoutes);
router.use('/area-recursos', authMiddleware, areaRecursoCuentaRoutes);
router.use('/kardex', authMiddleware, kardexRoutes);
router.use('/coberturas-acceso', authMiddleware, coberturasAccesoRoutes);
router.use('/push', authMiddleware, pushRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/cortes', cortesRoutes);

// TODO: agregar rutas de módulos (usuarios, roles, permisos, materiales, solicitudes, etc.)

export default router;
