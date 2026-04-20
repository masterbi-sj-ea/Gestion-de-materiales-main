import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireModulePermission } from '../../middleware/accessControl';
import { obtenerDashboardController } from './dashboard.controller';

const router = Router();

router.get('/', authMiddleware, requireModulePermission('dashboard', 'ver'), obtenerDashboardController);

export default router;
