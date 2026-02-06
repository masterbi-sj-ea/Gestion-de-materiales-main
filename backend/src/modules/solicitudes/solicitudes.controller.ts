import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import {
  crearSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
  actualizarSolicitud,
  registrarAprobacionSolicitud,
  listarAprobacionesPorSolicitud,
  actualizarEstadoSolicitud,
  registrarDespachoSolicitud,
} from './solicitudes.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';

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
    idCentroCosto,
    detalle,
  } = req.body || {};

  if (!Array.isArray(detalle) || !detalle.length) {
    return res.status(400).json({ message: 'La solicitud debe tener al menos una línea de detalle' });
  }

  try {
    const result = await crearSolicitud({
      idSolicitante: userId,
      fechaSolicitud: fechaSolicitud ?? null,
      estado: estado ?? 'PENDIENTE',
      area: area ?? null,
      comentario: comentario ?? null,
      idCorteStock: idCorteStock ?? null,
      idArea: idArea ?? null,
      idCentroCosto: idCentroCosto ?? null,
      detalle: detalle.map((d: any) => ({
        idMaterial: d.idMaterial,
        cantidadSolicitada: d.cantidadSolicitada,
        unidadMedida: d.unidadMedida,
        comentarioLinea: d.comentarioLinea,
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
    return res.status(500).json({ message: 'Error al crear solicitud' });
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
    idCentroCosto,
    detalle,
    nuevoEstado,
  } = req.body || {};

  if (!Array.isArray(detalle) || !detalle.length) {
    return res.status(400).json({ message: 'La solicitud debe tener al menos una línea de detalle' });
  }

  try {
    await actualizarSolicitud({
      idSolicitud,
      fechaSolicitud: fechaSolicitud ?? null,
      nuevoEstado: nuevoEstado ?? 'PENDIENTE',
      comentario: comentario ?? null,
      idArea: idArea ?? null,
      idCentroCosto: idCentroCosto ?? null,
      area: null,
      detalle: detalle.map((d: any) => ({
        idMaterial: d.idMaterial,
        cantidadSolicitada: d.cantidadSolicitada,
        unidadMedida: d.unidadMedida,
        comentarioLinea: d.comentarioLinea,
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

  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  if (estado !== 'APROBADA' && estado !== 'RECHAZADA') {
    return res.status(400).json({ message: 'Estado inválido, use APROBADA o RECHAZADA' });
  }

  try {
    await registrarAprobacionSolicitud({
      idSolicitud,
      idAprobador: userId,
      estado,
      comentario: comentario ?? null,
    });

    try {
      await registrarAuditoria(userId, 'APROBAR_SOLICITUD', {
        modulo: 'Solicitudes',
        idSolicitud,
        estado,
        comentario,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría APROBAR_SOLICITUD', auditError);
    }

    return res.status(200).json({ message: 'Aprobación registrada correctamente' });
  } catch (error: any) {
    console.error('Error en registrarAprobacionSolicitudController', error);
    return res.status(500).json({ message: 'Error al registrar aprobación de solicitud' });
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

  if (!idSolicitud || Number.isNaN(idSolicitud)) {
    return res.status(400).json({ message: 'Id de solicitud inválido' });
  }

  if (!estado) {
    return res.status(400).json({ message: 'estado es requerido' });
  }

  try {
    await actualizarEstadoSolicitud(idSolicitud, estado);

    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_ESTADO_SOLICITUD', {
        modulo: 'Solicitudes',
        idSolicitud,
        estado,
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
    await registrarDespachoSolicitud({
      idSolicitud,
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
