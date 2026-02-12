import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Package, FileText, DollarSign, AlertTriangle, Download } from 'lucide-react';
import { Badge } from './ui/badge';

const mockConsumoArea = [
  { area: 'Producción A', presupuesto: 150000, consumo: 125000 },
  { area: 'Producción B', presupuesto: 120000, consumo: 98000 },
  { area: 'Mantenimiento', presupuesto: 80000, consumo: 75000 },
  { area: 'Calidad', presupuesto: 50000, consumo: 42000 },
];

const mockTopMateriales = [
  { material: 'Tornillos M6', cantidad: 5400, valor: 12500 },
  { material: 'Pintura Industrial', cantidad: 850, valor: 18900 },
  { material: 'Rodamientos', cantidad: 320, valor: 15600 },
  { material: 'Aceite Lubricante', cantidad: 1200, valor: 9800 },
  { material: 'Cables Eléctricos', cantidad: 680, valor: 8200 },
];

const mockEvolucionMensual = [
  { mes: 'Ene', presupuesto: 85000, consumo: 72000 },
  { mes: 'Feb', presupuesto: 85000, consumo: 78000 },
  { mes: 'Mar', presupuesto: 85000, consumo: 81000 },
  { mes: 'Abr', presupuesto: 85000, consumo: 75000 },
  { mes: 'May', presupuesto: 85000, consumo: 79000 },
  { mes: 'Jun', presupuesto: 85000, consumo: 82000 },
];

const mockEstadoSolicitudes = [
  { estado: 'Pendiente', valor: 15, color: '#fbbf24' },
  { estado: 'Aprobada', valor: 42, color: '#22c55e' },
  { estado: 'En Despacho', valor: 18, color: '#3b82f6' },
  { estado: 'Despachada', valor: 87, color: '#10b981' },
  { estado: 'Rechazada', valor: 8, color: '#ef4444' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [selectedArea, setSelectedArea] = useState('todas');
  const [selectedMonth, setSelectedMonth] = useState('junio');

  const totalPresupuesto = 400000;
  const totalConsumo = 340000;
  const disponible = totalPresupuesto - totalConsumo;
  const porcentajeEjecucion = (totalConsumo / totalPresupuesto) * 100;

  const alertas = [
    { area: 'Producción A', tipo: 'warning', mensaje: 'Ejecución presupuestaria al 83%' },
    { area: 'Mantenimiento', tipo: 'danger', mensaje: 'Ejecución presupuestaria al 94%' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Dashboard General</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido, {user?.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedArea} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Seleccionar área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las áreas</SelectItem>
              <SelectItem value="produccion_a">Producción A</SelectItem>
              <SelectItem value="produccion_b">Producción B</SelectItem>
              <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              <SelectItem value="calidad">Calidad</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enero">Enero 2025</SelectItem>
              <SelectItem value="febrero">Febrero 2025</SelectItem>
              <SelectItem value="marzo">Marzo 2025</SelectItem>
              <SelectItem value="abril">Abril 2025</SelectItem>
              <SelectItem value="mayo">Mayo 2025</SelectItem>
              <SelectItem value="junio">Junio 2025</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Presupuesto Total</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">${totalPresupuesto.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Asignado para el período
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Consumo Acumulado</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">${totalConsumo.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-blue-600">{porcentajeEjecucion.toFixed(1)}%</span> ejecutado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Disponible</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">${disponible.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">{((disponible/totalPresupuesto)*100).toFixed(1)}%</span> restante
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Solicitudes Activas</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">75</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-yellow-600">15 pendientes</span> de aprobación
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
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
                  <Badge variant={alerta.tipo === 'danger' ? 'destructive' : 'default'}>
                    {alerta.area}
                  </Badge>
                  <span className="text-sm">{alerta.mensaje}</span>
                </div>
                <Button size="sm" variant="outline">Ver Detalle</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Consumo por Área */}
        <Card>
          <CardHeader>
            <CardTitle>Consumo por Área</CardTitle>
            <CardDescription>Presupuesto vs Consumo Real</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mockConsumoArea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="area" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
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
                  data={mockEstadoSolicitudes}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ estado, valor }) => `${estado}: ${valor}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="valor"
                >
                  {mockEstadoSolicitudes.map((entry, index) => (
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Evolución Mensual */}
        <Card>
          <CardHeader>
            <CardTitle>Evolución Mensual</CardTitle>
            <CardDescription>Presupuesto vs Consumo por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockEvolucionMensual}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
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
              {mockTopMateriales.map((material, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{material.material}</div>
                    <div className="text-sm text-muted-foreground">
                      Cantidad: {material.cantidad} unidades
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-blue-600">
                      ${material.valor.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
