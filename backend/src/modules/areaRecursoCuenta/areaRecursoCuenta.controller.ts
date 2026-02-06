import { Request, Response } from 'express';
import { listarRecursosPorArea, obtenerCodigoCuenta } from './areaRecursoCuenta.service';

export async function obtenerCodigoCuentaController(req: Request, res: Response) {
  const idArea = Number(req.query.idArea);
  const idRecurso = Number(req.query.idRecurso);

  if (!Number.isInteger(idArea) || idArea <= 0 || !Number.isInteger(idRecurso) || idRecurso <= 0) {
    return res.status(400).json({ message: 'idArea e idRecurso son requeridos' });
  }

  try {
    const codigoCuenta = await obtenerCodigoCuenta(idArea, idRecurso);
    return res.json({ codigoCuenta });
  } catch (error: any) {
    console.error('Error en obtenerCodigoCuentaController', error);
    return res.status(500).json({ message: 'Error al obtener código de cuenta' });
  }
}

export async function listarRecursosPorAreaController(req: Request, res: Response) {
  const idArea = Number(req.query.idArea);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'idArea es requerido' });
  }

  try {
    const recursos = await listarRecursosPorArea(idArea);
    return res.json(recursos);
  } catch (error: any) {
    console.error('Error en listarRecursosPorAreaController', error);
    return res.status(500).json({ message: 'Error al listar recursos por área' });
  }
}
