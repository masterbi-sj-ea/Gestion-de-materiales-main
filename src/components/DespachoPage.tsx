import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Truck, Package, CheckCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface ItemSolicitud {
  id: string;
  materialId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidadSolicitada: number;
  cantidadDespachada: number;
  stock: number;
}

interface Solicitud {
  id: string;
  numero: string;
  fecha: string;
  area: string;
  solicitante: string;
  items: ItemSolicitud[];
  observaciones?: string;
}

const mockSolicitudesAprobadas: Solicitud[] = [
  {
    id: '1',
    numero: 'SOL-2025-002',
    fecha: '2025-06-14',
    area: 'Producción A',
    solicitante: 'Juan Pérez',
    items: [
      { id: '1', materialId: 'M1', codigo: 'MAT-001', descripcion: 'Tornillos M6 x 20mm', unidad: 'Unidad', cantidadSolicitada: 500, cantidadDespachada: 0, stock: 1250 },
      { id: '2', materialId: 'M2', codigo: 'MAT-002', descripcion: 'Pintura Industrial Blanca', unidad: 'Galón', cantidadSolicitada: 10, cantidadDespachada: 0, stock: 85 },
      { id: '3', materialId: 'M3', codigo: 'MAT-004', descripcion: 'Aceite Lubricante SAE 40', unidad: 'Litro', cantidadSolicitada: 25, cantidadDespachada: 0, stock: 450 },
    ]
  },
  {
    id: '2',
    numero: 'SOL-2025-010',
    fecha: '2025-06-16',
    area: 'Mantenimiento',
    solicitante: 'Carlos Ruiz',
    items: [
      { id: '4', materialId: 'M5', codigo: 'MAT-005', descripcion: 'Cable Eléctrico 12 AWG', unidad: 'Metro', cantidadSolicitada: 150, cantidadDespachada: 0, stock: 680 },
      { id: '5', materialId: 'M3', codigo: 'MAT-003', descripcion: 'Rodamiento 6205-2RS', unidad: 'Unidad', cantidadSolicitada: 20, cantidadDespachada: 0, stock: 320 },
    ]
  },
];

export default function DespachoPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>(mockSolicitudesAprobadas);
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [editedItems, setEditedItems] = useState<Record<string, number>>({});
  const [observacionesDespacho, setObservacionesDespacho] = useState('');

  const handleOpenDespacho = (solicitud: Solicitud) => {
    setSelectedSolicitud(solicitud);
    // Inicializar con las cantidades solicitadas
    const initialItems: Record<string, number> = {};
    solicitud.items.forEach(item => {
      initialItems[item.id] = item.cantidadSolicitada;
    });
    setEditedItems(initialItems);
    setObservacionesDespacho('');
  };

  const handleCantidadChange = (itemId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditedItems({
      ...editedItems,
      [itemId]: numValue
    });
  };

  const handleDespachar = (tipo: 'total' | 'parcial') => {
    if (!selectedSolicitud) return;

    // Validar que las cantidades no excedan el stock ni lo solicitado
    for (const item of selectedSolicitud.items) {
      const cantidadADespachar = editedItems[item.id] || 0;
      if (cantidadADespachar > item.cantidadSolicitada) {
        alert(`La cantidad a despachar de ${item.descripcion} no puede exceder lo solicitado`);
        return;
      }
      if (cantidadADespachar > item.stock) {
        alert(`No hay suficiente stock de ${item.descripcion}`);
        return;
      }
    }

    console.log('Despachando solicitud:', {
      solicitud: selectedSolicitud.numero,
      tipo,
      items: editedItems,
      observaciones: observacionesDespacho
    });

    setSolicitudes(solicitudes.filter(s => s.id !== selectedSolicitud.id));
    setSelectedSolicitud(null);
    alert(`Despacho ${tipo} registrado exitosamente`);
  };

  const getTotalItems = (items: ItemSolicitud[]) => {
    return items.reduce((sum, item) => sum + item.cantidadSolicitada, 0);
  };

  const esDespachoCompleto = () => {
    if (!selectedSolicitud) return false;
    return selectedSolicitud.items.every(item => 
      editedItems[item.id] === item.cantidadSolicitada
    );
  };

  const hayCantidadesPendientes = () => {
    if (!selectedSolicitud) return false;
    return selectedSolicitud.items.some(item => 
      (editedItems[item.id] || 0) < item.cantidadSolicitada
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Despacho de Bodega</h1>
        <p className="text-muted-foreground mt-1">
          Gestión de despachos de solicitudes aprobadas
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Por Despachar</CardTitle>
            <Truck className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{solicitudes.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Solicitudes aprobadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Items Totales</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {solicitudes.reduce((sum, s) => sum + getTotalItems(s.items), 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Unidades por despachar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Despachados Hoy</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">8</div>
            <p className="text-xs text-muted-foreground mt-1">
              Despachos completados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Solicitudes */}
      <Card>
        <CardHeader>
          <CardTitle>Solicitudes Aprobadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitudes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No hay solicitudes pendientes de despacho
                    </TableCell>
                  </TableRow>
                ) : (
                  solicitudes.map((solicitud) => (
                    <TableRow key={solicitud.id}>
                      <TableCell className="font-medium">{solicitud.numero}</TableCell>
                      <TableCell>{new Date(solicitud.fecha).toLocaleDateString()}</TableCell>
                      <TableCell>{solicitud.area}</TableCell>
                      <TableCell>{solicitud.solicitante}</TableCell>
                      <TableCell className="text-center">{solicitud.items.length}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleOpenDespacho(solicitud)}
                        >
                          <Truck className="w-4 h-4 mr-2" />
                          Despachar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Despacho */}
      <Dialog open={!!selectedSolicitud} onOpenChange={() => {
        setSelectedSolicitud(null);
        setEditedItems({});
        setObservacionesDespacho('');
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Despacho</DialogTitle>
            <DialogDescription>
              {selectedSolicitud?.numero} - {selectedSolicitud?.area}
            </DialogDescription>
          </DialogHeader>

          {selectedSolicitud && (
            <div className="space-y-4">
              {/* Información de la solicitud */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Solicitante</div>
                  <div className="font-medium">{selectedSolicitud.solicitante}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Fecha Solicitud</div>
                  <div className="font-medium">
                    {new Date(selectedSolicitud.fecha).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Tabla de Items */}
              <div>
                <Label className="mb-2 block">Materiales a Despachar</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Solicitado</TableHead>
                        <TableHead className="text-center">Stock</TableHead>
                        <TableHead className="text-center">A Despachar</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSolicitud.items.map((item) => {
                        const cantidadADespachar = editedItems[item.id] || 0;
                        const excedeStock = cantidadADespachar > item.stock;
                        const excedeSolicitado = cantidadADespachar > item.cantidadSolicitada;
                        
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.codigo}</TableCell>
                            <TableCell>{item.descripcion}</TableCell>
                            <TableCell className="text-center">
                              {item.cantidadSolicitada} {item.unidad}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={item.stock >= item.cantidadSolicitada ? 'secondary' : 'destructive'}>
                                {item.stock}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                max={Math.min(item.cantidadSolicitada, item.stock)}
                                value={editedItems[item.id] || 0}
                                onChange={(e) => handleCantidadChange(item.id, e.target.value)}
                                className="w-24 text-center"
                              />
                            </TableCell>
                            <TableCell>
                              {excedeStock && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Sin stock
                                </Badge>
                              )}
                              {!excedeStock && excedeSolicitado && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Excede
                                </Badge>
                              )}
                              {!excedeStock && !excedeSolicitado && cantidadADespachar === item.cantidadSolicitada && (
                                <Badge variant="secondary" className="gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Completo
                                </Badge>
                              )}
                              {!excedeStock && !excedeSolicitado && cantidadADespachar > 0 && cantidadADespachar < item.cantidadSolicitada && (
                                <Badge className="gap-1 bg-yellow-100 text-yellow-700">
                                  Parcial
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Alertas */}
              {hayCantidadesPendientes() && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Hay items con cantidades pendientes. Este será un despacho parcial.
                  </AlertDescription>
                </Alert>
              )}

              {/* Observaciones */}
              <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones del Despacho</Label>
                <Textarea
                  id="observaciones"
                  placeholder="Ingresa observaciones sobre el despacho..."
                  value={observacionesDespacho}
                  onChange={(e) => setObservacionesDespacho(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedSolicitud(null);
                setEditedItems({});
                setObservacionesDespacho('');
              }}
            >
              Cancelar
            </Button>
            {hayCantidadesPendientes() && (
              <Button
                variant="outline"
                className="border-yellow-600 text-yellow-700 hover:bg-yellow-50"
                onClick={() => handleDespachar('parcial')}
              >
                <Package className="w-4 h-4 mr-2" />
                Despacho Parcial
              </Button>
            )}
            <Button
              onClick={() => handleDespachar('total')}
              disabled={!esDespachoCompleto()}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Despacho Completo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
