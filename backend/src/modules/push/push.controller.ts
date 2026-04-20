import { Response } from 'express';
import { hasRequestModulePermission } from '../../middleware/accessControl';
import { AuthRequest } from '../../middleware/auth';
import {
  getWebPushPublicKey,
  isWebPushConfigured,
  removePushSubscriptionByEndpoint,
  sendPushNotificationsToUserIds,
  upsertPushSubscription,
} from './push.service';

async function canManageApprovalPush(req: AuthRequest): Promise<boolean> {
  return hasRequestModulePermission(req, 'aprobaciones', 'aprobar');
}

export async function getPushConfigController(req: AuthRequest, res: Response) {
  const canManage = await canManageApprovalPush(req);

  if (!canManage) {
    return res.status(403).json({ message: 'No tienes permisos para activar notificaciones de aprobaciones.' });
  }

  const enabled = await isWebPushConfigured();
  const publicKey = enabled ? await getWebPushPublicKey() : null;
  return res.json({
    enabled,
    publicKey,
    requiresSecureContext: true,
    reason: enabled ? null : 'Faltan las llaves VAPID en el servidor para habilitar Web Push.',
  });
}

export async function upsertPushSubscriptionController(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (!(await canManageApprovalPush(req))) {
    return res.status(403).json({ message: 'No tienes permisos para activar notificaciones de aprobaciones.' });
  }

  if (!(await isWebPushConfigured())) {
    return res.status(503).json({ message: 'Web Push no está configurado todavía en el servidor.' });
  }

  try {
    await upsertPushSubscription({
      userId: req.userId,
      subscription: req.body?.subscription,
      scope: 'aprobaciones',
      userAgent: req.get('user-agent') ?? null,
    });

    return res.status(204).send();
  } catch (error: any) {
    console.error('No se pudo guardar la suscripción Web Push', error);
    return res.status(400).json({
      message: error?.message || 'No se pudo guardar la suscripción Web Push.',
    });
  }
}

export async function removePushSubscriptionController(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  const endpoint = String(req.body?.endpoint || '').trim();
  if (!endpoint) {
    return res.status(400).json({ message: 'El endpoint de la suscripción es obligatorio.' });
  }

  await removePushSubscriptionByEndpoint(req.userId, endpoint);
  return res.status(204).send();
}

export async function sendPushTestController(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (!(await canManageApprovalPush(req))) {
    return res.status(403).json({ message: 'No tienes permisos para activar notificaciones de aprobaciones.' });
  }

  if (!(await isWebPushConfigured())) {
    return res.status(503).json({ message: 'Web Push no está configurado todavía en el servidor.' });
  }

  const result = await sendPushNotificationsToUserIds([req.userId], {
    title: 'Notificaciones externas activadas',
    body: 'Este equipo ya puede recibir solicitudes pendientes aunque no estés dentro de la app.',
    url: '/aprobaciones',
    tag: `push-test-${req.userId}`,
    data: {
      kind: 'push_test',
    },
  });

  return res.json(result);
}