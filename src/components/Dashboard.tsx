import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Package, FileText, DollarSign, AlertTriangle, Download } from 'lucide-react';
import { Badge } from './ui/badge';
import { apiFetch } from '../services/apiClient';
import { useRealtimeSocket } from '../contexts/RealtimeSocketContext';

type Alerta = { area: string; tipo: string; mensaje: string };
type AreaType = { id: number; nombre: string };
type TopMaterial = { material: string; cantidad: number; valor: number | null };
type EstadoRow = { estado: string; valor: number; color: string };
type EvolRow = { mes: string; presupuesto: number; consumo: number };
type DashboardScope = {
  tipo: 'global' | 'personal';
  puedeVerTodo: boolean;
  puedeSeleccionarTodasLasAreas: boolean;
  idsAreasPermitidas: number[];
  descripcion: string;
};

type DashboardData = {
  alcance?: DashboardScope;
  areas?: AreaType[];
  resumen?: {
    presupuestoTotal?: number;
    consumoAcumulado?: number;
    disponible?: number;
    porcentajeEjecucion?: number;
    solicitudesActivas?: number;
    pendientesAprobacion?: number;
  };
  alertas?: Alerta[];
  consumoPorArea?: Array<{ area: string; presupuesto: number; consumo: number }>;
  estadosSolicitudes?: EstadoRow[];
  evolucionMensual?: EvolRow[];
  topMateriales?: TopMaterial[];
};

type DashboardRealtimePayload = {
  reason?: string;
  timestamp?: string;
  idSolicitud?: number;
  idArea?: number | null;
  userId?: number | null;
};

const SOCKET_EVENT_DASHBOARD_ACTUALIZADO = 'dashboard_actualizado';



function formatCurrencyUsd(value: number): string {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { socket, realtimeConnected } = useRealtimeSocket();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [selectedArea, setSelectedArea] = useState('todas');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const joinedAreaRoomsRef = useRef<string[]>([]);

  const fetchDashboard = useCallback(async (mode: 'initial' | 'background' = 'initial') => {
    try {
      if (mode === 'background') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams({
        anio: selectedYear,
        mes: selectedMonth,
      });

      if (selectedArea !== 'todas') {
        params.append('idArea', selectedArea);
      }

      const res = await apiFetch(`/dashboard?${params.toString()}`);
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || 'No se pudo cargar el dashboard.');
      }

      setDashboardData(payload);
      setLastRefreshAt(new Date().toISOString());
    } catch (err: any) {
      console.error('Error cargando dashboard', err);
      setError(err?.message || 'No se pudo cargar el dashboard.');
    } finally {
      if (mode === 'background') {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [selectedArea, selectedMonth, selectedYear]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (refreshTimeoutRef.current != null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      void fetchDashboard('background');
    }, 500);
  }, [fetchDashboard]);

  useEffect(() => {
    void fetchDashboard('initial');
  }, [fetchDashboard]);

  useEffect(() => {
    const idsPermitidas = new Set((dashboardData?.alcance?.idsAreasPermitidas ?? []).map(String));
    const esVistaPersonal = dashboardData?.alcance?.tipo === 'personal';

    if (esVistaPersonal && selectedArea !== 'todas' && !idsPermitidas.has(selectedArea)) {
      setSelectedArea('todas');
    }
  }, [dashboardData, selectedArea]);

  const areaRooms = (dashboardData?.alcance?.puedeVerTodo ?? false)
    ? []
    : (dashboardData?.alcance?.idsAreasPermitidas ?? []).map((idArea) => `dashboard:area:${idArea}`);
  const areaRoomsKey = areaRooms.join('|');

  useEffect(() => {
    if (!socket) {
      joinedAreaRoomsRef.current = [];
      return;
    }

    const previousRooms = joinedAreaRoomsRef.current;
    const nextRooms = areaRooms;

    previousRooms
      .filter((room) => !nextRooms.includes(room))
      .forEach((room) => socket.emit('leave', room));

    if (socket.connected) {
      nextRooms
        .filter((room) => !previousRooms.includes(room))
        .forEach((room) => socket.emit('join', room));
    }

    joinedAreaRoomsRef.current = nextRooms;
  }, [areaRoomsKey, socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleConnect = () => {
      joinedAreaRoomsRef.current.forEach((room) => socket.emit('join', room));
    };

    socket.on('connect', handleConnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleDashboardUpdated = (_payload: DashboardRealtimePayload) => {
      scheduleRealtimeRefresh();
    };

    socket.on(SOCKET_EVENT_DASHBOARD_ACTUALIZADO, handleDashboardUpdated);

    return () => {
      socket.off(SOCKET_EVENT_DASHBOARD_ACTUALIZADO, handleDashboardUpdated);
    };
  }, [scheduleRealtimeRefresh, socket]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current != null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!socket) {
        return;
      }

      joinedAreaRoomsRef.current.forEach((room) => socket.emit('leave', room));
      joinedAreaRoomsRef.current = [];
    };
  }, [socket]);

  // Datos derivados (no usar mocks en producción — fallback = arrays vacíos)
  const totalPresupuesto = dashboardData?.resumen?.presupuestoTotal ?? 0;
  const totalConsumo = dashboardData?.resumen?.consumoAcumulado ?? 0;
  const disponible = dashboardData?.resumen?.disponible ?? 0;
  const porcentajeEjecucion = dashboardData?.resumen?.porcentajeEjecucion ?? 0;

  const alertas: Alerta[] = dashboardData?.alertas ?? [];
  const consumoPorArea: { area: string; presupuesto: number; consumo: number }[] =
    dashboardData?.consumoPorArea ?? [];
  const estadoSolicitudes: EstadoRow[] = dashboardData?.estadosSolicitudes ?? [];
  const evolucionMensual: EvolRow[] = dashboardData?.evolucionMensual ?? [];
  const topMateriales: TopMaterial[] = dashboardData?.topMateriales ?? [];
  const areas: AreaType[] = dashboardData?.areas ?? [];

  const porcentajeDisponible = totalPresupuesto > 0 ? (disponible / totalPresupuesto) * 100 : 0;
  const alcance = dashboardData?.alcance;
  const esVistaGlobal = alcance?.puedeVerTodo ?? false;
  const puedeSeleccionarTodasLasAreas = alcance?.puedeSeleccionarTodasLasAreas ?? true;
  const estadoRealtime = realtimeConnected ? (refreshing ? 'Actualizando' : 'Tiempo real activo') : 'Tiempo real en espera';
  const lastRefreshLabel = lastRefreshAt
    ? new Date(lastRefreshAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Dashboard General</h1>
            <Badge variant={esVistaGlobal ? 'default' : 'secondary'}>
              {esVistaGlobal ? 'Vista global' : 'Vista personal'}
            </Badge>
            <Badge variant={realtimeConnected ? 'outline' : 'secondary'}>
              {estadoRealtime}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Bienvenido, {user?.name}
          </p>
          {alcance?.descripcion && (
            <p className="text-xs text-muted-foreground mt-1">{alcance.descripcion}</p>
          )}
          {lastRefreshLabel && (
            <p className="text-xs text-muted-foreground mt-1">Actualizado: {lastRefreshLabel}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Select value={selectedArea} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Seleccionar área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">
                {puedeSeleccionarTodasLasAreas ? 'Todas las áreas' : 'Mis áreas'}
              </SelectItem>
              {areas.map((area) => (
                <SelectItem key={area.id} value={String(area.id)}>{area.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              {[
                { value: '1', label: 'Enero' },
                { value: '2', label: 'Febrero' },
                { value: '3', label: 'Marzo' },
                { value: '4', label: 'Abril' },
                { value: '5', label: 'Mayo' },
                { value: '6', label: 'Junio' },
                { value: '7', label: 'Julio' },
                { value: '8', label: 'Agosto' },
                { value: '9', label: 'Septiembre' },
                { value: '10', label: 'Octubre' },
                { value: '11', label: 'Noviembre' },
                { value: '12', label: 'Diciembre' },
              ].map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label} {selectedYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Presupuesto Total (USD)</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{formatCurrencyUsd(totalPresupuesto)}</div>
            <p className="text-xs text-muted-foreground mt-1">Asignado para el período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Consumo Acumulado (USD)</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{formatCurrencyUsd(totalConsumo)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-blue-600">{porcentajeEjecucion.toFixed(1)}%</span> ejecutado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Disponible (USD)</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{formatCurrencyUsd(disponible)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">{porcentajeDisponible.toFixed(1)}%</span> restante
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Solicitudes Activas</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{dashboardData?.resumen?.solicitudesActivas ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-yellow-600">{dashboardData?.resumen?.pendientesAprobacion ?? 0} pendientes</span> de aprobación
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error global no bloqueante */}
      {error ? (
        <div className="mt-4">
          <Card>
            <CardContent>
              <div className="text-center text-destructive py-4">{error}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4">
          <Card>
            <CardContent>
              <div className="text-center text-muted-foreground py-6">Cargando datos del dashboard...</div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Alertas */}
          {alertas.length > 0 && (
            <Card className="border-orange-200 bg-orange-50 mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  Alertas Presupuestarias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alertas.map((alerta, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Badge variant={alerta.tipo === 'danger' ? 'destructive' : 'default'}>{alerta.area}</Badge>
                      <span className="text-sm">{alerta.mensaje}</span>
                    </div>
                    <Button size="sm" variant="outline">Ver Detalle</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Charts Row 1 */}
          <div className="grid gap-6 lg:grid-cols-2 mt-4">
            {/* Consumo por Área */}
            <Card>
              <CardHeader>
                <CardTitle>Consumo por Área</CardTitle>
                <CardDescription>
                  {esVistaGlobal ? 'Presupuesto vs Consumo Real del negocio' : 'Presupuesto vs Consumo Real de tus áreas'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {consumoPorArea.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">Sin datos para este período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={consumoPorArea}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="area" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatCurrencyUsd(value)} />
                      <Legend />
                      <Bar dataKey="presupuesto" fill="#94a3b8" name="Presupuesto" />
                      <Bar dataKey="consumo" fill="#3b82f6" name="Consumo" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Estado Solicitudes */}
            <Card>
              <CardHeader>
                <CardTitle>Estado de Solicitudes</CardTitle>
                <CardDescription>
                  {esVistaGlobal ? 'Distribución global por estado' : 'Distribución de tus solicitudes por estado'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {estadoSolicitudes.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">Sin datos para este período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={estadoSolicitudes}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ payload }: any) => `${payload?.estado || ''}: ${payload?.valor || 0}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="valor"
                      >
                        {estadoSolicitudes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-6 lg:grid-cols-2 mt-4">
            {/* Evolución Mensual */}
            <Card>
              <CardHeader>
                <CardTitle>Evolución Mensual</CardTitle>
                <CardDescription>
                  {esVistaGlobal ? 'Presupuesto vs Consumo por mes' : 'Evolución mensual de tus áreas'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {evolucionMensual.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">Sin datos para este período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={evolucionMensual}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatCurrencyUsd(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="presupuesto" stroke="#94a3b8" strokeWidth={2} name="Presupuesto" />
                      <Line type="monotone" dataKey="consumo" stroke="#3b82f6" strokeWidth={2} name="Consumo" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Materiales */}
            <Card>
              <CardHeader>
                <CardTitle>Top Materiales Consumidos</CardTitle>
                <CardDescription>
                  {esVistaGlobal ? 'Materiales más solicitados del período' : 'Materiales de tus solicitudes despachadas'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topMateriales.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">Sin datos para este período.</div>
                ) : (
                  <div className="space-y-3">
                    {topMateriales.map((material, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{material.material}</div>
                          <div className="text-sm text-muted-foreground">Cantidad: {material.cantidad} unidades</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-blue-600">{material.valor ? formatCurrencyUsd(material.valor) : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
