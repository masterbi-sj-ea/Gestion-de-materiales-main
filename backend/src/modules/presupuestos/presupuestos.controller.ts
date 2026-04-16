import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { 
  listarPresupuestos, 
  guardarPresupuesto, 
  guardarPresupuestoDetalle, 
  obtenerDetallePresupuesto,
  importarPresupuestoMasivo
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
    const result = await guardarPresupuesto({
      IdPresupuesto: idPresupuesto ? Number(idPresupuesto) : undefined,
      Anio: Number(anio),
      Mes: Number(mes),
      MontoTotal: Number(montoTotal),
      IdArea: Number(idArea),
      IdCentroCosto: idCentroCosto ? Number(idCentroCosto) : undefined,
      IdUsuarioAudit: req.userId || 0
    });

    try {
      await registrarAuditoria(req.userId ?? null, result.action === 'created' ? 'CREAR_PRESUPUESTO' : 'ACTUALIZAR_PRESUPUESTO', {
        modulo: 'Presupuesto',
        entidad: `Presupuesto #${result.idPresupuesto}`,
        idPresupuesto: result.idPresupuesto,
        anio: Number(anio),
        mes: Number(mes),
        idArea: Number(idArea),
        montoTotal: Number(montoTotal),
        accion: result.action,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría de presupuesto', auditError);
    }

    return res.status(200).json({
      message: 'Presupuesto guardado correctamente',
      idPresupuesto: result.idPresupuesto,
      action: result.action,
    });
  } catch (error: any) {
    console.error('Error en guardarPresupuestoController', error);
    return res.status(500).json({ message: error?.message || 'Error al guardar presupuesto' });
  }
}

export async function guardarPresupuestoDetalleController(req: AuthRequest, res: Response) {
  const { idPresupuesto, idMaterial, grupoArticulos, montoPermitido, cantidadPresupuestada, costoUnitarioPresupuestado, montoAsignado } = req.body || {};

  if (!idPresupuesto || !idMaterial || !montoPermitido) {
    return res.status(400).json({ message: 'Datos incompletos para el detalle del presupuesto' });
  }

  try {
    const result = await guardarPresupuestoDetalle({
      IdPresupuesto: Number(idPresupuesto),
      IdMaterial: Number(idMaterial),
      GrupoArticulos: grupoArticulos || '',
      MontoPermitido: Number(montoPermitido),
      CantidadPresupuestada: Number(cantidadPresupuestada) || 0,
      CostoUnitarioPresupuestado: Number(costoUnitarioPresupuestado) || 0,
      MontoAsignado: Number(montoAsignado) || 0
    });

    try {
      await registrarAuditoria(req.userId ?? null, result.action === 'created' ? 'CREAR_DETALLE_PRESUPUESTO' : 'ACTUALIZAR_DETALLE_PRESUPUESTO', {
        modulo: 'Presupuesto',
        entidad: `Presupuesto #${idPresupuesto}`,
        idPresupuesto: Number(idPresupuesto),
        idMaterial: Number(idMaterial),
        montoPermitido: Number(montoPermitido),
        accion: result.action,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría de detalle de presupuesto', auditError);
    }

    return res.status(200).json({
      message: 'Detalle de presupuesto guardado correctamente',
      idPresupuestoDetalle: result.idPresupuestoDetalle,
      action: result.action,
    });
  } catch (error: any) {
    console.error('Error en guardarPresupuestoDetalleController', error);
    return res.status(500).json({ message: error?.message || 'Error al guardar detalle de presupuesto' });
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


export async function importarPresupuestosController(req: AuthRequest, res: Response) {
  const { filas } = req.body || {};

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ message: "No se enviaron filas para importar." });
  }

  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ message: "Usuario no autenticado" });
  }

  try {
    const result = await importarPresupuestoMasivo(filas, userId);

    if (result.errores.length > 0) {
      return res.status(400).json({
        message: 'No se pudo importar el archivo porque hay filas sin mapeo o con datos invalidos.',
        ...result,
      });
    }

    await registrarAuditoria(userId, 'IMPORTAR_PRESUPUESTO_EXCEL', {
      filasLeidas: result.filasLeidas,
      filasAplicadas: result.filasAplicadas,
      procesados: result.procesados,
      creados: result.creados,
      actualizados: result.actualizados,
      omitidos: result.omitidos,
    });

    return res.status(200).json({
      message: 'Importacion exitosa',
      ...result,
    });
  } catch (error: any) {
    console.error("Error importando presupuestos masivos:", error);
    return res.status(500).json({ message: "Error al importar presupuestos", error: error.message });
  }
}
