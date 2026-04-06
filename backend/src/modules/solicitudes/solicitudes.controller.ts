import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import {
  crearSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
  obtenerSolicitudMeta,
  actualizarSolicitud,
  registrarAprobacionSolicitud,
  listarAprobacionesPorSolicitud,
  actualizarEstadoSolicitud,
  registrarDespachoSolicitud,
  generarPdfSolicitud,
} from './solicitudes.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { usuarioTieneAccesoArea } from '../areas/areas.service';

const ESTADOS_SOLICITUD_VALIDOS = new Set([
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
  'EN_DESPACHO',
  'PARCIALMENTE_DESPACHADA',
  'DESPACHADA',
]);

const TRANSICIONES_SOLICITUD_PERMITIDAS: Record<string, string[]> = {
  PENDIENTE: ['APROBADA', 'RECHAZADA'],
  APROBADA: ['EN_DESPACHO', 'PARCIALMENTE_DESPACHADA', 'DESPACHADA'],
  EN_DESPACHO: ['PARCIALMENTE_DESPACHADA', 'DESPACHADA'],
  PARCIALMENTE_DESPACHADA: ['EN_DESPACHO', 'DESPACHADA'],
};

function normalizarEstadoSolicitud(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function puedeTransicionarSolicitud(estadoActual: string, nuevoEstado: string): boolean {
  if (estadoActual === nuevoEstado) {
    return true;
  }

  return (TRANSICIONES_SOLICITUD_PERMITIDAS[estadoActual] ?? []).includes(nuevoEstado);
}

function normalizarIdEnteroPositivo(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
}

async function validarAccesoAreasSolicitud(userId: number, idAreaCabecera: unknown, detalle: any[]): Promise<void> {
  const idsArea = new Set<number>();

  const idAreaCabeceraNormalizado = normalizarIdEnteroPositivo(idAreaCabecera);
  if (idAreaCabecera !== null && idAreaCabecera !== undefined && idAreaCabecera !== '' && idAreaCabeceraNormalizado == null) {
    const error: any = new Error('El área de la solicitud no es válida.');
    error.statusCode = 400;
    throw error;
  }

  if (idAreaCabeceraNormalizado != null) {
    idsArea.add(idAreaCabeceraNormalizado);
  }

  for (const linea of detalle) {
    const idAreaLinea = normalizarIdEnteroPositivo(linea?.idArea);
    if (idAreaLinea == null) {
      const error: any = new Error('Cada línea debe tener un Área destino válida (idArea).');
      error.statusCode = 400;
      throw error;
    }

    idsArea.add(idAreaLinea);
  }

  const idsAreaNoAutorizadas: number[] = [];

  await Promise.all(
    Array.from(idsArea).map(async (idArea) => {
      const tieneAcceso = await usuarioTieneAccesoArea(userId, idArea);
      if (!tieneAcceso) {
        idsAreaNoAutorizadas.push(idArea);
      }
    }),
  );

  if (idsAreaNoAutorizadas.length > 0) {
    const error: any = new Error('No tienes autorización para crear solicitudes en esta área.');
    error.statusCode = 403;
    error.code = 'AREA_ACCESS_DENIED';
    error.idsArea = idsAreaNoAutorizadas;
    throw error;
  }
}

export async function crearSolicitudController(req: AuthRequest, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const {
    fechaSolicitud,
    estado,
    area,
    comentario,
    idCorteStock,
    idArea,
    idRecurso,
    idCentroCosto,
    ot,
    detalle,
  } = req.body || {};

  if (!Array.isArray(detalle) || !detalle.length) {
    return res.status(400).json({ message: 'La solicitud debe tener al menos una línea de detalle' });
  }

  // Multi-área real: cada línea debe traer su IdArea.
  // Si necesitas compatibilidad hacia atrás, cambia esta validación a un fallback.
  if (detalle.some((d: any) => d?.idArea == null)) {
    return res.status(400).json({ message: 'Cada línea debe tener un Área destino (idArea).' });
  }

  try {
    await validarAccesoAreasSolicitud(userId, idArea, detalle);

    const result = await crearSolicitud({
      idSolicitante: userId,
      fechaSolicitud: fechaSolicitud ?? null,
      estado: estado ?? 'PENDIENTE',
      area: area ?? null,
      comentario: comentario ?? null,
      idCorteStock: idCorteStock ?? null,
      idArea: idArea ?? null,
      idRecurso: idRecurso ?? null,
      idCentroCosto: idCentroCosto ?? null,
      ot: ot ?? null,
      detalle: detalle.map((d: any) => ({
        idMaterial: d.idMaterial,
        cantidadSolicitada: d.cantidadSolicitada,
        unidadMedida: d.unidadMedida,
        comentarioLinea: d.comentarioLinea,
        idArea: normalizarIdEnteroPositivo(d.idArea),
        idRecurso: normalizarIdEnteroPositivo(d.idRecurso),
      })),
    });

    try {
      await registrarAuditoria(userId, 'CREAR_SOLICITUD', {
        modulo: 'Solicitudes',
        entidad: `Solicitud #${result.IdSolicitud}`,
        idSolicitud: result.IdSolicitud,
        codigoSolicitud: result.CodigoSolicitud,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_SOLICITUD', auditError);
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Error en crearSolicitudController', error);

    const sqlInfo = error?.originalError?.info;
    const sqlNumber: number | undefined =
      (typeof error?.number === 'number' ? error.number : undefined) ??
      (typeof sqlInfo?.number === 'number' ? sqlInfo.number : undefined);
    const sqlMessage: string | undefined =
      (typeof error?.message === 'string' ? error.message : undefined) ??
      (typeof sqlInfo?.message === 'string' ? sqlInfo.message : undefined);
    const normalizedSqlMessage = (sqlMessage || '').toLowerCase();

    // 2627: PK/Unique constraint violation, 2601: Cannot insert duplicate key row in object with unique index
    if (sqlNumber === 2627 || sqlNumber === 2601) {
      // Caso específico observado: IDENTITY desfasado en DetalleSolicitudesMaterial
      if ((sqlMessage || '').includes('DetalleSolicitudesMaterial') && (sqlMessage || '').includes('duplicate key value is (1)')) {
        return res.status(409).json({
          message:
            'Error al crear solicitud: el IDENTITY de DetalleSolicitudesMaterial está desfasado (PK duplicada). Ejecuta un RESEED del IDENTITY al MAX(IdDetalleSolicitud) y reintenta.',
        });
      }

      return res.status(409).json({ message: sqlMessage || 'Registro duplicado (restricción UNIQUE/PK)' });
    }

    if (normalizedSqlMessage.includes("invalid object name 'dbo.kardex'")) {
      return res.status(500).json({
        code: 'DB_SCHEMA_OUTDATED',
        message:
          'La base de datos tiene un procedimiento desactualizado. sp_CrearSolicitudMaterial todavía referencia dbo.Kardex. Actualiza el procedimiento desde backend/sql/init_db.sql y vuelve a intentar.',
      });
    }

    if (typeof error?.statusCode === 'number') {
      return res.status(error.statusCode).json({
        code: error?.code,
        idsArea: Array.isArray(error?.idsArea) ? error.idsArea : undefined,
        message: error?.message || 'No fue posible crear la solicitud',
      });
    }

    return res.status(500).json({ message: sqlMessage || 'Error al crear solicitud' });
  }
}

export async function listarSolicitudesController(req: AuthRequest, res: Response) {
  try {
    const { estado, idArea, fechaDesde, fechaHasta, soloMias } = req.query as Record<string, string | undefined>;

    const idSolicitante = soloMias === 'true' ? req.userId ?? undefined : undefined;

    const solicitudes = await listarSolicitudes({
      idSolicitante,
      estado: estado || undefined,
      idArea: idArea ? Number(idArea) : undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    });

    return res.json(solicitudes);
  } catch (error: any) {
    console.error('Error en listarSolicitudesController', error);
    return res.status(500).json({ message: 'Error al listar solicitudes' });
  }
}

export async function obtenerSolicitudController(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const idSolicitud = Number(id);
  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  try {
    const solicitud = await obtenerSolicitud(idSolicitud);
    if (!solicitud.cabecera) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }
    return res.json(solicitud);
  } catch (error: any) {
    console.error('Error en obtenerSolicitudController', error);
    return res.status(500).json({ message: 'Error al obtener solicitud' });
  }
}

export async function actualizarSolicitudController(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const idSolicitud = Number(id);
  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  const {
    fechaSolicitud,
    comentario,
    idArea,
    idRecurso,
    idCentroCosto,
    detalle,
    nuevoEstado,
    ot,
  } = req.body || {};

  if (!Array.isArray(detalle) || !detalle.length) {
    return res.status(400).json({ message: 'La solicitud debe tener al menos una línea de detalle' });
  }

  if (detalle.some((d: any) => d?.idArea == null)) {
    return res.status(400).json({ message: 'Cada línea debe tener un Área destino (idArea).' });
  }

  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    await validarAccesoAreasSolicitud(userId, idArea, detalle);

    await actualizarSolicitud({
      idSolicitud,
      fechaSolicitud: fechaSolicitud ?? null,
      nuevoEstado: nuevoEstado ?? 'PENDIENTE',
      comentario: comentario ?? null,
      idArea: idArea ?? null,
      idRecurso: idRecurso ?? null,
      idCentroCosto: idCentroCosto ?? null,
      ot: ot ?? null,
      area: null,
      detalle: detalle.map((d: any) => ({
        idMaterial: d.idMaterial,
        cantidadSolicitada: d.cantidadSolicitada,
        unidadMedida: d.unidadMedida,
        comentarioLinea: d.comentarioLinea,
        idArea: normalizarIdEnteroPositivo(d.idArea),
        idRecurso: normalizarIdEnteroPositivo(d.idRecurso),
      })),
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_SOLICITUD', {
        modulo: 'Solicitudes',
        idSolicitud,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_SOLICITUD', auditError);
    }

    return res.status(200).json({ message: 'Solicitud actualizada correctamente' });
  } catch (error: any) {
    console.error('Error en actualizarSolicitudController', error);

    if (typeof error?.statusCode === 'number') {
      return res.status(error.statusCode).json({
        code: error?.code,
        idsArea: Array.isArray(error?.idsArea) ? error.idsArea : undefined,
        message: error?.message || 'Error al actualizar solicitud',
      });
    }

    return res.status(500).json({ message: error?.message || 'Error al actualizar solicitud' });
  }
}

export async function registrarAprobacionSolicitudController(req: AuthRequest, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const { id } = req.params;
  const { estado, comentario } = req.body || {};
  const idSolicitud = Number(id);
  const estadoNormalizado = normalizarEstadoSolicitud(estado);
  const comentarioNormalizado =
    typeof comentario === 'string' && comentario.trim().length > 0 ? comentario.trim() : null;

  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  if (estadoNormalizado !== 'APROBADA' && estadoNormalizado !== 'RECHAZADA') {
    return res.status(400).json({ message: 'Estado inválido, use APROBADA o RECHAZADA' });
  }

  if (estadoNormalizado === 'RECHAZADA' && !comentarioNormalizado) {
    return res.status(400).json({ message: 'Debes ingresar un comentario al rechazar la solicitud' });
  }

  try {
    const solicitudMeta = await obtenerSolicitudMeta(idSolicitud);
    if (!solicitudMeta) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    if (normalizarEstadoSolicitud(solicitudMeta.Estado) !== 'PENDIENTE') {
      return res.status(409).json({
        message: `La solicitud ${solicitudMeta.CodigoSolicitud} ya no está pendiente y no puede volver a aprobarse o rechazarse.`,
      });
    }

    await registrarAprobacionSolicitud({
      idSolicitud,
      idAprobador: userId,
      estado: estadoNormalizado as 'APROBADA' | 'RECHAZADA',
      comentario: comentarioNormalizado,
    });

    try {
      await registrarAuditoria(userId, 'APROBAR_SOLICITUD', {
        modulo: 'Solicitudes',
        idSolicitud,
        estado: estadoNormalizado,
        comentario: comentarioNormalizado,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría APROBAR_SOLICITUD', auditError);
    }

    return res.status(200).json({ message: 'Aprobación registrada correctamente' });
  } catch (error: any) {
    console.error('Error en registrarAprobacionSolicitudController', error);

    const message = String(error?.message || '').trim();
    if (message === 'Solicitud no encontrada') {
      return res.status(404).json({ message });
    }

    if (message.includes('ya no está pendiente')) {
      return res.status(409).json({ message });
    }

    const sqlInfo = error?.originalError?.info;
    const sqlNumber: number | undefined =
      (typeof error?.number === 'number' ? error.number : undefined) ??
      (typeof sqlInfo?.number === 'number' ? sqlInfo.number : undefined);
    const sqlMessage: string | undefined =
      (typeof error?.message === 'string' ? error.message : undefined) ??
      (typeof sqlInfo?.message === 'string' ? sqlInfo.message : undefined);

    // Algunos SPs relanzan como 50000; en esos casos el texto sigue siendo clave.
    const msg = (sqlMessage || '').toString();

    // Caso observado: IDENTITY desfasado en dbo.Aprobaciones (PK duplicada con valor 1)
    if (msg.includes('Aprobaciones') && msg.includes('duplicate key value is (1)')) {
      return res.status(409).json({
        message:
          'Error al registrar aprobación: el IDENTITY de dbo.Aprobaciones está desfasado (PK duplicada). Ejecuta un RESEED al MAX(IdAprobacion) y reintenta.',
      });
    }

    // Duplicados por texto (aunque el number venga como 50000)
    if (msg.includes('Cannot insert duplicate key') || msg.includes('duplicate key')) {
      return res.status(409).json({
        message: sqlMessage || 'No se pudo registrar la aprobación: registro duplicado (PK/UNIQUE).',
      });
    }

    // Duplicados (PK/UNIQUE)
    if (sqlNumber === 2627 || sqlNumber === 2601) {
      return res.status(409).json({
        message: sqlMessage || 'No se pudo registrar la aprobación: registro duplicado (PK/UNIQUE).',
      });
    }

    // Violación de FK / CHECK
    if (sqlNumber === 547) {
      return res.status(409).json({
        message:
          sqlMessage ||
          'No se pudo registrar la aprobación: violación de integridad (FK/CHECK). Verifica solicitud y aprobador.',
      });
    }

    // Errores de conversión / parámetros inválidos
    if (sqlNumber === 245 || sqlNumber === 8114 || sqlNumber === 515 || sqlNumber === 50000) {
      return res.status(400).json({ message: sqlMessage || 'Datos inválidos para registrar aprobación.' });
    }

    return res.status(500).json({ message: sqlMessage || 'Error al registrar aprobación de solicitud' });
  }
}

export async function listarAprobacionesPorSolicitudController(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const idSolicitud = Number(id);
  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  try {
    const aprobaciones = await listarAprobacionesPorSolicitud(idSolicitud);
    return res.json(aprobaciones);
  } catch (error: any) {
    console.error('Error en listarAprobacionesPorSolicitudController', error);
    return res.status(500).json({ message: 'Error al listar aprobaciones de la solicitud' });
  }
}

export async function actualizarEstadoSolicitudController(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { estado } = req.body || {};
  const idSolicitud = Number(id);
  const estadoNormalizado = normalizarEstadoSolicitud(estado);

  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  if (!estadoNormalizado) {
    return res.status(400).json({ message: 'estado es requerido' });
  }

  try {
    if (!ESTADOS_SOLICITUD_VALIDOS.has(estadoNormalizado)) {
      return res.status(400).json({ message: 'Estado inválido para la solicitud' });
    }

    const solicitudMeta = await obtenerSolicitudMeta(idSolicitud);
    if (!solicitudMeta) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    const estadoActual = normalizarEstadoSolicitud(solicitudMeta.Estado);
    if (!puedeTransicionarSolicitud(estadoActual, estadoNormalizado)) {
      return res.status(409).json({
        message: `No se permite cambiar la solicitud ${solicitudMeta.CodigoSolicitud} de ${estadoActual} a ${estadoNormalizado}.`,
      });
    }

    await actualizarEstadoSolicitud(idSolicitud, estadoNormalizado);

    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_ESTADO_SOLICITUD', {
        modulo: 'Solicitudes',
        idSolicitud,
        estado: estadoNormalizado,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_ESTADO_SOLICITUD', auditError);
    }

    return res.status(200).json({ message: 'Estado actualizado correctamente' });
  } catch (error: any) {
    console.error('Error en actualizarEstadoSolicitudController', error);
    return res.status(500).json({ message: 'Error al actualizar estado de solicitud' });
  }
}

export async function registrarDespachoSolicitudController(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { nuevoEstado, detalle } = req.body || {};
  const idSolicitud = Number(id);

  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  if (!Array.isArray(detalle) || !detalle.length) {
    return res.status(400).json({ message: 'El despacho debe contener al menos una línea' });
  }

  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Usuario no autenticado' });

    const solicitudMeta = await obtenerSolicitudMeta(idSolicitud);
    if (!solicitudMeta) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    const estadoActual = normalizarEstadoSolicitud(solicitudMeta.Estado);
    if (!['APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA'].includes(estadoActual)) {
      return res.status(409).json({
        message: `La solicitud ${solicitudMeta.CodigoSolicitud} no está lista para despacho.`,
      });
    }

    await registrarDespachoSolicitud({
      idSolicitud,
      idUsuarioDespacho: userId,
      nuevoEstado: nuevoEstado || undefined,
      detalle: detalle.map((d: any) => ({
        idMaterial: d.idMaterial,
        cantidadAprobada: d.cantidadAprobada,
        comentarioLinea: d.comentarioLinea,
      })),
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'REGISTRAR_DESPACHO_SOLICITUD', {
        modulo: 'Solicitudes',
        idSolicitud,
        nuevoEstado: nuevoEstado || 'DESPACHADA',
        lineas: detalle?.length ?? 0,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REGISTRAR_DESPACHO_SOLICITUD', auditError);
    }

    return res.status(200).json({ message: 'Despacho registrado correctamente' });
  } catch (error: any) {
    console.error('Error en registrarDespachoSolicitudController', error);
    return res.status(500).json({ message: 'Error al registrar despacho de solicitud' });
  }
}

export async function generarPdfSolicitudController(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const stream = await generarPdfSolicitud(Number(id));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Solicitud-${id}.pdf`);

    stream.pipe(res);
  } catch (error: any) {
    console.error('Error al generar PDF de solicitud:', error);
    return res.status(500).json({ message: error.message || 'Error al generar PDF' });
  }
}
