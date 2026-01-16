import { Request, Response } from 'express';
import { listarModulos } from './modulos.service';

export async function listarModulosController(_req: Request, res: Response) {
  try {
    const modulos = await listarModulos();
    return res.json(modulos);
  } catch (error: any) {
    console.error('Error en listarModulosController', error);
    return res.status(500).json({ message: 'Error al listar módulos' });
  }
}
