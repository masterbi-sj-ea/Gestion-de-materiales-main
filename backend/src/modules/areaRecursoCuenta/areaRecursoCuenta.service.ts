import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';

export interface AreaRecursoCuenta {
  CodigoCuenta: string;
}

export interface RecursoPorArea {
  IdRecurso: number;
  Nombre: string;
}

export async function obtenerCodigoCuenta(idArea: number, idRecurso: number): Promise<{ codigoCuenta: string | null; idCentroCosto: number | null }> {
  try {
      const result = await callSpOne<AreaRecursoCuenta>('sp_ObtenerCodigoCuentaAreaRecurso', {
        IdArea: idArea,
        IdRecurso: idRecurso,
      });

      const codigoCuenta = result?.CodigoCuenta ?? null;
      let idCentroCosto: number | null = null;
    
      if (codigoCuenta) {
        const pool = await getPool();
        const request = pool.request();
        // Buscar el CCO que coincida con el código de cuenta.
        // Nota: Asumimos que la columna 'Codigo' en CentrosCosto es el código contable.
        // Si no, habría que ver dónde se guarda el código contable en CentrosCosto.
        const ccResult = await request.input('Codigo', codigoCuenta).query(`
            SELECT TOP 1 IdCentroCosto FROM CentrosCosto WHERE Codigo = @Codigo
        `);
        
        if (ccResult.recordset.length > 0) {
            idCentroCosto = ccResult.recordset[0].IdCentroCosto;
        }
      }
    
      return { codigoCuenta, idCentroCosto };
  } catch (error) {
      console.error('Error obteniendo CCO para Area/Recurso:', error);
      return { codigoCuenta: null, idCentroCosto: null };
  }
}


export async function listarRecursosPorArea(idArea: number): Promise<RecursoPorArea[]> {
  return callSpMany<RecursoPorArea>('sp_ListarRecursosPorArea', {
    IdArea: idArea,
  });
}
