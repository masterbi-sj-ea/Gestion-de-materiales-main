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

    const resultado = await despachoService.registrarDespacho({
      idSolicitud,
      observaciones,
      detalle
    });

    // Auditoría
    await registrarAuditoria(req.userId ?? null, 'REGISTRAR_DESPACHO', {
      idSolicitud,
      items: detalle.length
    });

    return res.status(200).json(resultado);
  } catch (error: any) {
    console.error('Error al registrar despacho:', error);
    return res.status(500).json({ message: error.message || 'Error al procesar el despacho' });
  }
}
