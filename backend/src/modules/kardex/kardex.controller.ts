import { Request, Response } from 'express';
import { listarMovimientosInventario } from './kardex.service';

export async function listarMovimientosController(req: Request, res: Response) {
  try {
    const { idMaterial, tipoMovimiento, fechaInicio, fechaFin, search, page, limit } = req.query;

    const pageNumber = page ? Number(page) : undefined;
    const limitNumber = limit ? Number(limit) : undefined;

    const filtros = {
      IdMaterial: idMaterial ? Number(idMaterial) : undefined,
      TipoMovimiento: tipoMovimiento ? String(tipoMovimiento) : undefined,
      FechaInicio: fechaInicio ? String(fechaInicio) : undefined,
      FechaFin: fechaFin ? String(fechaFin) : undefined,
      Search: search ? String(search) : undefined,
      Page: pageNumber && Number.isFinite(pageNumber) ? pageNumber : undefined,
      Limit: limitNumber && Number.isFinite(limitNumber) ? limitNumber : undefined,
    };

    const movimientos = await listarMovimientosInventario(filtros);
    return res.json(movimientos);
  } catch (error: any) {
    console.error('Error en listarMovimientosController', error);
    return res.status(500).json({ message: 'Error al listar movimientos de inventario' });
  }
}
