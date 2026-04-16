import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { usuarioTieneAccesoArea } from '../areas/areas.service';
import { listarCatalogosPermitidosPorUsuarioArea } from '../coberturasAcceso/coberturasAcceso.service';
import {
  obtenerCodigoCuenta,
  obtenerCodigoCuentaPreviewPorArea,
  obtenerCodigoCuentaPreviewPorAreaCatalogo,
  obtenerRecursosVisiblesPorUsuarioArea,
  resolverRecursosMaterialEnArea,
  usuarioPuedeUsarRecursoEnArea,
} from './areaRecursoCuenta.service';

async function validarAccesoArea(req: AuthRequest, res: Response, idArea: number): Promise<boolean> {
  if (!req.userId) {
    res.status(401).json({ message: 'Usuario no autenticado' });
    return false;
  }

  const autorizado = await usuarioTieneAccesoArea(req.userId, idArea);
  if (!autorizado) {
    res.status(403).json({ message: 'No tienes autorización para operar en esta área.' });
    return false;
  }

  return true;
}

export async function obtenerCodigoCuentaController(req: AuthRequest, res: Response) {
  // Aceptar tanto `idArea` como `areaId`
  const rawArea = (req.query.idArea ?? req.query.areaId) as unknown;
  const idArea = Number(rawArea);
  const idCatalogo = Number(req.query.catalogoId ?? req.query.idCatalogoSolicitud ?? req.query.idCatalogo);
  const idRecurso = Number(req.query.idRecurso ?? req.query.id);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'idArea es requerido' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    if (!Number.isInteger(idRecurso) || idRecurso <= 0) {
      if (Number.isInteger(idCatalogo) && idCatalogo > 0) {
        const catalogosPermitidos = await listarCatalogosPermitidosPorUsuarioArea(req.userId ?? 0, idArea);
        const catalogoAutorizado = (catalogosPermitidos ?? []).some((catalogo) => Number(catalogo.id ?? 0) === idCatalogo);
        if (!catalogoAutorizado) {
          return res.status(403).json({ message: 'No tienes autorización para usar este catálogo en el área seleccionada.' });
        }

        const data = await obtenerCodigoCuentaPreviewPorAreaCatalogo(idArea, idCatalogo, req.userId ?? undefined);
        return res.json(data);
      }

      const data = await obtenerCodigoCuentaPreviewPorArea(idArea);
      return res.json(data);
    }

    const puedeUsarRecurso = await usuarioPuedeUsarRecursoEnArea(req.userId!, idArea, idRecurso);
    if (!puedeUsarRecurso) {
      return res.status(403).json({ message: 'No tienes autorización para usar este recurso en el área seleccionada.' });
    }

    const data = await obtenerCodigoCuenta(idArea, idRecurso);
    return res.json(data);
  } catch (error: any) {
    console.error('Error en obtenerCodigoCuentaController', error);
    return res.status(500).json({ message: 'Error al obtener código de cuenta' });
  }
}

export async function listarRecursosPorAreaController(req: AuthRequest, res: Response) {
  // Aceptar tanto `idArea` como `areaId` en la query para compatibilidad
  const raw = (req.query.idArea ?? req.query.areaId) as unknown;
  const idArea = Number(raw);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'idArea es requerido' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    const { recursos } = await obtenerRecursosVisiblesPorUsuarioArea(req.userId!, idArea);
    return res.json(recursos);
  } catch (error: any) {
    console.error('Error en listarRecursosPorAreaController', error);
    return res.status(500).json({ message: 'Error al listar recursos por área' });
  }
}

export async function listarRecursosPermitidosController(req: AuthRequest, res: Response) {
  // Aceptar tanto `idArea` como `areaId` en la query
  const raw = (req.query.idArea ?? req.query.areaId) as unknown;
  const idArea = Number(raw);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'areaId es requerido' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    const payload = await obtenerRecursosVisiblesPorUsuarioArea(req.userId!, idArea);
    return res.json(payload);
  } catch (error: any) {
    console.error('Error en listarRecursosPermitidosController', error);
    return res.status(500).json({ message: 'Error al listar recursos permitidos' });
  }
}

export async function listarRecursosPorMaterialController(req: AuthRequest, res: Response) {
  const idArea = Number(req.query.idArea ?? req.query.areaId);
  const idMaterial = Number(req.query.idMaterial);

  if (!Number.isInteger(idArea) || idArea <= 0 || !Number.isInteger(idMaterial) || idMaterial <= 0) {
    return res.status(400).json({ message: 'idArea e idMaterial son requeridos' });
  }

  try {
    if (!(await validarAccesoArea(req, res, idArea))) {
      return;
    }

    const payload = await resolverRecursosMaterialEnArea(idArea, idMaterial);
    return res.json(payload);
  } catch (error: any) {
    console.error('Error en listarRecursosPorMaterialController', error);
    return res.status(500).json({ message: 'Error al resolver recurso por material' });
  }
}
