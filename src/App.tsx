import { useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

// El rol de usuario se trata ahora como string libre, para coincidir exactamente
// con los nombres de rol que vengan desde la base de datos.
export type UserRole = string;

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  area?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('authToken');
  });

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