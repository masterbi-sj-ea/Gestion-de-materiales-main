import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import * as despachoService from './despachos.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';


export async function listarPendientesController(req: AuthRequest, res: Response) {
  try {
    const pendientes = await despachoService.listarSolicitudesPendientes();
    return res.json(pendientes);
  } catch (error) {
    console.error('Error al listar despachos pendientes:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

export async function listarDespachadasController(req: AuthRequest, res: Response) {
  try {
    const despachadas = await despachoService.listarSolicitudesDespachadas();
    return res.json(despachadas);
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
  } catch (error) {
    console.error('Error al obtener detalle para despacho:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

export async function registrarDespachoController(req: AuthRequest, res: Response) {
  try {
    const { idSolicitud, observaciones, detalle } = req.body;

    if (!idSolicitud || !detalle || !Array.isArray(detalle) || detalle.length === 0) {
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
      detalle,
      idUsuario: req.userId // Pasamos el ID del usuario que despacha
    });

    // Auditoría
    try {
      await registrarAuditoria(req.userId ?? null, 'REGISTRAR_DESPACHO', {
        idSolicitud: idSolicitudNum,
        items: Array.isArray(detalle) ? detalle.length : 0
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
