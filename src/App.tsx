import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PermisosProvider } from './contexts/PermisosContext';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import MaterialesPage from './components/MaterialesPage';
import CrearSolicitudPage from './components/CrearSolicitudPage';
import VerSolicitudesPage from './components/VerSolicitudesPage';
import AprobacionPage from './components/AprobacionPage';
import DespachoPage from './components/DespachoPage';
import PresupuestoPage from './components/PresupuestoPage';
import AuditoriaPage from './components/AuditoriaPage';
import ReportesPage from './components/ReportesPage';
import UsuariosPage from './components/UsuariosPage';
import PermisosPage from './components/PermisosPage';
import RolesPage from './components/RolesPage';
import AreasPage from './components/AreasPage';
import CortesPage from './components/CortesPage';

import { User, UserRole } from './types';
import { AuthContext } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';

function App() {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('authUser');
    try {
      return stored ? (JSON.parse(stored) as User) : null;
    } catch (e) {
      console.error('Error parsing stored user', e);
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('authToken');
  });
  const lastToastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      lastToastUserId.current = null;
      return;
    }

    if (lastToastUserId.current === user.id) return;

    toast.custom((t) => (
      <div
        className="flex w-[320px] items-start gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-lg"
        onClick={() => toast.dismiss(t)}
      >
        <div className="mt-0.5 text-emerald-600">
          <CheckCircle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-900">Inicio de sesión exitoso</div>
          <div className="text-xs text-slate-500">Bienvenido, {user.name}.</div>
        </div>
      </div>
    ));
    lastToastUserId.current = user.id;
  }, [user]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:4000/api/auth/login', {
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
          localStorage.setItem('authUser', JSON.stringify(mappedUser));
        } catch (e) {
          console.error('Error saving user to localStorage', e);
        }
      }
      const token = data.token as string | undefined;
      if (token) {
        setToken(token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('authToken', token);
        }
      }

      return true;
    } catch (error) {
      console.error('Error en login frontend', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <PermisosProvider>
        <Router>
          {!user ? (
            <Login />
          ) : (
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/materiales" element={<MaterialesPage />} />
                <Route path="/solicitudes/crear" element={<CrearSolicitudPage />} />
                <Route path="/solicitudes" element={<VerSolicitudesPage />} />
                <Route path="/aprobaciones" element={<AprobacionPage />} />
                <Route path="/despacho" element={<DespachoPage />} />
                <Route path="/presupuesto" element={<PresupuestoPage />} />
                <Route path="/cortes" element={<CortesPage />} />
                <Route path="/auditoria" element={<AuditoriaPage />} />
                <Route path="/reportes" element={<ReportesPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/permisos" element={<PermisosPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/areas" element={<AreasPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          )}
        </Router>
      </PermisosProvider>
    </AuthContext.Provider>
  );
}

export default App;