# Backend - Gestión de Materiales

Backend en Node.js + TypeScript pensado como capa fina sobre procedimientos almacenados en la base de datos.

## Pasos para arrancar en desarrollo

1. Ir a la carpeta `backend`:

   ```bash
   cd backend
   ```

2. Instalar dependencias:

   ```bash
   npm install
   ```

3. Crear un archivo `.env` en esta carpeta basado en `.env.example` y ajustar los datos de conexión a la base de datos.

   Variables relevantes para Materiales:

   ```env
   DB_SERVER=tu-servidor
   DB_USER=tu-usuario
   DB_PASSWORD=tu-password
   DB_DATABASE=GestionMateriales
   JWT_SECRET=change-me-in-production

   # Tipo de cambio usado para convertir importaciones históricas o semanales
   # cuando el archivo venga en COR/C$/NIO y deba normalizarse a USD.
   MATERIALES_TIPO_CAMBIO_USD_TO_CORD=36.80
   ```

4. Levantar el servidor en modo desarrollo:

   ```bash
   npm run dev
   ```

5. Probar el healthcheck:

   - `GET http://localhost:4000/health`

Más adelante se conectará con los SP de SQL Server para toda la lógica de negocio.

## Web Push para aprobaciones

Las notificaciones fuera de la aplicación usan Web Push. Para habilitarlas:

```bash
npm run generate:vapid
```

Luego copia las llaves generadas en tu `.env`:

```env
WEB_PUSH_VAPID_PUBLIC_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_VAPID_SUBJECT=mailto:tu-correo@empresa.com
```

Las suscripciones se guardan en `backend/cache/push-subscriptions.json`.

En desarrollo, si no defines llaves VAPID, el backend generará unas locales persistentes en `backend/cache/web-push-vapid.json`. Eso deja Web Push funcional en `localhost` sin configuración adicional.

## HTTPS opcional

Para que el navegador permita service worker y Web Push fuera de `localhost`, sirve la app en HTTPS configurando:

```env
HTTPS_KEY_PATH=C:\ruta\certificados\privkey.pem
HTTPS_CERT_PATH=C:\ruta\certificados\fullchain.pem
```

Si no defines estas variables, el servidor arrancará en HTTP como hasta ahora.

Si además el frontend va a consumir el socket en modo websocket/auto, apunta sus variables de Vite al origin HTTPS del backend, por ejemplo:

```env
VITE_API_URL=https://tu-dominio-o-host:4000
VITE_SOCKET_URL=https://tu-dominio-o-host:4000
VITE_SOCKET_TRANSPORT=auto
```

En HTTP o por IP local sin certificados, deja `VITE_SOCKET_TRANSPORT` vacío o en `polling` para evitar intentos de WSS no válidos.
