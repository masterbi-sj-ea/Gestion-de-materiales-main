import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { sileo as toast } from 'sileo';
import './Login.css';

export default function Login() {
  const [viewMode, setViewMode] = useState<'operativo' | 'presentacion'>('operativo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const success = await login(email, password);
    if (!success) {
      setError('Credenciales inválidas. Verifica tu email y contraseña.');
      toast.error({
        title: 'Error de acceso',
        description: 'Credenciales inválidas. Verifica tu email y contraseña.',
      });
    }
  };

  const featureHighlights = [
    {
      icon: Boxes,
      title: 'Inventario centralizado',
      description: 'Stock, materiales y movimientos reunidos en una sola entrada.',
    },
    {
      icon: ClipboardList,
      title: 'Proceso ordenado',
      description: 'Solicitudes, aprobación y despacho con seguimiento claro.',
    },
    {
      icon: ShieldCheck,
      title: 'Acceso por rol',
      description: 'Cada perfil entra con la vista correcta desde el inicio.',
    },
  ];

  const mobileModules = ['Stock', 'Solicitudes', 'Despacho', 'Kardex'];

  return (
    <div className={`login-page ${viewMode === 'presentacion' ? 'login-page--presentacion' : 'login-page--operativo'}`}>
      <div className="login-orb login-orb-one" />
      <div className="login-orb login-orb-two" />
      <div className="login-orb login-orb-three" />

      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-pill">
            <Sparkles size={14} />
            <span>Acceso Operativo</span>
          </div>

          <div className="login-brand-header">
            <div className="login-logo-box">
              <Package size={30} />
            </div>

            <div className="login-brand-copy">
              <div className="login-eyebrow">Gestion de Materiales</div>
              <h1>Una entrada mas clara para un sistema de trabajo real.</h1>
              <p>
                Controla inventario, solicitudes, aprobaciones y despacho desde
                una pantalla mas firme, moderna y facil de entender.
              </p>
            </div>
          </div>

          <div className="login-feature-grid">
            {featureHighlights.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="login-feature-card">
                  <div className="login-feature-icon">
                    <Icon size={18} />
                  </div>
                  <h2>{feature.title}</h2>
                  <p>{feature.description}</p>
                </div>
              );
            })}
          </div>

          <div className="login-brand-banner">
            <div>
              <div className="login-banner-label">Flujo principal</div>
              <strong>Inventario, solicitudes y despacho en un solo lugar.</strong>
            </div>
            <div className="login-banner-badge">ERP operativo</div>
          </div>

          <div className="login-brand-footer">
            Inventario • Solicitudes • Despacho • Kardex
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-top">
            <div className="login-form-title-group">
              <div className="login-form-logo">
                <Package size={22} />
              </div>
              <div>
                <div className="login-form-kicker">Bienvenido</div>
                <h2>Iniciar sesion</h2>
              </div>
            </div>

            <div className="login-form-top-actions">
              <div className="login-view-mode-toggle" role="tablist" aria-label="Modo de vista de inicio de sesión">
                <button
                  type="button"
                  className={`login-view-mode-btn ${viewMode === 'operativo' ? 'is-active' : ''}`}
                  onClick={() => setViewMode('operativo')}
                  role="tab"
                  aria-selected={viewMode === 'operativo'}
                >
                  Operativo
                </button>
                <button
                  type="button"
                  className={`login-view-mode-btn ${viewMode === 'presentacion' ? 'is-active' : ''}`}
                  onClick={() => setViewMode('presentacion')}
                  role="tab"
                  aria-selected={viewMode === 'presentacion'}
                >
                  Presentación
                </button>
              </div>
              <div className="login-status-badge">Sistema activo</div>
            </div>
          </div>

          <div className="login-mobile-showcase">
            <div className="login-mobile-showcase-top">
              <div className="login-mobile-showcase-brand">
                <div className="login-mobile-showcase-logo">
                  <Package size={18} />
                </div>
                <div>
                  <div className="login-mobile-showcase-kicker">Operacion diaria</div>
                  <strong>Inventario y despacho sin rodeos</strong>
                </div>
              </div>

              <div className="login-mobile-showcase-badge">En linea</div>
            </div>

            <p>
              En movil el acceso debe sentirse rapido, claro y listo para trabajar.
            </p>

            <div className="login-mobile-chip-row">
              {mobileModules.map((module) => (
                <span key={module} className="login-mobile-chip">
                  {module}
                </span>
              ))}
            </div>
          </div>

          <div className="login-form-intro">
            <div className="login-form-intro-icon">
              <ShieldCheck size={18} />
            </div>
            <div className="login-form-intro-copy">
              <strong>Sistema de Gestion de Materiales</strong>
              <p>
                Ingresa tus credenciales para continuar con inventario,
                aprobaciones y despacho.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="email">Correo electronico</label>
              <div className="login-input-wrap">
                <Mail className="login-input-icon" size={17} />
                <input
                  id="email"
                  type="email"
                  placeholder="usuario@empresa.com"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="login-input"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">Contrasena</label>
              <div className="login-input-wrap">
                <Lock className="login-input-icon" size={17} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  title={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  onClick={() => setShowPassword((s) => !s)}
                  className="login-password-toggle"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert" aria-live="polite">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-submit">
              <span>Iniciar Sesion</span>
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="login-form-note">
            <ShieldCheck size={15} />
            <p>Acceso protegido y vista inicial segun tu perfil.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
