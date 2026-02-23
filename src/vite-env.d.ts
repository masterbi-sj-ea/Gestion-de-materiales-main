/// <reference types="vite/client" />

// Tipado explícito para variables de entorno prefijadas con VITE_
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Agrega aquí otras variables si las necesitas, por ejemplo:
  // readonly VITE_APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
