import { Request, Response } from 'express';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { AuthRequest } from '../../middleware/auth';
import {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  desactivarUsuario
} from './usuarios.service';

export async function listarUsuariosController(_req: Request, res: Response) {
  try {
    const usuarios = await listarUsuarios();
    return res.json(usuarios);
  } catch (error: any) {
    console.error('Error en listarUsuariosController', error);
    return res.status(500).json({ message: 'Error al listar usuarios' });
  }
}

export async function obtenerUsuarioController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de usuario inválido' });
  }

  try {
    const usuario = await obtenerUsuario(id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    return res.json(usuario);
  } catch (error: any) {
    console.error('Error en obtenerUsuarioController', error);
    return res.status(500).json({ message: 'Error al obtener usuario' });
  }
}

export async function crearUsuarioController(req: AuthRequest, res: Response) {
  const { nombreCompleto, email, hashPassword, activo, idArea, idRolPrincipal } = req.body || {};

  if (!nombreCompleto || !email) {
    return res.status(400).json({ message: 'nombreCompleto y email son requeridos' });
  }

  try {
    const idUsuario = await crearUsuario({
      NombreCompleto: nombreCompleto,
      Email: email,
      HashPassword: hashPassword,
      Activo: activo,
      IdArea: typeof idArea === 'number' ? idArea : idArea ? Number(idArea) : null,
      IdRolPrincipal: typeof idRolPrincipal === 'number' ? idRolPrincipal : idRolPrincipal ? Number(idRolPrincipal) : null,
    });
    try {
      await registrarAuditoria(req.userId ?? null, 'CREAR_USUARIO', {
        modulo: 'Usuarios',
        entidad: nombreCompleto,
        idUsuario,
        email,
        nombreCompleto,
        detalles: `Creación del usuario "${nombreCompleto}" (${email})`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_USUARIO', auditError);
    }

    return res.status(201).json({ idUsuario });
  } catch (error: any) {
    console.error('Error en crearUsuarioController', error);
    return res.status(500).json({ message: 'Error al crear usuario' });
  }
}

export async function actualizarUsuarioController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  const { nombreCompleto, email, activo, idArea, idRolPrincipal } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de usuario inválido' });
  }

  if (!nombreCompleto || !email || typeof activo !== 'boolean') {
    return res.status(400).json({ message: 'nombreCompleto, email y activo son requeridos' });
  }

  try {
    await actualizarUsuario(id, {
      NombreCompleto: nombreCompleto,
      Email: email,
      Activo: activo,
      IdArea: typeof idArea === 'number' ? idArea : idArea ? Number(idArea) : null,
      IdRolPrincipal: typeof idRolPrincipal === 'number' ? idRolPrincipal : idRolPrincipal ? Number(idRolPrincipal) : null,
    });
    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_USUARIO', {
        modulo: 'Usuarios',
        entidad: nombreCompleto,
        idUsuario: id,
        email,
        nombreCompleto,
        activo,
        detalles: `Actualización del usuario "${nombreCompleto}" (${email})`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_USUARIO', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en actualizarUsuarioController', error);
    return res.status(500).json({ message: 'Error al actualizar usuario' });
  }
}

export async function desactivarUsuarioController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de usuario inválido' });
  }

  try {
    await desactivarUsuario(id);

    try {
      await registrarAuditoria(req.userId ?? null, 'DESACTIVAR_USUARIO', {
        modulo: 'Usuarios',
        entidad: `Usuario #${id}`,
        idUsuario: id,
        detalles: `Desactivación del usuario con ID ${id}`,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría DESACTIVAR_USUARIO', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en desactivarUsuarioController', error);
    return res.status(500).json({ message: 'Error al desactivar usuario' });
  }
}
