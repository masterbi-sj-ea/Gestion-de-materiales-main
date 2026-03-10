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
}

// La lista de módulos ahora se carga desde la base de datos vía /api/modulos

interface PermisosContextType {
  modulos: Modulo[];
  permisos: PermisoRol[];
  actualizarPermisos: (rol: UserRole, modulosSeleccionados: string[]) => void;
  getModulosPermitidos: (rol: UserRole) => string[];
  puedeAcceder: (rol: UserRole, moduloId: string) => boolean;
}

const PermisosContext = createContext<PermisosContextType | null>(null);

export const usePermisos = () => {
  const context = useContext(PermisosContext);
  if (!context) throw new Error('usePermisos must be used within PermisosProvider');
  return context;
};

export function PermisosProvider({ children }: { children: ReactNode }) {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [permisos, setPermisos] = useState<PermisoRol[]>([]);
  const [roleNameToId, setRoleNameToId] = useState<Record<string, number>>({});
  const [codigoToIdModulo, setCodigoToIdModulo] = useState<Record<string, number>>({});
  const { token } = useAuth();

  // Cargar mapeos dinámicos: UserRole -> IdRol y CodigoModulo -> IdModulo desde el backend
  useEffect(() => {
    const cargarConfigPermisos = async () => {
      if (!token) {
        // Si aún no tenemos token (usuario no logueado), no llamamos a las APIs protegidas
        return;
      }

      try {
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
          (permisosRolData as any[]).forEach((row) => {
            // Consideramos que puedeVer define si el módulo está activo para la vista
            if (row.Codigo && row.PuedeVer) {
              const codigo: string = row.Codigo;
              // Solo tomamos módulos que existen en la lista cargada desde BD
              if (modulosFrontend.some((m) => m.id === codigo)) {
                modulosPermitidos.push(codigo);
              }
            }
          });

          permisosDb.push({ rol: rolNombre as UserRole, modulosPermitidos });
        }

        if (permisosDb.length > 0) {
          setPermisos(permisosDb);
        }
      } catch (error) {
        console.error('Error al cargar configuración de permisos desde backend', error);
      }
    };

    cargarConfigPermisos();
  }, [token]);

  const actualizarPermisos = (rol: UserRole, modulosSeleccionados: string[]) => {
    setPermisos(prevPermisos =>
      prevPermisos.map(p =>
        p.rol === rol ? { ...p, modulosPermitidos: modulosSeleccionados } : p
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
        const tieneAcceso = modulosSeleccionados.includes(m.id);
        return {
          idModulo,
          puedeVer: tieneAcceso,
          puedeCrear: false,
          puedeEditar: false,
          puedeAprobar: false,
          puedeEliminar: false
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
    const permisoRol = permisos.find(p => p.rol === rol);
    return permisoRol?.modulosPermitidos || [];
  };

  const puedeAcceder = (rol: UserRole, moduloId: string): boolean => {
    const modulosPermitidos = getModulosPermitidos(rol);
    return modulosPermitidos.includes(moduloId);
  };

  return (
    <PermisosContext.Provider value={{ modulos, permisos, actualizarPermisos, getModulosPermitidos, puedeAcceder }}>
      {children}
    </PermisosContext.Provider>
  );
}
