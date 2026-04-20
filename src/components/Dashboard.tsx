import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Package, FileText, DollarSign, AlertTriangle, Download } from 'lucide-react';
import { Badge } from './ui/badge';

type Alerta = { area: string; tipo: string; mensaje: string };
type AreaType = { id: number; nombre: string };
type TopMaterial = { material: string; cantidad: number; valor: number | null };
type EstadoRow = { estado: string; valor: number; color: string };
type EvolRow = { mes: string; presupuesto: number; consumo: number };



function formatCurrencyUsd(value: number): string {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [selectedArea, setSelectedArea] = useState('todas');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = sessionStorage.getItem('authToken');
        const params = new URLSearchParams({
          anio: selectedYear,
          mes: selectedMonth,
        });

        if (selectedArea !== 'todas') {
          params.append('idArea', selectedArea);
        }

        const res = await fetch(`/api/dashboard?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(payload?.message || 'No se pudo cargar el dashboard.');
        }

        setDashboardData(payload);
      } catch (err: any) {
        console.error('Error cargando dashboard', err);
        setError(err?.message || 'No se pudo cargar el dashboard.');
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboard();
  }, [selectedArea, selectedMonth, selectedYear]);

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

  const hasData = !!dashboardData && (
    totalPresupuesto > 0 ||
    totalConsumo > 0 ||
    consumoPorArea.length > 0 ||
    estadoSolicitudes.length > 0 ||
    evolucionMensual.length > 0 ||
    topMateriales.length > 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard General</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Bienvenido, {user?.name}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Select value={selectedArea} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Seleccionar área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las áreas</SelectItem>
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

      {/* Estado: loading / error / empty / datos */}
      {loading ? (
        <div className="mt-4">
          <Card>
            <CardContent>
              <div className="text-center text-muted-foreground py-6">Cargando datos del dashboard...</div>
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <div className="mt-4">
          <Card>
            <CardContent>
              <div className="text-center text-destructive py-6">{error}</div>
            </CardContent>
          </Card>
        </div>
      ) : !hasData ? (
        <div className="mt-4">
          <Card>
            <CardContent>
              <div className="text-center text-muted-foreground py-6">No hay datos para el período seleccionado.</div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
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
                <CardDescription>Presupuesto vs Consumo Real</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            {/* Estado Solicitudes */}
            <Card>
              <CardHeader>
                <CardTitle>Estado de Solicitudes</CardTitle>
                <CardDescription>Distribución por estado</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-6 lg:grid-cols-2 mt-4">
            {/* Evolución Mensual */}
            <Card>
              <CardHeader>
                <CardTitle>Evolución Mensual</CardTitle>
                <CardDescription>Presupuesto vs Consumo por mes</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            {/* Top Materiales */}
            <Card>
              <CardHeader>
                <CardTitle>Top Materiales Consumidos</CardTitle>
                <CardDescription>Materiales más solicitados del período</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
