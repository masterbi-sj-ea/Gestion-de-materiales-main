import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { sileo } from 'sileo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Mail, Clock, Edit, Trash2, FileBarChart, Download, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface ConfiguracionReporte {
  id: string;
  nombre: string;
  tipo: 'consumo' | 'presupuesto' | 'solicitudes' | 'inventario';
  frecuencia: 'diario' | 'semanal' | 'mensual';
  hora: string;
  destinatarios: string[];
  activo: boolean;
  ultimoEnvio?: string;
}

const mockReportes: ConfiguracionReporte[] = [
  {
    id: '1',
    nombre: 'Reporte Diario de Solicitudes',
    tipo: 'solicitudes',
    frecuencia: 'diario',
    hora: '08:00',
    destinatarios: ['jefe@empresa.com', 'admin@empresa.com'],
    activo: true,
    ultimoEnvio: '2025-06-17 08:00'
  },
  {
    id: '2',
    nombre: 'Resumen Semanal de Presupuesto',
    tipo: 'presupuesto',
    frecuencia: 'semanal',
    hora: '09:00',
    destinatarios: ['admin@empresa.com', 'finanzas@empresa.com'],
    activo: true,
    ultimoEnvio: '2025-06-15 09:00'
  },
  {
    id: '3',
    nombre: 'Reporte Mensual de Consumo',
    tipo: 'consumo',
    frecuencia: 'mensual',
    hora: '10:00',
    destinatarios: ['admin@empresa.com', 'gerencia@empresa.com'],
    activo: true,
    ultimoEnvio: '2025-06-01 10:00'
  },
  {
    id: '4',
    nombre: 'Alerta de Inventario Bajo',
    tipo: 'inventario',
    frecuencia: 'diario',
    hora: '07:00',
    destinatarios: ['bodega@empresa.com', 'compras@empresa.com'],
    activo: false,
    ultimoEnvio: '2025-06-16 07:00'
  },
];

const tipoReporteOptions = [
  { value: 'consumo', label: 'Consumo por Área' },
  { value: 'presupuesto', label: 'Ejecución Presupuestaria' },
  { value: 'solicitudes', label: 'Estado de Solicitudes' },
  { value: 'inventario', label: 'Control de Inventario' },
];

const frecuenciaOptions = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal (Lunes)' },
  { value: 'mensual', label: 'Mensual (Día 1)' },
];

export default function ReportesPage() {
  const [reportes, setReportes] = useState<ConfiguracionReporte[]>(mockReportes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReporte, setEditingReporte] = useState<ConfiguracionReporte | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; item: string | null }>({ open: false, item: null });
  const [formData, setFormData] = useState({
    nombre: '',
    tipo: 'consumo',
    frecuencia: 'diario',
    hora: '08:00',
    destinatarios: '',
    activo: true
  });

  const handleOpenDialog = (reporte?: ConfiguracionReporte) => {
    if (reporte) {
      setEditingReporte(reporte);
      setFormData({
        nombre: reporte.nombre,
        tipo: reporte.tipo,
        frecuencia: reporte.frecuencia,
        hora: reporte.hora,
        destinatarios: reporte.destinatarios.join(', '),
        activo: reporte.activo
      });
    } else {
      setEditingReporte(null);
      setFormData({
        nombre: '',
        tipo: 'consumo',
        frecuencia: 'diario',
        hora: '08:00',
        destinatarios: '',
        activo: true
      });
    }
    setDialogOpen(true);
  };

  const handleGuardar = () => {
    console.log('Guardando configuración de reporte:', formData);
    sileo.success({
      title: 'Configuración guardada exitosamente',
      description: 'Los cambios se han guardado correctamente.',
    });
    setDialogOpen(false);
  };

  const handleToggleActivo = (id: string, activo: boolean) => {
    setReportes(reportes.map(r => 
      r.id === id ? { ...r, activo } : r
    ));
  };

  const handleEliminar = (id: string) => {
    setConfirmDelete({ open: true, item: id });
  };

  const confirmEliminar = () => {
    if (confirmDelete.item) {
      setReportes(reportes.filter(r => r.id !== confirmDelete.item));
      sileo.success({
        title: 'Reporte eliminado',
        description: 'La configuración del reporte fue eliminada con éxito.',
      });
    }
    setConfirmDelete({ open: false, item: null });
  };

  const handleGenerarManual = (reporte: ConfiguracionReporte) => {
    console.log('Generando reporte manual:', reporte);
    sileo.info({
      title: `Generando ${reporte.nombre}...`,
      description: 'El reporte se está generando y será enviado a los destinatarios.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Diálogo de Confirmación de Eliminación Pro-Level Responsivo */}
      <Dialog open={confirmDelete.open} onOpenChange={(open) => !open && setConfirmDelete({ open: false, item: null })}>
        <DialogContent className="sm:max-w-md w-[90vw] md:w-full rounded-2xl p-0 overflow-hidden border-destructive/20 shadow-2xl">
          <div className="bg-destructive/10 p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-destructive/20 rounded-full p-4 mb-4">
              <AlertTriangle className="h-10 w-10 text-destructive shadow-sm" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-bold text-destructive mb-2">
              ¿Eliminar reporte?
            </DialogTitle>
            <DialogDescription className="text-base text-destructive/80 font-medium">
              Esta acción es irreversible. ¿Deseas eliminar definitivamente este reporte automático?
            </DialogDescription>
          </div>

          <DialogFooter className="px-6 py-4 bg-background/50 border-t flex justify-center">
            <Button
              variant="destructive"
              onClick={confirmEliminar}
              className="w-full sm:w-2/3 rounded-xl h-11 font-bold shadow-md hover:shadow-lg transition-all"
            >
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Configuración de Reportes</h1>
          <p className="text-muted-foreground mt-1">
            Automatiza el envío de reportes por correo electrónico
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Reporte
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingReporte ? 'Editar Reporte Automático' : 'Nuevo Reporte Automático'}
              </DialogTitle>
              <DialogDescription>
                Configura el envío automático de reportes
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del Reporte</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Reporte Diario de Solicitudes"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Reporte</Label>
                  <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value as any })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tipoReporteOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frecuencia">Frecuencia</Label>
                  <Select value={formData.frecuencia} onValueChange={(value) => setFormData({ ...formData, frecuencia: value as any })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frecuenciaOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hora">Hora de Envío</Label>
                <Input
                  id="hora"
                  type="time"
                  value={formData.hora}
                  onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destinatarios">Destinatarios</Label>
                <Input
                  id="destinatarios"
                  placeholder="email1@empresa.com, email2@empresa.com"
                  value={formData.destinatarios}
                  onChange={(e) => setFormData({ ...formData, destinatarios: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Separa múltiples correos con comas
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="activo"
                  checked={formData.activo}
                  onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                />
                <Label htmlFor="activo">Activar reporte automático</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGuardar}>
                Guardar Configuración
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Reportes</CardTitle>
            <FileBarChart className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{reportes.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Configurados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Activos</CardTitle>
            <Clock className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-green-600">
              {reportes.filter(r => r.activo).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              En ejecución
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Enviados Hoy</CardTitle>
            <Mail className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {reportes.filter(r => r.frecuencia === 'diario' && r.activo).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Reportes diarios
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Próximo Envío</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">07:00</div>
            <p className="text-xs text-muted-foreground mt-1">
              Mañana
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Reportes */}
      <Card>
        <CardHeader>
          <CardTitle>Reportes Configurados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Destinatarios</TableHead>
                  <TableHead>Último Envío</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No hay reportes configurados
                    </TableCell>
                  </TableRow>
                ) : (
                  reportes.map((reporte) => (
                    <TableRow key={reporte.id}>
                      <TableCell className="font-medium">{reporte.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {tipoReporteOptions.find(t => t.value === reporte.tipo)?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {frecuenciaOptions.find(f => f.value === reporte.frecuencia)?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{reporte.hora}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {reporte.destinatarios.slice(0, 2).map((email, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {email}
                            </Badge>
                          ))}
                          {reporte.destinatarios.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{reporte.destinatarios.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {reporte.ultimoEnvio ? new Date(reporte.ultimoEnvio).toLocaleString() : 'Nunca'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={reporte.activo}
                          onCheckedChange={(checked) => handleToggleActivo(reporte.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleGenerarManual(reporte)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDialog(reporte)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEliminar(reporte.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Información Adicional */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-5 h-5 text-blue-600" />
            Información de Reportes Automáticos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Los reportes se envían automáticamente según la configuración establecida</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Puedes generar reportes manualmente haciendo clic en el botón de descarga</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Los reportes incluyen gráficos, tablas y resúmenes ejecutivos</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Los destinatarios recibirán el reporte en formato PDF adjunto por correo electrónico</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
