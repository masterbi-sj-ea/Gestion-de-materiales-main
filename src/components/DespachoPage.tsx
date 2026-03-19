import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Truck, Package, CheckCircle, AlertCircle, Search, FileText } from 'lucide-react';
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
import { API_ORIGIN } from '../services/apiConfig';

// Base del backend (sin /api)
const API_BASE = API_ORIGIN;

// Interfaces actualizadas para coincidir con el backend
interface ItemSolicitudDetalle {
  IdDetalleSolicitud: number;
  IdMaterial: number;
  Codigo: string;
  Descripcion: string;
  UnidadMedida: string;
  CantidadSolicitada: number;
  CantidadAprobada: number;
  CantidadPendiente: number;
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
  const [historial, setHistorial] = useState<any[]>([]);
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
  const [downloadingPdf, setDownloadingPdf] = useState<number | null>(null);

  const downloadDespachoPdf = async (idDespacho: number) => {
    try {
      setDownloadingPdf(idDespacho);
      const response = await fetch(`${API_BASE}/api/despachos/${idDespacho}/pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('No se pudo generar el PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Requisa_Despacho_${idDespacho}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error descargando PDF:', error);
      toast.error({ title: 'Error', description: 'No se pudo descargar el PDF.' });
    } finally {
      setDownloadingPdf(null);
    }
  };
  const [loadingDespachosHoy, setLoadingDespachosHoy] = useState<boolean>(false);
  const [selectedDetalleId, setSelectedDetalleId] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState<string>('');
  const [scannerMode, setScannerMode] = useState(true);

  const printComponentRef = useRef<HTMLDivElement>(null);

  const handleScannerInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && selectedSolicitud) {
      const barcode = itemSearch.trim();
      if (!barcode) return;

      const item = selectedSolicitud.detalle.find(
        d => d.Codigo.toLowerCase() === barcode.toLowerCase()
      );

      if (item) {
        const currentQty = editedItems[item.IdDetalleSolicitud] || 0;
        const newQty = Math.min(currentQty + 1, item.CantidadPendiente, item.EnStock);
        
        if (newQty > currentQty) {
          handleCantidadChange(item.IdDetalleSolicitud, newQty.toString());
          toast.success({ title: "Material Identificado", description: `${item.Descripcion} (+1)` });
        } else {
          toast.warning({ 
            title: "Límite alcanzado", 
            description: `No se puede despachar más de ${item.Descripcion} (Pendiente: ${item.CantidadPendiente}, Stock: ${item.EnStock})` 
          });
        }
      } else {
        toast.error({ title: "Error de Escaneo", description: "El material no pertenece a esta solicitud." });
      }
      setItemSearch('');
    }
  };

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

  // Eliminamos el useEffect que disparaba handlePrint automáticamente al cambiar printData
  // porque ahora lo disparamos manualmente después de setear el estado en handleDespachar

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

      // Inicializar con la cantidad pendiente real desde el backend
      const initialItems: Record<number, number> = {};
      data.detalle.forEach(item => {
        initialItems[item.IdDetalleSolicitud] = item.CantidadPendiente ?? 0;
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
    const parsed = parseFloat(value);
    const numValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setEditedItems({
      ...editedItems,
      [idDetalleSolicitud]: numValue,
    });
  };

  const handleDespachar = async (tipo: 'total' | 'parcial') => {
    if (!selectedSolicitud || isDispatching) return;

    // Validar que las cantidades no excedan el stock ni lo pendiente
    for (const item of selectedSolicitud.detalle) {
      const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
      if (cantidadADespachar <= 0) continue;

      const pendiente = item.CantidadPendiente;

      if (cantidadADespachar > pendiente) {
        toast.error({ title: "Error", description: `La cantidad de ${item.Descripcion} excede el saldo pendiente (${pendiente})`});
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
            idDetalleSolicitud: Number(idDetalle),
            cantidadDespachada: cantidad,
          };
        })
        .filter(Boolean);

      if (detalleDespacho.length === 0) {
        toast.error({ title: 'Sin ítems', description: 'Debes ingresar al menos una cantidad a despachar.' });
        setIsDispatching(false);
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

      const result: any = await response.json();

      if (!response.ok) {
        // Manejo de errores específicos del SP (THROW 50004, 50010, etc)
        const errorMessage = result.message || 'Error al registrar el despacho';
        
        if (errorMessage.includes('Stock insuficiente')) {
          toast.error({ title: "Error de Inventario", description: "No hay stock suficiente para completar esta acción." });
        } else if (errorMessage.includes('CódigoCuenta')) {
          toast.error({ title: "Configuración Contable", description: "Falta configurar la cuenta para esta área en la base de datos." });
        } else {
          toast.error({ title: "Error del Servidor", description: errorMessage });
        }
        setIsDispatching(false);
        return;
      }

      toast.success({ title: "Despacho Registrado", description: `Requisa generada correctamente.`});
      
      // Descargar el PDF generado por el backend
      if (result.IdDespachoGenerado || result.idDespachoGenerado) {
        const idDesp = result.IdDespachoGenerado || result.idDespachoGenerado;
        await downloadDespachoPdf(idDesp);
      }

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
    return selectedSolicitud.detalle.every(item => {
      const pendiente = item.CantidadPendiente;
      return (editedItems[item.IdDetalleSolicitud] || 0) === pendiente;
    });
  };

  const hayCantidadesPendientes = () => {
    if (!selectedSolicitud) return false;
    return selectedSolicitud.detalle.some(item => {
      const pendiente = item.CantidadPendiente;
      const actual = editedItems[item.IdDetalleSolicitud] || 0;
      return actual < pendiente;
    });
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
      ''
    );
  };

  const getItemEstado = (item: ItemSolicitudDetalle) => {
    const isDispatchingState = ['APROBADA', 'PARCIALMENTE_DESPACHADA'].includes(selectedSolicitud?.cabecera.Estado || '');
    const pendiente = item.CantidadPendiente;
    const actual = editedItems[item.IdDetalleSolicitud] || 0;

    const excedeStock = isDispatchingState && actual > item.EnStock;
    const excedePendiente = actual > pendiente;

    if (excedeStock) return { label: 'Sin stock', tone: 'error' as const };
    if (excedePendiente) return { label: 'Excede', tone: 'error' as const };
    if (pendiente === 0) return { label: 'Entregado', tone: 'success' as const };
    if (actual === pendiente && actual > 0)
      return { label: 'Completo', tone: 'success' as const };
    if (actual > 0 && actual < pendiente)
      return { label: 'Parcial', tone: 'warning' as const };
    
    return { label: 'Pendiente', tone: 'muted' as const };
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
                      <TableHead>N° Despacho</TableHead>
                      <TableHead>Fecha Despacho</TableHead>
                      <TableHead>Solicitud</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead>Despachador</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingHistorial ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          Cargando historial...
                        </TableCell>
                      </TableRow>
                    ) : historial.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          No se han encontrado despachos realizados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historial.map((despacho) => (
                        <TableRow key={despacho.IdDespacho}>
                          <TableCell className="font-medium">DESP-{despacho.IdDespacho}</TableCell>
                          <TableCell>{new Date(despacho.FechaDespacho).toLocaleString()}</TableCell>
                          <TableCell>{despacho.CodigoSolicitud}</TableCell>
                          <TableCell>{despacho.AreaNombre}</TableCell>
                          <TableCell>{despacho.NombreDespachador}</TableCell>
                          <TableCell className="text-center">{despacho.ItemsDespachados}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{despacho.EstadoDespacho}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                              onClick={() => downloadDespachoPdf(despacho.IdDespacho)}
                              disabled={downloadingPdf === despacho.IdDespacho}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              {downloadingPdf === despacho.IdDespacho ? '...' : 'PDF'}
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
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-4xl h-[calc(100dvh-2rem)] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 sm:p-0 shadow-2xl rounded-3xl animate-fade-in-up">
          <DialogHeader className="sticky top-0 z-20 bg-gradient-to-b from-slate-50 to-white/90 backdrop-blur border-b border-slate-200 rounded-t-3xl shadow-xl animate-fade-in px-6 pt-6 pb-3">
            <DialogTitle className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900">
              <Truck className="w-7 h-7 text-primary drop-shadow" /> Registrar Despacho
            </DialogTitle>
            <DialogDescription className="space-y-0.5 break-words">
              {selectedSolicitud && (
                <>
                  <span className="font-medium text-slate-900">
                    {selectedSolicitud.cabecera.CodigoSolicitud} ·{' '}
                    {(selectedSolicitud.cabecera.AreaNombre || '').split(' - ').pop()?.trim() ||
                      selectedSolicitud.cabecera.AreaNombre}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Área: {selectedSolicitud.cabecera.AreaNombre}
                  </span>
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
            <div className="flex-1 overflow-y-auto py-6 px-6 space-y-6">
              {/* Modo de entrada: Manual vs Scanner */}
              <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl transition-colors duration-300 ${scannerMode ? 'bg-primary text-white shadow-lg ring-4 ring-primary/20' : 'bg-slate-200 text-slate-500'}`}>
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 leading-tight">Entrada de Materiales</h4>
                    <p className="text-xs text-slate-500 font-medium">Búsqueda rápida o escaneo de código</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <Input
                      autoFocus
                      placeholder={scannerMode ? "Escaneo de código..." : "Buscar material..."}
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      onKeyDown={handleScannerInput}
                      className="w-48 sm:w-64 bg-white border-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-300 rounded-xl font-medium placeholder:text-slate-400"
                    />
                    {scannerMode && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                        <span className="w-1.5 h-4 bg-primary/20 rounded-full animate-pulse" />
                        <span className="w-1.5 h-4 bg-primary/40 rounded-full animate-pulse delay-75" />
                        <span className="w-1.5 h-4 bg-primary/20 rounded-full animate-pulse delay-150" />
                      </div>
                    )}
                  </div>
                  <Button 
                    variant={scannerMode ? "default" : "outline"}
                    size="icon"
                    onClick={() => setScannerMode(!scannerMode)}
                    className="rounded-xl shadow-sm transition-all active:scale-95"
                    title={scannerMode ? "Desactivar Modo Scanner" : "Activar Modo Scanner"}
                  >
                    <Truck className={`w-4 h-4 ${scannerMode ? 'animate-bounce' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Información de la solicitud */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
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
              <div className="mt-4 flex flex-col gap-6 md:flex-row">
                {/* Lista de items */}
                <div className="md:w-5/12 lg:w-4/12 flex flex-col min-h-0">
                  <Label className="mb-2 block text-xs font-semibold tracking-wide uppercase text-slate-600">
                    Materiales
                  </Label>
                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por código o nombre..."
                      className="pl-9 h-10 text-xs shadow-sm bg-white"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                  </div>
                  <div
                    className="rounded-xl border border-slate-200 bg-white flex-1 overflow-y-auto shadow-sm min-h-[300px]"
                  >
                    {selectedSolicitud.detalle
                      .filter(item => 
                        item.Descripcion.toLowerCase().includes(itemSearch.toLowerCase()) ||
                        item.Codigo.toLowerCase().includes(itemSearch.toLowerCase())
                      )
                      .map((item) => {
                        const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
                        const { label, tone } = getItemEstado(item);
                        const isSelected = item.IdDetalleSolicitud === selectedDetalleId;
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
                            className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left text-xs last:border-b-0 hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-slate-100 ring-1 ring-inset ring-primary/20' : ''
                            }`}
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-700 border border-slate-200">
                              {item.Codigo.slice(-3)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-bold text-slate-900">
                                  {item.Descripcion}
                                </p>
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClasses}`}
                                >
                                  {label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                <span>Aprobado: <span className="text-slate-900">{item.CantidadAprobada}</span></span>
                                <span>Pendiente: <span className="text-blue-600 font-bold">{item.CantidadPendiente}</span></span>
                                <span>A Despachar: <span className="text-emerald-600 font-bold">{cantidadADespachar}</span></span>
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
                      ['APROBADA', 'PARCIALMENTE_DESPACHADA'].includes(selectedSolicitud.cabecera.Estado);
                    const cantidadADespachar =
                      editedItems[current.IdDetalleSolicitud] || 0;
                    const pendiente = current.CantidadPendiente;
                    const maxPermitido = Math.min(
                      pendiente,
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
                      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        {/* Resumen principal */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1 text-[11px] font-bold text-white shadow-sm ring-1 ring-slate-900/10 uppercase tracking-tight">
                                    {current.Codigo}
                                </span>
                                <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 uppercase">
                                    {current.UnidadMedida || 'UND'}
                                </span>
                            </div>
                            <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                                {current.Descripcion}
                            </h3>
                          </div>
                          <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-wider ${toneClasses} shadow-sm`}>
                            {tone === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                            {tone === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                            {tone === 'warning' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                            {label}
                          </div>
                        </div>

                        {/* Tabla de campos numéricos */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Aprobado</div>
                                <div className="text-sm font-black text-slate-900">{current.CantidadAprobada}</div>
                            </div>
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-center">
                                <div className="text-[10px] font-bold text-blue-400 uppercase mb-1">Pendiente</div>
                                <div className="text-sm font-black text-blue-700">{pendiente}</div>
                            </div>
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Stock</div>
                                <div className="text-sm font-black text-slate-900">{current.EnStock}</div>
                            </div>
                            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-center">
                                <div className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Max Hoy</div>
                                <div className="text-sm font-black text-emerald-700">{maxPermitido}</div>
                            </div>
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center col-span-2 sm:col-span-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cuenta</div>
                                <div className="text-xs font-bold text-slate-900 truncate">{codigoCuenta || '-'}</div>
                            </div>
                        </div>

                        {/* Input grande centrado para cantidad a despachar */}
                        <div className="flex flex-col items-center justify-center pt-4 group">
                          <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3 group-hover:text-primary transition-colors">Cantidad a despachar ahora</Label>
                          <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 rounded-2xl border border-slate-200 border-b-4 border-b-slate-300">
                            <Button type="button" variant="ghost" className="h-10 w-10 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl" disabled={!isAprobada} title="Poner en 0" onClick={() => handleCantidadChange(current.IdDetalleSolicitud, '0')}>0</Button>
                            <Input 
                                type="number" 
                                step="any" 
                                min="0" 
                                max={maxPermitido} 
                                value={cantidadADespachar} 
                                onChange={(e) => handleCantidadChange(current.IdDetalleSolicitud, e.target.value)} 
                                onBlur={(e) => { 
                                    const val = parseFloat(e.target.value); 
                                    const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(maxPermitido, val)); 
                                    handleCantidadChange(current.IdDetalleSolicitud, clamped.toString()); 
                                }} 
                                disabled={!isAprobada} 
                                className="h-16 w-32 border-0 bg-transparent text-center text-3xl font-black text-primary focus-visible:ring-0 focus-visible:ring-offset-0 transition-all placeholder:text-slate-200" 
                            />
                            <Button type="button" variant="outline" className="h-12 px-4 text-[11px] font-black border-2 border-primary/20 text-primary hover:bg-primary hover:text-white rounded-xl shadow-sm transition-all active:scale-95" disabled={!isAprobada} title="Máximo permitido" onClick={() => handleCantidadChange(current.IdDetalleSolicitud, String(maxPermitido))}>MAX</Button>
                          </div>
                          {pendiente === 0 && (
                            <div className="mt-3 flex items-center gap-1.5 text-emerald-600">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-[11px] font-bold uppercase">Este item ya fue entregado por completo.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Alertas */}
              {hayExcedeStock() && (
                <Alert className="border-red-500 bg-red-50 text-red-900 rounded-xl">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <AlertDescription className="font-bold">
                    Uno o más materiales exceden el stock disponible. Debes ajustar las cantidades.
                  </AlertDescription>
                </Alert>
              )}
              {hayCantidadesPendientes() && (
                <Alert className="border-amber-400 bg-amber-50 text-amber-900 rounded-xl">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <AlertDescription className="font-bold">
                    El despacho actual es parcial. Se generará una entrega pero la solicitud continuará pendiente de saldo.
                  </AlertDescription>
                </Alert>
              )}

              {/* Observaciones */}
              <div className="space-y-2 mt-4">
                <Label
                  htmlFor="observaciones"
                  className="text-xs font-semibold tracking-wide uppercase text-slate-600"
                >
                  Observaciones del despacho
                </Label>
                <div className="border border-slate-200 rounded-xl bg-slate-50 p-1.5 shadow-inner transition-all hover:bg-slate-100/50">
                  <Textarea
                    id="observaciones"
                    placeholder="Escribe aquí cualquier observación relevante sobre la entrega..."
                    value={observacionesDespacho}
                    onChange={(e) => setObservacionesDespacho(e.target.value)}
                    rows={3}
                    disabled={!['APROBADA', 'PARCIALMENTE_DESPACHADA'].includes(selectedSolicitud.cabecera.Estado)}
                    className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none transition-all placeholder:text-slate-400 font-medium text-slate-700"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-0 border-t border-slate-100 p-6 bg-slate-50/50 backdrop-blur rounded-b-3xl">
            {['APROBADA', 'PARCIALMENTE_DESPACHADA'].includes(selectedSolicitud?.cabecera.Estado || '') && (
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl ml-auto">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-[140px] h-14 border-2 border-slate-200 text-slate-600 hover:bg-white font-bold shadow-sm rounded-2xl transition-all order-2 sm:order-1"
                  onClick={() => {
                    setSelectedSolicitud(null);
                    setEditedItems({});
                    setObservacionesDespacho('');
                  }}
                  disabled={isDispatching}
                >
                  Cancelar
                </Button>

                {hayCantidadesPendientes() && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:flex-1 h-14 border-2 border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 font-black shadow-md flex items-center justify-center gap-2 rounded-2xl transition-all active:scale-95 order-3 sm:order-2"
                    onClick={() => handleDespachar('parcial')}
                    disabled={isDispatching || hayDespachoVacio() || hayExcedeStock()}
                  >
                    <Package className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">Despacho Parcial</span>
                  </Button>
                )}

                <Button
                  size="lg"
                  className={`w-full sm:flex-[1.5] h-14 text-white font-black shadow-lg flex items-center justify-center gap-3 text-lg rounded-2xl transition-all active:scale-95 order-1 sm:order-3 ${
                    esDespachoCompleto() 
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' 
                    : 'bg-slate-400 cursor-not-allowed opacity-70'
                  }`}
                  onClick={() => handleDespachar('total')}
                  disabled={!esDespachoCompleto() || isDispatching || hayExcedeStock()}
                >
                  <CheckCircle className="w-6 h-6 flex-shrink-0" />
                  <span className="truncate">Despacho Total</span>
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
