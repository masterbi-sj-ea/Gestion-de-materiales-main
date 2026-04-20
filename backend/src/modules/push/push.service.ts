import fs from 'fs/promises';
import path from 'path';
import webpush from 'web-push';
import { env } from '../../config/env';
import { userHasModulePermission } from '../../middleware/accessControl';
import { listarUsuarios } from '../usuarios/usuarios.service';

type PushSubscriptionScope = 'aprobaciones';

export interface BrowserPushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface StoredPushSubscription extends BrowserPushSubscriptionPayload {
  userId: number;
  scope: PushSubscriptionScope;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PushNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

const PUSH_STORAGE_FILE = path.resolve(__dirname, '../../../cache/push-subscriptions.json');
const VAPID_STORAGE_FILE = path.resolve(__dirname, '../../../cache/web-push-vapid.json');

interface VapidConfiguration {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let vapidConfiguredSignature: string | null = null;
let vapidConfigurationPromise: Promise<VapidConfiguration | null> | null = null;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSubscription(
  input: BrowserPushSubscriptionPayload | null | undefined,
): BrowserPushSubscriptionPayload | null {
  if (!input || !isNonEmptyString(input.endpoint)) {
    return null;
  }

  if (!input.keys || !isNonEmptyString(input.keys.p256dh) || !isNonEmptyString(input.keys.auth)) {
    return null;
  }

  return {
    endpoint: input.endpoint.trim(),
    expirationTime: typeof input.expirationTime === 'number' ? input.expirationTime : null,
    keys: {
      p256dh: input.keys.p256dh.trim(),
      auth: input.keys.auth.trim(),
    },
  };
}

function isStoredPushSubscription(value: unknown): value is StoredPushSubscription {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredPushSubscription>;
  return Boolean(
    typeof candidate.userId === 'number'
      && isNonEmptyString(candidate.endpoint)
      && candidate.scope === 'aprobaciones'
      && candidate.keys
      && isNonEmptyString(candidate.keys.p256dh)
      && isNonEmptyString(candidate.keys.auth)
      && isNonEmptyString(candidate.createdAt)
      && isNonEmptyString(candidate.updatedAt),
  );
}

async function readStoredSubscriptions(): Promise<StoredPushSubscription[]> {
  try {
    const raw = await fs.readFile(PUSH_STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredPushSubscription) : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    console.error('No se pudieron leer las suscripciones Web Push', error);
    return [];
  }
}

async function writeStoredSubscriptions(items: StoredPushSubscription[]): Promise<void> {
  await fs.mkdir(path.dirname(PUSH_STORAGE_FILE), { recursive: true });
  const tempFile = `${PUSH_STORAGE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(items, null, 2), 'utf8');
  await fs.rename(tempFile, PUSH_STORAGE_FILE);
}

function isValidVapidConfiguration(value: unknown): value is VapidConfiguration {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VapidConfiguration>;
  return Boolean(
    isNonEmptyString(candidate.publicKey)
      && isNonEmptyString(candidate.privateKey)
      && isNonEmptyString(candidate.subject),
  );
}

function buildVapidConfigurationSignature(config: VapidConfiguration): string {
  return `${config.subject}|${config.publicKey}|${config.privateKey}`;
}

async function readStoredVapidConfiguration(): Promise<VapidConfiguration | null> {
  try {
    const raw = await fs.readFile(VAPID_STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return isValidVapidConfiguration(parsed) ? parsed : null;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    console.error('No se pudieron leer las llaves VAPID locales', error);
    return null;
  }
}

async function writeStoredVapidConfiguration(config: VapidConfiguration): Promise<void> {
  await fs.mkdir(path.dirname(VAPID_STORAGE_FILE), { recursive: true });
  await fs.writeFile(VAPID_STORAGE_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function resolveVapidConfiguration(): Promise<VapidConfiguration | null> {
  if (!vapidConfigurationPromise) {
    vapidConfigurationPromise = (async () => {
      if (
        env.WEB_PUSH_VAPID_PUBLIC_KEY
        && env.WEB_PUSH_VAPID_PRIVATE_KEY
        && env.WEB_PUSH_VAPID_SUBJECT
      ) {
        return {
          publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY,
          privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY,
          subject: env.WEB_PUSH_VAPID_SUBJECT,
        };
      }

      if (env.NODE_ENV === 'production') {
        return null;
      }

      const stored = await readStoredVapidConfiguration();
      if (stored) {
        return stored;
      }

      const generated = webpush.generateVAPIDKeys();
      const config: VapidConfiguration = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        subject: 'mailto:dev-notifications@localhost',
      };

      await writeStoredVapidConfiguration(config);
      console.warn('Web Push VAPID no estaba configurado. Se generaron llaves locales persistentes para desarrollo.');
      return config;
    })();
  }

  return vapidConfigurationPromise;
}

async function ensureVapidConfigured(): Promise<VapidConfiguration | null> {
  const config = await resolveVapidConfiguration();
  if (!config) {
    return null;
  }

  const nextSignature = buildVapidConfigurationSignature(config);
  if (vapidConfiguredSignature === nextSignature) {
    return config;
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  vapidConfiguredSignature = nextSignature;
  return config;
}

function buildRoleList(rawRoles: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      rawRoles
        .map((role) => String(role || '').trim())
        .filter((role) => role.length > 0),
    ),
  );
}

export async function isWebPushConfigured(): Promise<boolean> {
  return Boolean(await resolveVapidConfiguration());
}

export async function getWebPushPublicKey(): Promise<string | null> {
  const config = await resolveVapidConfiguration();
  return config?.publicKey ?? null;
}

export async function upsertPushSubscription(args: {
  userId: number;
  subscription: BrowserPushSubscriptionPayload;
  scope?: PushSubscriptionScope;
  userAgent?: string | null;
}): Promise<void> {
  const subscription = normalizeSubscription(args.subscription);
  if (!subscription) {
    throw new Error('La suscripción push recibida no es válida');
  }

  const now = new Date().toISOString();
  const scope = args.scope ?? 'aprobaciones';
  const items = await readStoredSubscriptions();
  const nextItem: StoredPushSubscription = {
    ...subscription,
    userId: args.userId,
    scope,
    userAgent: args.userAgent ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const existingIndex = items.findIndex((item) => item.endpoint === subscription.endpoint);
  if (existingIndex >= 0) {
    const previous = items[existingIndex];
    items[existingIndex] = {
      ...previous,
      ...nextItem,
      createdAt: previous.createdAt,
    };
  } else {
    items.push(nextItem);
  }

  await writeStoredSubscriptions(items);
}

export async function removePushSubscriptionByEndpoint(userId: number, endpoint: string): Promise<void> {
  const normalizedEndpoint = String(endpoint || '').trim();
  if (!normalizedEndpoint) {
    return;
  }

  const items = await readStoredSubscriptions();
  const filtered = items.filter((item) => !(item.userId === userId && item.endpoint === normalizedEndpoint));
  if (filtered.length === items.length) {
    return;
  }

  await writeStoredSubscriptions(filtered);
}

async function prunePushSubscription(endpoint: string): Promise<void> {
  const normalizedEndpoint = String(endpoint || '').trim();
  if (!normalizedEndpoint) {
    return;
  }

  const items = await readStoredSubscriptions();
  const filtered = items.filter((item) => item.endpoint !== normalizedEndpoint);
  if (filtered.length === items.length) {
    return;
  }

  await writeStoredSubscriptions(filtered);
}

async function listPushSubscriptionsForUserIds(
  userIds: number[],
  scope: PushSubscriptionScope,
): Promise<StoredPushSubscription[]> {
  if (userIds.length === 0) {
    return [];
  }

  const uniqueUserIds = new Set(userIds);
  const items = await readStoredSubscriptions();
  return items.filter((item) => uniqueUserIds.has(item.userId) && item.scope === scope);
}

export async function listarUsuariosAprobadores(): Promise<number[]> {
  const usuarios = await listarUsuarios();
  const grouped = new Map<number, { activo: boolean; roles: string[] }>();

  usuarios.forEach((usuario) => {
    const current = grouped.get(usuario.IdUsuario) ?? { activo: usuario.Activo, roles: [] };
    current.activo = current.activo || usuario.Activo;

    if (usuario.RolPrincipal) {
      current.roles.push(usuario.RolPrincipal);
    }

    grouped.set(usuario.IdUsuario, current);
  });

  const permissionCache = new Map<string, boolean>();
  const approverIds: number[] = [];

  for (const [userId, usuario] of grouped.entries()) {
    if (!usuario.activo) {
      continue;
    }

    const roles = buildRoleList(usuario.roles);
    if (roles.length === 0) {
      continue;
    }

    const cacheKey = roles.slice().sort((left, right) => left.localeCompare(right, 'es')).join('|');
    if (!permissionCache.has(cacheKey)) {
      permissionCache.set(cacheKey, await userHasModulePermission(roles, 'aprobaciones', 'aprobar'));
    }

    if (permissionCache.get(cacheKey)) {
      approverIds.push(userId);
    }
  }

  return approverIds;
}

export async function sendPushNotificationsToUserIds(
  userIds: number[],
  payload: PushNotificationPayload,
): Promise<{ targetedUsers: number; targetedSubscriptions: number; sent: number }> {
  const vapidConfig = await ensureVapidConfigured();
  if (!vapidConfig) {
    return { targetedUsers: 0, targetedSubscriptions: 0, sent: 0 };
  }

  const subscriptions = await listPushSubscriptionsForUserIds(userIds, 'aprobaciones');
  if (subscriptions.length === 0) {
    return { targetedUsers: userIds.length, targetedSubscriptions: 0, sent: 0 };
  }

  const serializedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    icon: payload.icon ?? null,
    badge: payload.badge ?? null,
    requireInteraction: payload.requireInteraction ?? false,
    data: payload.data ?? null,
  });

  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ?? null,
            keys: subscription.keys,
          },
          serializedPayload,
        );
        sent += 1;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0);
        console.error('Error enviando Web Push', {
          endpoint: subscription.endpoint,
          statusCode,
          error,
        });

        if (statusCode === 404 || statusCode === 410) {
          await prunePushSubscription(subscription.endpoint);
        }
      }
    }),
  );

  return {
    targetedUsers: userIds.length,
    targetedSubscriptions: subscriptions.length,
    sent,
  };
}

export async function sendPushNotificationsToApprovers(
  payload: PushNotificationPayload,
): Promise<{ targetedUsers: number; targetedSubscriptions: number; sent: number }> {
  const approverIds = await listarUsuariosAprobadores();
  return sendPushNotificationsToUserIds(approverIds, payload);
}

export async function sendPendingApprovalPushNotification(args: {
  id: number;
  codigo: string;
  area: string;
  solicitante: string;
  items: number;
}): Promise<void> {
  await sendPushNotificationsToApprovers({
    title: 'Nueva solicitud pendiente',
    body: `${args.solicitante} envió ${args.codigo} para ${args.area}.`,
    url: `/aprobaciones?solicitud=${args.id}`,
    tag: `aprobacion-pendiente-${args.id}`,
    requireInteraction: true,
    data: {
      kind: 'solicitud_pendiente_aprobacion',
      solicitudId: args.id,
      codigo: args.codigo,
      area: args.area,
      items: args.items,
    },
  });
}