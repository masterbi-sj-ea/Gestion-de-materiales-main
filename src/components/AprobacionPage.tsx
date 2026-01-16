import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CheckCircle, XCircle, Eye, Clock, AlertCircle, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Solicitud {
  id: string;
  numero: string;
  fecha: string;
  area: string;
  solicitante: string;
  items: number;
  total: number;
  presupuestoArea: number;
  consumoAcumulado: number;
  excedePresupuesto: boolean;
}

const mockSolicitudesPendientes: Solicitud[] = [
  { id: '1', numero: 'SOL-2025-001', fecha: '2025-06-15', area: 'Producción A', solicitante: 'Juan Pérez', items: 5, total: 12500, presupuestoArea: 150000, consumoAcumulado: 125000, excedePresupuesto: false },
  { id: '2', numero: 'SOL-2025-008', fecha: '2025-06-16', area: 'Producción B', solicitante: 'María López', items: 8, total: 28000, presupuestoArea: 120000, consumoAcumulado: 98000, excedePresupuesto: true },
  { id: '3', numero: 'SOL-2025-009', fecha: '2025-06-16', area: 'Mantenimiento', solicitante: 'Carlos Ruiz', items: 4, total: 7800, presupuestoArea: 80000, consumoAcumulado: 65000, excedePresupuesto: false },
];

const mockSolicitudesAprobadas: Solicitud[] = [
  { id: '4', numero: 'SOL-2025-002', fecha: '2025-06-14', area: 'Producción A', solicitante: 'Juan Pérez', items: 3, total: 8900, presupuestoArea: 150000, consumoAcumulado: 125000, excedePresupuesto: false },
  { id: '5', numero: 'SOL-2025-006', fecha: '2025-06-13', area: 'Calidad', solicitante: 'Ana Torres', items: 6, total: 11200, presupuestoArea: 50000, consumoAcumulado: 38000, excedePresupuesto: false },
];

const mockSolicitudesRechazadas: Solicitud[] = [
  { id: '6', numero: 'SOL-2025-005', fecha: '2025-06-11', area: 'Mantenimiento', solicitante: 'Carlos Ruiz', items: 6, total: 18500, presupuestoArea: 80000, consumoAcumulado: 75000, excedePresupuesto: true },
];

export default function AprobacionPage() {
  const [pendientes, setPendientes] = useState<Solicitud[]>(mockSolicitudesPendientes);
  const [aprobadas] = useState<Solicitud[]>(mockSolicitudesAprobadas);
  const [rechazadas] = useState<Solicitud[]>(mockSolicitudesRechazadas);
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [modalAction, setModalAction] = useState<'aprobar' | 'rechazar' | null>(null);
  const [comentario, setComentario] = useState('');

  const handleOpenModal = (solicitud: Solicitud, action: 'aprobar' | 'rechazar') => {
    setSelectedSolicitud(solicitud);
    setModalAction(action);
    setComentario('');
  };

  const handleConfirmarAccion = () => {
    if (modalAction === 'rechazar' && !comentario.trim()) {
      alert('Debes ingresar un comentario al rechazar la solicitud');
      return;
    }

    console.log(`${modalAction} solicitud:`, selectedSolicitud, comentario);
    
    if (modalAction === 'aprobar') {
      setPendientes(pendientes.filter(s => s.id !== selectedSolicitud?.id));
      alert('Solicitud aprobada exitosamente');
    } else {
      setPendientes(pendientes.filter(s => s.id !== selectedSolicitud?.id));
      alert('Solicitud rechazada');
    }

    setSelectedSolicitud(null);
    setModalAction(null);
    setComentario('');
  };

  const renderTable = (solicitudes: Solicitud[], showActions: boolean = false) => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>Solicitante</TableHead>
            <TableHead className="text-center">Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado Presup.</TableHead>
            {showActions && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {solicitudes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showActions ? 8 : 7} className="text-center py-12 text-muted-foreground">
                No hay solicitudes en este estado
              </TableCell>
            </TableRow>
          ) : (
            solicitudes.map((solicitud) => {
              const disponible = solicitud.presupuestoArea - solicitud.consumoAcumulado;
              const saldoDespues = disponible - solicitud.total;
              
              return (
                <TableRow key={solicitud.id}>
                  <TableCell className="font-medium">{solicitud.numero}</TableCell>
                  <TableCell>{new Date(solicitud.fecha).toLocaleDateString()}</TableCell>
                  <TableCell>{solicitud.area}</TableCell>
                  <TableCell>{solicitud.solicitante}</TableCell>
                  <TableCell className="text-center">{solicitud.items}</TableCell>
                  <TableCell className="text-right">${solicitud.total.toLocaleString()}</TableCell>
                  <TableCell>
                    {solicitud.excedePresupuesto ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Excede
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        OK
                      </Badge>
                    )}
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedSolicitud(solicitud)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => handleOpenModal(solicitud, 'aprobar')}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleOpenModal(solicitud, 'rechazar')}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Gestión de Aprobaciones</h1>
        <p className="text-muted-foreground mt-1">
          Revisar y aprobar solicitudes de materiales
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Pendientes</CardTitle>
            <Clock className="w-4 h-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{pendientes.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Requieren revisión
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Aprobadas Hoy</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{aprobadas.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: ${aprobadas.reduce((sum, s) => sum + s.total, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Rechazadas</CardTitle>
            <XCircle className="w-4 h-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{rechazadas.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Esta semana
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="pendientes">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pendientes">
                Pendientes ({pendientes.length})
              </TabsTrigger>
              <TabsTrigger value="aprobadas">
                Aprobadas ({aprobadas.length})
              </TabsTrigger>
              <TabsTrigger value="rechazadas">
                Rechazadas ({rechazadas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes" className="mt-6">
              {renderTable(pendientes, true)}
            </TabsContent>

            <TabsContent value="aprobadas" className="mt-6">
              {renderTable(aprobadas, false)}
            </TabsContent>

            <TabsContent value="rechazadas" className="mt-6">
              {renderTable(rechazadas, false)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modal de Acción */}
      <Dialog open={!!modalAction} onOpenChange={() => {
        setModalAction(null);
        setSelectedSolicitud(null);
        setComentario('');
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {modalAction === 'aprobar' ? 'Aprobar Solicitud' : 'Rechazar Solicitud'}
            </DialogTitle>
            <DialogDescription>
              {selectedSolicitud?.numero}
            </DialogDescription>
          </DialogHeader>

          {selectedSolicitud && (
            <div className="space-y-4">
              {/* Información de la solicitud */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Área</div>
                  <div className="font-medium">{selectedSolicitud.area}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Solicitante</div>
                  <div className="font-medium">{selectedSolicitud.solicitante}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Items</div>
                  <div className="font-medium">{selectedSolicitud.items}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="font-medium">${selectedSolicitud.total.toLocaleString()}</div>
                </div>
              </div>

              {/* Análisis presupuestario */}
              <Card className={selectedSolicitud.excedePresupuesto ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Análisis Presupuestario
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Presupuesto área:</span>
                    <span className="font-medium">${selectedSolicitud.presupuestoArea.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Consumo acumulado:</span>
                    <span className="font-medium">${selectedSolicitud.consumoAcumulado.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Disponible actual:</span>
                    <span className="font-medium text-green-600">
                      ${(selectedSolicitud.presupuestoArea - selectedSolicitud.consumoAcumulado).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">Saldo después de aprobación:</span>
                    <span className={`font-medium ${selectedSolicitud.excedePresupuesto ? 'text-red-600' : 'text-blue-600'}`}>
                      ${(selectedSolicitud.presupuestoArea - selectedSolicitud.consumoAcumulado - selectedSolicitud.total).toLocaleString()}
                    </span>
                  </div>
                  {selectedSolicitud.excedePresupuesto && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Esta solicitud excede el presupuesto disponible del área
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Comentario */}
              {modalAction === 'rechazar' && (
                <div className="space-y-2">
                  <Label htmlFor="comentario">
                    Motivo del Rechazo <span className="text-red-600">*</span>
                  </Label>
                  <Textarea
                    id="comentario"
                    placeholder="Ingresa el motivo del rechazo..."
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    rows={4}
                  />
                </div>
              )}

              {modalAction === 'aprobar' && (
                <div className="space-y-2">
                  <Label htmlFor="comentario">Comentario Opcional</Label>
                  <Textarea
                    id="comentario"
                    placeholder="Ingresa algún comentario si lo deseas..."
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setModalAction(null);
                setSelectedSolicitud(null);
                setComentario('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarAccion}
              className={modalAction === 'rechazar' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {modalAction === 'aprobar' ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aprobar
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Rechazar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
