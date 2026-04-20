
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

  ## Build de producción

  Ejecuta:

  ```bash
  npm run build
  ```

  El resultado quedará en `dist/`.
  