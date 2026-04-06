import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import {
  listarAreas,
  listarAreasPermitidasPorUsuario,
  crearArea,
  actualizarArea,
  eliminarArea,
} from './areas.service';

export async function listarAreasController(_req: Request, res: Response) {
  try {
    const areas = await listarAreas();
    return res.json(areas);
  } catch (error: any) {
    console.error('Error en listarAreasController', error);
    return res.status(500).json({ message: 'Error al listar áreas' });
  }
}

export async function listarMisAreasPermitidasController(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  try {
    const areas = await listarAreasPermitidasPorUsuario(req.userId);
    return res.json(areas);
  } catch (error: any) {
    console.error('Error en listarMisAreasPermitidasController', error);
    return res.status(500).json({ message: 'Error al listar las áreas permitidas del usuario' });
  }
}

export async function crearAreaController(req: Request, res: Response) {
  const { codigo, nombre, descripcion, activo, idCentroCosto } = req.body || {};

  if (!codigo || !nombre) {
    return res.status(400).json({ message: 'codigo y nombre son requeridos' });
  }

  try {
    const idArea = await crearArea({
      Codigo: codigo,
      Nombre: nombre,
      Descripcion: descripcion,
      Activo: activo,
      IdCentroCosto: idCentroCosto !== undefined && idCentroCosto !== null ? Number(idCentroCosto) : null,
    });
    return res.status(201).json({ idArea });
  } catch (error: any) {
    console.error('Error en crearAreaController', error);
    return res.status(500).json({ message: 'Error al crear área' });
  }
}

export async function actualizarAreaController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { codigo, nombre, descripcion, activo, idCentroCosto } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de área inválido' });
  }

  if (!codigo || !nombre) {
    return res.status(400).json({ message: 'codigo y nombre son requeridos' });
  }

  try {
    await actualizarArea(id, {
      Codigo: codigo,
      Nombre: nombre,
      Descripcion: descripcion,
      Activo: activo,
      IdCentroCosto: idCentroCosto !== undefined && idCentroCosto !== null ? Number(idCentroCosto) : null,
    });
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en actualizarAreaController', error);
    return res.status(500).json({ message: 'Error al actualizar área' });
  }
}

export async function eliminarAreaController(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de área inválido' });
  }

  try {
    await eliminarArea(id);
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en eliminarAreaController', error);
    return res.status(500).json({ message: 'Error al eliminar área' });
  }
}
