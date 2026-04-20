
  # Gestión de Materiales App

  This is a code bundle for Gestión de Materiales App. The original project is available at https://www.figma.com/design/B02rup8mWKO5vrvYEwpNcE/Gesti%C3%B3n-de-Materiales-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  
  ## Configuración de entorno

  Esta app usa variables de entorno de Vite. Crea un archivo `.env` en la raíz con:

  ```env
  # URL del backend
  VITE_API_URL=http://localhost:4000

  # Opcional: origin específico para Socket.IO si no coincide con el API.
  # VITE_SOCKET_URL=http://localhost:4000

  # Opcional: polling | websocket | auto
  # Si no se define, la app usa auto cuando el origin del socket es HTTPS real
  # y polling cuando el despliegue sigue en HTTP/IP local.
  # VITE_SOCKET_TRANSPORT=auto
  ```

  Cualquier variable que comience con `VITE_` estará disponible en el código vía `import.meta.env`.

  Nota sobre tiempo real:
  Si publicas el backend con HTTPS real, configura `VITE_API_URL` y, si aplica, `VITE_SOCKET_URL`
  apuntando al origin `https://...`. Con eso el cliente Socket.IO hará upgrade automático a websocket.

  ## Notificaciones web en producción

  Para que la app mande notificaciones externas reales fuera de `localhost`, deben cumplirse estas condiciones:

  1. El sitio debe abrirse en `https://` real.
  2. El backend debe tener configuradas `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` y `WEB_PUSH_VAPID_SUBJECT`.
  3. El usuario debe activar las notificaciones desde la pantalla de aprobaciones.

  Mejoras incluidas:

  - El frontend usa mismo origin por defecto en producción cuando no se define `VITE_API_URL`.
  - El service worker de push ya funciona con `BASE_URL` y despliegues detrás de proxy.
  - Se agregó `manifest.webmanifest` y activos visuales dedicados para la notificación.

  ## Build de producción

  Ejecuta:

  ```bash
  npm run build
  ```

  El resultado del frontend quedará en `build/`.

  ## Empaquetado para producción

  Para generar un paquete profesional donde el backend sirva el frontend estático ya compilado, ejecuta:

  ```bash
  npm run package:prod
  ```

  Ese comando hace todo esto:

  1. Construye el frontend con Vite.
  2. Copia el resultado a `backend/public`.
  3. Compila el backend TypeScript a `backend/dist`.
  4. Genera un paquete final en `release/backend` listo para copiar al servidor.
  5. Incluye `ecosystem.config.cjs` para arrancar el backend con PM2.

  En producción, el backend servirá automáticamente el SPA y sus assets estáticos desde `public/`, con:

  - cache largo e `immutable` para `assets/`
  - `no-cache` para `index.html` y `push-sw.js`
  - fallback SPA solo para rutas HTML, sin interferir con `/api`, `/health` ni `/socket.io`
  - control explícito de orígenes para API y Socket.IO en producción

  ## Docker y Compose

  También puedes desplegar todo en contenedor, manteniendo el backend como servidor único del frontend compilado.

  Archivos incluidos:

  - `Dockerfile`: build multietapa que compila frontend, compila backend y deja una imagen runtime ligera.
  - `docker-compose.yml`: servicio con volúmenes persistentes para `cache`, `imports` y `logs`.

  Flujo recomendado:

  ```bash
  copy backend/.env.example backend/.env
  docker compose build
  docker compose up -d
  ```

  El contenedor expone el backend en el puerto `4000` y usa el healthcheck `GET /health`.

  Si la app necesita leer imágenes de materiales desde el host, monta una carpeta en `/materiales`
  dentro de `docker-compose.yml` y configura `MATERIALES_IMG_ROOT=/materiales` en `backend/.env`.
  