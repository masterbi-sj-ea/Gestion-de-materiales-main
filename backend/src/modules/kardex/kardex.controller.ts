import { Request, Response } from 'express';
import { listarMovimientosInventario } from './kardex.service';

export async function listarMovimientosController(req: Request, res: Response) {
  try {
    const { idMaterial, tipoMovimiento, fechaInicio, fechaFin } = req.query;

    const filtros = {
      IdMaterial: idMaterial ? Number(idMaterial) : undefined,
      TipoMovimiento: tipoMovimiento ? String(tipoMovimiento) : undefined,
      FechaInicio: fechaInicio ? String(fechaInicio) : undefined,
      FechaFin: fechaFin ? String(fechaFin) : undefined,
    };

    const movimientos = await listarMovimientosInventario(filtros);
    return res.json(movimientos);
  } catch (error: any) {
    console.error('Error en listarMovimientosController', error);
    return res.status(500).json({ message: 'Error al listar movimientos de inventario' });
  }
}
