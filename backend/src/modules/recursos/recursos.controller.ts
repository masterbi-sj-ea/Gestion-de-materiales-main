import { Request, Response } from 'express';
import { listarRecursos } from './recursos.service';

export async function listarRecursosController(_req: Request, res: Response) {
  try {
    const recursos = await listarRecursos();
    return res.json(recursos);
  } catch (error: any) {
    console.error('Error en listarRecursosController', error);
    return res.status(500).json({ message: 'Error al listar recursos' });
  }
}
