import sql from 'mssql';
import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';

export interface Material {
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedida: string;
  GrupoArticulos: string | null;
}

export interface MaterialConStock extends Material {
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
  UltimaMonedaCompra: string | null;
}

export interface MaterialImportRow {
  NumeroArticulo: string;
  DescripcionArticulo: string;
  EnStock: number;
  UnidadMedida: string;
  GrupoArticulos?: string | null;
  UltimaFechaCompra?: string | null;
  UltimoPrecioCompra?: number | null;
  UltimaMonedaCompra?: string | null;
}

export async function listarMateriales(): Promise<Material[]> {
  return callSpMany<Material>('sp_ListarMateriales');
}

export async function listarMaterialesConStock(): Promise<MaterialConStock[]> {
  return callSpMany<MaterialConStock>('sp_ListarMaterialesConStock');
}

export async function crearMaterial(input: {
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedida: string;
  GrupoArticulos?: string | null;
}): Promise<number> {
  const result = await callSpOne<{ IdMaterial: number }>('sp_CrearMaterial', {
    NumeroArticulo: input.NumeroArticulo,
    DescripcionArticulo: input.DescripcionArticulo,
    UnidadMedida: input.UnidadMedida,
    GrupoArticulos: input.GrupoArticulos ?? null,
  });
  return result?.IdMaterial ?? 0;
}

export async function actualizarMaterial(
  idMaterial: number,
  input: {
    NumeroArticulo: string;
    DescripcionArticulo: string;
    UnidadMedida: string;
    GrupoArticulos?: string | null;
  },
): Promise<void> {
  await callSpOne('sp_ActualizarMaterial', {
    IdMaterial: idMaterial,
    NumeroArticulo: input.NumeroArticulo,
    DescripcionArticulo: input.DescripcionArticulo,
    UnidadMedida: input.UnidadMedida,
    GrupoArticulos: input.GrupoArticulos ?? null,
  });
}

export async function eliminarMaterial(idMaterial: number): Promise<void> {
  await callSpOne('sp_EliminarMaterial', { IdMaterial: idMaterial });
}

export async function importarMaterialesYStock(datos: MaterialImportRow[], idUsuario?: number): Promise<void> {
  const pool = await getPool();
  const tvp = new sql.Table();

  tvp.columns.add('NumeroArticulo', sql.NVarChar(50));
  tvp.columns.add('DescripcionArticulo', sql.NVarChar(255));
  tvp.columns.add('EnStock', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(50));
  tvp.columns.add('GrupoArticulos', sql.NVarChar(100));
  tvp.columns.add('UltimaFechaCompra', sql.Date);
  tvp.columns.add('UltimoPrecioCompra', sql.Decimal(18, 4));
  tvp.columns.add('UltimaMonedaCompra', sql.NVarChar(10));

  const parseFecha = (value?: string | null): Date | null => {
    if (!value) return null;
    const str = value.trim();
    if (!str) return null;

    // Soportar formatos dd/MM/yyyy y yyyy-MM-dd
    let d: number, m: number, y: number;

    const slashParts = str.split('/');
    if (slashParts.length === 3) {
      // Asumimos dd/MM/yyyy
      d = Number(slashParts[0]);
      m = Number(slashParts[1]);
      y = Number(slashParts[2]);
    } else {
      const dashParts = str.split('-');
      if (dashParts.length === 3) {
        // Asumimos yyyy-MM-dd
        y = Number(dashParts[0]);
        m = Number(dashParts[1]);
        d = Number(dashParts[2]);
      } else {
        return null;
      }
    }

    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  for (const row of datos) {
    tvp.rows.add(
      row.NumeroArticulo,
      row.DescripcionArticulo,
      row.EnStock ?? 0,
      row.UnidadMedida,
      row.GrupoArticulos ?? null,
      parseFecha(row.UltimaFechaCompra ?? null),
      row.UltimoPrecioCompra ?? null,
      row.UltimaMonedaCompra ?? null,
    );
  }

  const request = pool.request();
  request.input('Datos', tvp as any);
  if (idUsuario) {
    request.input('IdUsuario', sql.Int, idUsuario);
  }
  await request.execute('sp_ImportarMaterialesYStock');
}
