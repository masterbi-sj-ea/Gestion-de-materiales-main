import { Router } from 'express';
import {
  getPushConfigController,
  removePushSubscriptionController,
  sendPushTestController,
  upsertPushSubscriptionController,
} from './push.controller';

const router = Router();

router.get('/config', getPushConfigController);
router.post('/subscriptions', upsertPushSubscriptionController);
router.delete('/subscriptions', removePushSubscriptionController);
router.post('/test', sendPushTestController);

export default router;