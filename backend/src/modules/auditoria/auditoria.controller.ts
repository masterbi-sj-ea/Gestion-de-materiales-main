import { Request, Response } from 'express';
import { listarAuditoria } from './auditoria.service';

export async function listarAuditoriaController(req: Request, res: Response) {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;

  try {
    const result = await listarAuditoria(page, pageSize);
    return res.json(result);
  } catch (error: any) {
    console.error('Error en listarAuditoriaController', error);
    return res.status(500).json({ message: 'Error al listar auditoría' });
  }
}
