import { useState, useEffect } from 'react';
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
import { useAuth } from '../hooks/useAuth'; // Importar useAuth
import { toast } from 'sonner'; // Importar toast para notificaciones
import { useReactToPrint } from 'react-to-print'; // Importar hook para imprimir
import { RequisaPrint } from './prints/RequisaPrint'; // Importar componente de impresión
import { useRef } from 'react'; // Importar useRef
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'; // Importar Tabs

// Interfaces actualizadas para coincidir con el backend
interface ItemSolicitudDetalle {
  IdDetalleSolicitud: number;
  IdMaterial: number;
  Codigo: string;
  Descripcion: string;
  UnidadMedida: string;
  CantidadSolicitada: number;
  CantidadAprobada: number | null;
  EnStock: number;
}

interface SolicitudPendiente {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  AreaNombre: string;
  NombreSolicitante: string;
  ItemsTotal: number;
}

interface SolicitudDetallada {
  cabecera: {
    IdSolicitud: number;
    CodigoSolicitud: string;
    FechaSolicitud: string;
    AreaNombre: string;
    CodigoCentroCosto?: string; // Nuevo
    NombreSolicitante: string;
    ComentarioSolicitud: string | null;
    Estado: string;
  };
  detalle: ItemSolicitudDetalle[];
}

// Interfaz para los datos de impresión
interface DespachoPrintData {
  CodigoDespacho: string;
  FechaDespacho: string;
  CodigoSolicitud: string;
  AreaNombre: string;
  CodigoCentroCosto?: string; // Nuevo
  NombreSolicitante: string;
  Observaciones: string | null;
  Detalles: {
    Codigo: string;
    Descripcion: string;
    UnidadMedida: string;
    CantidadDespachada: number;
  }[];
}


export default function DespachoPage() {
  const { token } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  const [historial, setHistorial] = useState<SolicitudPendiente[]>([]);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [selectedSolicitud, setSelectedSolicitud] = useState<SolicitudDetallada | null>(null);
  const [editedItems, setEditedItems] = useState<Record<number, number>>({});
  const [observacionesDespacho, setObservacionesDespacho] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [printData, setPrintData] = useState<DespachoPrintData | null>(null); // Estado para datos de impresión

  const printComponentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printComponentRef,
    onAfterPrint: () => setPrintData(null), // Limpiar datos después de imprimir
  });

  useEffect(() => {
    if (printData) {
      handlePrint();
    }
  }, [printData, handlePrint]);

  useEffect(() => {
    const cargarSolicitudesPendientes = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch('http://localhost:4000/api/despachos/pendientes', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error('Error al cargar las solicitudes pendientes');
        }
        const data: SolicitudPendiente[] = await response.json();
        setSolicitudes(data);
      } catch (error) {
        console.error(error);
        toast.error('No se pudieron cargar las solicitudes para despacho.');
      } finally {
        setLoading(false);
      }
    };

    cargarSolicitudesPendientes();
  }, [token]);

  useEffect(() => {
    const cargarHistorial = async () => {
      if (!token || activeTab !== 'historial') return;
      setLoadingHistorial(true);
      try {
        const response = await fetch('http://localhost:4000/api/despachos/historial', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Error al cargar historial');
        const data = await response.json();
        setHistorial(data);
      } catch (error) {
        console.error(error);
        toast.error('Error cargando historial de despachos');
      } finally {
        setLoadingHistorial(false);
      }
    };
    cargarHistorial();
  }, [token, activeTab]);

  const handleOpenDespacho = async (solicitud: SolicitudPendiente) => {
    if (!token) return;
    setModalLoading(true);
    setSelectedSolicitud(null); // Limpiar estado anterior
    try {
      const response = await fetch(`http://localhost:4000/api/despachos/pendientes/${solicitud.IdSolicitud}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Error al cargar el detalle de la solicitud');
      }
      const data: SolicitudDetallada = await response.json();
      setSelectedSolicitud(data);

      // Inicializar con las cantidades solicitadas o despachadas
      const initialItems: Record<number, number> = {};
      data.detalle.forEach(item => {
        initialItems[item.IdDetalleSolicitud] = data.cabecera.Estado === 'DESPACHADA' 
          ? (item.CantidadAprobada ?? 0) 
          : item.CantidadSolicitada;
      });
      setEditedItems(initialItems);
      setObservacionesDespacho('');

    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar el detalle de la solicitud.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleCantidadChange = (idDetalleSolicitud: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditedItems({
      ...editedItems,
      [idDetalleSolicitud]: numValue
    });
  };

  const handleDespachar = async (tipo: 'total' | 'parcial') => {
    if (!selectedSolicitud || isDispatching) return;

    // Validar que las cantidades no excedan el stock ni lo solicitado
    for (const item of selectedSolicitud.detalle) {
      const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
      if (cantidadADespachar > item.CantidadSolicitada) {
        toast.error(`La cantidad a despachar de ${item.Descripcion} no puede exceder lo solicitado`);
        return;
      }
      if (cantidadADespachar > item.EnStock) {
        toast.error(`No hay suficiente stock de ${item.Descripcion}`);
        return;
      }
    }

    setIsDispatching(true);
    try {
      const payload = {
        idSolicitud: selectedSolicitud.cabecera.IdSolicitud,
        observaciones: observacionesDespacho,
        detalle: Object.entries(editedItems)
          .map(([idDetalle, cantidad]) => {
            const itemOriginal = selectedSolicitud.detalle.find(d => d.IdDetalleSolicitud === Number(idDetalle));
            if (!itemOriginal || cantidad === 0) return null;
            return {
              idMaterial: itemOriginal.IdMaterial,
              cantidadDespachada: cantidad,
            };
          })
          .filter(Boolean), // Eliminar nulos si la cantidad es 0
      };

      const response = await fetch('http://localhost:4000/api/despachos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al registrar el despacho');
      }

      const result = await response.json();

      // Preparar datos para la impresión
      const dataToPrint: DespachoPrintData = {
        CodigoDespacho: result.despacho.CodigoDespacho,
        FechaDespacho: result.despacho.FechaDespacho,
        CodigoSolicitud: selectedSolicitud.cabecera.CodigoSolicitud,
        AreaNombre: selectedSolicitud.cabecera.AreaNombre,
        CodigoCentroCosto: result.despacho.CodigoCentroCosto || selectedSolicitud.cabecera.CodigoCentroCosto, // Usar el devuelto o el de cabecera
        NombreSolicitante: selectedSolicitud.cabecera.NombreSolicitante,
        Observaciones: observacionesDespacho,
        Detalles: result.detalle.map((d: any) => ({
          Codigo: d.Codigo,
          Descripcion: d.Descripcion,
          UnidadMedida: d.UnidadMedida,
          CantidadDespachada: d.CantidadDespachada,
        })),
      };

      setPrintData(dataToPrint); // Disparar la impresión

      toast.success(`Despacho ${tipo} registrado exitosamente`);
      setSolicitudes(solicitudes.filter(s => s.IdSolicitud !== selectedSolicitud.cabecera.IdSolicitud));
      setSelectedSolicitud(null);

    } catch (error: any) {
      console.error('Error al despachar:', error);
      toast.error(error.message || 'No se pudo registrar el despacho.');
    } finally {
      setIsDispatching(false);
    }
  };

  const getTotalItems = (items: ItemSolicitudDetalle[]) => {
    return items.reduce((sum, item) => sum + item.CantidadSolicitada, 0);
  };

  const esDespachoCompleto = () => {
    if (!selectedSolicitud) return false;
    return selectedSolicitud.detalle.every(item => 
      editedItems[item.IdDetalleSolicitud] === item.CantidadSolicitada
    );
  };

  const hayCantidadesPendientes = () => {
    if (!selectedSolicitud) return false;
    return selectedSolicitud.detalle.some(item => 
      (editedItems[item.IdDetalleSolicitud] || 0) < item.CantidadSolicitada
    );
  };

  return (
    <div className="space-y-6">
      {/* Contenedor para la impresión (oculto en pantalla) */}
      <RequisaPrint ref={printComponentRef} data={printData} />

      {/* Header */}
      <div>
        <h1>Despacho de Bodega</h1>
        <p className="text-muted-foreground mt-1">
          Gestión de despachos de solicitudes aprobadas
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes ({solicitudes.length})</TabsTrigger>
          <TabsTrigger value="historial">Historial Despachadas</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-6">
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">Por Despachar</CardTitle>
                <Truck className="w-4 h-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl">{loading ? '...' : solicitudes.length}</div>
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
                  {loading ? '...' : solicitudes.reduce((sum, s) => sum + s.ItemsTotal, 0)}
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
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          Cargando solicitudes...
                        </TableCell>
                      </TableRow>
                    ) : solicitudes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No hay solicitudes pendientes de despacho
                        </TableCell>
                      </TableRow>
                    ) : (
                      solicitudes.map((solicitud) => (
                        <TableRow key={solicitud.IdSolicitud}>
                          <TableCell className="font-medium">{solicitud.CodigoSolicitud}</TableCell>
                          <TableCell>{new Date(solicitud.FechaSolicitud).toLocaleDateString()}</TableCell>
                          <TableCell>{solicitud.AreaNombre}</TableCell>
                          <TableCell>{solicitud.NombreSolicitante}</TableCell>
                          <TableCell className="text-center">{solicitud.ItemsTotal}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleOpenDespacho(solicitud)}
                              disabled={modalLoading}
                            >
                              <Truck className="w-4 h-4 mr-2" />
                              {modalLoading && selectedSolicitud?.cabecera.IdSolicitud !== solicitud.IdSolicitud ? 'Cargando...' : 'Despachar'}
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
        </TabsContent>

        <TabsContent value="historial" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Despachos Realizados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Fecha Solicitud</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead>Solicitante</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingHistorial ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          Cargando historial...
                        </TableCell>
                      </TableRow>
                    ) : historial.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No se han encontrado despachos realizados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historial.map((solicitud) => (
                        <TableRow key={solicitud.IdSolicitud}>
                          <TableCell className="font-medium">{solicitud.CodigoSolicitud}</TableCell>
                          <TableCell>{new Date(solicitud.FechaSolicitud).toLocaleDateString()}</TableCell>
                          <TableCell>{solicitud.AreaNombre}</TableCell>
                          <TableCell>{solicitud.NombreSolicitante}</TableCell>
                          <TableCell className="text-center">{solicitud.ItemsTotal}</TableCell>
                          <TableCell className="text-right">
                             <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDespacho(solicitud)}
                            >
                              Ver Detalle
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
        </TabsContent>
      </Tabs>

      {/* Modal de Despacho */}
      <Dialog open={!!selectedSolicitud || modalLoading} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSelectedSolicitud(null);
          setEditedItems({});
          setObservacionesDespacho('');
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Despacho</DialogTitle>
            <DialogDescription>
              {selectedSolicitud?.cabecera.CodigoSolicitud} - {selectedSolicitud?.cabecera.AreaNombre}
            </DialogDescription>
          </DialogHeader>

          {modalLoading && !selectedSolicitud && (
            <div className="flex items-center justify-center h-64">
              <p>Cargando detalle de la solicitud...</p>
            </div>
          )}

          {selectedSolicitud && (
            <div className="space-y-4">
              {/* Información de la solicitud */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Solicitante</div>
                  <div className="font-medium">{selectedSolicitud.cabecera.NombreSolicitante}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Fecha Solicitud</div>
                  <div className="font-medium">
                    {new Date(selectedSolicitud.cabecera.FechaSolicitud).toLocaleDateString()}
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
                      {selectedSolicitud.detalle.map((item) => {
                        const isAprobada = selectedSolicitud.cabecera.Estado === 'APROBADA';
                        const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
                        const excedeStock = isAprobada && cantidadADespachar > item.EnStock;
                        const excedeSolicitado = cantidadADespachar > item.CantidadSolicitada;
                        
                        return (
                          <TableRow key={item.IdDetalleSolicitud}>
                            <TableCell className="font-medium">{item.Codigo}</TableCell>
                            <TableCell>{item.Descripcion}</TableCell>
                            <TableCell className="text-center">
                              {item.CantidadSolicitada} {item.UnidadMedida}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={!isAprobada || item.EnStock >= item.CantidadSolicitada ? 'secondary' : 'destructive'}>
                                {item.EnStock}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                max={Math.min(item.CantidadSolicitada, item.EnStock)}
                                value={editedItems[item.IdDetalleSolicitud] || 0}
                                onChange={(e) => handleCantidadChange(item.IdDetalleSolicitud, e.target.value)}
                                className="w-24 text-center"
                                disabled={!isAprobada}
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
                              {!excedeStock && !excedeSolicitado && cantidadADespachar === item.CantidadSolicitada && (
                                <Badge variant="secondary" className="gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Completo
                                </Badge>
                              )}
                              {!excedeStock && !excedeSolicitado && cantidadADespachar > 0 && cantidadADespachar < item.CantidadSolicitada && (
                                <Badge className="gap-1 bg-yellow-100 text-yellow-700">
                                  Parcial
                                </Badge>
                              )}
                              {!excedeStock && !excedeSolicitado && cantidadADespachar === 0 && (
                                <Badge className="gap-1 bg-red-100 text-red-700">
                                  No despachado
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
                    {selectedSolicitud.cabecera.Estado === 'APROBADA'
                      ? "Hay items con cantidades pendientes. Este será un despacho parcial."
                      : "Esta solicitud fue despachada parcialmente."}
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
                  disabled={selectedSolicitud.cabecera.Estado !== 'APROBADA'}
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
              disabled={isDispatching}
            >
              {selectedSolicitud?.cabecera.Estado === 'APROBADA' ? 'Cancelar' : 'Cerrar'}
            </Button>
            {selectedSolicitud?.cabecera.Estado === 'APROBADA' && hayCantidadesPendientes() && (
              <Button
                variant="outline"
                className="border-yellow-600 text-yellow-700 hover:bg-yellow-50"
                onClick={() => handleDespachar('parcial')}
                disabled={isDispatching}
              >
                {isDispatching ? 'Procesando...' : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Despacho Parcial
                  </>
                )}
              </Button>
            )}
            {selectedSolicitud?.cabecera.Estado === 'APROBADA' && (
              <Button
                onClick={() => handleDespachar('total')}
                disabled={!esDespachoCompleto() || isDispatching}
              >
                {isDispatching ? 'Procesando...' : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Despacho Completo
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
