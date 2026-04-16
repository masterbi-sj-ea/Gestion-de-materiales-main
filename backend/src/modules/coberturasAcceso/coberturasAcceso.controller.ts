import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { env } from '../../config/env';
import { listarAreas } from '../areas/areas.service';
import { usuarioTieneCoberturaActivaEnArea } from '../areaRecursoCuenta/areaRecursoCuenta.service';
import { listarUsuarios } from '../usuarios/usuarios.service';
import {
  agregarAreaCobertura,
  agregarCatalogoCobertura,
  agregarUsuarioCobertura,
  crearCoberturaAcceso,
  listarCatalogosSolicitud,
  listarCatalogosPermitidosPorUsuarioArea,
  listarCoberturasAcceso,
  obtenerDetalleCobertura,
  obtenerConteosCoberturas,
  removerUsuarioCobertura,
  removerAreaCobertura,
  removerCatalogoCobertura,
  actualizarCoberturaAcceso,
  eliminarCoberturaAcceso,
} from './coberturasAcceso.service';

function parsePositiveInt(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
}

function isDuplicateError(error: any): boolean {
  const sqlNumber = error?.number ?? error?.originalError?.info?.number;
  const message = String(error?.originalError?.info?.message || error?.message || '').toLowerCase();
  return sqlNumber === 2627 || sqlNumber === 2601 || message.includes('ya está asignado');
}

export async function listarCoberturasAccesoController(_req: Request, res: Response) {
  try {
    const coberturas = await listarCoberturasAcceso();

    // Obtener conteos en lote para evitar N+1
    try {
      const conteos = await obtenerConteosCoberturas();
      const map = new Map<number, { id: number; totalUsuarios: number; totalAreas: number; totalCatalogos: number }>(
        (conteos || []).map((x) => [x.id, x]),
      );

      coberturas.forEach((c) => {
        const counts = map.get(c.id);
        if (counts) {
          c.totalUsuarios = counts.totalUsuarios;
          c.totalAreas = counts.totalAreas;
          c.totalCatalogos = counts.totalCatalogos;
        }
      });
    } catch (err) {
      console.error('No se pudo obtener conteos por cobertura, usando fallback por detalle', err);
      // Fallback no bloqueante: intentar detalle por cobertura
      await Promise.all(
        coberturas.map(async (c) => {
          try {
            const detalle = await obtenerDetalleCobertura(c.id);
            c.totalUsuarios = detalle.usuarios?.length ?? c.totalUsuarios ?? 0;
            c.totalAreas = detalle.areas?.length ?? c.totalAreas ?? 0;
            c.totalCatalogos = detalle.catalogos?.length ?? c.totalCatalogos ?? 0;
          } catch (err2) {
            console.error('No se pudo obtener detalle para conteos de cobertura', c.id, err2);
          }
        }),
      );
    }

    return res.json(coberturas);
  } catch (error: any) {
    console.error('Error en listarCoberturasAccesoController', error);
    return res.status(500).json({ message: 'Error al listar coberturas de acceso' });
  }
}

export async function removerUsuarioCoberturaController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  const idUsuario = parsePositiveInt(req.params.idUsuario);
  if (!idCobertura || !idUsuario) {
    return res.status(400).json({ message: 'idCobertura e idUsuario son requeridos' });
  }

  try {
    await removerUsuarioCobertura(idCobertura, idUsuario);
    try {
      await registrarAuditoria(req.userId ?? null, 'REMOVER_USUARIO_COBERTURA', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        idUsuarioRemovido: idUsuario,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REMOVER_USUARIO_COBERTURA', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en removerUsuarioCoberturaController', error);
    return res.status(500).json({ message: 'Error al remover usuario de la cobertura' });
  }
}

export async function removerAreaCoberturaController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  const idArea = parsePositiveInt(req.params.idArea);
  if (!idCobertura || !idArea) {
    return res.status(400).json({ message: 'idCobertura e idArea son requeridos' });
  }

  try {
    await removerAreaCobertura(idCobertura, idArea);
    try {
      await registrarAuditoria(req.userId ?? null, 'REMOVER_AREA_COBERTURA', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        idAreaRemovida: idArea,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REMOVER_AREA_COBERTURA', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en removerAreaCoberturaController', error);
    return res.status(500).json({ message: 'Error al remover área de la cobertura' });
  }
}

export async function removerCatalogoCoberturaController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  const idCatalogo = parsePositiveInt(req.params.idCatalogo);
  if (!idCobertura || !idCatalogo) {
    return res.status(400).json({ message: 'idCobertura e idCatalogo son requeridos' });
  }

  try {
    await removerCatalogoCobertura(idCobertura, idCatalogo);
    try {
      await registrarAuditoria(req.userId ?? null, 'REMOVER_CATALOGO_COBERTURA', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        idCatalogoRemovido: idCatalogo,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REMOVER_CATALOGO_COBERTURA', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en removerCatalogoCoberturaController', error);
    const message = error?.message || 'Error al remover catálogo de la cobertura';
    if (env.NODE_ENV !== 'production') {
      // En desarrollo devolvemos más contexto para depuración
      return res.status(500).json({ message, details: { message: error?.message, stack: error?.stack, info: error?.originalError?.info } });
    }

    return res.status(500).json({ message: 'Error al remover catálogo de la cobertura' });
  }
}

export async function actualizarCoberturaAccesoController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  if (!idCobertura) {
    return res.status(400).json({ message: 'Id de cobertura inválido' });
  }

  const payload = {
    nombre: typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : undefined,
    descripcion: typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : undefined,
    tipoAlcance: typeof req.body?.tipoAlcance === 'string' ? req.body.tipoAlcance.trim().toUpperCase() as any : undefined,
    vigenteDesde: req.body?.vigenteDesde ?? undefined,
    vigenteHasta: req.body?.vigenteHasta ?? undefined,
    activo: typeof req.body?.activo === 'boolean' ? req.body.activo : undefined,
  };

  if (payload.nombre !== undefined && !payload.nombre) {
    return res.status(400).json({ message: 'El nombre de la cobertura es requerido' });
  }

  // Validación de rango de fechas en servidor: vigenteDesde debe ser <= vigenteHasta
  if (payload.vigenteDesde && payload.vigenteHasta) {
    const desde = Date.parse(String(payload.vigenteDesde));
    const hasta = Date.parse(String(payload.vigenteHasta));
    if (Number.isNaN(desde) || Number.isNaN(hasta) || desde > hasta) {
      return res.status(400).json({ message: 'vigenteDesde debe ser anterior o igual a vigenteHasta' });
    }
  }

  try {
    await actualizarCoberturaAcceso(idCobertura, payload);
    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_COBERTURA_ACCESO', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        cambios: payload,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_COBERTURA_ACCESO', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en actualizarCoberturaAccesoController', error);
    const message = error?.message || 'Error al actualizar la cobertura';
    if (env.NODE_ENV !== 'production') {
      return res.status(500).json({ message, details: { message: error?.message, stack: error?.stack, info: error?.originalError?.info } });
    }

    return res.status(500).json({ message: 'Error al actualizar la cobertura' });
  }
}

export async function eliminarCoberturaAccesoController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  if (!idCobertura) {
    return res.status(400).json({ message: 'Id de cobertura inválido' });
  }

  const soft = req.body?.soft !== false;

  try {
    await eliminarCoberturaAcceso(idCobertura, soft);
    try {
      await registrarAuditoria(req.userId ?? null, 'ELIMINAR_COBERTURA_ACCESO', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        softDelete: soft,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ELIMINAR_COBERTURA_ACCESO', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en eliminarCoberturaAccesoController', error);
    return res.status(500).json({ message: 'Error al eliminar la cobertura' });
  }
}

export async function obtenerDetalleCoberturaController(req: Request, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  if (!idCobertura) {
    return res.status(400).json({ message: 'Id de cobertura inválido' });
  }

  try {
    const detalle = await obtenerDetalleCobertura(idCobertura);
    if (!detalle.cobertura) {
      return res.status(404).json({ message: 'Cobertura no encontrada' });
    }

    return res.json(detalle);
  } catch (error: any) {
    console.error('Error en obtenerDetalleCoberturaController', error);
    return res.status(500).json({ message: 'Error al obtener el detalle de la cobertura' });
  }
}

export async function crearCoberturaAccesoController(req: AuthRequest, res: Response) {
  const nombre = String(req.body?.nombre || '').trim();
  const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : null;
  const tipoAlcance = String(req.body?.tipoAlcance || '').trim().toUpperCase();

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre de la cobertura es requerido' });
  }

  if (tipoAlcance !== 'GLOBAL' && tipoAlcance !== 'RESTRINGIDO') {
    return res.status(400).json({ message: 'tipoAlcance debe ser GLOBAL o RESTRINGIDO' });
  }

  try {
    const idCobertura = await crearCoberturaAcceso({
      nombre,
      descripcion,
      tipoAlcance: tipoAlcance as 'GLOBAL' | 'RESTRINGIDO',
      activo: req.body?.activo !== false,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'CREAR_COBERTURA_ACCESO', {
        modulo: 'Coberturas de Acceso',
        entidad: nombre,
        idCobertura,
        nombre,
        tipoAlcance,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_COBERTURA_ACCESO', auditError);
    }

    return res.status(201).json({ idCobertura });
  } catch (error: any) {
    console.error('Error en crearCoberturaAccesoController', error);
    const message = error?.message || 'Error al crear la cobertura de acceso';
    if (env.NODE_ENV !== 'production') {
      return res.status(500).json({ message, details: { message: error?.message, stack: error?.stack, info: error?.originalError?.info } });
    }

    return res.status(500).json({ message: 'Error al crear la cobertura de acceso' });
  }
}

export async function agregarUsuarioCoberturaController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  const idUsuario = parsePositiveInt(req.body?.idUsuario);

  if (!idCobertura || !idUsuario) {
    return res.status(400).json({ message: 'idCobertura e idUsuario son requeridos' });
  }

  try {
    await agregarUsuarioCobertura(idCobertura, idUsuario);

    try {
      await registrarAuditoria(req.userId ?? null, 'ASIGNAR_USUARIO_COBERTURA', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        idUsuarioAsignado: idUsuario,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ASIGNAR_USUARIO_COBERTURA', auditError);
    }

    return res.status(201).json({ ok: true });
  } catch (error: any) {
    console.error('Error en agregarUsuarioCoberturaController', error);
    if (isDuplicateError(error)) {
      return res.status(409).json({ message: 'El usuario ya está asignado a esta cobertura' });
    }
    return res.status(500).json({ message: 'Error al asignar usuario a la cobertura' });
  }
}

export async function agregarAreaCoberturaController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  const idArea = parsePositiveInt(req.body?.idArea);

  if (!idCobertura || !idArea) {
    return res.status(400).json({ message: 'idCobertura e idArea son requeridos' });
  }

  try {
    await agregarAreaCobertura(idCobertura, idArea);

    try {
      await registrarAuditoria(req.userId ?? null, 'ASIGNAR_AREA_COBERTURA', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        idAreaAsignada: idArea,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ASIGNAR_AREA_COBERTURA', auditError);
    }

    return res.status(201).json({ ok: true });
  } catch (error: any) {
    console.error('Error en agregarAreaCoberturaController', error);
    if (isDuplicateError(error)) {
      return res.status(409).json({ message: 'El área ya está asignada a esta cobertura' });
    }
    return res.status(500).json({ message: 'Error al asignar área a la cobertura' });
  }
}

export async function agregarCatalogoCoberturaController(req: AuthRequest, res: Response) {
  const idCobertura = parsePositiveInt(req.params.id);
  const idCatalogoSolicitud = parsePositiveInt(req.body?.idCatalogoSolicitud);

  if (!idCobertura || !idCatalogoSolicitud) {
    return res.status(400).json({ message: 'idCobertura e idCatalogoSolicitud son requeridos' });
  }

  try {
    await agregarCatalogoCobertura(idCobertura, idCatalogoSolicitud);

    try {
      await registrarAuditoria(req.userId ?? null, 'ASIGNAR_CATALOGO_COBERTURA', {
        modulo: 'Coberturas de Acceso',
        entidad: `Cobertura #${idCobertura}`,
        idCobertura,
        idCatalogoSolicitud,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ASIGNAR_CATALOGO_COBERTURA', auditError);
    }

    return res.status(201).json({ ok: true });
  } catch (error: any) {
    console.error('Error en agregarCatalogoCoberturaController', error);
    if (isDuplicateError(error)) {
      return res.status(409).json({ message: 'El catálogo ya está asignado a esta cobertura' });
    }
    return res.status(500).json({ message: 'Error al asignar catálogo a la cobertura' });
  }
}

export async function listarCatalogosSolicitudController(_req: Request, res: Response) {
  try {
    const catalogos = await listarCatalogosSolicitud();
    return res.json(catalogos);
  } catch (error: any) {
    console.error('Error en listarCatalogosSolicitudController', error);
    return res.status(500).json({ message: 'Error al listar catálogos de solicitud' });
  }
}

export async function listarCatalogosPermitidosController(req: AuthRequest, res: Response) {
  const idArea = Number(req.query?.areaId ?? req.query?.idArea);
  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'areaId es requerido' });
  }

  try {
    const applied = await usuarioTieneCoberturaActivaEnArea(req.userId ?? 0, idArea);
    const raw = await listarCatalogosPermitidosPorUsuarioArea(req.userId ?? 0, idArea);

    const catalogos = (raw || []).map((row: any) => ({
      id: Number(row.IdCatalogoSolicitud ?? row.idCatalogoSolicitud ?? row.IdCatalogo ?? row.id ?? 0),
      nombre: String(row.NombreCatalogo ?? row.nombre ?? row.Nombre ?? ''),
      descripcion: row.Descripcion ?? row.descripcion ?? null,
    }));

    return res.json({ catalogos, applied });
  } catch (error: any) {
    console.error('Error en listarCatalogosPermitidosController', error);
    return res.status(500).json({ message: 'Error al listar catálogos permitidos' });
  }
}

export async function listarUsuariosCoberturaController(_req: Request, res: Response) {
  try {
    const usuarios = await listarUsuarios();
    return res.json(usuarios);
  } catch (error: any) {
    console.error('Error en listarUsuariosCoberturaController', error);
    return res.status(500).json({ message: 'Error al listar usuarios para coberturas' });
  }
}

export async function listarAreasCoberturaController(_req: Request, res: Response) {
  try {
    const areas = await listarAreas();
    return res.json(areas);
  } catch (error: any) {
    console.error('Error en listarAreasCoberturaController', error);
    return res.status(500).json({ message: 'Error al listar áreas para coberturas' });
  }
}