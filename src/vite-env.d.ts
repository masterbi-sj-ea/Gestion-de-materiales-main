/// <reference types="vite/client" />

// Tipado explícito para variables de entorno prefijadas con VITE_
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_SOCKET_TRANSPORT?: 'polling' | 'websocket' | 'auto';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
