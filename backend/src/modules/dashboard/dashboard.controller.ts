import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { obtenerDashboardData } from './dashboard.service';

export async function obtenerDashboardController(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado.' });
    }

    const now = new Date();
    const anio = Number(req.query.anio ?? now.getFullYear());
    const mesQuery = req.query.mes;
    const idAreaQuery = req.query.idArea;

    const mes =
      mesQuery === undefined || mesQuery === null || mesQuery === ''
        ? now.getMonth() + 1
        : Number(mesQuery);

    const idArea =
      idAreaQuery === undefined || idAreaQuery === null || idAreaQuery === '' || String(idAreaQuery) === 'todas'
        ? null
        : Number(idAreaQuery);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ message: 'Año inválido.' });
    }

    if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
      return res.status(400).json({ message: 'Mes inválido.' });
    }

    if (idArea !== null && (!Number.isInteger(idArea) || idArea <= 0)) {
      return res.status(400).json({ message: 'Área inválida.' });
    }

    const payload = await obtenerDashboardData({
      anio,
      mes,
      idArea,
    }, {
      userId: req.userId,
      userRoles: req.userRoles ?? [],
    });

    return res.json(payload);
  } catch (error: any) {
    if (typeof error?.statusCode === 'number') {
      return res.status(error.statusCode).json({
        message: error?.message || 'No autorizado para ver este dashboard.',
      });
    }

    console.error('Error en obtenerDashboardController', error);
    return res.status(500).json({
      message: error?.message || 'Error al obtener el dashboard',
    });
  }
}
