import { Request, Response } from 'express';
import { listarCentrosCosto, crearCentroCosto } from './centrosCosto.service';

export async function listarCentrosCostoController(_req: Request, res: Response) {
  try {
    const centros = await listarCentrosCosto();
    return res.json(centros);
  } catch (error: any) {
    console.error('Error en listarCentrosCostoController', error);
    return res.status(500).json({ message: 'Error al listar centros de costo' });
  }
}

export async function crearCentroCostoController(req: Request, res: Response) {
  const { codigo, nombre, descripcion, activo } = req.body || {};

  if (!codigo || !nombre) {
    return res.status(400).json({ message: 'codigo y nombre son requeridos' });
  }

  try {
    const idCentroCosto = await crearCentroCosto({
      Codigo: codigo,
      Nombre: nombre,
      Descripcion: descripcion,
      Activo: activo,
    });
    return res.status(201).json({ idCentroCosto });
  } catch (error: any) {
    console.error('Error en crearCentroCostoController', error);
    return res.status(500).json({ message: 'Error al crear centro de costo' });
  }
}
