import { Request, Response } from 'express';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { AuthRequest } from '../../middleware/auth';
import {
  listarRoles,
  obtenerRol,
  crearRol,
  actualizarRol,
  eliminarRol
} from './roles.service';

export async function listarRolesController(_req: Request, res: Response) {
  try {
    const roles = await listarRoles();
    return res.json(roles);
  } catch (error: any) {
    console.error('Error en listarRolesController', error);
    return res.status(500).json({ message: 'Error al listar roles' });
  }
}

export async function obtenerRolController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de rol inválido' });
  }

  try {
    const rol = await obtenerRol(id);
    if (!rol) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }
    return res.json(rol);
  } catch (error: any) {
    console.error('Error en obtenerRolController', error);
    return res.status(500).json({ message: 'Error al obtener rol' });
  }
}

export async function crearRolController(req: AuthRequest, res: Response) {
  const { nombre, descripcion } = req.body || {};

  if (!nombre) {
    return res.status(400).json({ message: 'nombre es requerido' });
  }

  try {
    const idRol = await crearRol({ Nombre: nombre, Descripcion: descripcion });

    try {
      await registrarAuditoria(req.userId ?? null, 'CREAR_ROL', {
        modulo: 'Roles',
        entidad: nombre,
        idRol,
        nombre,
        descripcion,
        detalles: `Creación del rol "${nombre}"`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_ROL', auditError);
    }

    return res.status(201).json({ idRol });
  } catch (error: any) {
    console.error('Error en crearRolController', error);
    return res.status(500).json({ message: 'Error al crear rol' });
  }
}

export async function actualizarRolController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  const { nombre, descripcion } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de rol inválido' });
  }

  if (!nombre) {
    return res.status(400).json({ message: 'nombre es requerido' });
  }

  try {
    await actualizarRol(id, { Nombre: nombre, Descripcion: descripcion });

    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_ROL', {
        modulo: 'Roles',
        entidad: nombre,
        idRol: id,
        nombre,
        descripcion,
        detalles: `Actualización del rol "${nombre}" (ID ${id})`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_ROL', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en actualizarRolController', error);
    return res.status(500).json({ message: 'Error al actualizar rol' });
  }
}

export async function eliminarRolController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de rol inválido' });
  }

  try {
    await eliminarRol(id);

    try {
      await registrarAuditoria(req.userId ?? null, 'ELIMINAR_ROL', {
        modulo: 'Roles',
        entidad: `Rol #${id}`,
        idRol: id,
        detalles: `Eliminación del rol con ID ${id}`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ELIMINAR_ROL', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en eliminarRolController', error);
    return res.status(500).json({ message: 'Error al eliminar rol' });
  }
}
