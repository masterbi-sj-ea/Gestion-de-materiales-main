import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { listarCortes, crearCorte, actualizarCorte, eliminarCorte } from './cortes.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';

export async function listarCortesController(_req: Request, res: Response) {
  try {
    const cortes = await listarCortes();
    return res.json(cortes);
  } catch (error: any) {
    console.error('Error en listarCortesController', error);
    return res.status(500).json({ message: 'Error al listar cortes de stock' });
  }
}

export async function actualizarCorteController(req: AuthRequest, res: Response) {
	const id = Number(req.params.id);
	if (!id || Number.isNaN(id)) {
		return res.status(400).json({ message: 'Id de corte inválido' });
	}

	const { descripcion, fechaInicio, fechaFin, ambito, esMaximo } = req.body || {};

	try {
		await actualizarCorte(id, {
			descripcion: descripcion ?? null,
			fechaInicio: fechaInicio ?? null,
			fechaFin: fechaFin ?? null,
			ambito: ambito ?? null,
			esMaximo: !!esMaximo,
		});

		try {
			await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_CORTE_STOCK', {
				modulo: 'Cortes de Stock',
				entidad: `Corte #${id}`,
				idCorte: id,
				descripcion,
				fechaInicio,
				fechaFin,
				ambito,
				esMaximo: !!esMaximo,
				detalles: `Actualización de corte de stock (ID ${id})`,
			});
		} catch (auditError) {
			console.error('Error al registrar auditoría ACTUALIZAR_CORTE_STOCK', auditError);
		}

		return res.status(204).send();
	} catch (error: any) {
		console.error('Error en actualizarCorteController', error);
		return res.status(500).json({ message: 'Error al actualizar corte de stock' });
	}
}

export async function eliminarCorteController(req: AuthRequest, res: Response) {
	const id = Number(req.params.id);
	if (!id || Number.isNaN(id)) {
		return res.status(400).json({ message: 'Id de corte inválido' });
	}

	try {
		await eliminarCorte(id);

		try {
			await registrarAuditoria(req.userId ?? null, 'ELIMINAR_CORTE_STOCK', {
				modulo: 'Cortes de Stock',
				entidad: `Corte #${id}`,
				idCorte: id,
				detalles: `Eliminación/anulación de corte de stock (ID ${id})`,
			});
		} catch (auditError) {
			console.error('Error al registrar auditoría ELIMINAR_CORTE_STOCK', auditError);
		}

		return res.status(204).send();
	} catch (error: any) {
		console.error('Error en eliminarCorteController', error);
		return res.status(500).json({ message: 'Error al eliminar corte de stock' });
	}
}

export async function crearCorteController(req: AuthRequest, res: Response) {
  const { descripcion, fechaInicio, fechaFin, ambito, esMaximo } = req.body || {};

  try {
    const idCorte = await crearCorte({
      descripcion: descripcion ?? null,
      fechaInicio: fechaInicio ?? null,
      fechaFin: fechaFin ?? null,
      ambito: ambito ?? null,
      esMaximo: !!esMaximo,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'CREAR_CORTE_STOCK', {
        modulo: 'Cortes de Stock',
        entidad: `Corte #${idCorte}`,
        idCorte,
        descripcion,
        fechaInicio,
        fechaFin,
        ambito,
        esMaximo: !!esMaximo,
        detalles: `Creación de un nuevo corte de stock (ID ${idCorte}, ámbito ${ambito || 'STOCK'})`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_CORTE_STOCK', auditError);
    }

    return res.status(201).json({ idCorte });
  } catch (error: any) {
    console.error('Error en crearCorteController', error);
    return res.status(500).json({ message: 'Error al crear corte de stock' });
  }
}
