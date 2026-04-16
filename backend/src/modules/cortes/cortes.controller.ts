import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import {
	listarCortes,
	crearCorte,
	actualizarCorte,
	eliminarCorte,
	obtenerDetalleCorte,
	cargarSnapshotCorte,
	registrarConteoCorte,
	type RegistrarConteoDetalleInput,
} from './cortes.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';

function parsePositiveInteger(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return null;
	}

	return parsed;
}

function normalizarDetalleConteo(value: unknown): RegistrarConteoDetalleInput[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const detalleNormalizado = value
		.map((item): RegistrarConteoDetalleInput | null => {
			const idDetalleCorte = parsePositiveInteger((item as any)?.idDetalleCorte);
			const conteoFisico = Number((item as any)?.conteoFisico);

			if (!idDetalleCorte || !Number.isFinite(conteoFisico) || conteoFisico < 0) {
				return null;
			}

			return {
				idDetalleCorte,
				conteoFisico,
				comentarioLinea: ((item as any)?.comentarioLinea ?? null) as string | null,
			};
		});

	return detalleNormalizado.filter((item): item is RegistrarConteoDetalleInput => item !== null);
}

export async function listarCortesController(_req: Request, res: Response) {
  try {
    const cortes = await listarCortes();
    return res.json(cortes);
  } catch (error: any) {
    console.error('Error en listarCortesController', error);
    return res.status(500).json({ message: 'Error al listar cortes de stock' });
  }
}

export async function obtenerDetalleCorteController(req: AuthRequest, res: Response) {
	const id = parsePositiveInteger(req.params.id);
	if (!id) {
		return res.status(400).json({ message: 'Id de corte inválido' });
	}

	try {
		const detalle = await obtenerDetalleCorte(id);

		if (!detalle.cabecera) {
			return res.status(404).json({ message: 'No se encontró el corte solicitado' });
		}

		return res.json(detalle);
	} catch (error: any) {
		console.error('Error en obtenerDetalleCorteController', error);
		return res.status(500).json({ message: 'Error al obtener el detalle del corte de stock' });
	}
}

export async function cargarSnapshotCorteController(req: AuthRequest, res: Response) {
	const id = parsePositiveInteger(req.params.id);
	if (!id) {
		return res.status(400).json({ message: 'Id de corte inválido' });
	}

	if (!req.userId) {
		return res.status(401).json({ message: 'Usuario no autenticado' });
	}

	try {
		const resultado = await cargarSnapshotCorte(id, req.userId);

		try {
			await registrarAuditoria(req.userId, 'CARGAR_SNAPSHOT_CORTE_STOCK', {
				modulo: 'Cortes de Stock',
				entidad: `Corte #${id}`,
				idCorte: id,
				resultado: resultado.resultado,
				nuevoEstado: resultado.nuevoEstado,
				lineasSnapshot: resultado.lineasSnapshot,
				detalles: `Carga de snapshot para corte de stock (ID ${id})`,
			});
		} catch (auditError) {
			console.error('Error al registrar auditoría CARGAR_SNAPSHOT_CORTE_STOCK', auditError);
		}

		return res.status(200).json(resultado);
	} catch (error: any) {
		console.error('Error en cargarSnapshotCorteController', error);
		return res.status(500).json({ message: 'Error al cargar el snapshot del corte de stock' });
	}
}

export async function registrarConteoCorteController(req: AuthRequest, res: Response) {
	const id = parsePositiveInteger(req.params.id);
	if (!id) {
		return res.status(400).json({ message: 'Id de corte inválido' });
	}

	if (!req.userId) {
		return res.status(401).json({ message: 'Usuario no autenticado' });
	}

	const detalle = normalizarDetalleConteo(req.body?.detalle);
	if (!detalle.length) {
		return res.status(400).json({ message: 'Debes enviar al menos una línea de conteo válida.' });
	}

	try {
		const resultado = await registrarConteoCorte(id, req.userId, detalle);

		try {
			await registrarAuditoria(req.userId, 'REGISTRAR_CONTEO_CORTE_STOCK', {
				modulo: 'Cortes de Stock',
				entidad: `Corte #${id}`,
				idCorte: id,
				lineas: detalle.length,
				resultado: resultado.resultado,
				nuevoEstado: resultado.nuevoEstado,
				lineasContadas: resultado.lineasContadas,
				lineasPendientes: resultado.lineasPendientes,
				lineasConDiferencia: resultado.lineasConDiferencia,
				detalles: `Registro de conteo para corte de stock (ID ${id})`,
			});
		} catch (auditError) {
			console.error('Error al registrar auditoría REGISTRAR_CONTEO_CORTE_STOCK', auditError);
		}

		return res.status(200).json(resultado);
	} catch (error: any) {
		console.error('Error en registrarConteoCorteController', error);
		return res.status(500).json({ message: 'Error al registrar el conteo del corte de stock' });
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
