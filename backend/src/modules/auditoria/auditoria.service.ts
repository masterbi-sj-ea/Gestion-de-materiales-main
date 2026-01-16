import { callSpMany, callSpOne } from '../../infra/spCaller';

export async function registrarAuditoria(
  idUsuario: number | null,
  tipoAccion: string,
  detalle: unknown = null,
): Promise<void> {
  await callSpOne('sp_RegistrarAuditoriaAccion', {
    IdUsuario: idUsuario,
    TipoAccion: tipoAccion,
    DetalleJson: detalle ? JSON.stringify(detalle) : null,
  });
}

export interface RegistroAuditoriaDb {
  IdAuditoria: number;
  IdUsuario: number | null;
  FechaAccion: string;
  TipoAccion: string;
  DetalleJson: string | null;
  UsuarioNombre: string | null;
  Email: string | null;
  RolNombre: string | null;
}

export interface ListarAuditoriaResult {
  items: RegistroAuditoriaDb[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listarAuditoria(page: number, pageSize: number): Promise<ListarAuditoriaResult> {
  const registros = await callSpMany<RegistroAuditoriaDb>('sp_ListarAuditoriaAcciones', {
    Page: page,
    PageSize: pageSize,
  });

  // Para obtener el total usamos una segunda llamada simple al COUNT.
  // Si prefieres, se puede optimizar el SP para devolver el total en otro recordset.
  const totalRow = await callSpOne<{ TotalRegistros: number }>('sp_ListarAuditoriaAcciones', {
    Page: 1,
    PageSize: 1,
  });

  const total = totalRow?.TotalRegistros ?? registros.length;

  return {
    items: registros,
    total,
    page,
    pageSize,
  };
}
