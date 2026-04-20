# Windows Server + IIS

Opción recomendada para este proyecto en Windows Server:

1. Node como servicio Windows escuchando solo en `127.0.0.1:4009`.
2. IIS al frente como reverse proxy público (`http://servidor` o `https://tu-dominio`).

## Qué incluye esta carpeta

- `iis/web.config`: regla de reverse proxy para IIS hacia `http://127.0.0.1:4009`.
- `iis/.env.production.example`: variables recomendadas para producción detrás de IIS.
- `windows/winsw/gestion-materiales-service.xml`: configuración ejemplo para WinSW.

## Requisitos IIS

Antes de usar `web.config`, instala y habilita:

- IIS URL Rewrite
- Application Request Routing (ARR) con Proxy habilitado
- WebSocket Protocol

Además, en IIS debes permitir estas server variables para URL Rewrite:

- `HTTP_X_FORWARDED_PROTO`
- `HTTP_X_FORWARDED_HOST`
- `HTTP_X_FORWARDED_FOR`

## Flujo sugerido

1. Copiar `release/backend` al servidor.
2. Crear `.env` en la raíz de `backend` usando `deploy/iis/.env.production.example`.
3. Instalar dependencias con `npm ci --omit=dev`.
4. Registrar Node como servicio Windows con WinSW o NSSM.
5. Crear un sitio en IIS con el `web.config` de `deploy/iis` como raíz del sitio público.

## Notas operativas

- Con esta topología, la app queda same-origin y normalmente no necesita `CORS_ALLOWED_ORIGINS`.
- `TRUST_PROXY=true` es obligatorio para que Express entienda que el HTTPS termina en IIS.
- El backend ya sirve frontend estático, `/api`, `/health` y `socket.io` desde el mismo proceso Node.