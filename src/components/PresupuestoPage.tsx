import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../services/apiConfig';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Plus, Edit, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface PresupuestoPro {
  IdPresupuesto: number;
  Anio: number;
  Mes: number;
  Presupuesto: number;
  Moneda: string;
  IdArea: number;
  AreaNombre: string;
  IdCentroCosto: number | null;
  CentroCostoNombre: string | null;
  Comprometido: number;
  Ejecutado: number;
  Consumo: number;
  Disponible: number;
  PorcentajeEjecucion: number;
  EstadoAlerta: 'Normal' | 'Alerta' | 'Critico';
}

interface PresupuestoDetalle {
  IdPresupuestoDetalle: number;
  IdPresupuesto: number;
  IdMaterial: number;
  MaterialNombre: string;
  GrupoArticulos: string;
  MontoPermitido: number;
  CantidadPresupuestada: number;
  CostoUnitarioPresupuestado: number;
  MontoAsignado: number;
  MontoComprometido: number;
  MontoEjecutado: number;
}

interface Area {
  id: number;
  codigo: string;
  nombre: string;
}

export default function PresupuestoPage() {
  const { token, user } = useAuth();
  const [presupuestos, setPresupuestos] = useState<PresupuestoPro[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  
  // Estado para el visor de detalle
  const [dialogDetailOpen, setDialogDetailOpen] = useState(false);
  const [selectedPresupuesto, setSelectedPresupuesto] = useState<PresupuestoPro | null>(null);
  const [detalle, setDetalle] = useState<PresupuestoDetalle[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  
  // Estado para el formulario de nuevo presupuesto
  const [formIdPresupuesto, setFormIdPresupuesto] = useState<number | null>(null);
  const [formAnio, setFormAnio] = useState(new Date().getFullYear().toString());
  const [formMes, setFormMes] = useState((new Date().getMonth() + 1).toString());
  const [formAreaId, setFormAreaId] = useState<string>('');
  const [formMonto, setFormMonto] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const cargarPresupuestos = async () => {
    if (!token) return;
    setLoading(true);
    setErrorData(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/presupuestos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setPresupuestos(data);
      } else {
        setErrorData('Error al cargar la lista de presupuestos.');
      }
    } catch (error) {
      console.error('Error al cargar presupuestos', error);
      setErrorData('Error de conexión al cargar presupuestos.');
    } finally {
      setLoading(false);
    }
  };

  const cargarAreas = async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/areas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setAreas(data.map((a: any) => ({
          id: a.IdArea,
          codigo: a.Codigo,
          nombre: a.Nombre,
        })));
      }
    } catch (error) {
      console.error('Error al cargar áreas', error);
    }
  };

  useEffect(() => {
    cargarPresupuestos();
    cargarAreas();
  }, [token]);

  const openForm = (p?: PresupuestoPro) => {
    setFormError(null);
    if (p) {
      setFormIdPresupuesto(p.IdPresupuesto);
      setFormAnio(p.Anio.toString());
      setFormMes(p.Mes.toString());
      setFormAreaId(p.IdArea.toString());
      setFormMonto(p.Presupuesto.toString());
    } else {
      setFormIdPresupuesto(null);
      setFormAnio(new Date().getFullYear().toString());
      setFormMes((new Date().getMonth() + 1).toString());
      setFormAreaId('');
      setFormMonto('');
    }
    setDialogOpen(true);
  };

  const openDetail = async (p: PresupuestoPro) => {
    setSelectedPresupuesto(p);
    setDialogDetailOpen(true);
    setLoadingDetalle(true);
    setDetalle([]);
    try {
      const resp = await fetch(`${API_BASE_URL}/presupuestos/${p.IdPresupuesto}/detalle`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setDetalle(data);
      }
    } catch (error) {
      console.error('Error al cargar detalle de presupuesto', error);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const handleGuardarPresupuesto = async () => {
    if (!token) return;
    
    setFormError(null);
    if (!formAnio || !formMes || !formAreaId || !formMonto) {
      setFormError('Todos los campos son obligatorios');
      return;
    }
    
    const monto = Number(formMonto);
    if (isNaN(monto) || monto <= 0) {
      setFormError('El monto debe ser un valor mayor a cero');
      return;
    }

    setIsSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/presupuestos/guardar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          idPresupuesto: formIdPresupuesto,
          anio: Number(formAnio),
          mes: Number(formMes),
          idArea: Number(formAreaId),
          montoTotal: monto,
        }),
      });

      if (resp.ok) {
        setDialogOpen(false);
        cargarPresupuestos();
        setFormMonto('');
      } else {
        const err = await resp.json();
        setFormError(err.message || 'Error al guardar presupuesto');
      }
    } catch (error) {
      console.error('Error al guardar presupuesto', error);
      setFormError('Error de conexión con el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPresupuestos = useMemo(() => {
    if (!searchTerm) return presupuestos;
    const term = searchTerm.toLowerCase();
    return presupuestos.filter(p => p.AreaNombre.toLowerCase().includes(term));
  }, [presupuestos, searchTerm]);

  const stats = useMemo(() => {
    const totalP = filteredPresupuestos.reduce((sum, p) => sum + p.Presupuesto, 0);
    const totalC = filteredPresupuestos.reduce((sum, p) => sum + p.Consumo, 0);
    const totalD = totalP - totalC;
    const porc = totalP > 0 ? (totalC / totalP) * 100 : 0;
    const alertas = filteredPresupuestos.filter(p => p.EstadoAlerta !== 'Normal').length;

    return { totalP, totalC, totalD, porc, alertas };
  }, [filteredPresupuestos]);

  const chartData = useMemo(() => {
    return filteredPresupuestos.map(p => ({
      name: p.AreaNombre.substring(0, 10) + (p.AreaNombre.length > 10 ? '...' : ''),
      presupuesto: p.Presupuesto,
      consumo: p.Consumo
    }));
  }, [filteredPresupuestos]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Balance Maestro</h1>
          <p className="text-muted-foreground mt-1">
            Gestión transaccional y control de ejecución en tiempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => openForm()}>
              <Plus className="w-4 h-4 mr-2" />
              Definir Nuevo Presupuesto
            </Button>
            <DialogContent className="w-[95vw] max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{formIdPresupuesto ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</DialogTitle>
                <DialogDescription>
                  Establece el límite de gasto para un área y período.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {formError && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                    {formError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Año</Label>
                    <Select value={formAnio} onValueChange={setFormAnio}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mes</Label>
                    <Select value={formMes} onValueChange={setFormMes}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 12}, (_, i) => (
                           <SelectItem key={i+1} value={(i+1).toString()}>
                             {new Date(0, i).toLocaleString('es', {month: 'long'})}
                           </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Área Responsable</Label>
                  <Select value={formAreaId} onValueChange={setFormAreaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el área" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={a.id.toString()}>{a.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monto Total Autorizado ($)</Label>
                  <Input 
                    type="number" 
                    value={formMonto} 
                    onChange={e => setFormMonto(e.target.value)}
                    placeholder="Ej: 50000.00"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                <Button onClick={handleGuardarPresupuesto} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {formIdPresupuesto ? 'Actualizar' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : errorData ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center h-[400px]">
          <AlertTriangle className="h-10 w-10 text-red-500 mb-4" />
          <h3 className="text-lg font-medium">Error al cargar datos</h3>
          <p className="text-muted-foreground mt-2">{errorData}</p>
          <Button onClick={cargarPresupuestos} variant="outline" className="mt-4">
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Presupuesto Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats.totalP.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Monto total autorizado para el ciclo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Consumo Acumulado</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats.totalC.toLocaleString()}</div>
                <div className="flex items-center pt-1">
                  <div className="w-full bg-secondary rounded-full h-2 mr-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(stats.porc, 100)}%` }} />
                  </div>
                  <span className="text-xs font-medium">{stats.porc.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Disponible</CardTitle>
                <TrendingDown className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">${stats.totalD.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Remanente para operaciones</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Áreas en Alerta</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${stats.alertas > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stats.alertas > 0 ? 'text-red-600' : ''}`}>{stats.alertas}</div>
                <p className="text-xs text-muted-foreground">Ejecución mayor al 80%</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Ejecución por Área</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    <Bar dataKey="presupuesto" name="Presupuesto" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="consumo" name="Consumo Real" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Alertas de Ejecución</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredPresupuestos.filter(p => p.EstadoAlerta !== 'Normal').map((p) => (
                    <div key={p.IdPresupuesto} className="flex items-center p-3 border rounded-lg bg-red-50/50">
                      <div className={`mr-4 h-2 w-2 rounded-full ${p.EstadoAlerta === 'Critico' ? 'bg-red-600' : 'bg-yellow-500'}`} />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{p.AreaNombre}</p>
                        <p className="text-xs text-muted-foreground">
                          Ejecución al {p.PorcentajeEjecucion.toFixed(1)}% - Disp: ${p.Disponible.toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={p.EstadoAlerta === 'Critico' ? 'destructive' : 'outline'}>
                        {p.EstadoAlerta}
                      </Badge>
                    </div>
                  ))}
                  {filteredPresupuestos.filter(p => p.EstadoAlerta !== 'Normal').length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                        <TrendingDown className="h-6 w-6 text-emerald-600" />
                      </div>
                      <p className="text-sm font-medium">Todas las áreas bajo control</p>
                      <p className="text-xs text-muted-foreground">No hay alertas de presupuesto pendientes</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Presupuestos por Área</CardTitle>
              <div className="w-full sm:w-64">
                <Input
                  placeholder="Buscar por área..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                    <TableHead>Área</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Presupuesto</TableHead>
                    <TableHead className="text-right">Consumo</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-center">% Ejecución</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPresupuestos.map((p) => (
                    <TableRow key={p.IdPresupuesto}>
                      <TableCell className="font-medium">{p.AreaNombre}</TableCell>
                      <TableCell>{p.Anio} - Mes {p.Mes}</TableCell>
                      <TableCell className="text-right font-semibold">${p.Presupuesto.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium text-primary">${p.Consumo.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-medium ${p.Disponible < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ${p.Disponible.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                           <div className="w-16 bg-secondary rounded-full h-1.5 hidden md:block">
                             <div 
                               className={`h-1.5 rounded-full ${p.PorcentajeEjecucion > 90 ? 'bg-red-500' : p.PorcentajeEjecucion > 70 ? 'bg-yellow-500' : 'bg-emerald-500'}`} 
                               style={{ width: `${Math.min(p.PorcentajeEjecucion, 100)}%` }} 
                             />
                           </div>
                           <span className="text-xs">{p.PorcentajeEjecucion.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={
                          p.EstadoAlerta === 'Critico' ? 'destructive' : 
                          p.EstadoAlerta === 'Alerta' ? 'default' : 'secondary'
                        } className={p.EstadoAlerta === 'Alerta' ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-0' : ''}>
                          {p.EstadoAlerta}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openDetail(p)}>
                           <Eye className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openForm(p)}>
                           <Edit className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPresupuestos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {presupuestos.length === 0 ? 'No hay presupuestos definidos.' : 'No se encontraron presupuestos en esta búsqueda.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal de Detalle de Presupuesto */}
      <Dialog open={dialogDetailOpen} onOpenChange={setDialogDetailOpen}>
        <DialogContent className="w-[95vw] max-w-[800px] sm:max-h-[85vh] overflow-hidden flex flex-col p-0">
          <div className="px-6 pb-2 pt-6 dialog-header shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                Detalle de Presupuesto
                {selectedPresupuesto && (
                  <Badge variant="outline" className="ml-2">
                    {selectedPresupuesto.AreaNombre}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedPresupuesto && `Período: ${selectedPresupuesto.Anio} - Mes ${selectedPresupuesto.Mes}`}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {selectedPresupuesto && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Monto Asignado</p>
                  <p className="font-semibold text-lg">${selectedPresupuesto.Presupuesto.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Consumo Total</p>
                  <p className="font-semibold text-lg text-primary">${selectedPresupuesto.Consumo.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Disponible</p>
                  <p className={`font-semibold text-lg ${selectedPresupuesto.Disponible < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    ${selectedPresupuesto.Disponible.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Estado</p>
                  <Badge variant={
                    selectedPresupuesto.EstadoAlerta === 'Critico' ? 'destructive' : 
                    selectedPresupuesto.EstadoAlerta === 'Alerta' ? 'default' : 'secondary'
                  } className={`mt-0.5 ${selectedPresupuesto.EstadoAlerta === 'Alerta' ? 'bg-yellow-500 text-white' : ''}`}>
                    {selectedPresupuesto.EstadoAlerta}
                  </Badge>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-3">Distribución por Material o Concepto</h3>
              {loadingDetalle ? (
                <div className="flex shrink-0 justify-center items-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : detalle.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Material / Grupo</TableHead>
                        <TableHead className="text-right">Permitido</TableHead>
                        <TableHead className="text-right">Ejecutado</TableHead>
                        <TableHead className="text-right">Progreso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.map(d => {
                        const progreso = d.MontoPermitido > 0 ? (d.MontoEjecutado / d.MontoPermitido) * 100 : 0;
                        return (
                          <TableRow key={d.IdPresupuestoDetalle}>
                            <TableCell className="font-medium text-sm">
                              {d.MaterialNombre || d.GrupoArticulos || 'General'}
                            </TableCell>
                            <TableCell className="text-right">${d.MontoPermitido.toLocaleString()}</TableCell>
                            <TableCell className="text-right">${d.MontoEjecutado.toLocaleString()}</TableCell>
                            <TableCell className="w-[120px] text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <span className="text-xs">{progreso.toFixed(1)}%</span>
                                <div className="w-12 bg-secondary rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full ${progreso > 90 ? 'bg-red-500' : progreso > 70 ? 'bg-yellow-500' : 'bg-primary'}`} 
                                    style={{ width: `${Math.min(progreso, 100)}%` }} 
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 bg-muted/20 rounded-md border border-dashed">
                  <p className="text-muted-foreground text-sm">No se han registrado detalles o asignaciones específicas para este presupuesto.</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="px-6 py-4 border-t shrink-0">
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogDetailOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
