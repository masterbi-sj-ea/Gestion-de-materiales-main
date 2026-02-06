import { callSpMany } from '../../infra/spCaller';

export interface Recurso {
  IdRecurso: number;
  Nombre: string;
  Activo: boolean;
}

export async function listarRecursos(): Promise<Recurso[]> {
  return callSpMany<Recurso>('sp_ListarRecursos');
}
