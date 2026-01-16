import { callSpMany } from '../../infra/spCaller';

export interface Modulo {
  IdModulo: number;
  Codigo: string;
  Nombre: string;
  Path: string;
  Descripcion: string | null;
  Icono: string | null;
}

export async function listarModulos(): Promise<Modulo[]> {
  return callSpMany<Modulo>('sp_ListarModulos');
}
