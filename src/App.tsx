import { type ReactElement, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { sileo as toast } from 'sileo';
import { PermisosProvider } from './contexts/PermisosContext';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import MaterialesPage from './components/MaterialesPage';
import CrearSolicitudPage from './components/CrearSolicitudPage';
import VerSolicitudesPage from './components/VerSolicitudesPage';
import AprobacionPage from './components/AprobacionPage';
import DespachoPage from './components/DespachoPage';
import { KardexPage } from './components/KardexPage';
import PresupuestoPage from './components/PresupuestoPage';
import AuditoriaPage from './components/AuditoriaPage';
import ReportesPage from './components/ReportesPage';
import UsuariosPage from './components/UsuariosPage';
import PermisosPage from './components/PermisosPage';
import RolesPage from './components/RolesPage';
import AreasPage from './components/AreasPage';
import CortesPage from './components/CortesPage';
import CoberturasAccesoPage from './components/CoberturasAccesoPage';

import { User, UserRole } from './types';
import { AuthContext } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { API_BASE_URL } from './services/apiConfig';
import { usePermisos } from './contexts/PermisosContext';
import { AprobacionesRealtimeProvider } from './contexts/AprobacionesRealtimeContext';
import { RealtimeSocketProvider } from './contexts/RealtimeSocketContext';

function ProtectedModuleRoute({
  moduloId,
  children,
}: {
  moduloId: string | string[];
  children: ReactElement;
}) {
  const { user } = useAuth();
  const { cargandoPermisos, puedeAcceder } = usePermisos();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (cargandoPermisos) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Validando permisos del módulo...
      </div>
    );
  }

  const moduleIds = Array.isArray(moduloId) ? moduloId : [moduloId];

  if (!moduleIds.some((moduleId) => puedeAcceder(user.role, moduleId))) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem('authUser');
    try {
      return stored ? (JSON.parse(stored) as User) : null;
    } catch (e) {
      console.error('Error parsing stored user', e);
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('authToken');
  });
  const lastToastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      lastToastUserId.current = null;
      return;
    }

    if (lastToastUserId.current === user.id) return;

    toast.show({
      title: "Inicio de sesión exitoso",
      description: `Bienvenido, ${user.name}.`,
      position: "top-center"
    });
    lastToastUserId.current = user.id;
  }, [user]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const backendUser = data.user as { id: number; email: string; nombre?: string; roles?: string[] };

      // Tomamos el primer rol devuelto por el backend (nombre tal como está en la BD)
      const primaryRole: UserRole = backendUser.roles && backendUser.roles.length > 0
        ? (backendUser.roles[0] as string)
        : '';

      const mappedUser: User = {
        id: String(backendUser.id),
        name: backendUser.nombre || backendUser.email,
        email: backendUser.email,
        role: primaryRole
      };

      setUser(mappedUser);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('authUser', JSON.stringify(mappedUser));
        } catch (e) {
          console.error('Error saving user to sessionStorage', e);
        }
      }
      const token = data.token as string | undefined;
      if (token) {
        setToken(token);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('authToken', token);
        }
      }

      return true;
    } catch (error) {
      console.error('Error en login frontend', error);
      return false;
    }
  };

  const logout = () => {
    const activeToken = token;

    void (async () => {
      if (
        typeof window === 'undefined'
        || !activeToken
        || !window.isSecureContext
        || !('serviceWorker' in navigator)
      ) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          return;
        }

        await fetch(`${API_BASE_URL}/push/subscriptions`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        await subscription.unsubscribe().catch(() => undefined);
      } catch (error) {
        console.error('No se pudo limpiar la suscripción push al cerrar sesión', error);
      }
    })();

    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('authUser');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <PermisosProvider>
        <RealtimeSocketProvider>
          <Router>
            <AprobacionesRealtimeProvider>
              {!user ? (
                <Login />
              ) : (
                <Layout>
                  <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route
                    path="/materiales"
                    element={
                      <ProtectedModuleRoute moduloId="materiales">
                        <MaterialesPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/solicitudes/crear"
                    element={
                      <ProtectedModuleRoute moduloId={["crear-solicitud", "solicitudes"]}>
                        <CrearSolicitudPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/solicitudes"
                    element={
                      <ProtectedModuleRoute moduloId="solicitudes">
                        <VerSolicitudesPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/aprobaciones"
                    element={
                      <ProtectedModuleRoute moduloId="aprobaciones">
                        <AprobacionPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/despacho"
                    element={
                      <ProtectedModuleRoute moduloId="despacho">
                        <DespachoPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/kardex"
                    element={
                      <ProtectedModuleRoute moduloId="kardex">
                        <KardexPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/presupuesto"
                    element={
                      <ProtectedModuleRoute moduloId="presupuesto">
                        <PresupuestoPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/cortes"
                    element={
                      <ProtectedModuleRoute moduloId="cortes">
                        <CortesPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/auditoria"
                    element={
                      <ProtectedModuleRoute moduloId="auditoria">
                        <AuditoriaPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/reportes"
                    element={
                      <ProtectedModuleRoute moduloId="reportes">
                        <ReportesPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/usuarios"
                    element={
                      <ProtectedModuleRoute moduloId="usuarios">
                        <UsuariosPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/permisos"
                    element={
                      <ProtectedModuleRoute moduloId="permisos">
                        <PermisosPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/roles"
                    element={
                      <ProtectedModuleRoute moduloId="roles">
                        <RolesPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/areas"
                    element={
                      <ProtectedModuleRoute moduloId="areas">
                        <AreasPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route
                    path="/coberturas-acceso"
                    element={
                      <ProtectedModuleRoute moduloId="coberturas-acceso">
                        <CoberturasAccesoPage />
                      </ProtectedModuleRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              )}
            </AprobacionesRealtimeProvider>
          </Router>
        </RealtimeSocketProvider>
      </PermisosProvider>
    </AuthContext.Provider>
  );
}

export default App;
