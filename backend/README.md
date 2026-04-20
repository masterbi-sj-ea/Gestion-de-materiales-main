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
   TRUST_PROXY=false
   CORS_ALLOWED_ORIGINS=

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

## Web Push en producción

Para que las notificaciones externas funcionen fuera de `localhost` necesitas obligatoriamente:

```env
WEB_PUSH_VAPID_PUBLIC_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_VAPID_SUBJECT=mailto:notificaciones@tu-dominio.com
```

Y además publicar la app en `HTTPS` real. En producción no se generan llaves VAPID automáticas: si faltan, el backend reportará que Web Push no está configurado.

Recomendaciones:

- Si el backend sirve el frontend en el mismo origin público, el frontend usará ese mismo origin por defecto para `/api`.
- Si usas proxy inverso, expón la app en `https://tu-dominio` y reenvía al backend interno.
- Después del deploy valida que `https://tu-dominio/push-sw.js` y `https://tu-dominio/manifest.webmanifest` respondan bien.

## Despliegue recomendado

Desde la raíz del repositorio, genera el paquete de producción con:

```bash
npm run package:prod
```

Esto dejará una carpeta `release/backend` con lo necesario para producción:

- `dist/` con el backend compilado
- `public/` con el frontend compilado y listo para servir
- `package.json` y `package-lock.json` del backend
- `.env.example` como plantilla de configuración

En el servidor de producción:

```bash
cd backend
npm ci --omit=dev
pm2 start ecosystem.config.cjs --env production
```

Notas operativas:

- El backend sirve el SPA desde `public/`.
- Los assets versionados se sirven con cache largo.
- `index.html` y `push-sw.js` se sirven sin cache agresivo para evitar despliegues inconsistentes.
- El fallback del SPA no intercepta `/api`, `/health` ni `/socket.io`.
- En producción, si `CORS_ALLOWED_ORIGINS` queda vacío, solo se aceptan mismo origen y requests sin cabecera `Origin`.
- Si despliegas detrás de Nginx, IIS o un balanceador, activa `TRUST_PROXY=true`.
- El paquete incluye `ecosystem.config.cjs` para que PM2 reinicie el proceso, rote logs y maneje señales de apagado.

## PM2 recomendado

Instala PM2 una vez en el servidor:

```bash
npm install -g pm2
```

Comandos típicos:

```bash
pm2 start ecosystem.config.cjs --env production
pm2 status
pm2 logs gestion-materiales-backend
pm2 save
```

## Docker y Compose

Si prefieres desplegarlo en contenedor, desde la raíz del repositorio usa:

```bash
copy backend/.env.example backend/.env
docker compose build
docker compose up -d
```

Qué hace esta opción:

- Construye frontend y backend dentro de una imagen multietapa.
- El backend sirve el SPA compilado desde `public/`.
- Persiste `cache`, `imports` y `logs` mediante volúmenes Docker.
- Expone `GET /health` como healthcheck del contenedor.

Consideraciones:

- Dentro del contenedor no hace falta PM2; Docker ya se encarga del ciclo de vida del proceso.
- Si usas proxy inverso delante del contenedor, configura `TRUST_PROXY=true`.
- Si necesitas imágenes locales de materiales, monta una carpeta del host en el contenedor y apunta `MATERIALES_IMG_ROOT` a esa ruta montada.
