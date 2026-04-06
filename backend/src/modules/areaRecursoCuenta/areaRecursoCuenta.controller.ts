import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { usuarioTieneAccesoArea } from '../areas/areas.service';
import {
  obtenerCodigoCuenta,
  obtenerRecursosVisiblesPorUsuarioArea,
  usuarioPuedeUsarRecursoEnArea,
} from './areaRecursoCuenta.service';

async function validarAccesoArea(req: AuthRequest, res: Response, idArea: number): Promise<boolean> {
  if (!req.userId) {
    res.status(401).json({ message: 'Usuario no autenticado' });
    return false;
  }

  const autorizado = await usuarioTieneAccesoArea(req.userId, idArea);
  if (!autorizado) {
    res.status(403).json({ message: 'No tienes autorización para operar en esta área.' });
    return false;
  }

  return true;
}

export async function obtenerCodigoCuentaController(req: AuthRequest, res: Response) {
  // Aceptar tanto `idArea` como `areaId`
  const rawArea = (req.query.idArea ?? req.query.areaId) as unknown;
  const idArea = Number(rawArea);
  const idRecurso = Number(req.query.idRecurso ?? req.query.id);

  if (!Number.isInteger(idArea) || idArea <= 0 || !Number.isInteger(idRecurso) || idRecurso <= 0) {
    return res.status(400).json({ message: 'idArea e idRecurso son requeridos' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    const puedeUsarRecurso = await usuarioPuedeUsarRecursoEnArea(req.userId!, idArea, idRecurso);
    if (!puedeUsarRecurso) {
      return res.status(403).json({ message: 'No tienes autorización para usar este recurso en el área seleccionada.' });
    }

    const data = await obtenerCodigoCuenta(idArea, idRecurso);
    return res.json(data);
  } catch (error: any) {
    console.error('Error en obtenerCodigoCuentaController', error);
    return res.status(500).json({ message: 'Error al obtener código de cuenta' });
  }
}

export async function listarRecursosPorAreaController(req: AuthRequest, res: Response) {
  // Aceptar tanto `idArea` como `areaId` en la query para compatibilidad
  const raw = (req.query.idArea ?? req.query.areaId) as unknown;
  const idArea = Number(raw);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'idArea es requerido' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    const { recursos } = await obtenerRecursosVisiblesPorUsuarioArea(req.userId!, idArea);
    return res.json(recursos);
  } catch (error: any) {
    console.error('Error en listarRecursosPorAreaController', error);
    return res.status(500).json({ message: 'Error al listar recursos por área' });
  }
}

export async function listarRecursosPermitidosController(req: AuthRequest, res: Response) {
  // Aceptar tanto `idArea` como `areaId` en la query
  const raw = (req.query.idArea ?? req.query.areaId) as unknown;
  const idArea = Number(raw);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'areaId es requerido' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    const payload = await obtenerRecursosVisiblesPorUsuarioArea(req.userId!, idArea);
    return res.json(payload);
  } catch (error: any) {
    console.error('Error en listarRecursosPermitidosController', error);
    return res.status(500).json({ message: 'Error al listar recursos permitidos' });
  }
}
