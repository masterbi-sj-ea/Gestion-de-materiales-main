import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { listarPresupuestos, crearPresupuesto, actualizarPresupuesto } from './presupuestos.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';

export async function listarPresupuestosController(_req: Request, res: Response) {
  try {
    const presupuestos = await listarPresupuestos();
    return res.json(presupuestos);
  } catch (error: any) {
    console.error('Error en listarPresupuestosController', error);
    return res.status(500).json({ message: 'Error al listar presupuestos' });
  }
}

export async function crearPresupuestoController(req: AuthRequest, res: Response) {
  const { anio, mes, idArea, idCentroCosto, montoTotal, moneda } = req.body || {};

  if (!anio || !montoTotal) {
    return res.status(400).json({ message: 'anio y montoTotal son requeridos' });
  }

  try {
    const idPresupuesto = await crearPresupuesto({
      Anio: Number(anio),
      Mes: mes !== undefined && mes !== null ? Number(mes) : null,
      IdArea: idArea !== undefined && idArea !== null ? Number(idArea) : null,
      IdCentroCosto: idCentroCosto !== undefined && idCentroCosto !== null ? Number(idCentroCosto) : null,
      MontoTotal: Number(montoTotal),
      Moneda: moneda,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'CREAR_PRESUPUESTO', {
        modulo: 'Presupuestos',
        entidad: `Presupuesto #${idPresupuesto}`,
        idPresupuesto,
        anio,
        mes,
        idArea,
        idCentroCosto,
        montoTotal,
        moneda,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_PRESUPUESTO', auditError);
    }

    return res.status(201).json({ idPresupuesto });
  } catch (error: any) {
    console.error('Error en crearPresupuestoController', error);
    return res.status(500).json({ message: 'Error al crear presupuesto' });
  }
}

export async function actualizarPresupuestoController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  const { anio, mes, idArea, idCentroCosto, montoTotal, moneda } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de presupuesto inválido' });
  }

  if (!anio || !montoTotal) {
    return res.status(400).json({ message: 'anio y montoTotal son requeridos' });
  }

  try {
    await actualizarPresupuesto(id, {
      Anio: Number(anio),
      Mes: mes !== undefined && mes !== null ? Number(mes) : null,
      IdArea: idArea !== undefined && idArea !== null ? Number(idArea) : null,
      IdCentroCosto: idCentroCosto !== undefined && idCentroCosto !== null ? Number(idCentroCosto) : null,
      MontoTotal: Number(montoTotal),
      Moneda: moneda,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_PRESUPUESTO', {
        modulo: 'Presupuestos',
        entidad: `Presupuesto #${id}`,
        idPresupuesto: id,
        anio,
        mes,
        idArea,
        idCentroCosto,
        montoTotal,
        moneda,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_PRESUPUESTO', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en actualizarPresupuestoController', error);
    return res.status(500).json({ message: 'Error al actualizar presupuesto' });
  }
}
