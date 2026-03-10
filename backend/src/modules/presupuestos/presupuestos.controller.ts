import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { 
  listarPresupuestos, 
  guardarPresupuesto, 
  guardarPresupuestoDetalle, 
  obtenerDetallePresupuesto 
} from './presupuestos.service';

export async function listarPresupuestosController(_req: Request, res: Response) {
  try {
    const presupuestos = await listarPresupuestos();
    return res.json(presupuestos);
  } catch (error: any) {
    console.error('Error en listarPresupuestosController', error);
    return res.status(500).json({ message: 'Error al listar presupuestos' });
  }
}

export async function guardarPresupuestoController(req: AuthRequest, res: Response) {
  const { idPresupuesto, anio, mes, montoTotal, idArea, idCentroCosto } = req.body || {};

  if (!anio || !mes || !montoTotal || !idArea) {
    return res.status(400).json({ message: 'Anio, mes, montoTotal e idArea son requeridos' });
  }

  try {
    await guardarPresupuesto({
      IdPresupuesto: idPresupuesto ? Number(idPresupuesto) : undefined,
      Anio: Number(anio),
      Mes: Number(mes),
      MontoTotal: Number(montoTotal),
      IdArea: Number(idArea),
      IdCentroCosto: idCentroCosto ? Number(idCentroCosto) : undefined,
      IdUsuarioAudit: req.userId || 0
    });

    return res.status(200).json({ message: 'Presupuesto guardado correctamente' });
  } catch (error: any) {
    console.error('Error en guardarPresupuestoController', error);
    return res.status(500).json({ message: 'Error al guardar presupuesto' });
  }
}

export async function guardarPresupuestoDetalleController(req: AuthRequest, res: Response) {
  const { idPresupuesto, idMaterial, grupoArticulos, montoPermitido, cantidadPresupuestada, costoUnitarioPresupuestado, montoAsignado } = req.body || {};

  if (!idPresupuesto || !idMaterial || !montoPermitido) {
    return res.status(400).json({ message: 'Datos incompletos para el detalle del presupuesto' });
  }

  try {
    await guardarPresupuestoDetalle({
      IdPresupuesto: Number(idPresupuesto),
      IdMaterial: Number(idMaterial),
      GrupoArticulos: grupoArticulos || '',
      MontoPermitido: Number(montoPermitido),
      CantidadPresupuestada: Number(cantidadPresupuestada) || 0,
      CostoUnitarioPresupuestado: Number(costoUnitarioPresupuestado) || 0,
      MontoAsignado: Number(montoAsignado) || 0
    });

    return res.status(200).json({ message: 'Detalle de presupuesto guardado correctamente' });
  } catch (error: any) {
    console.error('Error en guardarPresupuestoDetalleController', error);
    return res.status(500).json({ message: 'Error al guardar detalle de presupuesto' });
  }
}

export async function obtenerDetallePresupuestoController(req: Request, res: Response) {
  const idPresupuesto = Number(req.params.id);
  
  if (isNaN(idPresupuesto)) {
    return res.status(400).json({ message: 'ID de presupuesto inválido' });
  }

  try {
    const detalle = await obtenerDetallePresupuesto(idPresupuesto);
    return res.json(detalle);
  } catch (error: any) {
    console.error('Error en obtenerDetallePresupuestoController', error);
    return res.status(500).json({ message: 'Error al obtener detalle de presupuesto' });
  }
}

