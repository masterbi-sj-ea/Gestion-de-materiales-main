self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function getAbsoluteUrl(rawUrl) {
  try {
    return new URL(rawUrl || 'aprobaciones', self.registration.scope).toString();
  } catch {
    return new URL('aprobaciones', self.registration.scope).toString();
  }
}

function getAssetUrl(fileName) {
  return new URL(fileName, self.registration.scope).toString();
}

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = payload.title || 'Nueva solicitud pendiente';
  const targetUrl = getAbsoluteUrl(payload.url);
  const options = {
    body: payload.body || 'Hay una nueva solicitud pendiente por aprobar.',
    icon: payload.icon || getAssetUrl('app-icon.svg'),
    badge: payload.badge || getAssetUrl('notification-badge.svg'),
    tag: payload.tag || 'aprobacion-pendiente',
    renotify: true,
    requireInteraction: Boolean(payload.requireInteraction),
    timestamp: Date.now(),
    data: {
      url: targetUrl,
      payload: payload.data || null,
    },
    actions: [
      {
        action: 'open',
        title: payload.openLabel || 'Abrir',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification && event.notification.data ? event.notification.data : null;
  const targetUrl = getAbsoluteUrl(notificationData ? notificationData.url : undefined);

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    const exactMatch = windowClients.find((client) => client.url === targetUrl);
    if (exactMatch && 'focus' in exactMatch) {
      await exactMatch.focus();
      return;
    }

    const sameOriginClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === new URL(targetUrl).origin;
      } catch {
        return false;
      }
    });

    if (sameOriginClient && 'focus' in sameOriginClient) {
      if ('navigate' in sameOriginClient) {
        await sameOriginClient.navigate(targetUrl);
      }

      await sameOriginClient.focus();
      return;
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});