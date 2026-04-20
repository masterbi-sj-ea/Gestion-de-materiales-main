import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from '../contexts/PermisosContext';
import { API_BASE_URL } from '../services/apiConfig';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Search,
  Eye,
  Edit,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Package,
  RefreshCw,
  AlertCircle,
  Copy,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EstadoFrontend =
  | 'pendiente'
  | 'aprobada'
  | 'rechazada'
  | 'en_despacho'
  | 'despachada_parcial'
  | 'cerrada_parcial'
  | 'despachada_total';

interface Solicitud {
  id: string;
  numero: string;
  fecha: string;
  area: string;
  cuenta?: string;
  solicitante: string;
  estado: EstadoFrontend;
  items: number;
  total: number;
  observaciones?: string;
}

interface SolicitudResumenApi {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  Estado: string;
  IdSolicitante: number;
  NombreSolicitante: string;
  RolSolicitante: string | null;
  IdArea: number | null;
  AreaNombre: string | null;
  AreaCodigoCuenta: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
  Comentario: string | null;
  TotalItems: number;
  TotalMonto: number;
}

interface SolicitudDetalleApi {
  IdDetalleSolicitud: number;
  IdSolicitud: number;
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedidaMaterial: string;
  GrupoArticulos: string | null;
  CantidadSolicitada: number;
  CantidadAprobada: number | null;
  UnidadMedidaDetalle: string | null;
  ComentarioLinea: string | null;
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
}

interface AprobacionSolicitudApi {
  IdAprobacion: number;
  IdSolicitud: number;
  IdAprobador: number;
  NombreAprobador: string;
  EmailAprobador: string;
  FechaAprobacion: string;
  Estado: string;
  Comentario: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapea el estado que llega del backend (en cualquier capitalización) al enum
 * interno del frontend. Si llega un valor desconocido se retorna 'pendiente'
 * pero se loguea una advertencia para facilitar el debugging.
 */
function mapEstadoDesdeBackend(estadoDb: string): EstadoFrontend {
  switch ((estadoDb ?? '').toUpperCase().trim()) {
    case 'PENDIENTE':
      return 'pendiente';
    case 'APROBADA':
      return 'aprobada';
    case 'RECHAZADA':
      return 'rechazada';
    case 'EN_DESPACHO':
    // Alias que algunos backends retornan:
    case 'EN DESPACHO':
    case 'ENDESPACHO':
      return 'en_despacho';
    case 'DESPACHADA_PARCIAL':
    case 'DESPACHADA PARCIAL':
    case 'PARCIALMENTE_DESPACHADA':
    case 'PARCIALMENTE DESPACHADA':
      return 'despachada_parcial';
    case 'CERRADA_PARCIAL':
    case 'CERRADA PARCIAL':
      return 'cerrada_parcial';
    case 'DESPACHADA_TOTAL':
    case 'DESPACHADA TOTAL':
    case 'DESPACHADA':
    case 'COMPLETADA':
      return 'despachada_total';
    default:
      console.warn(`[VerSolicitudes] Estado desconocido del backend: "${estadoDb}"`);
      return 'pendiente';
  }
}

/**
 * Convierte el valor del select de filtro (frontend) al valor que espera el
 * backend como query param.
 */
function estadoFrontendToBackend(estado: string): string {
  const map: Record<string, string> = {
    pendiente: 'PENDIENTE',
    aprobada: 'APROBADA',
    rechazada: 'RECHAZADA',
    en_despacho: 'EN_DESPACHO',
    despachada_parcial: 'PARCIALMENTE_DESPACHADA',
    cerrada_parcial: 'CERRADA_PARCIAL',
    despachada_total: 'COMPLETADA',
  };
  return map[estado] ?? estado.toUpperCase();
}

function formatFechaUTC(fecha: string): string {
  return new Date(fecha).toLocaleDateString(undefined, { timeZone: 'UTC' });
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado config (badges + icons)
// ─────────────────────────────────────────────────────────────────────────────

const estadoConfig: Record<
  EstadoFrontend,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pendiente: {
    label: 'Pendiente',
    color: 'bg-amber-100 text-amber-700 border border-amber-300',
    icon: Clock,
  },
  aprobada: {
    label: 'Aprobada',
    color: 'bg-green-100 text-green-700 border border-green-300',
    icon: CheckCircle,
  },
  rechazada: {
    label: 'Rechazada',
    color: 'bg-red-100 text-red-700 border border-red-300',
    icon: XCircle,
  },
  en_despacho: {
    label: 'En Despacho',
    color: 'bg-blue-100 text-blue-700 border border-blue-300',
    icon: Truck,
  },
  despachada_parcial: {
    label: 'Desp. Parcial',
    color: 'bg-orange-100 text-orange-700 border border-orange-300',
    icon: Package,
  },
  cerrada_parcial: {
    label: 'Cerrada Parcial',
    color: 'bg-rose-100 text-rose-700 border border-rose-300',
    icon: XCircle,
  },
  despachada_total: {
    label: 'Completada',
    color: 'bg-teal-100 text-teal-700 border border-teal-300',
    icon: CheckCircle,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function VerSolicitudesPage() {
  const { getPermisosModulo, puedeAcceder } = usePermisos();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const permisosSolicitudes = user ? getPermisosModulo(user.role, 'solicitudes') : null;
  const canCreateSolicitudes = (!!user && puedeAcceder(user.role, 'crear-solicitud')) || !!permisosSolicitudes?.puedeCrear;
  const canEditSolicitudes = !!permisosSolicitudes?.puedeEditar;

  // ── Data state ──────────────────────────────────────────────────────────────
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filter & pagination state ────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // ── Detail modal state ───────────────────────────────────────────────────────
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState<SolicitudDetalleApi[]>([]);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const [aprobaciones, setAprobaciones] = useState<AprobacionSolicitudApi[]>([]);
  const [aprobacionesLoading, setAprobacionesLoading] = useState(false);
  const [aprobacionesError, setAprobacionesError] = useState<string | null>(null);

  // Ref para abortar fetch de lista cuando cambian los filtros/token
  const listAbortRef = useRef<AbortController | null>(null);

  // ── Fetch solicitudes ────────────────────────────────────────────────────────
  const fetchSolicitudes = useCallback(async () => {
    if (!token) return;

    // Cancelar petición anterior si la hay
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ soloMias: 'true' });
      if (selectedEstado !== 'todas') {
        params.set('estado', estadoFrontendToBackend(selectedEstado));
      }

      const response = await fetch(`${API_BASE_URL}/solicitudes?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${response.status} al cargar solicitudes`);
      }

      const data: SolicitudResumenApi[] = await response.json();

      const mapped: Solicitud[] = data.map((s) => ({
        id: String(s.IdSolicitud),
        numero: s.CodigoSolicitud,
        fecha: s.FechaSolicitud,
        area: s.AreaNombre ?? '-',
        cuenta: s.AreaCodigoCuenta ?? s.CentroCostoCodigo ?? '-',
        solicitante: s.NombreSolicitante,
        estado: mapEstadoDesdeBackend(s.Estado),
        items: s.TotalItems ?? 0,
        // TotalMonto viene directamente del backend — es la fuente de verdad
        total: s.TotalMonto ?? 0,
        observaciones: s.Comentario ?? undefined,
      }));

      setSolicitudes(mapped);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[VerSolicitudes] Error al cargar solicitudes:', err);
      setError(err.message ?? 'Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  }, [token, selectedEstado]);

  useEffect(() => {
    fetchSolicitudes();
    return () => listAbortRef.current?.abort();
  }, [fetchSolicitudes]);

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedEstado, searchTerm]);

  // ── Client-side search filter (solo búsqueda de texto, NOT duplicate de estado) ──
  const filteredSolicitudes = solicitudes.filter((sol) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      sol.numero.toLowerCase().includes(term) ||
      sol.area.toLowerCase().includes(term) ||
      sol.solicitante.toLowerCase().includes(term) ||
      (sol.cuenta?.toLowerCase().includes(term) ?? false)
    );
  });

  // ── Pagination ───────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredSolicitudes.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedSolicitudes = filteredSolicitudes.slice(startIndex, startIndex + PAGE_SIZE);

  // ── Modal: ver detalle ────────────────────────────────────────────────────────
  const handleVerDetalle = async (solicitud: Solicitud) => {
    if (!token) return;

    setSelectedSolicitud(solicitud);
    setDetalleSeleccionado([]);
    setDetalleError(null);
    setDetalleLoading(true);
    setAprobaciones([]);
    setAprobacionesError(null);
    setAprobacionesLoading(true);

    // Fetch detalle e aprobaciones en paralelo
    const [detalleResult, aprobResult] = await Promise.allSettled([
      fetch(`${API_BASE_URL}/solicitudes/${solicitud.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE_URL}/solicitudes/${solicitud.id}/aprobaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    // Procesar detalle
    if (detalleResult.status === 'fulfilled') {
      const res = detalleResult.value;
      if (res.ok) {
        const data: { cabecera: any; detalle: SolicitudDetalleApi[] } = await res.json();
        setDetalleSeleccionado(data.detalle ?? []);
      } else {
        setDetalleError('Error al obtener el detalle de la solicitud');
      }
    } else {
      setDetalleError('No se pudo conectar al servidor para obtener el detalle');
    }
    setDetalleLoading(false);

    // Procesar aprobaciones
    if (aprobResult.status === 'fulfilled') {
      const res = aprobResult.value;
      if (res.ok) {
        const data: AprobacionSolicitudApi[] = await res.json();
        setAprobaciones(data ?? []);
      } else {
        // 404 = sin aprobaciones aún, no es error crítico
        if (res.status !== 404) {
          setAprobacionesError('Error al obtener las aprobaciones');
        }
      }
    } else {
      setAprobacionesError('No se pudo conectar al servidor para obtener las aprobaciones');
    }
    setAprobacionesLoading(false);
  };

  const handleCerrarModal = () => {
    setSelectedSolicitud(null);
    setDetalleSeleccionado([]);
    setDetalleError(null);
    setAprobaciones([]);
    setAprobacionesError(null);
  };

  const handleEditar = (id: string) => navigate(`/solicitudes/crear?id=${id}`);
  const handleClonar = (id: string) => navigate(`/solicitudes/crear?clone=${id}`);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis Solicitudes</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Historial y seguimiento de solicitudes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchSolicitudes}
            disabled={loading}
            title="Recargar solicitudes"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Cargando...' : 'Recargar'}
          </Button>
          {canCreateSolicitudes && (
            <Button onClick={() => navigate('/solicitudes/crear')}>
              <FileText className="w-4 h-4 mr-2" />
              Nueva Solicitud
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, área, solicitante o cuenta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
            <Select value={selectedEstado} onValueChange={setSelectedEstado}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="aprobada">Aprobada</SelectItem>
                <SelectItem value="rechazada">Rechazada</SelectItem>
                <SelectItem value="en_despacho">En Despacho</SelectItem>
                <SelectItem value="despachada_parcial">Despachada Parcial</SelectItem>
                <SelectItem value="cerrada_parcial">Cerrada Parcial</SelectItem>
                <SelectItem value="despachada_total">Completada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Solicitudes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Solicitudes ({filteredSolicitudes.length})</CardTitle>
          {filteredSolicitudes.length > 0 && (
            <span className="text-sm text-muted-foreground">
              Página {safePage} de {totalPages}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {/* Error banner */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-red-700 hover:text-red-900 h-auto p-1"
                onClick={fetchSolicitudes}
              >
                Reintentar
              </Button>
            </div>
          )}

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Número</TableHead>
                  <TableHead className="min-w-[100px]">Fecha</TableHead>
                  <TableHead className="min-w-[120px]">Cuenta</TableHead>
                  <TableHead className="min-w-[200px]">Área</TableHead>
                  <TableHead className="min-w-[150px]">Solicitante</TableHead>
                  <TableHead className="text-center min-w-[70px]">Items</TableHead>
                  <TableHead className="text-right min-w-[110px]">Total (USD)</TableHead>
                  <TableHead className="min-w-[160px]">Estado</TableHead>
                  <TableHead className="text-right min-w-[120px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[90px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[160px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[130px]" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[130px]" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-[90px] ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSolicitudes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {error ? 'Error al cargar las solicitudes' : 'No se encontraron solicitudes'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSolicitudes.map((solicitud) => {
                    const config = estadoConfig[solicitud.estado];
                    const Icon = config.icon;

                    return (
                      <TableRow key={solicitud.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{solicitud.numero}</TableCell>
                        <TableCell className="text-sm">{formatFechaUTC(solicitud.fecha)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{solicitud.cuenta}</TableCell>
                        <TableCell className="text-sm max-w-[240px] truncate" title={solicitud.area}>
                          {solicitud.area}
                        </TableCell>
                        <TableCell className="text-sm">{solicitud.solicitante}</TableCell>
                        <TableCell className="text-center">{solicitud.items}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(solicitud.total)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 ${config.color}`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {/* Ver detalle */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Ver detalle"
                              onClick={() => handleVerDetalle(solicitud)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            {/* Clonar solicitud */}
                            {canCreateSolicitudes && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Clonar solicitud"
                                onClick={() => handleClonar(solicitud.id)}
                              >
                                <Copy className="w-4 h-4 text-blue-600" />
                              </Button>
                            )}

                            {/* Editar — solo disponible cuando está rechazada o aún pendiente */}
                            {canEditSolicitudes && (solicitud.estado === 'rechazada' || solicitud.estado === 'pendiente') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title={
                                  solicitud.estado === 'rechazada'
                                    ? 'Editar solicitud rechazada'
                                    : 'Editar solicitud pendiente'
                                }
                                onClick={() => handleEditar(solicitud.id)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación: se muestra cuando hay más de una página */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-muted-foreground">
                Mostrando {startIndex + 1}–
                {Math.min(startIndex + PAGE_SIZE, filteredSolicitudes.length)} de{' '}
                {filteredSolicitudes.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span>
                  Página {safePage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal Detalle ── */}
      <Dialog open={!!selectedSolicitud} onOpenChange={(open) => !open && handleCerrarModal()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          {/* Header fijo */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FileText className="w-5 h-5 text-primary" />
              Detalle de Solicitud
            </DialogTitle>
            {selectedSolicitud && (
              <DialogDescription className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-semibold text-slate-700">{selectedSolicitud.numero}</span>
                <span className="text-slate-400">·</span>
                <Badge
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 ${
                    estadoConfig[selectedSolicitud.estado].color
                  }`}
                >
                  {(() => {
                    const Icon = estadoConfig[selectedSolicitud.estado].icon;
                    return <Icon className="w-3 h-3" />;
                  })()}
                  {estadoConfig[selectedSolicitud.estado].label}
                </Badge>
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Cuerpo scrolleable */}
          {selectedSolicitud && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Info general */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <InfoField label="Fecha" value={formatFechaUTC(selectedSolicitud.fecha)} />
                <InfoField label="Solicitante" value={selectedSolicitud.solicitante} />
                <InfoField label="Área" value={selectedSolicitud.area} />
                <InfoField label="Cuenta" value={selectedSolicitud.cuenta ?? '-'} />
              </div>

              {/* Resumen de totales — usa los datos de la cabecera (fuente de verdad) */}
              <div className="border rounded-lg p-4 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-8">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total ítems: </span>
                  <span className="font-semibold">{selectedSolicitud.items}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Total monto (USD): </span>
                  <span className="font-semibold text-base">{formatCurrency(selectedSolicitud.total)}</span>
                </div>
              </div>

              {/* Materiales detalle */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Detalle de Materiales
                </h3>

                {detalleLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cargando detalle...
                  </div>
                )}

                {!detalleLoading && detalleError && (
                  <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {detalleError}
                  </div>
                )}

                {!detalleLoading && !detalleError && detalleSeleccionado.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No hay líneas de detalle registradas.</p>
                )}

                {!detalleLoading && !detalleError && detalleSeleccionado.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      <Table className="text-sm">
                        <TableHeader className="sticky top-0 bg-slate-50 z-10">
                          <TableRow>
                            <TableHead className="text-xs">N° Artículo</TableHead>
                            <TableHead className="text-xs">Descripción</TableHead>
                            <TableHead className="text-xs">Actividad / O.C.</TableHead>
                            <TableHead className="text-right text-xs">Cant. Solicitada</TableHead>
                            <TableHead className="text-right text-xs">Cant. Aprobada</TableHead>
                            <TableHead className="text-xs">Unidad</TableHead>
                            <TableHead className="text-right text-xs">En Stock</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detalleSeleccionado.map((d) => (
                            <TableRow key={d.IdDetalleSolicitud} className="text-sm">
                              <TableCell className="font-mono">{d.NumeroArticulo}</TableCell>
                              <TableCell className="max-w-[200px]">{d.DescripcionArticulo}</TableCell>
                              <TableCell className="max-w-[180px]">{d.ComentarioLinea || '—'}</TableCell>
                              <TableCell className="text-right">{d.CantidadSolicitada}</TableCell>
                              <TableCell className="text-right">
                                {d.CantidadAprobada != null ? (
                                  <span
                                    className={
                                      d.CantidadAprobada < d.CantidadSolicitada
                                        ? 'text-amber-600 font-medium'
                                        : 'text-green-700 font-medium'
                                    }
                                  >
                                    {d.CantidadAprobada}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>{d.UnidadMedidaDetalle || d.UnidadMedidaMaterial}</TableCell>
                              <TableCell className="text-right">
                                {d.EnStock != null ? (
                                  <span
                                    className={
                                      d.EnStock === 0
                                        ? 'text-red-600 font-medium'
                                        : d.EnStock < d.CantidadSolicitada
                                        ? 'text-amber-600 font-medium'
                                        : ''
                                    }
                                  >
                                    {d.EnStock}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>

              {/* Aprobaciones */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Historial de Aprobaciones
                </h3>

                {aprobacionesLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cargando aprobaciones...
                  </div>
                )}

                {!aprobacionesLoading && aprobacionesError && (
                  <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {aprobacionesError}
                  </div>
                )}

                {!aprobacionesLoading && !aprobacionesError && aprobaciones.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">
                    Sin aprobaciones registradas aún.
                  </p>
                )}

                {!aprobacionesLoading && !aprobacionesError && aprobaciones.length > 0 && (
                  <div className="space-y-2">
                    {aprobaciones.map((apr) => {
                      const esAprobado = apr.Estado?.toUpperCase() === 'APROBADA';
                      const esRechazado = apr.Estado?.toUpperCase() === 'RECHAZADA';
                      return (
                        <div
                          key={apr.IdAprobacion}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            esAprobado
                              ? 'bg-green-50 border-green-200'
                              : esRechazado
                              ? 'bg-red-50 border-red-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="mt-0.5">
                            {esAprobado ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : esRechazado ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <Clock className="w-4 h-4 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">{apr.NombreAprobador}</span>
                              <Badge
                                className={`text-xs px-1.5 py-0.5 ${
                                  esAprobado
                                    ? 'bg-green-100 text-green-700'
                                    : esRechazado
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {apr.Estado}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(apr.FechaAprobacion).toLocaleString()}
                            </div>
                            {apr.Comentario && (
                              <div className="mt-1.5 text-sm text-slate-700 bg-white/80 border border-slate-200 rounded px-2 py-1.5">
                                {apr.Comentario}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Observaciones de la cabecera */}
              {selectedSolicitud.observaciones && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Observaciones
                  </h3>
                  <div className="p-3 bg-slate-50 border rounded-lg text-sm">
                    {selectedSolicitud.observaciones}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer con acciones */}
          {selectedSolicitud && (
            <div className="shrink-0 border-t px-6 py-4 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {/* Editar si es rechazada o pendiente */}
                {canEditSolicitudes && (selectedSolicitud.estado === 'rechazada' ||
                  selectedSolicitud.estado === 'pendiente') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleCerrarModal();
                      handleEditar(selectedSolicitud.id);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    {selectedSolicitud.estado === 'rechazada' ? 'Editar y reenviar' : 'Editar'}
                  </Button>
                )}
                {canCreateSolicitudes && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleCerrarModal();
                      handleClonar(selectedSolicitud.id);
                    }}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Clonar
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleCerrarModal}>
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-slate-800 break-words">{value}</div>
    </div>
  );
}
