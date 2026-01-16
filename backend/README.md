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

4. Levantar el servidor en modo desarrollo:

   ```bash
   npm run dev
   ```

5. Probar el healthcheck:

   - `GET http://localhost:4000/health`

Más adelante se conectará con los SP de SQL Server para toda la lógica de negocio.
