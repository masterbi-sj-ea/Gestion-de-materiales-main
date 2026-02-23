
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
  ```

  Cualquier variable que comience con `VITE_` estará disponible en el código vía `import.meta.env`.

  ## Build de producción

  Ejecuta:

  ```bash
  npm run build
  ```

  El resultado quedará en `dist/`.
  