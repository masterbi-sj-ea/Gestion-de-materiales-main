import { API_BASE_URL } from './apiConfig';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  // URL dinámica basada en el hostname actual (evita apuntar a localhost del teléfono)
  const baseUrl = API_BASE_URL;

  // Recuperar el token del session storage, que es el que gestiona el AuthContext
  const token = sessionStorage.getItem('authToken');

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Agregar Content-Type json por defecto si tiene body y no se especificó un content-type
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  return response;
}
