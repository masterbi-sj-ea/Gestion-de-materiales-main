import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { hasRequestModulePermission } from '../../middleware/accessControl';
import * as despachoService from './despachos.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';


export async function listarPendientesController(req: AuthRequest, res: Response) {
  try {
    const { page, pageSize } = req.query as Record<string, string | undefined>;

    const pendientes = await despachoService.listarSolicitudesPendientes({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Math.min(Number(pageSize), 100) : 10,
    });

    return res.json(pendientes);
  } catch (error) {
    console.error('Error al listar despachos pendientes:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

export async function listarDespachadasController(req: AuthRequest, res: Response) {
  try {
    const {
      fechaDesde,
      fechaHasta,
      idArea,
      idDespachador,
      page,
      pageSize,
    } = req.query as Record<string, string | undefined>;

    const result = await despachoService.listarSolicitudesDespachadas({
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      idArea: idArea ? Number(idArea) : undefined,
      idDespachador: idDespachador ? Number(idDespachador) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Math.min(Number(pageSize), 200) : 50,
    });

    return res.json(result);
  } catch (error) {
    console.error('Error al listar despachos realizados:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

export async function obtenerDetalleController(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const solicitud = await despachoService.obtenerSolicitudParaDespacho(Number(id));
    
    if (!solicitud) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    return res.json(solicitud);
  } catch (error: any) {
    console.error('Error al obtener detalle para despacho:', error);
    const status = Number(error?.statusCode);
    if (status === 409) {
      return res.status(409).json({ message: error.message || 'La solicitud ya no está disponible para despacho' });
    }
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

export async function registrarDespachoController(req: AuthRequest, res: Response) {
  try {
    const { idSolicitud, observaciones, detalle, accion, motivoCierreParcial } = req.body;
    const accionNormalizada = String(accion ?? 'despachar').trim().toLowerCase();
    const esCierreParcial = accionNormalizada === 'cerrar_parcial';
    const tienePermiso = await hasRequestModulePermission(
      req,
      'despacho',
      esCierreParcial ? 'aprobar' : 'crear',
    );

    if (!tienePermiso) {
      return res.status(403).json({
        message: esCierreParcial
          ? 'No tienes permisos para cerrar parcialmente solicitudes.'
          : 'No tienes permisos para despachar solicitudes.',
      });
    }

    if (!idSolicitud || !Array.isArray(detalle) || (!esCierreParcial && detalle.length === 0)) {
      return res.status(400).json({ message: 'Datos de despacho inválidos' });
    }

    // Normalización mínima
    const idSolicitudNum = Number(idSolicitud);
    if (!Number.isFinite(idSolicitudNum) || idSolicitudNum <= 0) {
      return res.status(400).json({ message: 'idSolicitud inválido' });
    }

    if (typeof observaciones !== 'string') {
      // permitir null/undefined como string vacío
      // (no cambiamos contrato; solo evitamos fallos)
    }

    const resultado = await despachoService.registrarDespacho({
      idSolicitud: idSolicitudNum,
      observaciones: typeof observaciones === 'string' ? observaciones : '',
      detalle: Array.isArray(detalle) ? detalle : [],
      accion: esCierreParcial ? 'cerrar_parcial' : 'despachar',
      motivoCierreParcial: typeof motivoCierreParcial === 'string' ? motivoCierreParcial : '',
      idUsuario: req.userId // Pasamos el ID del usuario que despacha
    });

    // Auditoría
    try {
      await registrarAuditoria(req.userId ?? null, esCierreParcial ? 'CERRAR_PARCIAL_SOLICITUD' : 'REGISTRAR_DESPACHO', {
        idSolicitud: idSolicitudNum,
        accion: esCierreParcial ? 'cerrar_parcial' : 'despachar',
        items: Array.isArray(detalle) ? detalle.length : 0,
        motivoCierreParcial: esCierreParcial ? (typeof motivoCierreParcial === 'string' ? motivoCierreParcial : '') : null,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REGISTRAR_DESPACHO', auditError);
    }

    return res.status(200).json(resultado);
  } catch (error: any) {
    console.error('Error al registrar despacho:', error);
    const status = Number(error?.statusCode);
    if (status === 400 || status === 409) {
      return res.status(status).json({ message: error.message || 'Error de validación' });
    }
    return res.status(500).json({ message: error?.message || 'Error al procesar el despacho' });
  }
}

export async function contarDespachosHoyController(req: AuthRequest, res: Response) {
  try {
    const count = await despachoService.contarDespachosHoy();
    return res.json({ todayCount: count });
  } catch (error) {
    console.error('Error al contar despachos de hoy:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

export async function generarPdfController(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const stream = await despachoService.generarPdfDespacho(Number(id));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Requisa-${id}.pdf`);

    stream.pipe(res);
  } catch (error: any) {
    console.error('Error al generar PDF de despacho:', error);
    return res.status(500).json({ message: error.message || 'Error al generar PDF' });
  }
}

export async function generarDevolucionPdfController(req: AuthRequest, res: Response) {
  try {
    const idDevolucion = parseRouteId(req.params.id);
    if (!idDevolucion) {
      return res.status(400).json({ message: 'Id de devolución inválido' });
    }

    const stream = await despachoService.generarPdfDevolucion(idDevolucion);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Devolucion-${idDevolucion}.pdf`);

    stream.pipe(res);
  } catch (error: any) {
    console.error('Error al generar PDF de devolución:', error);
    const status = Number(error?.statusCode);
    if (status === 400 || status === 404) {
      return res.status(status).json({ message: error.message || 'Error de validación' });
    }
    return res.status(500).json({ message: error.message || 'Error al generar PDF de devolución' });
  }
}

function parseRouteId(rawValue: string | undefined): number | null {
  const id = Number(rawValue);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  return id;
}

export async function listarDevolucionesPorDespachoController(req: AuthRequest, res: Response) {
  try {
    const idDespacho = Number(req.params.id);

    if (!Number.isFinite(idDespacho) || idDespacho <= 0) {
      return res.status(400).json({ message: 'Id de despacho inválido' });
    }

    const result = await despachoService.listarDevolucionesPorDespacho(idDespacho);
    return res.json(result);
  } catch (error: any) {
    console.error('Error al listar devoluciones del despacho:', error);
    const status = Number(error?.statusCode);
    if (status === 400 || status === 404 || status === 409 || status === 501) {
      return res.status(status).json({ message: error.message || 'Error de validación' });
    }
    return res.status(500).json({ message: error?.message || 'Error interno del servidor' });
  }
}

export async function obtenerDetalleParaDevolucionController(req: AuthRequest, res: Response) {
  try {
    const idDespacho = Number(req.params.id);

    if (!Number.isFinite(idDespacho) || idDespacho <= 0) {
      return res.status(400).json({ message: 'Id de despacho inválido' });
    }

    const result = await despachoService.obtenerDetalleParaDevolucion(idDespacho);

    if (!result) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }

    return res.json(result);
  } catch (error: any) {
    console.error('Error al obtener detalle para devolución:', error);
    const status = Number(error?.statusCode);
    if (status === 400 || status === 404 || status === 409 || status === 501) {
      return res.status(status).json({ message: error.message || 'Error de validación' });
    }
    return res.status(500).json({ message: error?.message || 'Error interno del servidor' });
  }
}

export async function registrarDevolucionController(req: AuthRequest, res: Response) {
  try {
    const idDespacho = Number(req.params.id);
    const { motivo, observaciones, fechaDevolucion, detalle } = req.body;

    if (!Number.isFinite(idDespacho) || idDespacho <= 0) {
      return res.status(400).json({ message: 'Id de despacho inválido' });
    }

    if (typeof motivo !== 'string' || !motivo.trim()) {
      return res.status(400).json({ message: 'Debes indicar el motivo de la devolución' });
    }

    if (!Array.isArray(detalle) || detalle.length === 0) {
      return res.status(400).json({ message: 'Debes enviar al menos una línea para devolución' });
    }

    const resultado = await despachoService.registrarDevolucion({
      idDespacho,
      idUsuarioRecibe: req.userId ?? 0,
      motivo,
      observaciones: typeof observaciones === 'string' ? observaciones : '',
      fechaDevolucion: typeof fechaDevolucion === 'string' && fechaDevolucion.trim()
        ? fechaDevolucion
        : null,
      detalle,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'REGISTRAR_DEVOLUCION_DESPACHO', {
        idDespacho,
        motivo,
        items: detalle.length,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REGISTRAR_DEVOLUCION_DESPACHO', auditError);
    }

    return res.status(200).json(resultado);
  } catch (error: any) {
    console.error('Error al registrar devolución:', error);
    const status = Number(error?.statusCode);
    if (status === 400 || status === 404 || status === 409 || status === 501) {
      return res.status(status).json({ message: error.message || 'Error de validación' });
    }
    return res.status(500).json({ message: error?.message || 'Error al procesar la devolución' });
  }
}

export async function anularDevolucionController(req: AuthRequest, res: Response) {
  try {
    const idDevolucion = Number(req.params.id);
    const { motivoAnulacion, observaciones } = req.body;

    if (!Number.isFinite(idDevolucion) || idDevolucion <= 0) {
      return res.status(400).json({ message: 'Id de devolución inválido' });
    }

    if (typeof motivoAnulacion !== 'string' || !motivoAnulacion.trim()) {
      return res.status(400).json({ message: 'Debes indicar el motivo de la anulación' });
    }

    const resultado = await despachoService.anularDevolucion({
      idDevolucion,
      idUsuarioAnula: req.userId ?? 0,
      motivoAnulacion,
      observaciones: typeof observaciones === 'string' ? observaciones : '',
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'ANULAR_DEVOLUCION_DESPACHO', {
        idDevolucion,
        motivoAnulacion,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ANULAR_DEVOLUCION_DESPACHO', auditError);
    }

    return res.status(200).json(resultado);
  } catch (error: any) {
    console.error('Error al anular devolución:', error);
    const status = Number(error?.statusCode);
    if (status === 400 || status === 404 || status === 409) {
      return res.status(status).json({ message: error.message || 'Error de validación' });
    }
    return res.status(500).json({ message: error?.message || 'Error al anular la devolución' });
  }
}
