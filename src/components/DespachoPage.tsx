import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Truck, Package, CheckCircle, AlertCircle, Search } from 'lucide-react';
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
import { sileo as toast } from 'sileo';
import { useReactToPrint } from 'react-to-print'; // Importar hook para imprimir
import { RequisaPrint } from './prints/RequisaPrint'; // Importar componente de impresión
import { useRef } from 'react'; // Importar useRef
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'; // Importar Tabs
// Base de API configurable vía Vite
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

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
  Estado?: string;
  EstadoDespachoLabel?: string;
  ListaParaDespachar?: boolean;
  ItemsTotal: number;
}

interface SolicitudDetallada {
  cabecera: {
    IdSolicitud: number;
    CodigoSolicitud: string;
    FechaSolicitud: string;
    AreaNombre: string; // ej: "BPM - BUENAS PRACTICAS DE MANUFACTURA"
    // Campos adicionales que pueden llegar desde el backend
    AreaCodigoCuenta?: string | null; // ej: "51103903"
    CentroCostoCodigo?: string | null;
    CodigoCuenta?: string | null;
    CodigoCentroCosto?: string; // legacy
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
  // Actividad: área destino o actividad a imprimir
  Actividad?: string;
  // Código de cuenta/CCO a imprimir
  CodigoCuenta?: string;
  AreaNombre?: string; // legacy
  CodigoCentroCosto?: string; // legacy
  NombreSolicitante: string;
  Observaciones: string | null;
  Detalles: {
    Codigo: string;
    Descripcion: string;
    UnidadMedida: string;
    CantidadDespachada: number;
  }[];
}


// Variable para el logo en Base64 (Reemplaza esta cadena larga con tu imagen real convertida a Base64 si lo deseas, o usa una URL directa)
// Puedes usar herramientas online como "Image to Base64" para convertir tu logo.png
const LOGO_URL = "/logo_extraceite.png"; // Asegúrate de poner tu archivo en la carpeta "public" con este nombre

/*
   NOTA: Para que la imagen cargue correctamente en la ventana de impresión,
   lo ideal es colocar el archivo 'logo_extraceite.png' en la carpeta 'public' de tu proyecto Vite.
   Así estará accesible en la raíz del servidor web (ej: http://localhost:5173/logo_extraceite.png).
*/

export default function DespachoPage() {
  const { token, user } = useAuth();
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
  const [despachosHoy, setDespachosHoy] = useState<number>(0);
  const [loadingDespachosHoy, setLoadingDespachosHoy] = useState<boolean>(false);
  const [selectedDetalleId, setSelectedDetalleId] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState<string>('');

  const printComponentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printComponentRef,
    // Retrasar el cleanup para evitar error: "contentWindow" de react-to-print
    onAfterPrint: () => {
      setTimeout(() => setPrintData(null), 300);
    },
    onPrintError: (error) => {
      console.error('Error al imprimir (react-to-print)', error);
      // Nota: mantenemos printData para permitir reintento manual si fuera necesario
    },
  });

  useEffect(() => {
    if (printData) {
      const raf = requestAnimationFrame(() => {
        handlePrint();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [printData, handlePrint]);

  useEffect(() => {
    const controller = new AbortController();
    const reloadSolicitudesPendientes = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/despachos/pendientes`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Error al cargar las solicitudes pendientes');
        const data: SolicitudPendiente[] = await response.json();
        setSolicitudes(data);
      } catch (error) {
        console.error(error);
        toast.error({ title: "Error", description: 'No se pudieron cargar las solicitudes para despacho.'});
      } finally {
        setLoading(false);
      }
    };

    reloadSolicitudesPendientes();
    return () => controller.abort();
  }, [token]);

  // Cargar conteo de despachos hoy desde backend (métrica dedicada)
  useEffect(() => {
    const controller = new AbortController();
    const loadDespachosHoy = async () => {
      if (!token) return;
      setLoadingDespachosHoy(true);
      try {
        const response = await fetch(`${API_BASE}/api/despachos/metrics/hoy`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Error al cargar métrica de despachos');
        const data = await response.json();
        setDespachosHoy(Number(data?.todayCount ?? 0));
      } catch (error) {
        console.error('Error cargando despachos hoy (métrica)', error);
      } finally {
        setLoadingDespachosHoy(false);
      }
    };
    loadDespachosHoy();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    const reloadHistorialDespachos = async () => {
      if (!token || activeTab !== 'historial') return;
      setLoadingHistorial(true);
      try {
        const response = await fetch(`${API_BASE}/api/despachos/historial`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Error al cargar historial');
        const data = await response.json();
        setHistorial(data);
      } catch (error) {
        console.error(error);
        toast.error({ title: "Error", description: 'Error cargando historial de despachos'});
      } finally {
        setLoadingHistorial(false);
      }
    };
    reloadHistorialDespachos();
    return () => controller.abort();
  }, [token, activeTab]);

  const handleOpenDespacho = async (solicitud: SolicitudPendiente) => {
    if (!token) return;
    setModalLoading(true);
    setSelectedSolicitud(null); // Limpiar estado anterior
    try {
      const response = await fetch(`${API_BASE}/api/despachos/pendientes/${solicitud.IdSolicitud}`, {
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
      const firstDetalle = data.detalle[0];
      setSelectedDetalleId(firstDetalle ? firstDetalle.IdDetalleSolicitud : null);

    } catch (error) {
      console.error(error);
      toast.error({ title: "Error", description: 'No se pudo cargar el detalle de la solicitud.'});
    } finally {
      setModalLoading(false);
    }
  };

  const handleCantidadChange = (idDetalleSolicitud: number, value: string) => {
    // Asegurar no-negativos aunque el input tenga min=0
    const parsed = parseInt(value);
    const numValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setEditedItems({
      ...editedItems,
      [idDetalleSolicitud]: numValue,
    });
  };

  const handleDespachar = async (tipo: 'total' | 'parcial') => {
    if (!selectedSolicitud || isDispatching) return;

    // Validar que las cantidades no excedan el stock ni lo solicitado
    for (const item of selectedSolicitud.detalle) {
      const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
      if (cantidadADespachar > item.CantidadSolicitada) {
        toast.error({ title: "Error", description: `La cantidad a despachar de ${item.Descripcion} no puede exceder lo solicitado`});
        return;
      }
      if (cantidadADespachar > item.EnStock) {
        toast.error({ title: "Error", description: `No hay suficiente stock de ${item.Descripcion}`});
        return;
      }
    }

    setIsDispatching(true);
    try {
      const detalleDespacho = Object.entries(editedItems)
        .map(([idDetalle, cantidad]) => {
          const itemOriginal = selectedSolicitud.detalle.find(d => d.IdDetalleSolicitud === Number(idDetalle));
          if (!itemOriginal || (cantidad ?? 0) <= 0) return null;
          return {
            idMaterial: itemOriginal.IdMaterial,
            cantidadDespachada: cantidad,
          };
        })
        .filter(Boolean) as Array<{ idMaterial: number; cantidadDespachada: number }>;

      if (detalleDespacho.length === 0) {
        toast.error({ title: 'Sin ítems', description: 'Debes ingresar al menos una cantidad a despachar.' });
        return;
      }

      const payload = {
        idSolicitud: selectedSolicitud.cabecera.IdSolicitud,
        observaciones: observacionesDespacho,
        detalle: detalleDespacho,
      };

      const response = await fetch(`${API_BASE}/api/despachos`, {
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

      const result: any = await response.json();

      // Preparar datos para impresión usando componente RequisaPrint
      const fechaDespachoStr = result?.despacho?.FechaDespacho
        ? new Date(result.despacho.FechaDespacho).toLocaleDateString()
        : new Date().toLocaleDateString();

      // Requisa: la fuente de verdad es la solicitud (cabecera) y sus datos.
      // El despacho devuelve alias útiles, pero la requisa debe imprimir lo correspondiente a la solicitud.
      const codigoCuentaSolicitud =
        selectedSolicitud.cabecera.CodigoCuenta ||
        selectedSolicitud.cabecera.CentroCostoCodigo ||
        selectedSolicitud.cabecera.CodigoCentroCosto ||
        selectedSolicitud.cabecera.AreaCodigoCuenta ||
        '';

      setPrintData({
        CodigoDespacho: result?.despacho?.CodigoDespacho ?? '',
        FechaDespacho: fechaDespachoStr,
        CodigoSolicitud: selectedSolicitud.cabecera.CodigoSolicitud,
        Actividad:
          (selectedSolicitud.cabecera.AreaNombre || '').split(' - ').pop()?.trim() ||
          selectedSolicitud.cabecera.AreaNombre,
        CodigoCuenta: String(codigoCuentaSolicitud),
        // Backward-compat para plantillas antiguas
        CodigoCentroCosto: String(codigoCuentaSolicitud),
        NombreSolicitante: selectedSolicitud.cabecera.NombreSolicitante,
        Observaciones: observacionesDespacho || null,
        Detalles: (result?.detalle ?? []).map((d: any) => ({
          Codigo: d.Codigo,
          Descripcion: d.Descripcion,
          UnidadMedida: d.UnidadMedida,
          CantidadDespachada: d.CantidadDespachada,
        })),
      });

      toast.success({ title: "Éxito", description: `Despacho ${tipo} registrado exitosamente`});
      // Forzar recarga desde el backend para reflejar estado real (parcial o total)
      try {
        const responsePend = await fetch(`${API_BASE}/api/despachos/pendientes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (responsePend.ok) {
          const dataPend: SolicitudPendiente[] = await responsePend.json();
          setSolicitudes(dataPend);
        }
        if (activeTab === 'historial') {
          const responseHist = await fetch(`${API_BASE}/api/despachos/historial`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (responseHist.ok) {
            const dataHist = await responseHist.json();
            setHistorial(dataHist);
          }
        }
        // Refrescar KPI de despachos de hoy (métrica dedicada)
        try {
          const responseMetrics = await fetch(`${API_BASE}/api/despachos/metrics/hoy`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (responseMetrics.ok) {
            const data = await responseMetrics.json();
            setDespachosHoy(Number(data?.todayCount ?? 0));
          }
        } catch (e) {
          console.error('Error refrescando KPI despachos hoy (métrica)', e);
        }
      } catch (refreshErr) {
        console.error('Error refrescando listas post-despacho', refreshErr);
      }
      setSelectedSolicitud(null);

    } catch (error: any) {
      console.error('Error al despachar:', error);
      toast.error({ title: "Error", description: error.message || 'No se pudo registrar el despacho.'});
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

  // Mejora UX: detectar excedentes de stock y despacho vacío
  const hayExcedeStock = () => {
    if (!selectedSolicitud) return false;
    return selectedSolicitud.detalle.some(item => {
      const cantidad = editedItems[item.IdDetalleSolicitud] || 0;
      return cantidad > item.EnStock;
    });
  };

  const hayDespachoVacio = () => {
    if (!selectedSolicitud) return true;
    return selectedSolicitud.detalle.every(item => {
      const cantidad = editedItems[item.IdDetalleSolicitud] || 0;
      return cantidad === 0;
    });
  };

  const resolveCodigoCuentaSolicitud = (cabecera: SolicitudDetallada['cabecera']) => {
    return (
      cabecera.CodigoCuenta ||
      cabecera.CentroCostoCodigo ||
      cabecera.CodigoCentroCosto ||
      cabecera.AreaCodigoCuenta ||
      ''
    );
  };

  const getItemEstado = (item: ItemSolicitudDetalle) => {
    const isAprobada = selectedSolicitud?.cabecera.Estado === 'APROBADA';
    const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
    const excedeStock = isAprobada && cantidadADespachar > item.EnStock;
    const excedeSolicitado = cantidadADespachar > item.CantidadSolicitada;

    if (excedeStock) return { label: 'Sin stock', tone: 'error' as const };
    if (excedeSolicitado) return { label: 'Excede', tone: 'error' as const };
    if (cantidadADespachar === item.CantidadSolicitada && cantidadADespachar > 0)
      return { label: 'Completo', tone: 'success' as const };
    if (cantidadADespachar > 0 && cantidadADespachar < item.CantidadSolicitada)
      return { label: 'Parcial', tone: 'warning' as const };
    return { label: 'Sin despacho', tone: 'muted' as const };
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
                <div className="text-2xl">{loadingDespachosHoy ? '...' : despachosHoy}</div>
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
                      <TableHead>Estado</TableHead>
                      <TableHead>Solicitante</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          Cargando solicitudes...
                        </TableCell>
                      </TableRow>
                    ) : solicitudes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          No hay solicitudes pendientes de despacho
                        </TableCell>
                      </TableRow>
                    ) : (
                      solicitudes.map((solicitud) => (
                        <TableRow key={solicitud.IdSolicitud}>
                          <TableCell className="font-medium">{solicitud.CodigoSolicitud}</TableCell>
                          <TableCell>{new Date(solicitud.FechaSolicitud).toLocaleDateString()}</TableCell>
                          <TableCell>{solicitud.AreaNombre}</TableCell>
                          <TableCell>
                            <Badge variant={solicitud.ListaParaDespachar ? 'secondary' : 'destructive'}>
                              {solicitud.EstadoDespachoLabel ?? (solicitud.Estado ?? 'APROBADA')}
                            </Badge>
                          </TableCell>
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
      <Dialog
        open={!!selectedSolicitud || modalLoading}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedSolicitud(null);
            setEditedItems({});
            setObservacionesDespacho('');
            setSelectedDetalleId(null);
            setItemSearch('');
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-4xl h-[calc(100dvh-2rem)] sm:h-auto sm:max-h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="border-b pb-3">
            <DialogTitle>Registrar Despacho</DialogTitle>
            <DialogDescription className="space-y-0.5 break-words">
              {selectedSolicitud && (
                <>
                  <p className="font-medium text-slate-900">
                    {selectedSolicitud.cabecera.CodigoSolicitud} ·{' '}
                    {(selectedSolicitud.cabecera.AreaNombre || '').split(' - ').pop()?.trim() ||
                      selectedSolicitud.cabecera.AreaNombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Área: {selectedSolicitud.cabecera.AreaNombre}
                  </p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {modalLoading && !selectedSolicitud && (
            <div className="flex-1 flex items-center justify-center">
              <p>Cargando detalle de la solicitud...</p>
            </div>
          )}

          {selectedSolicitud && (
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Información de la solicitud */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Solicitante
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {selectedSolicitud.cabecera.NombreSolicitante}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Fecha solicitud
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {new Date(selectedSolicitud.cabecera.FechaSolicitud).toLocaleDateString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Actividad
                  </div>
                  <div className="text-sm font-semibold text-slate-900 break-words">
                    {(selectedSolicitud.cabecera.AreaNombre || '').split(' - ').pop()?.trim() ||
                      selectedSolicitud.cabecera.AreaNombre ||
                      '-'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Código de cuenta
                  </div>
                  <div className="text-sm font-semibold text-slate-900 break-words">
                    {resolveCodigoCuentaSolicitud(selectedSolicitud.cabecera) || '-'}
                  </div>
                </div>
              </div>

              {/* Split view: lista izquierda + detalle derecha */}
              <div className="mt-2 flex flex-col gap-4 md:flex-row">
                {/* Lista de items */}
                <div className="md:w-5/12 lg:w-4/12">
                  <Label className="mb-2 block text-xs font-semibold tracking-wide uppercase text-slate-600">
                    Materiales
                  </Label>
                  <div className="mb-2 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Buscar por código o descripción..."
                      className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <div
                    className="rounded-xl border border-slate-200 bg-white max-h-64 overflow-y-auto"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (!selectedSolicitud) return;
                      const detalle = selectedSolicitud.detalle;
                      const filtered = detalle.filter((item) => {
                        const term = itemSearch.toLowerCase().trim();
                        if (!term) return true;
                        return (
                          item.Codigo.toLowerCase().includes(term) ||
                          item.Descripcion.toLowerCase().includes(term)
                        );
                      });
                      const currentIndex = filtered.findIndex(
                        (d) => d.IdDetalleSolicitud === selectedDetalleId
                      );
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next =
                          currentIndex === -1
                            ? 0
                            : Math.min(currentIndex + 1, filtered.length - 1);
                        const target = filtered[next];
                        if (target) setSelectedDetalleId(target.IdDetalleSolicitud);
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev =
                          currentIndex === -1
                            ? 0
                            : Math.max(currentIndex - 1, 0);
                        const target = filtered[prev];
                        if (target) setSelectedDetalleId(target.IdDetalleSolicitud);
                      }
                    }}
                  >
                    {selectedSolicitud.detalle
                      .filter((item) => {
                        const term = itemSearch.toLowerCase().trim();
                        if (!term) return true;
                        return (
                          item.Codigo.toLowerCase().includes(term) ||
                          item.Descripcion.toLowerCase().includes(term)
                        );
                      })
                      .map((item) => {
                        const cantidadADespachar =
                          editedItems[item.IdDetalleSolicitud] || 0;
                        const { label, tone } = getItemEstado(item);
                        const isSelected =
                          item.IdDetalleSolicitud === selectedDetalleId;

                        const toneClasses =
                          tone === 'error'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : tone === 'success'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : tone === 'warning'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200';

                        return (
                          <button
                            key={item.IdDetalleSolicitud}
                            type="button"
                            onClick={() => setSelectedDetalleId(item.IdDetalleSolicitud)}
                            className={`flex w-full items-start gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50 ${
                              isSelected ? 'bg-slate-100' : ''
                            }`}
                          >
                            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                              {item.Codigo}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-semibold text-slate-900">
                                  {item.Descripcion}
                                </p>
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses}`}
                                >
                                  {label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                                <span>Sol: {item.CantidadSolicitada}</span>
                                <span>Stock: {item.EnStock}</span>
                                <span>Desp: {cantidadADespachar}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Detalle del item seleccionado */}
                <div className="md:w-7/12 lg:w-8/12">
                  <Label className="mb-2 block text-xs font-semibold tracking-wide uppercase text-slate-600">
                    Detalle del material
                  </Label>
                  {(() => {
                    const detalle = selectedSolicitud.detalle;
                    const current =
                      detalle.find((d) => d.IdDetalleSolicitud === selectedDetalleId) ||
                      detalle[0];
                    if (!current) {
                      return (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                          No hay materiales en esta solicitud.
                        </div>
                      );
                    }

                    const isAprobada =
                      selectedSolicitud.cabecera.Estado === 'APROBADA';
                    const cantidadADespachar =
                      editedItems[current.IdDetalleSolicitud] || 0;
                    const maxPermitido = Math.min(
                      current.CantidadSolicitada,
                      current.EnStock
                    );
                    const actividad =
                      (selectedSolicitud.cabecera.AreaNombre || '')
                        .split(' - ')
                        .pop()
                        ?.trim() ||
                      selectedSolicitud.cabecera.AreaNombre ||
                      '';
                    const codigoCuenta = resolveCodigoCuentaSolicitud(
                      selectedSolicitud.cabecera
                    );
                    const { label, tone } = getItemEstado(current);

                    const toneClasses =
                      tone === 'error'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : tone === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : tone === 'warning'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-50 text-slate-700 border-slate-200';

                    return (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                              <span>{current.Codigo}</span>
                              <span className="rounded-full bg-white/10 px-2 text-[10px]">
                                {current.UnidadMedida || 'U/M'}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">
                              {current.Descripcion}
                            </p>
                          </div>
                          <div
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses}`}
                          >
                            {label}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <div className="text-[11px] font-medium text-slate-500">
                              Solicitado
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {current.CantidadSolicitada}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <div className="text-[11px] font-medium text-slate-500">
                              Stock
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {current.EnStock}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <div className="text-[11px] font-medium text-slate-500">
                              Máx. despacho
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {maxPermitido}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <div className="text-[11px] font-medium text-slate-500">
                              Código de cuenta
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 break-words">
                              {codigoCuenta || '-'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 col-span-2 sm:col-span-4">
                            <div className="text-[11px] font-medium text-slate-500">
                              Actividad
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 break-words">
                              {actividad || '-'}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Cantidad a despachar
                            </div>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                disabled={!isAprobada}
                                onClick={() =>
                                  handleCantidadChange(
                                    current.IdDetalleSolicitud,
                                    '0'
                                  )
                                }
                              >
                                0
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                disabled={!isAprobada}
                                onClick={() =>
                                  handleCantidadChange(
                                    current.IdDetalleSolicitud,
                                    String(current.CantidadSolicitada)
                                  )
                                }
                              >
                                = Sol
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                disabled={!isAprobada}
                                onClick={() =>
                                  handleCantidadChange(
                                    current.IdDetalleSolicitud,
                                    String(maxPermitido)
                                  )
                                }
                              >
                                Máx
                              </Button>
                            </div>
                          </div>
                          <Input
                            type="number"
                            min="0"
                            max={maxPermitido}
                            value={cantidadADespachar}
                            onChange={(e) =>
                              handleCantidadChange(
                                current.IdDetalleSolicitud,
                                e.target.value
                              )
                            }
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              const clamped = isNaN(val)
                                ? 0
                                : Math.max(0, Math.min(maxPermitido, val));
                              handleCantidadChange(
                                current.IdDetalleSolicitud,
                                clamped.toString()
                              );
                            }}
                            disabled={!isAprobada}
                            className="h-12 text-center text-base font-semibold tracking-wide"
                          />
                        </div>

                        <p className="mt-1 text-[11px] text-slate-500">
                          Validación automática: no se permite exceder la cantidad
                          solicitada ni el stock disponible.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Alertas */}
              {hayExcedeStock() && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Hay ítems que exceden el stock disponible. Ajusta las cantidades antes de continuar.
                  </AlertDescription>
                </Alert>
              )}
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
                <Label
                  htmlFor="observaciones"
                  className="text-xs font-semibold tracking-wide uppercase text-slate-600"
                >
                  Observaciones del despacho
                </Label>
                <div className="border border-slate-200 rounded-xl bg-slate-50 p-1.5">
                  <Textarea
                    id="observaciones"
                    placeholder="Ingresa observaciones sobre el despacho (condiciones especiales, retiro, etc.)"
                    value={observacionesDespacho}
                    onChange={(e) => setObservacionesDespacho(e.target.value)}
                    rows={3}
                    disabled={selectedSolicitud.cabecera.Estado !== 'APROBADA'}
                    className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 border-t pt-3 flex-col sm:flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
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
                className="w-full sm:w-auto border-yellow-600 text-yellow-700 hover:bg-yellow-50"
                onClick={() => handleDespachar('parcial')}
                disabled={isDispatching || hayDespachoVacio()}
              >
                {isDispatching ? (
                  'Procesando...'
                ) : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Despacho Parcial
                  </>
                )}
              </Button>
            )}
            {selectedSolicitud?.cabecera.Estado === 'APROBADA' && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => handleDespachar('total')}
                disabled={!esDespachoCompleto() || isDispatching || hayExcedeStock()}
              >
                {isDispatching ? (
                  'Procesando...'
                ) : (
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
