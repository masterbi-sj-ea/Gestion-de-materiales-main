import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { UserRole } from '../types';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../services/apiConfig';

export interface Modulo {
  id: string;
  nombre: string;
  path: string;
  descripcion: string;
  icon: string;
}

export interface PermisoRol {
  rol: UserRole;
  modulosPermitidos: string[];
  accionesPorModulo?: Record<string, PermisoAcciones>;
}

export interface PermisoAcciones {
  puedeVer: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAprobar: boolean;
  puedeEliminar: boolean;
}

// La lista de módulos ahora se carga desde la base de datos vía /api/modulos

interface PermisosContextType {
  modulos: Modulo[];
  permisos: PermisoRol[];
  cargandoPermisos: boolean;
  actualizarPermisos: (rol: UserRole, modulosSeleccionados: string[]) => void;
  getModulosPermitidos: (rol: UserRole) => string[];
  puedeAcceder: (rol: UserRole, moduloId: string) => boolean;
  getPermisosModulo: (rol: UserRole, moduloId: string) => PermisoAcciones;
}

const PermisosContext = createContext<PermisosContextType | null>(null);

function normalizeRoleKey(rol: string | null | undefined): string {
  return String(rol || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeModuleKey(moduloId: string | null | undefined): string {
  return String(moduloId || '').trim().toLowerCase();
}

function isProductionChiefRole(rol: string | null | undefined): boolean {
  return normalizeRoleKey(rol) === 'jefe de produccion';
}

function buildRolePermissionOverride(rol: UserRole, moduloId: string): Partial<PermisoAcciones> {
  const normalizedModulo = normalizeModuleKey(moduloId);

  if (isProductionChiefRole(rol) && normalizedModulo === 'aprobaciones') {
    return {
      puedeVer: true,
      puedeAprobar: true,
    };
  }

  return {};
}

function mergePermisoAcciones(base: PermisoAcciones, override: Partial<PermisoAcciones>): PermisoAcciones {
  return {
    puedeVer: base.puedeVer || !!override.puedeVer,
    puedeCrear: base.puedeCrear || !!override.puedeCrear,
    puedeEditar: base.puedeEditar || !!override.puedeEditar,
    puedeAprobar: base.puedeAprobar || !!override.puedeAprobar,
    puedeEliminar: base.puedeEliminar || !!override.puedeEliminar,
  };
}

function ensureRequiredModulesForRole(rol: UserRole, modulosSeleccionados: string[]): string[] {
  const normalizedModules = new Set(modulosSeleccionados.map((codigo) => normalizeModuleKey(codigo)).filter(Boolean));

  if (isProductionChiefRole(rol)) {
    normalizedModules.add('aprobaciones');
  }

  return Array.from(normalizedModules);
}

function isSuperUserRole(rol: string | null | undefined): boolean {
  const normalized = normalizeRoleKey(rol);
  return normalized === 'administrador' || normalized === 'admin' || normalized === 'administrator';
}

function findPermisoRol(permisos: PermisoRol[], rol: UserRole): PermisoRol | undefined {
  const normalizedRol = normalizeRoleKey(rol);
  return permisos.find((permiso) => normalizeRoleKey(permiso.rol) === normalizedRol);
}

export const usePermisos = () => {
  const context = useContext(PermisosContext);
  if (!context) throw new Error('usePermisos must be used within PermisosProvider');
  return context;
};

export function PermisosProvider({ children }: { children: ReactNode }) {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [permisos, setPermisos] = useState<PermisoRol[]>([]);
  const [cargandoPermisos, setCargandoPermisos] = useState(false);
  const [roleNameToId, setRoleNameToId] = useState<Record<string, number>>({});
  const [codigoToIdModulo, setCodigoToIdModulo] = useState<Record<string, number>>({});
  const { token } = useAuth();

  const emptyPermisosModulo: PermisoAcciones = {
    puedeVer: false,
    puedeCrear: false,
    puedeEditar: false,
    puedeAprobar: false,
    puedeEliminar: false,
  };

  // Cargar mapeos dinámicos: UserRole -> IdRol y CodigoModulo -> IdModulo desde el backend
  useEffect(() => {
    const cargarConfigPermisos = async () => {
      if (!token) {
        // Si aún no tenemos token (usuario no logueado), no llamamos a las APIs protegidas
        setModulos([]);
        setPermisos([]);
        setRoleNameToId({});
        setCodigoToIdModulo({});
        setCargandoPermisos(false);
        return;
      }

      try {
        setCargandoPermisos(true);
        const authHeaders = { Authorization: `Bearer ${token}` };

        // 0) Cargar módulos desde backend
        const respModulos = await fetch(`${API_BASE_URL}/modulos`, {
          headers: authHeaders,
        });
        if (!respModulos.ok) return;
        const modulosData = await respModulos.json();

        const modulosFrontend: Modulo[] = (modulosData as any[]).map((m) => ({
          id: m.Codigo as string,
          nombre: m.Nombre as string,
          path: m.Path as string,
          descripcion: (m.Descripcion as string) ?? '',
          icon: (m.Icono as string) ?? 'FileText',
        }));
        setModulos(modulosFrontend);

        // 1) Cargar roles reales desde el backend
        const respRoles = await fetch(`${API_BASE_URL}/roles`, {
          headers: authHeaders,
        });
        if (!respRoles.ok) return;
        const rolesData = await respRoles.json();

        const roleMap: Record<string, number> = {};
        (rolesData as any[]).forEach((r) => {
          const nombre: string = r.Nombre;
          if (nombre) {
            roleMap[nombre] = r.IdRol;
          }
        });
        setRoleNameToId(roleMap);

        const anyRoleEntry = Object.entries(roleMap)[0];
        if (!anyRoleEntry) return;
        const anyRoleId = anyRoleEntry[1];

        // 2) Cargar mapeo Codigo -> IdModulo usando cualquier rol existente
        const respPermisos = await fetch(`${API_BASE_URL}/permisos/rol/${anyRoleId}`, {
          headers: authHeaders,
        });
        if (!respPermisos.ok) return;
        const data = await respPermisos.json();
        const mapa: Record<string, number> = {};
        (data as any[]).forEach((row) => {
          if (row.Codigo && typeof row.IdModulo === 'number') {
            mapa[row.Codigo] = row.IdModulo;
          }
        });
        setCodigoToIdModulo(mapa);

        // 3) Cargar permisos reales por rol desde BD y mapear a PermisoRol
        const permisosDb: PermisoRol[] = [];

        for (const [rolNombre, idRol] of Object.entries(roleMap)) {
          if (!idRol) continue;

          const respPermisosRol = await fetch(`${API_BASE_URL}/permisos/rol/${idRol}`, {
            headers: authHeaders,
          });
          if (!respPermisosRol.ok) continue;
          const permisosRolData = await respPermisosRol.json();

          const modulosPermitidos: string[] = [];
          const accionesPorModulo: Record<string, PermisoAcciones> = {};
          (permisosRolData as any[]).forEach((row) => {
            const codigo = String(row.Codigo || '').trim();
            if (!codigo) return;
            const normalizedCodigo = codigo.toLowerCase();

            accionesPorModulo[normalizedCodigo] = {
              puedeVer: !!row.PuedeVer,
              puedeCrear: !!row.PuedeCrear,
              puedeEditar: !!row.PuedeEditar,
              puedeAprobar: !!row.PuedeAprobar,
              puedeEliminar: !!row.PuedeEliminar,
            };

            // Consideramos que puedeVer define si el módulo está activo para la vista
            if (row.PuedeVer) {
              // Solo tomamos módulos que existen en la lista cargada desde BD
              if (modulosFrontend.some((m) => m.id === codigo)) {
                modulosPermitidos.push(normalizedCodigo);
              }
            }
          });

          permisosDb.push({
            rol: rolNombre as UserRole,
            modulosPermitidos,
            accionesPorModulo,
          });
        }

        setPermisos(permisosDb);
      } catch (error) {
        console.error('Error al cargar configuración de permisos desde backend', error);
      } finally {
        setCargandoPermisos(false);
      }
    };

    cargarConfigPermisos();
  }, [token]);

  const actualizarPermisos = (rol: UserRole, modulosSeleccionados: string[]) => {
    const normalizedSelectedModules = ensureRequiredModulesForRole(rol, modulosSeleccionados);

    setPermisos(prevPermisos =>
      prevPermisos.map(p =>
        normalizeRoleKey(p.rol) === normalizeRoleKey(rol)
          ? {
              ...p,
              modulosPermitidos: normalizedSelectedModules,
              accionesPorModulo: modulos.reduce<Record<string, PermisoAcciones>>((acc, modulo) => {
                const normalizedId = normalizeModuleKey(modulo.id);
                const tieneAcceso = normalizedSelectedModules.includes(normalizedId);
                const currentActions = p.accionesPorModulo?.[normalizedId] || emptyPermisosModulo;

                acc[normalizedId] = !tieneAcceso
                  ? emptyPermisosModulo
                  : mergePermisoAcciones(
                      {
                        puedeVer: true,
                        puedeCrear: currentActions.puedeCrear,
                        puedeEditar: currentActions.puedeEditar,
                        puedeAprobar: currentActions.puedeAprobar,
                        puedeEliminar: currentActions.puedeEliminar,
                      },
                      buildRolePermissionOverride(rol, normalizedId),
                    );
                return acc;
              }, {}),
            }
          : p
      )
    );

    const idRol = roleNameToId[rol];
    if (!idRol || Object.keys(codigoToIdModulo).length === 0) {
      return;
    }

    // Sincronizar con backend: construimos el payload esperado por /api/permisos/rol/:idRol
    const permisosPayload = modulos
      .map((m) => {
        const idModulo = codigoToIdModulo[m.id];
        if (!idModulo) return null;
        const normalizedId = normalizeModuleKey(m.id);
        const tieneAcceso = normalizedSelectedModules.includes(normalizedId);
        const permisoRolActual = findPermisoRol(permisos, rol);
        const currentActions = permisoRolActual?.accionesPorModulo?.[normalizedId] || emptyPermisosModulo;
        const nextActions = !tieneAcceso
          ? emptyPermisosModulo
          : mergePermisoAcciones(
              {
                puedeVer: true,
                puedeCrear: currentActions.puedeCrear,
                puedeEditar: currentActions.puedeEditar,
                puedeAprobar: currentActions.puedeAprobar,
                puedeEliminar: currentActions.puedeEliminar,
              },
              buildRolePermissionOverride(rol, normalizedId),
            );

        return {
          idModulo,
          ...nextActions,
        };
      })
      .filter(Boolean);

    (async () => {
      try {
        await fetch(`${API_BASE_URL}/permisos/rol/${idRol}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ permisos: permisosPayload })
        });
      } catch (error) {
        console.error('Error al guardar permisos en backend', error);
      }
    })();
  };

  const getModulosPermitidos = (rol: UserRole): string[] => {
    if (isSuperUserRole(rol)) {
      return modulos.map((modulo) => modulo.id.toLowerCase());
    }

    const permisoRol = findPermisoRol(permisos, rol);
    return ensureRequiredModulesForRole(rol, permisoRol?.modulosPermitidos || []);
  };

  const puedeAcceder = (rol: UserRole, moduloId: string): boolean => {
    if (isSuperUserRole(rol)) {
      return true;
    }

    const modulosPermitidos = getModulosPermitidos(rol);
    return modulosPermitidos.includes(moduloId.toLowerCase());
  };

  const getPermisosModulo = (rol: UserRole, moduloId: string): PermisoAcciones => {
    if (isSuperUserRole(rol)) {
      return {
        puedeVer: true,
        puedeCrear: true,
        puedeEditar: true,
        puedeAprobar: true,
        puedeEliminar: true,
      };
    }

    const permisoRol = findPermisoRol(permisos, rol);
    const normalizedModulo = normalizeModuleKey(moduloId);
    const basePermissions = permisoRol?.accionesPorModulo?.[normalizedModulo] || emptyPermisosModulo;
    return mergePermisoAcciones(basePermissions, buildRolePermissionOverride(rol, normalizedModulo));
  };

  return (
    <PermisosContext.Provider
      value={{
        modulos,
        permisos,
        cargandoPermisos,
        actualizarPermisos,
        getModulosPermitidos,
        puedeAcceder,
        getPermisosModulo,
      }}
    >
      {children}
    </PermisosContext.Provider>
  );
}
