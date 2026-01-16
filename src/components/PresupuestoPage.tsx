import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Plus, Edit, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface PresupuestoArea {
  id: string;
  area: string;
  periodo: string;
  monto: number;
  consumo: number;
  disponible: number;
  porcentaje: number;
}

interface Area {
  id: number;
  codigo: string;
  nombre: string;
}

const mockPresupuestos: PresupuestoArea[] = [
  { id: '1', area: 'Producción A', periodo: '2025-Q2', monto: 150000, consumo: 125000, disponible: 25000, porcentaje: 83.3 },
  { id: '2', area: 'Producción B', periodo: '2025-Q2', monto: 120000, consumo: 98000, disponible: 22000, porcentaje: 81.7 },
  { id: '3', area: 'Mantenimiento', periodo: '2025-Q2', monto: 80000, consumo: 75000, disponible: 5000, porcentaje: 93.8 },
  { id: '4', area: 'Calidad', periodo: '2025-Q2', monto: 50000, consumo: 42000, disponible: 8000, porcentaje: 84.0 },
];

const mockEvolucionMensual = [
  { mes: 'Enero', presupuesto: 400000, consumo: 320000 },
  { mes: 'Febrero', presupuesto: 400000, consumo: 345000 },
  { mes: 'Marzo', presupuesto: 400000, consumo: 368000 },
  { mes: 'Abril', presupuesto: 400000, consumo: 312000 },
  { mes: 'Mayo', presupuesto: 400000, consumo: 338000 },
  { mes: 'Junio', presupuesto: 400000, consumo: 340000 },
];

const mockComparativoAreas = [
  { area: 'Prod. A', presupuesto: 150000, consumo: 125000 },
  { area: 'Prod. B', presupuesto: 120000, consumo: 98000 },
  { area: 'Mant.', presupuesto: 80000, consumo: 75000 },
  { area: 'Calidad', presupuesto: 50000, consumo: 42000 },
];

export default function PresupuestoPage() {
  const { token } = useAuth();
  const [presupuestos] = useState<PresupuestoArea[]>(mockPresupuestos);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPeriodo, setSelectedPeriodo] = useState('2025-q2');
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | undefined>(undefined);

  const cargarAreas = async () => {
    if (!token) return;

    try {
      const resp = await fetch('http://localhost:4000/api/areas', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: Area[] = (data as any[]).map((a) => ({
        id: a.IdArea as number,
        codigo: a.Codigo as string,
        nombre: a.Nombre as string,
      }));
      setAreas(mapped);
    } catch (error) {
      console.error('Error al cargar áreas para presupuesto', error);
    }
  };

  useEffect(() => {
    cargarAreas();
  }, [token]);

  const totalPresupuesto = presupuestos.reduce((sum, p) => sum + p.monto, 0);
  const totalConsumo = presupuestos.reduce((sum, p) => sum + p.consumo, 0);
  const totalDisponible = presupuestos.reduce((sum, p) => sum + p.disponible, 0);
  const porcentajeEjecucion = (totalConsumo / totalPresupuesto) * 100;

  const getColorEjecucion = (porcentaje: number) => {
    if (porcentaje >= 90) return 'text-red-600';
    if (porcentaje >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getBarColor = (porcentaje: number) => {
    if (porcentaje >= 90) return '#ef4444';
    if (porcentaje >= 75) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Control Presupuestario</h1>
          <p className="text-muted-foreground mt-1">
            Gestión y seguimiento de presupuestos por área
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2025-q1">Q1 2025</SelectItem>
              <SelectItem value="2025-q2">Q2 2025</SelectItem>
              <SelectItem value="2025-q3">Q3 2025</SelectItem>
              <SelectItem value="2025-q4">Q4 2025</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Cargar Presupuesto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cargar Presupuesto</DialogTitle>
                <DialogDescription>
                  Define el presupuesto para un área específica
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="area">Área</Label>
                  <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar área" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodo">Período</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025-q1">Q1 2025</SelectItem>
                      <SelectItem value="2025-q2">Q2 2025</SelectItem>
                      <SelectItem value="2025-q3">Q3 2025</SelectItem>
                      <SelectItem value="2025-q4">Q4 2025</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monto">Monto del Presupuesto</Label>
                  <Input
                    id="monto"
                    type="number"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setDialogOpen(false)}>
                  Guardar Presupuesto
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Presupuesto Total</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">${totalPresupuesto.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Período actual
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
              <span className={getColorEjecucion(porcentajeEjecucion)}>
                {porcentajeEjecucion.toFixed(1)}%
              </span> ejecutado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Disponible</CardTitle>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-green-600">
              ${totalDisponible.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((totalDisponible / totalPresupuesto) * 100).toFixed(1)}% restante
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Áreas en Alerta</CardTitle>
            <AlertTriangle className="w-4 h-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-orange-600">
              {presupuestos.filter(p => p.porcentaje >= 90).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Mayor al 90%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Presupuestos por Área */}
      <Card>
        <CardHeader>
          <CardTitle>Presupuestos por Área</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Presupuesto</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">% Ejecución</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presupuestos.map((presupuesto) => (
                  <TableRow key={presupuesto.id}>
                    <TableCell className="font-medium">{presupuesto.area}</TableCell>
                    <TableCell>{presupuesto.periodo}</TableCell>
                    <TableCell className="text-right">
                      ${presupuesto.monto.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      ${presupuesto.consumo.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={presupuesto.disponible < presupuesto.monto * 0.1 ? 'text-red-600' : ''}>
                        ${presupuesto.disponible.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={getColorEjecucion(presupuesto.porcentaje)}>
                        {presupuesto.porcentaje.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {presupuesto.porcentaje >= 90 ? (
                        <Badge variant="destructive">Crítico</Badge>
                      ) : presupuesto.porcentaje >= 75 ? (
                        <Badge className="bg-yellow-100 text-yellow-700">Alerta</Badge>
                      ) : (
                        <Badge variant="secondary">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comparativo por Área */}
        <Card>
          <CardHeader>
            <CardTitle>Comparativo por Área</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mockComparativoAreas}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="area" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="presupuesto" fill="#94a3b8" name="Presupuesto" />
                <Bar dataKey="consumo" fill="#3b82f6" name="Consumo">
                  {mockComparativoAreas.map((entry, index) => {
                    const porcentaje = (entry.consumo / entry.presupuesto) * 100;
                    return <Cell key={`cell-${index}`} fill={getBarColor(porcentaje)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Evolución Mensual */}
        <Card>
          <CardHeader>
            <CardTitle>Evolución Mensual</CardTitle>
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
      </div>

      {/* Alertas por Área */}
      {presupuestos.filter(p => p.porcentaje >= 75).length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Áreas que Requieren Atención
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {presupuestos
              .filter(p => p.porcentaje >= 75)
              .sort((a, b) => b.porcentaje - a.porcentaje)
              .map((presupuesto) => (
                <div key={presupuesto.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Badge variant={presupuesto.porcentaje >= 90 ? 'destructive' : 'default'}>
                      {presupuesto.area}
                    </Badge>
                    <span className="text-sm">
                      Ejecución al {presupuesto.porcentaje.toFixed(1)}% - Disponible: ${presupuesto.disponible.toLocaleString()}
                    </span>
                  </div>
                  <Button size="sm" variant="outline">Ver Detalle</Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
