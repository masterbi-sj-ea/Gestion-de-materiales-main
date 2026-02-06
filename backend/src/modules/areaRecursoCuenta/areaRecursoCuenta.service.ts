import { callSpMany, callSpOne } from '../../infra/spCaller';

export interface AreaRecursoCuenta {
  CodigoCuenta: string;
}

export interface RecursoPorArea {
  IdRecurso: number;
  Nombre: string;
}

export async function obtenerCodigoCuenta(idArea: number, idRecurso: number): Promise<string | null> {
  const result = await callSpOne<AreaRecursoCuenta>('sp_ObtenerCodigoCuentaAreaRecurso', {
    IdArea: idArea,
    IdRecurso: idRecurso,
  });
  return result?.CodigoCuenta ?? null;
}

export async function listarRecursosPorArea(idArea: number): Promise<RecursoPorArea[]> {
  return callSpMany<RecursoPorArea>('sp_ListarRecursosPorArea', {
    IdArea: idArea,
  });
}
