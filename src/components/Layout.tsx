import { useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CheckSquare,
  ChevronDown,
  DollarSign,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Shield,
  Truck,
  Users,
  X,
  ClipboardList,
} from 'lucide-react';
import type { Modulo } from '../contexts/PermisosContext';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from '../contexts/PermisosContext';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

type SidebarGroupId = 'principal' | 'operacion' | 'control' | 'administracion' | 'otros';

interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: SidebarGroupId;
  order: number;
}

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Package,
  FileText,
  CheckSquare,
  Truck,
  DollarSign,
  ClipboardList,
  FileBarChart,
  Users,
  Shield,
  Activity,
};

const sidebarGroups: Array<{ id: SidebarGroupId; label: string }> = [
  { id: 'principal', label: 'Principal' },
  { id: 'operacion', label: 'Operacion' },
  { id: 'control', label: 'Control' },
  { id: 'administracion', label: 'Administracion' },
  { id: 'otros', label: 'Mas' },
];

const sidebarMetaByPath: Record<string, { group: SidebarGroupId; order: number }> = {
  '/': { group: 'principal', order: 10 },
  '/solicitudes/crear': { group: 'operacion', order: 10 },
  '/solicitudes': { group: 'operacion', order: 20 },
  '/materiales': { group: 'operacion', order: 30 },
  '/aprobaciones': { group: 'operacion', order: 40 },
  '/despacho': { group: 'operacion', order: 50 },
  '/kardex': { group: 'control', order: 10 },
  '/cortes': { group: 'control', order: 20 },
  '/presupuesto': { group: 'control', order: 30 },
  '/reportes': { group: 'control', order: 40 },
  '/areas': { group: 'administracion', order: 10 },
  '/coberturas-acceso': { group: 'administracion', order: 15 },
  '/usuarios': { group: 'administracion', order: 20 },
  '/roles': { group: 'administracion', order: 30 },
  '/permisos': { group: 'administracion', order: 40 },
  '/auditoria': { group: 'administracion', order: 50 },
};

const sidebarMetaById: Record<string, { group: SidebarGroupId; order: number }> = {
  dashboard: { group: 'principal', order: 10 },
  solicitudes: { group: 'operacion', order: 20 },
  materiales: { group: 'operacion', order: 30 },
  aprobaciones: { group: 'operacion', order: 40 },
  despacho: { group: 'operacion', order: 50 },
  kardex: { group: 'control', order: 10 },
  cortes: { group: 'control', order: 20 },
  presupuesto: { group: 'control', order: 30 },
  reportes: { group: 'control', order: 40 },
  areas: { group: 'administracion', order: 10 },
  'coberturas-acceso': { group: 'administracion', order: 15 },
  usuarios: { group: 'administracion', order: 20 },
  roles: { group: 'administracion', order: 30 },
  permisos: { group: 'administracion', order: 40 },
  auditoria: { group: 'administracion', order: 50 },
};

function normalizePath(path: string): string {
  if (!path) return '/';
  if (path === '/') return '/';
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

function resolveSidebarMeta(modulo: Modulo): { group: SidebarGroupId; order: number } {
  const normalizedPath = normalizePath(modulo.path);
  const normalizedId = String(modulo.id || '').trim().toLowerCase();
  const normalizedName = String(modulo.nombre || '').trim().toLowerCase();

  if (sidebarMetaByPath[normalizedPath]) {
    return sidebarMetaByPath[normalizedPath];
  }

  if (sidebarMetaById[normalizedId]) {
    return sidebarMetaById[normalizedId];
  }

  if (normalizedName.includes('solicitud')) {
    return { group: 'operacion', order: 60 };
  }

  if (
    normalizedName.includes('reporte') ||
    normalizedName.includes('presupuesto') ||
    normalizedName.includes('kardex') ||
    normalizedName.includes('corte')
  ) {
    return { group: 'control', order: 90 };
  }

  if (
    normalizedName.includes('usuario') ||
    normalizedName.includes('rol') ||
    normalizedName.includes('permiso') ||
    normalizedName.includes('auditor') ||
    normalizedName.includes('area') ||
    normalizedName.includes('cobertura')
  ) {
    return { group: 'administracion', order: 90 };
  }

  return { group: 'otros', order: 999 };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { cargandoPermisos, getModulosPermitidos, modulos } = usePermisos();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Polyfill robusto para 100dvh en Safari iOS / Móviles
  useEffect(() => {
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };
    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    return () => window.removeEventListener('resize', setAppHeight);
  }, []);

  // Bloquear scroll del fondo cuando el menú lateral móvil está abierto
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const modulosPermitidos = user ? getModulosPermitidos(user.role) : [];

  const navigation = useMemo<NavigationItem[]>(() => {
    const permitidos = new Set(modulosPermitidos.map((moduloId) => moduloId.toLowerCase()));

    return modulos
      .filter((modulo) => permitidos.has(modulo.id.toLowerCase()))
      .map((modulo) => {
        const Icon = iconMap[modulo.icon] || FileText;
        const meta = resolveSidebarMeta(modulo);
        return {
          id: modulo.id,
          label: modulo.nombre,
          path: modulo.path,
          icon: Icon,
          group: meta.group,
          order: meta.order,
        };
      })
      .sort((a, b) => {
        const groupOrder =
          sidebarGroups.findIndex((group) => group.id === a.group) -
          sidebarGroups.findIndex((group) => group.id === b.group);

        if (groupOrder !== 0) return groupOrder;
        if (a.order !== b.order) return a.order - b.order;
        return a.label.localeCompare(b.label, 'es');
      });
  }, [modulos, modulosPermitidos]);

  const navigationSections = useMemo(
    () =>
      sidebarGroups
        .map((group) => ({
          ...group,
          items: navigation.filter((item) => item.group === group.id),
        }))
        .filter((group) => group.items.length > 0),
    [navigation],
  );

  const activeNavigationPath = useMemo(() => {
    const currentPath = normalizePath(location.pathname);

    const matches = navigation.filter((item) => {
      const itemPath = normalizePath(item.path);

      if (itemPath === '/') {
        return currentPath === '/';
      }

      return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
    });

    return matches.sort((a, b) => normalizePath(b.path).length - normalizePath(a.path).length)[0]?.path ?? null;
  }, [location.pathname, navigation]);

  const userInitial = String(user?.name || '?').trim().charAt(0).toUpperCase() || '?';

  const renderSidebarNavigation = (mobile = false) => {
    if (cargandoPermisos) {
      return (
        <div className="space-y-6 px-1">
          {Array.from({ length: 3 }).map((_, sectionIndex) => (
            <div key={sectionIndex} className="space-y-2">
              <div className="h-4 w-20 rounded-md bg-[#F2F4F7]" />
              {Array.from({ length: 3 }).map((__, itemIndex) => (
                <div
                  key={itemIndex}
                  className="flex items-center gap-3 rounded-lg border border-transparent bg-[#F9FAFB] px-3 py-2 animate-pulse"
                >
                  <div className="h-5 w-5 rounded bg-[#EAECF0]" />
                  <div className="h-4 w-24 rounded bg-[#EAECF0]" />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (navigationSections.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-[#EAECF0] bg-[#F9FAFB] px-4 py-6 text-center shadow-sm">
          <p className="text-sm font-medium text-[#344054]">No hay módulos visibles</p>
          <p className="mt-2 text-xs leading-5 text-[#475467]">
            Tu rol actual no tiene accesos disponibles para mostrar en este menú.
          </p>
        </div>
      );
    }

    return navigationSections.map((section) => (
      <div key={section.id} className="space-y-1 mt-6 first:mt-2">
        <div className="px-3 mb-2">
          <div className="text-xs font-semibold text-[#98A2B3]">
            {section.label}
          </div>
        </div>
        <div className="space-y-0.5">
          {section.items.map((item) => {
            const isActive = normalizePath(item.path) === normalizePath(activeNavigationPath || '');
            const Icon = item.icon;

            return (
              <Link
                key={`${item.id}-${item.path}`}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                onClick={mobile ? () => setSidebarOpen(false) : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 ${isActive
                    ? 'custom-active-item'
                    : 'custom-inactive-item'
                  }`}
              >
                <div
                  className={`flex shrink-0 items-center justify-center transition-colors duration-200 ${isActive
                      ? 'custom-active-icon'
                      : 'custom-inactive-icon group-hover:text-[#344054]'
                    }`}
                >
                  <Icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </span>
                {isActive && (
                  <span className="absolute right-3 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7F56D9] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#6941C6]"></span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    ));
  };

  const sidebarHeader = (
    <div className="px-5 pb-2 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#53389E] text-white shadow-sm">
          <div className="absolute inset-0 rounded-xl bg-white/10 mix-blend-overlay" />
          <Package className="h-5 w-5 drop-shadow-sm" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold tracking-tight text-[#101828]">
            Gestión ERP
          </div>
          <div className="truncate text-xs font-medium text-[#475467]">
            Sistema de Operaciones
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-[#F9F5FF] border border-[#E9D7FE] px-3 py-2 shadow-sm">
        <Shield className="h-[18px] w-[18px] text-[#6941C6]" />
        <span className="text-[14px] font-medium text-[#6941C6] flex-1 truncate">{user?.role || 'Sin rol'}</span>
        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#6941C6] border border-[#E9D7FE] shadow-sm">
          {navigation.length} MÓD
        </span>
      </div>
    </div>
  );

  const sidebarFooter = (
    <div className="mt-auto px-4 py-4 space-y-1">
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4EBFF] text-[#6941C6] text-sm font-bold border border-[#E9D7FE]">
          {userInitial}
          <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-[#12B76A] ring-2 ring-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[#344054] tracking-tight">{user?.name}</div>
          <div className="truncate text-xs text-[#475467]">{user?.email || 'Usuario Activo'}</div>
        </div>
      </div>

      <div className="px-1 pb-1">
        <Button
          variant="ghost"
          className="w-full justify-start rounded-lg text-[#475467] hover:bg-[#F9FAFB] hover:text-[#101828] h-9 px-3 transition-colors duration-200"
          onClick={logout}
        >
          <LogOut className="mr-2 h-[18px] w-[18px]" />
          <span className="font-medium text-sm">Cerrar Sesión</span>
        </Button>
      </div>
    </div>
  );

  const customStyles = `
    .custom-sidebar {
      background-color: #ffffff !important;
      border-right: 1px solid #EAECF0 !important;
    }
    .custom-active-item {
      background-color: #F9F5FF !important;
      color: #6941C6 !important;
    }
    .custom-inactive-item {
      color: #475467 !important;
      background-color: transparent !important;
    }
    .custom-inactive-item:hover {
      background-color: #F9FAFB !important;
      color: #101828 !important;
    }
    .custom-active-icon {
      color: #6941C6 !important;
    }
    .custom-inactive-icon {
      color: #475467 !important;
    }
    @media (min-width: 1024px) {
      .custom-sidebar-width {
        width: 280px !important;
      }
      .custom-main-padding {
        padding-left: 280px !important;
      }
    }
    .min-h-dvh {
      min-height: 100vh;
      min-height: var(--app-height, 100vh);
    }
    .h-dvh {
      height: 100vh;
      height: var(--app-height, 100vh);
    }
    /* A subtle custom scrollbar for the sidebar */
    .sidebar-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .sidebar-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .sidebar-scrollbar::-webkit-scrollbar-thumb {
      background: #EAECF0;
      border-radius: 4px;
    }
    .sidebar-scrollbar:hover::-webkit-scrollbar-thumb {
      background: #D0D5DD;
    }
  `;

  return (
    <div className="min-h-dvh bg-[#F9FAFB]">
      <style>{customStyles}</style>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex custom-sidebar-width lg:flex-col custom-sidebar shadow-sm z-40">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
          {sidebarHeader}
          <nav className="sidebar-scrollbar flex-1 overflow-y-auto px-4 pb-4 z-10">{renderSidebarNavigation()}</nav>
          {sidebarFooter}
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" style={{ minHeight: 'var(--app-height, 100vh)' }}>
          <div className="fixed inset-0 backdrop-blur-sm transition-opacity h-dvh bg-[#344054]/60" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed top-0 left-0 z-50 flex w-[280px] max-w-[calc(100vw-2rem)] flex-col custom-sidebar shadow-2xl h-dvh">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
              <div className="flex items-center justify-between px-5 pt-5 z-10">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B3]">Navegación</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg text-[#667085] hover:bg-[#F9FAFB] hover:text-[#101828] transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {sidebarHeader}
              <nav className="sidebar-scrollbar flex-1 overflow-y-auto px-4 pb-4 z-10">{renderSidebarNavigation(true)}</nav>
              {sidebarFooter}
            </div>
          </aside>
        </div>
      )}

      <div className="custom-main-padding flex flex-col min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 lg:px-8 lg:py-3">
            {/* Botón hamburger — solo mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center justify-center h-9 w-9 rounded-xl bg-[#F4EBFF] text-[#6941C6] hover:bg-[#E9D7FE] active:scale-95 transition-all shrink-0"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" strokeWidth={2.5} />
            </button>

            {/* Branding centrado — solo mobile */}
            <div className="lg:hidden flex items-center gap-2 flex-1 justify-center">
              <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#53389E] text-white shadow-sm">
                <Package className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold tracking-tight text-[#101828]">Gestión ERP</span>
            </div>

            {/* Avatar del usuario — solo mobile */}
            <div className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F4EBFF] text-[#6941C6] text-sm font-bold border border-[#E9D7FE]">
              {userInitial}
            </div>

            {/* Espacio para desktop (sidebar ya muestra el branding) */}
            <div className="hidden lg:block flex-1" />
          </div>
        </header>

        <main className="px-2 py-4 sm:p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
