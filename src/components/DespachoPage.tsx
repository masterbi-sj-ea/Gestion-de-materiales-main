import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Truck, Package, CheckCircle, AlertCircle, Search, FileText, Calendar, RefreshCw, XCircle, Undo2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from '../contexts/PermisosContext';
import { sileo as toast } from 'sileo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Progress } from './ui/progress';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';
import { API_ORIGIN } from '../services/apiConfig';

// Base del backend (sin /api)
const API_BASE = API_ORIGIN;

interface ResumenSolicitudVisual {
  AreaResumen?: string;
  AreasDetalle?: string[];
  CodigoCuenta?: string | null;
  CodigoCuentaResumen?: string;
  CodigosCuentaDetalle?: string[];
  OT?: string | null;
}

// Interfaces actualizadas para coincidir con el backend
interface ItemSolicitudDetalle {
  IdDetalleSolicitud: number;
  IdMaterial: number;
  IdArea?: number | null;
  AreaNombre?: string | null;
  IdRecurso?: number | null;
  RecursoNombre?: string | null;
  Codigo: string;
  Descripcion: string;
  CodigoCuenta?: string | null;
  UnidadMedida: string;
  CantidadSolicitada: number;
  CantidadAprobada: number;
  CantidadEntregada?: number;
  CantidadPendiente: number;
  EnStock: number;
}

interface SolicitudPendiente extends ResumenSolicitudVisual {
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

interface HistorialDespacho extends ResumenSolicitudVisual {
  HistorialTipo?: 'DESPACHO' | 'CIERRE_PARCIAL' | 'DEVOLUCION';
  IdDespacho: number | null;
  IdDevolucion?: number | null;
  CodigoDevolucion?: string | null;
  FechaDespacho: string;
  EstadoDespacho: string;
  IdSolicitud: number;
  CodigoSolicitud: string;
  NombreSolicitante: string;
  NombreDespachador: string | null;
  AreaNombre: string;
  EstadoSolicitud: string;
  ItemsDespachados: number;
  MotivoCierreParcial?: string | null;
  MotivoDevolucion?: string | null;
  ObservacionesDevolucion?: string | null;
  FechaCierreParcial?: string | null;
  IdUsuarioCierreParcial?: number | null;
  NombreUsuarioCierreParcial?: string | null;
  TieneSaldoDevoluble?: boolean;
  SaldoDisponibleDevolucion?: number;
  ReversaPresupuesto?: boolean | null;
  FueraVentanaPresupuesto?: boolean | null;
  MontoReversionPresupuesto?: number;
}

interface SolicitudDetallada {
  cabecera: ResumenSolicitudVisual & {
    IdSolicitud: number;
    CodigoSolicitud: string;
    FechaSolicitud: string;
    AreaNombre: string;
    CentroCostoCodigo?: string | null;
    CodigoCuenta?: string | null;
    CodigoCentroCosto?: string; // legacy
    NombreSolicitante: string;
    ComentarioSolicitud: string | null;
    Estado: string;
  };
  detalle: ItemSolicitudDetalle[];
}

// Interfaz para filtros del historial
interface HistorialFiltros {
  fechaDesde: string;
  fechaHasta: string;
  page: number;
  pageSize: number;
}

interface PaginationState {
  page: number;
  pageSize: number;
}

interface PendingListResponse {
  data: SolicitudPendiente[];
  total: number;
  totalItems: number;
}

interface HistorialListResponse {
  data: HistorialDespacho[];
  total: number;
}

interface DevolucionDespachoResumen {
  IdDevolucion: number;
  CodigoDevolucion: string;
  IdDespacho: number;
  IdSolicitud: number;
  FechaDespachoOrigen: string;
  FechaDevolucion: string;
  IdUsuarioRecibe: number;
  NombreUsuarioRecibe: string | null;
  Motivo: string;
  Observaciones?: string | null;
  Estado: string;
  ReversaPresupuesto: boolean;
  FueraVentanaPresupuesto: boolean;
  FechaLimiteReversion: string;
  MontoReversionPresupuesto: number;
  ItemsDevueltos: number;
}

interface DevolucionDetalleLinea {
  IdDetalleDespacho: number;
  IdDetalleSolicitud?: number | null;
  IdMaterial: number;
  Codigo: string;
  Descripcion: string;
  UnidadMedida: string;
  AreaNombre?: string | null;
  CodigoCuenta?: string | null;
  CantidadDespachada: number;
  CantidadYaDevuelta: number;
  CantidadDisponibleDevolver: number;
}

interface DetalleParaDevolucion {
  cabecera: ResumenSolicitudVisual & {
    IdDespacho: number;
    IdSolicitud: number;
    CodigoSolicitud: string;
    FechaDespacho: string;
    FechaSolicitud: string;
    OT?: string | null;
    NombreSolicitante: string;
    NombreDespachador: string;
    AreaNombre: string;
    CodigoCuenta?: string | null;
    FechaLimiteReversion: string;
    ReversaPresupuestoPreview: boolean;
    FueraVentanaPresupuestoPreview: boolean;
  };
  detalle: DevolucionDetalleLinea[];
}

interface DevolucionAnulacionTarget {
  idDevolucion: number;
  codigoDevolucion: string | null;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { name?: unknown; message?: unknown };
    return String(maybeError.name ?? '') === 'AbortError'
      || String(maybeError.message ?? '').includes('signal is aborted');
  }

  return false;
}

type SummaryCarrier = Partial<ResumenSolicitudVisual> & {
  AreaNombre?: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)),
  );
}

function getAreaValues(entry: SummaryCarrier): string[] {
  if ((entry.AreasDetalle?.length ?? 0) > 0) {
    return uniqueStrings(entry.AreasDetalle ?? []);
  }

  return uniqueStrings([entry.AreaResumen ?? null, entry.AreaNombre ?? null]);
}

function getCodigoCuentaValues(entry: SummaryCarrier): string[] {
  if ((entry.CodigosCuentaDetalle?.length ?? 0) > 0) {
    return uniqueStrings(entry.CodigosCuentaDetalle ?? []);
  }

  return uniqueStrings([entry.CodigoCuentaResumen ?? null, entry.CodigoCuenta ?? null]);
}

function formatStoredDateAsUtc(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-NI', { timeZone: 'UTC' }).format(parsed);
}

function formatCurrencyUsd(value: number | null | undefined): string {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

function getPaginationItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 3) {
    return [1, 2, 3, 4, 'ellipsis', totalPages];
  }

  if (page >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}

function getBadgeToneClasses(tone: 'default' | 'accent' | 'success' = 'default') {
  if (tone === 'accent') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }

  if (tone === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

const SOLICITUD_DESPACHABLE_STATES = ['APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA'];

function normalizeSolicitudWorkflowState(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'DESPACHADA':
    case 'DESPACHADA_TOTAL':
    case 'DESPACHADA TOTAL':
      return 'COMPLETADA';
    case 'DESPACHADA_PARCIAL':
    case 'DESPACHADA PARCIAL':
      return 'PARCIALMENTE_DESPACHADA';
    case 'CERRADA PARCIAL':
      return 'CERRADA_PARCIAL';
    case 'EN DESPACHO':
    case 'ENDESPACHO':
      return 'EN_DESPACHO';
    default:
      return normalized;
  }
}

function isSolicitudDespachableState(value: string | null | undefined): boolean {
  return SOLICITUD_DESPACHABLE_STATES.includes(normalizeSolicitudWorkflowState(value));
}

function getSolicitudEstadoBadgeProps(value: string | null | undefined) {
  switch (normalizeSolicitudWorkflowState(value)) {
    case 'APROBADA':
      return { label: 'Aprobada', className: 'border-green-200 bg-green-50 text-green-700' };
    case 'EN_DESPACHO':
      return { label: 'En despacho', className: 'border-blue-200 bg-blue-50 text-blue-700' };
    case 'PARCIALMENTE_DESPACHADA':
      return { label: 'Parcialmente despachada', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'COMPLETADA':
      return { label: 'Completada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'CERRADA_PARCIAL':
      return { label: 'Cerrada parcial', className: 'border-rose-200 bg-rose-50 text-rose-700' };
    case 'RECHAZADA':
      return { label: 'Rechazada', className: 'border-red-200 bg-red-50 text-red-700' };
    case 'PENDIENTE':
    default:
      return { label: 'Pendiente', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function getEstadoDespachoBadgeProps(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'CIERRE_PARCIAL':
      return { label: 'Cierre parcial', className: 'border-rose-200 bg-rose-50 text-rose-700' };
    case 'DEVOLUCION_REVERSA':
      return { label: 'Revierte presupuesto', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'DEVOLUCION_STOCK':
      return { label: 'Solo stock', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'PROCESADO':
      return { label: 'Procesado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'COMPLETO':
      return { label: 'Completo', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'PARCIAL':
      return { label: 'Parcial', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'ANULADO':
    case 'ANULADA':
      return { label: 'Anulado', className: 'border-red-200 bg-red-50 text-red-700' };
    default:
      return { label: normalized || 'N/D', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function isEstadoDespachoAnulado(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'ANULADO' || normalized === 'ANULADA';
}

function getEstadoDevolucionBadgeProps(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'ANULADO':
    case 'ANULADA':
      return { label: 'Anulada', className: 'border-red-200 bg-red-50 text-red-700' };
    case 'REGISTRADA':
      return { label: 'Registrada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    default:
      return { label: normalized || 'N/D', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function canOpenDevolucionHistorial(entry: HistorialDespacho): boolean {
  return entry.HistorialTipo === 'DESPACHO'
    && entry.IdDespacho != null
    && Boolean(entry.TieneSaldoDevoluble);
}

function canAnularDevolucionHistorial(entry: HistorialDespacho): boolean {
  return entry.HistorialTipo === 'DEVOLUCION'
    && entry.IdDevolucion != null
    && !isEstadoDespachoAnulado(entry.EstadoDespacho);
}

function isHistorialDespachoReal(entry: HistorialDespacho): boolean {
  return entry.HistorialTipo === 'DESPACHO' && entry.IdDespacho != null;
}

function SummaryBadges({
  values,
  emptyLabel,
  tone = 'default',
}: {
  values: string[];
  emptyLabel: string;
  tone?: 'default' | 'accent' | 'success';
}) {
  if (values.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  const visibleValues = values.slice(0, 2);
  const overflow = values.length - visibleValues.length;
  const badgeClassName = getBadgeToneClasses(tone);

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleValues.map((value) => (
        <Badge key={value} variant="outline" className={`max-w-full truncate ${badgeClassName}`}>
          {value}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className={badgeClassName}>
          +{overflow}
        </Badge>
      )}
    </div>
  );
}

function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando {start}-{end} de {totalItems}
      </p>

      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (page > 1) {
                    onPageChange(page - 1);
                  }
                }}
                className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>

            {getPaginationItems(page, totalPages).map((item, index) => (
              <PaginationItem key={`${item}-${index}`}>
                {item === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    onClick={(event) => {
                      event.preventDefault();
                      onPageChange(item);
                    }}
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (page < totalPages) {
                    onPageChange(page + 1);
                  }
                }}
                className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

export default function DespachoPage() {
  const { token, user } = useAuth();
  const { getPermisosModulo } = usePermisos();
  const permisosModulo = user ? getPermisosModulo(user.role, 'despacho') : null;
  const canViewDespacho = !!permisosModulo?.puedeVer;
  const canDispatch = !!permisosModulo?.puedeCrear;
  const canClosePartial = !!permisosModulo?.puedeAprobar;
  const canReturn = !!permisosModulo?.puedeEditar;
  const canVoidReturn = !!permisosModulo?.puedeEliminar;
  const canDownloadPdf = canViewDespacho;
  const canOperateDespacho = canDispatch || canClosePartial;
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  const [historial, setHistorial] = useState<HistorialDespacho[]>([]);
  const [pendientesTotal, setPendientesTotal] = useState<number>(0);
  const [pendientesItemsTotal, setPendientesItemsTotal] = useState<number>(0);
  const [historialTotal, setHistorialTotal] = useState<number>(0);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [selectedSolicitud, setSelectedSolicitud] = useState<SolicitudDetallada | null>(null);
  const [loadingModalId, setLoadingModalId] = useState<number | null>(null);
  const [editedItems, setEditedItems] = useState<Record<number, number>>({});
  const [observacionesDespacho, setObservacionesDespacho] = useState('');
  const [motivoCierreParcial, setMotivoCierreParcial] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [selectedDevolucionDetalle, setSelectedDevolucionDetalle] = useState<DetalleParaDevolucion | null>(null);
  const [devolucionesRegistradas, setDevolucionesRegistradas] = useState<DevolucionDespachoResumen[]>([]);
  const [loadingDevolucionModalId, setLoadingDevolucionModalId] = useState<number | null>(null);
  const [loadingDevolucionesRegistradas, setLoadingDevolucionesRegistradas] = useState(false);
  const [isSavingDevolucion, setIsSavingDevolucion] = useState(false);
  const [cantidadesDevolucion, setCantidadesDevolucion] = useState<Record<number, number>>({});
  const [observacionesLineaDevolucion, setObservacionesLineaDevolucion] = useState<Record<number, string>>({});
  const [motivoDevolucion, setMotivoDevolucion] = useState('');
  const [observacionesDevolucion, setObservacionesDevolucion] = useState('');
  const [devolucionAnulacionTarget, setDevolucionAnulacionTarget] = useState<DevolucionAnulacionTarget | null>(null);
  const [motivoAnulacionDevolucion, setMotivoAnulacionDevolucion] = useState('');
  const [observacionesAnulacionDevolucion, setObservacionesAnulacionDevolucion] = useState('');
  const [isAnulandoDevolucion, setIsAnulandoDevolucion] = useState(false);
  const [despachosHoy, setDespachosHoy] = useState<number>(0);
  const [downloadingPdf, setDownloadingPdf] = useState<number | null>(null);
  const [downloadingDevolucionPdf, setDownloadingDevolucionPdf] = useState<number | null>(null);
  const [historialFiltros, setHistorialFiltros] = useState<HistorialFiltros>({
    fechaDesde: '',
    fechaHasta: '',
    page: 1,
    pageSize: 10,
  });

  const downloadDespachoPdf = async (idDespacho: number) => {
    if (!canDownloadPdf) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para descargar PDFs de despacho.' });
      return;
    }

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

  const downloadDevolucionPdf = async (idDevolucion: number, codigoDevolucion?: string | null) => {
    if (!canDownloadPdf) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para descargar PDFs de devolución.' });
      return;
    }

    try {
      setDownloadingDevolucionPdf(idDevolucion);
      const response = await fetch(`${API_BASE}/api/despachos/devoluciones/${idDevolucion}/pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('No se pudo generar el PDF de devolución');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${codigoDevolucion || `Devolucion_${idDevolucion}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error descargando PDF de devolución:', error);
      toast.error({ title: 'Error', description: 'No se pudo descargar el PDF de devolución.' });
    } finally {
      setDownloadingDevolucionPdf(null);
    }
  };
  const [loadingDespachosHoy, setLoadingDespachosHoy] = useState<boolean>(false);
  const [itemSearch, setItemSearch] = useState<string>('');
  const [scannerMode, setScannerMode] = useState(true);
  const [pendientesPaginacion, setPendientesPaginacion] = useState<PaginationState>({
    page: 1,
    pageSize: 10,
  });
  const pendientesAbortRef = useRef<AbortController | null>(null);
  // Ref para abortar el fetch del historial
  const historialAbortRef = useRef<AbortController | null>(null);
  const devolucionAbortRef = useRef<AbortController | null>(null);

  const handleScannerInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!canDispatch) {
      return;
    }

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

  const loadPendientes = useCallback(async (pagination: PaginationState, signal?: AbortSignal) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pagination.page));
      params.set('pageSize', String(pagination.pageSize));

      const response = await fetch(`${API_BASE}/api/despachos/pendientes?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error('Error al cargar las solicitudes pendientes');

      const result: PendingListResponse | SolicitudPendiente[] = await response.json();
      const data = Array.isArray(result) ? result : (result.data ?? []);
      const total = Number(Array.isArray(result) ? data.length : (result.total ?? data.length));
      const totalItems = Number(
        Array.isArray(result)
          ? data.reduce((sum, solicitud) => sum + Number(solicitud.ItemsTotal ?? 0), 0)
          : (result.totalItems ?? data.reduce((sum, solicitud) => sum + Number(solicitud.ItemsTotal ?? 0), 0)),
      );
      const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));

      setSolicitudes(data);
      setPendientesTotal(total);
      setPendientesItemsTotal(totalItems);

      if (pagination.page > totalPages) {
        setPendientesPaginacion((current) => (
          current.page > totalPages ? { ...current, page: totalPages } : current
        ));
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error(error);
      toast.error({ title: 'Error', description: 'No se pudieron cargar las solicitudes para despacho.' });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [token]);

  // ── Función de carga del historial (memoizada para poder llamarla desde varios lugares) ──
  const loadHistorial = useCallback(async (filtros: HistorialFiltros, signal?: AbortSignal) => {
    if (!token) return;
    setLoadingHistorial(true);
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.set('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.set('fechaHasta', filtros.fechaHasta);
      params.set('page', String(filtros.page));
      params.set('pageSize', String(filtros.pageSize));

      const response = await fetch(`${API_BASE}/api/despachos/historial?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok) throw new Error('Error al cargar historial');
      const result: HistorialListResponse | HistorialDespacho[] = await response.json();
      // El backend devuelve { data: [...], total: N }
      const data = Array.isArray(result) ? result : (result.data ?? []);
      const total = Number(Array.isArray(result) ? data.length : (result.total ?? 0));
      const totalPages = Math.max(1, Math.ceil(total / filtros.pageSize));

      setHistorial(data);
      setHistorialTotal(total);

      if (filtros.page > totalPages) {
        setHistorialFiltros((current) => (
          current.page > totalPages ? { ...current, page: totalPages } : current
        ));
      }
    } catch (error) {
      if (isAbortError(error)) return;
      console.error(error);
      toast.error({ title: 'Error', description: 'Error cargando historial de despachos' });
    } finally {
      if (!signal?.aborted) {
        setLoadingHistorial(false);
      }
    }
  }, [token]);

  const resetDevolucionState = useCallback(() => {
    setSelectedDevolucionDetalle(null);
    setDevolucionesRegistradas([]);
    setCantidadesDevolucion({});
    setObservacionesLineaDevolucion({});
    setMotivoDevolucion('');
    setObservacionesDevolucion('');
    setLoadingDevolucionesRegistradas(false);
  }, []);

  const resetAnulacionDevolucionState = useCallback(() => {
    setDevolucionAnulacionTarget(null);
    setMotivoAnulacionDevolucion('');
    setObservacionesAnulacionDevolucion('');
  }, []);

  const loadDevolucionesPorDespacho = useCallback(async (idDespacho: number, signal?: AbortSignal) => {
    if (!token) {
      throw new Error('Sesión expirada');
    }

    const response = await fetch(`${API_BASE}/api/despachos/${idDespacho}/devoluciones`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.message || 'No se pudo cargar el historial de devoluciones del despacho.');
    }

    const result = await response.json();
    return Array.isArray(result) ? result as DevolucionDespachoResumen[] : [];
  }, [token]);

  const loadDetalleDevolucion = useCallback(async (idDespacho: number, signal?: AbortSignal) => {
    if (!token) {
      throw new Error('Sesión expirada');
    }

    const response = await fetch(`${API_BASE}/api/despachos/${idDespacho}/devolucion-detalle`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.message || 'No se pudo cargar el detalle para devolución.');
    }

    return await response.json() as DetalleParaDevolucion;
  }, [token]);

  const loadDevolucionModalContext = useCallback(async (
    idDespacho: number,
    options?: { signal?: AbortSignal; resetInputs?: boolean },
  ) => {
    const detalle = await loadDetalleDevolucion(idDespacho, options?.signal);
    setSelectedDevolucionDetalle(detalle);

    if (options?.resetInputs) {
      const initialCantidades: Record<number, number> = {};
      const initialObservaciones: Record<number, string> = {};
      detalle.detalle.forEach((item) => {
        initialCantidades[item.IdDetalleDespacho] = 0;
        initialObservaciones[item.IdDetalleDespacho] = '';
      });
      setCantidadesDevolucion(initialCantidades);
      setObservacionesLineaDevolucion(initialObservaciones);
      setMotivoDevolucion('');
      setObservacionesDevolucion('');
    }

    setLoadingDevolucionesRegistradas(true);
    try {
      const devoluciones = await loadDevolucionesPorDespacho(idDespacho, options?.signal);
      setDevolucionesRegistradas(devoluciones);
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('Error cargando devoluciones del despacho', error);
      }
      setDevolucionesRegistradas([]);
    } finally {
      if (!options?.signal?.aborted) {
        setLoadingDevolucionesRegistradas(false);
      }
    }
  }, [loadDetalleDevolucion, loadDevolucionesPorDespacho]);

  const requestHistorialRefresh = useCallback((overrides: Partial<HistorialFiltros> = {}) => {
    if (!canViewDespacho) {
      return;
    }

    const nextFiltros = { ...historialFiltros, ...overrides };
    setHistorialFiltros(nextFiltros);

    if (activeTab !== 'historial') {
      void loadHistorial(nextFiltros);
    }
  }, [activeTab, canViewDespacho, historialFiltros, loadHistorial]);

  useEffect(() => {
    if (!token || !canViewDespacho) return;
    pendientesAbortRef.current?.abort();
    const controller = new AbortController();
    pendientesAbortRef.current = controller;
    loadPendientes(pendientesPaginacion, controller.signal);
    return () => controller.abort();
  }, [token, canViewDespacho, pendientesPaginacion, loadPendientes]);

  // Cargar conteo de despachos hoy desde backend (métrica dedicada)
  useEffect(() => {
    const controller = new AbortController();
    const loadDespachosHoy = async () => {
      if (!token || !canViewDespacho) return;
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
        if (isAbortError(error)) {
          return;
        }
        console.error('Error cargando despachos hoy (métrica)', error);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDespachosHoy(false);
        }
      }
    };
    loadDespachosHoy();
    return () => controller.abort();
  }, [token, canViewDespacho]);

  // Cargar historial cuando el tab cambie a 'historial' o cambien los filtros
  useEffect(() => {
    if (!canViewDespacho || activeTab !== 'historial') return;
    historialAbortRef.current?.abort();
    const controller = new AbortController();
    historialAbortRef.current = controller;
    loadHistorial(historialFiltros, controller.signal);
    return () => controller.abort();
  }, [token, canViewDespacho, activeTab, historialFiltros, loadHistorial]);

  useEffect(() => {
    if (!canDispatch && scannerMode) {
      setScannerMode(false);
    }
  }, [canDispatch, scannerMode]);

  const handleOpenDespacho = async (solicitud: SolicitudPendiente) => {
    if (!canOperateDespacho) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso operativo para abrir este despacho.' });
      return;
    }

    if (!token || loadingModalId !== null) return;
    setLoadingModalId(solicitud.IdSolicitud);
    setSelectedSolicitud(null);
    try {
      const response = await fetch(`${API_BASE}/api/despachos/pendientes/${solicitud.IdSolicitud}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message || 'Error al cargar el detalle de la solicitud');
      }
      const data: SolicitudDetallada = await response.json();
      setSelectedSolicitud(data);

      // Inicializar con la cantidad pendiente real desde el backend (ya corregida)
      const initialItems: Record<number, number> = {};
      data.detalle.forEach(item => {
        initialItems[item.IdDetalleSolicitud] = canDispatch ? (item.CantidadPendiente ?? 0) : 0;
      });
      setEditedItems(initialItems);
      setObservacionesDespacho('');
      setMotivoCierreParcial('');
    } catch (error) {
      console.error(error);
      toast.error({ title: 'Error', description: 'No se pudo cargar el detalle de la solicitud.' });
    } finally {
      setLoadingModalId(null);
    }
  };

  const handleOpenDevolucion = async (despacho: HistorialDespacho) => {
    if (!canReturn) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para registrar devoluciones.' });
      return;
    }

    const idDespacho = Number(despacho.IdDespacho ?? 0);
    if (!token || loadingDevolucionModalId !== null || idDespacho <= 0) return;

    devolucionAbortRef.current?.abort();
    const controller = new AbortController();
    devolucionAbortRef.current = controller;

    setLoadingDevolucionModalId(idDespacho);
    resetDevolucionState();

    try {
      await loadDevolucionModalContext(idDespacho, { signal: controller.signal, resetInputs: true });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error('Error al cargar el detalle para devolución', error);
      toast.error({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo cargar el detalle para devolución.' });
      resetDevolucionState();
    } finally {
      if (!controller.signal.aborted) {
        setLoadingDevolucionModalId(null);
      }
    }
  };

  const handleOpenAnularDevolucion = (despacho: HistorialDespacho) => {
    if (!canVoidReturn) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para anular devoluciones.' });
      return;
    }

    const idDevolucion = Number(despacho.IdDevolucion ?? 0);
    if (idDevolucion <= 0 || isEstadoDespachoAnulado(despacho.EstadoDespacho)) {
      return;
    }

    setDevolucionAnulacionTarget({
      idDevolucion,
      codigoDevolucion: String(despacho.CodigoDevolucion ?? '').trim() || null,
    });
    setMotivoAnulacionDevolucion('');
    setObservacionesAnulacionDevolucion('');
  };

  const handleCantidadChange = (idDetalleSolicitud: number, value: string) => {
    if (!canDispatch) {
      return;
    }

    const parsed = parseFloat(value);
    const numValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setEditedItems({
      ...editedItems,
      [idDetalleSolicitud]: numValue,
    });
  };

  const handleCantidadDevolucionChange = (idDetalleDespacho: number, value: string) => {
    const parsed = parseFloat(value);
    const numValue = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    setCantidadesDevolucion((current) => ({
      ...current,
      [idDetalleDespacho]: numValue,
    }));
  };

  const handleObservacionLineaDevolucionChange = (idDetalleDespacho: number, value: string) => {
    setObservacionesLineaDevolucion((current) => ({
      ...current,
      [idDetalleDespacho]: value,
    }));
  };

  const handleDespachar = async (tipo: 'total' | 'parcial' | 'cerrar_parcial') => {
    if (!selectedSolicitud || isDispatching) return;
    const esCierreParcial = tipo === 'cerrar_parcial';

    if (esCierreParcial && !canClosePartial) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para cerrar parcialmente solicitudes.' });
      return;
    }

    if (!esCierreParcial && !canDispatch) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para despachar materiales.' });
      return;
    }

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

      if (!esCierreParcial && detalleDespacho.length === 0) {
        toast.error({ title: 'Sin ítems', description: 'Debes ingresar al menos una cantidad a despachar.' });
        setIsDispatching(false);
        return;
      }

      if (esCierreParcial && !motivoCierreParcial.trim()) {
        toast.error({ title: 'Motivo requerido', description: 'Debes indicar el motivo del cierre parcial.' });
        setIsDispatching(false);
        return;
      }

      const payload = {
        idSolicitud: selectedSolicitud.cabecera.IdSolicitud,
        observaciones: observacionesDespacho,
        detalle: detalleDespacho,
        accion: esCierreParcial ? 'cerrar_parcial' : 'despachar',
        motivoCierreParcial: esCierreParcial ? motivoCierreParcial.trim() : undefined,
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

      toast.success({
        title: esCierreParcial ? 'Solicitud cerrada parcialmente' : 'Despacho registrado',
        description: esCierreParcial
          ? 'El saldo restante quedó cerrado y dejó de comprometer presupuesto.'
          : 'Requisa generada correctamente.',
      });
      
      // Descargar el PDF generado por el backend
      if (canDownloadPdf && (result.IdDespachoGenerado || result.idDespachoGenerado)) {
        const idDesp = result.IdDespachoGenerado || result.idDespachoGenerado;
        await downloadDespachoPdf(idDesp);
      }

      // Refresco post-despacho: pendientes + historial (siempre, no solo si el tab está activo) + KPI
      try {
        const [reloadPendientesResult, responseMetrics] = await Promise.allSettled([
          loadPendientes(pendientesPaginacion),
          fetch(`${API_BASE}/api/despachos/metrics/hoy`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (responseMetrics.status === 'fulfilled' && responseMetrics.value.ok) {
          const metricsData = await responseMetrics.value.json();
          setDespachosHoy(Number(metricsData?.todayCount ?? 0));
        }

        if (reloadPendientesResult.status === 'rejected') {
          console.error('Error refrescando solicitudes pendientes', reloadPendientesResult.reason);
        }

        // Siempre refrescar el historial en background (para que esté fresco al cambiar de tab)
        requestHistorialRefresh({ page: 1 });
      } catch (refreshErr) {
        console.error('Error refrescando listas post-despacho', refreshErr);
      }
      setSelectedSolicitud(null);
      setEditedItems({});
      setObservacionesDespacho('');
      setMotivoCierreParcial('');

    } catch (error: any) {
      console.error('Error al despachar:', error);
      toast.error({ title: "Error", description: error.message || 'No se pudo registrar el despacho.'});
    } finally {
      setIsDispatching(false);
    }
  };

  const handleGuardarDevolucion = async () => {
    if (!canReturn) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para registrar devoluciones.' });
      return;
    }

    if (!selectedDevolucionDetalle || isSavingDevolucion) return;

    if (!motivoDevolucion.trim()) {
      toast.error({ title: 'Motivo requerido', description: 'Debes indicar el motivo de la devolución.' });
      return;
    }

    for (const item of selectedDevolucionDetalle.detalle) {
      const cantidad = cantidadesDevolucion[item.IdDetalleDespacho] || 0;
      if (cantidad <= 0) continue;

      if (cantidad > item.CantidadDisponibleDevolver) {
        toast.error({
          title: 'Cantidad inválida',
          description: `La cantidad de ${item.Descripcion} excede el saldo disponible para devolver (${item.CantidadDisponibleDevolver}).`,
        });
        return;
      }
    }

    const detallePayload = selectedDevolucionDetalle.detalle
      .map((item) => {
        const cantidad = cantidadesDevolucion[item.IdDetalleDespacho] || 0;
        if (cantidad <= 0) return null;

        return {
          idDetalleDespacho: item.IdDetalleDespacho,
          cantidadDevuelta: cantidad,
          observacionLinea: (observacionesLineaDevolucion[item.IdDetalleDespacho] || '').trim() || undefined,
        };
      })
      .filter(Boolean);

    if (detallePayload.length === 0) {
      toast.error({ title: 'Sin líneas', description: 'Debes indicar al menos una cantidad a devolver.' });
      return;
    }

    setIsSavingDevolucion(true);
    try {
      const response = await fetch(`${API_BASE}/api/despachos/${selectedDevolucionDetalle.cabecera.IdDespacho}/devoluciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          motivo: motivoDevolucion.trim(),
          observaciones: observacionesDevolucion.trim(),
          fechaDevolucion: null,
          detalle: detallePayload,
        }),
      });

      const result: any = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error({
          title: 'Error',
          description: result?.message || 'No se pudo registrar la devolución.',
        });
        return;
      }

      const reviertePresupuesto = Boolean(
        result?.ReversaPresupuesto
        ?? result?.reversaPresupuesto
        ?? selectedDevolucionDetalle.cabecera.ReversaPresupuestoPreview,
      );

      toast.success({
        title: 'Devolución registrada',
        description: reviertePresupuesto
          ? 'Devolución registrada y presupuesto revertido.'
          : 'Devolución registrada, solo reingresó a stock.',
      });

      const idDevolucionGenerada = Number(
        result?.IdDevolucion
        ?? result?.idDevolucion
        ?? result?.IdDevolucionGenerada
        ?? result?.idDevolucionGenerada
        ?? 0,
      );
      const codigoDevolucionGenerada = String(
        result?.CodigoDevolucion
        ?? result?.codigoDevolucion
        ?? '',
      ).trim() || null;

      requestHistorialRefresh({ page: 1 });
      await loadDevolucionModalContext(selectedDevolucionDetalle.cabecera.IdDespacho, { resetInputs: true });

      if (canDownloadPdf && idDevolucionGenerada > 0) {
        void downloadDevolucionPdf(idDevolucionGenerada, codigoDevolucionGenerada);
      }
    } catch (error) {
      console.error('Error al registrar devolución:', error);
      toast.error({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo registrar la devolución.',
      });
    } finally {
      setIsSavingDevolucion(false);
    }
  };

  const handleConfirmarAnulacionDevolucion = async () => {
    if (!canVoidReturn) {
      toast.error({ title: 'Sin permiso', description: 'No tienes permiso para anular devoluciones.' });
      return;
    }

    if (!devolucionAnulacionTarget || isAnulandoDevolucion) return;

    const motivoAnulacion = motivoAnulacionDevolucion.trim();
    if (!motivoAnulacion) {
      toast.error({ title: 'Motivo requerido', description: 'Debes indicar el motivo de la anulación.' });
      return;
    }

    setIsAnulandoDevolucion(true);
    try {
      const response = await fetch(`${API_BASE}/api/despachos/devoluciones/${devolucionAnulacionTarget.idDevolucion}/anular`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          motivoAnulacion,
          observaciones: observacionesAnulacionDevolucion.trim(),
        }),
      });

      const result: any = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error({
          title: 'Error',
          description: result?.message || 'No se pudo anular la devolución.',
        });
        return;
      }

      toast.success({
        title: 'Devolución anulada',
        description: result?.message || 'La devolución fue anulada correctamente.',
      });

      resetAnulacionDevolucionState();
      requestHistorialRefresh();
    } catch (error) {
      console.error('Error al anular devolución:', error);
      toast.error({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo anular la devolución.',
      });
    } finally {
      setIsAnulandoDevolucion(false);
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

  const hayDevolucionVacia = () => {
    if (!selectedDevolucionDetalle) return true;
    return selectedDevolucionDetalle.detalle.every((item) => {
      const cantidad = cantidadesDevolucion[item.IdDetalleDespacho] || 0;
      return cantidad === 0;
    });
  };

  const hayDevolucionExcedeDisponible = () => {
    if (!selectedDevolucionDetalle) return false;
    return selectedDevolucionDetalle.detalle.some((item) => {
      const cantidad = cantidadesDevolucion[item.IdDetalleDespacho] || 0;
      return cantidad > item.CantidadDisponibleDevolver;
    });
  };

  const sinSaldoDisponibleDevolver = () => {
    if (!selectedDevolucionDetalle) return true;
    return selectedDevolucionDetalle.detalle.every((item) => item.CantidadDisponibleDevolver <= 0);
  };

  const motivoCierreParcialValido = motivoCierreParcial.trim().length > 0;
  const motivoDevolucionValido = motivoDevolucion.trim().length > 0;
  const motivoAnulacionDevolucionValido = motivoAnulacionDevolucion.trim().length > 0;

  const resolveCodigoCuentaSolicitud = (cabecera: SolicitudDetallada['cabecera']) => {
    return (
      cabecera.CodigoCuenta ||
      cabecera.CentroCostoCodigo ||
      cabecera.CodigoCentroCosto ||
      ''
    );
  };

  const getItemEstado = (item: ItemSolicitudDetalle) => {
    const isDispatchingState = isSolicitudDespachableState(selectedSolicitud?.cabecera.Estado);
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

  // Progreso global del modal de despacho
  const progresoDespacho = () => {
    if (!selectedSolicitud) return { asignados: 0, total: 0, porcentaje: 0 };
    const total = selectedSolicitud.detalle.length;
    const asignados = selectedSolicitud.detalle.filter(
      item => (editedItems[item.IdDetalleSolicitud] ?? 0) > 0
    ).length;
    return { asignados, total, porcentaje: total > 0 ? Math.round((asignados / total) * 100) : 0 };
  };

  if (!canViewDespacho) {
    return (
      <div className="space-y-6">
        <div>
          <h1>Despacho de Bodega</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de despachos de solicitudes aprobadas
          </p>
        </div>

        <Card>
          <CardContent className="py-10">
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-semibold text-slate-900">Sin acceso a despacho</h2>
              <p className="text-sm text-muted-foreground">
                Tu rol no tiene permiso para ver este módulo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1>Despacho de Bodega</h1>
        <p className="text-muted-foreground mt-1">
          Gestión de despachos de solicitudes aprobadas
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes ({pendientesTotal})</TabsTrigger>
          <TabsTrigger value="historial">
            Historial Despachadas
            {historialTotal > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">
                {historialTotal}
              </span>
            )}
          </TabsTrigger>
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
                <div className="text-2xl">{loading ? '...' : pendientesTotal}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Solicitudes en cola
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
                  {loading ? '...' : pendientesItemsTotal}
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
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
              <div className="space-y-1">
                <CardTitle>Solicitudes pendientes de despacho</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Cola operativa de despacho. Solo se muestran solicitudes aprobadas o parcialmente despachadas.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                <div className="font-semibold text-slate-900">Página {pendientesPaginacion.page}</div>
                <div>{Math.max(1, Math.ceil(pendientesTotal / pendientesPaginacion.pageSize))} total</div>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="border-y sm:border sm:rounded-lg overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Solicitud</TableHead>
                      <TableHead>Área / actividad</TableHead>
                      <TableHead>Código cuenta</TableHead>
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
                      solicitudes.map((solicitud) => {
                        const isLoadingThis = loadingModalId === solicitud.IdSolicitud;
                        const isLoadingOther = loadingModalId !== null && !isLoadingThis;
                        const areas = getAreaValues(solicitud);
                        const codigosCuenta = getCodigoCuentaValues(solicitud);

                        return (
                        <TableRow key={solicitud.IdSolicitud}>
                          <TableCell>
                            <div className="space-y-1.5">
                              <div className="font-medium text-slate-900">{solicitud.CodigoSolicitud}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatStoredDateAsUtc(solicitud.FechaSolicitud)}
                              </div>
                              {solicitud.OT && (
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                  OT {solicitud.OT}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <SummaryBadges values={areas} emptyLabel="Sin área registrada" />
                          </TableCell>
                          <TableCell className="align-top">
                            <SummaryBadges values={codigosCuenta} emptyLabel="Sin cuenta configurada" tone="accent" />
                          </TableCell>
                          <TableCell>
                            <Badge variant={solicitud.ListaParaDespachar ? 'secondary' : 'destructive'}>
                              {solicitud.EstadoDespachoLabel ?? (solicitud.Estado ?? 'APROBADA')}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-slate-700">{solicitud.NombreSolicitante}</TableCell>
                          <TableCell className="text-center">{solicitud.ItemsTotal}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleOpenDespacho(solicitud)}
                              disabled={loadingModalId !== null || !canOperateDespacho}
                            >
                              {isLoadingThis ? (
                                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Cargando...</>
                              ) : (
                                <>
                                  <Truck className="w-4 h-4 mr-2" />
                                  {isLoadingOther ? 'Espere...' : (canDispatch ? 'Despachar' : 'Cerrar parcial')}
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {!loading && pendientesTotal > 0 && (
                <TablePagination
                  page={pendientesPaginacion.page}
                  pageSize={pendientesPaginacion.pageSize}
                  totalItems={pendientesTotal}
                  onPageChange={(nextPage) => setPendientesPaginacion((current) => ({ ...current, page: nextPage }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial" className="space-y-6">
          {/* Filtros del historial */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filtros del Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Desde</Label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      type="date"
                      value={historialFiltros.fechaDesde}
                      onChange={e => setHistorialFiltros(f => ({ ...f, fechaDesde: e.target.value, page: 1 }))}
                      className="pl-9 h-9 text-sm w-40"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Hasta</Label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      type="date"
                      value={historialFiltros.fechaHasta}
                      onChange={e => setHistorialFiltros(f => ({ ...f, fechaHasta: e.target.value, page: 1 }))}
                      className="pl-9 h-9 text-sm w-40"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setHistorialFiltros({ fechaDesde: '', fechaHasta: '', page: 1, pageSize: 10 });
                  }}
                >
                  Limpiar
                </Button>
                <Button
                  size="sm"
                  className="h-9 ml-auto"
                  onClick={() => loadHistorial(historialFiltros)}
                  disabled={loadingHistorial}
                >
                  {loadingHistorial
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Cargando...</>
                    : <><RefreshCw className="w-4 h-4 mr-2" />Recargar</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle>Historial de despacho</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Incluye despachos, devoluciones registradas y cierres parciales con su motivo.
                </p>
              </div>
              {historialTotal > 0 && (
                <span className="text-sm text-muted-foreground">{historialTotal} registro{historialTotal !== 1 ? 's' : ''}</span>
              )}
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="border-y sm:border sm:rounded-lg overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Solicitud</TableHead>
                      <TableHead>Despacho</TableHead>
                      <TableHead>Área / actividad</TableHead>
                      <TableHead>Código cuenta</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Estado solicitud</TableHead>
                      <TableHead className="text-center">Estado despacho</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingHistorial ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          Cargando historial...
                        </TableCell>
                      </TableRow>
                    ) : historial.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          No se han encontrado despachos realizados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historial.map((despacho) => {
                        const areas = getAreaValues(despacho);
                        const codigosCuenta = getCodigoCuentaValues(despacho);
                        const solicitudEstado = getSolicitudEstadoBadgeProps(despacho.EstadoSolicitud);
                        const despachoEstado = getEstadoDespachoBadgeProps(despacho.EstadoDespacho);
                        const isCierreParcial = despacho.HistorialTipo === 'CIERRE_PARCIAL';
                        const isDevolucion = despacho.HistorialTipo === 'DEVOLUCION';
                        const isDespachoReal = isHistorialDespachoReal(despacho);
                        const historialKey = despacho.IdDespacho != null
                          ? (isDevolucion
                            ? `devolucion-${despacho.IdDevolucion ?? despacho.IdDespacho}-${despacho.FechaDespacho}`
                            : `despacho-${despacho.IdDespacho}`)
                          : `cierre-${despacho.IdSolicitud}-${despacho.FechaCierreParcial ?? despacho.FechaDespacho}`;
                        const fechaEvento = despacho.FechaCierreParcial ?? despacho.FechaDespacho;

                        return (
                        <TableRow key={historialKey}>
                          <TableCell>
                            <div className="space-y-1.5">
                              <div className="font-medium text-slate-900">{despacho.CodigoSolicitud}</div>
                              {despacho.OT && (
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                  OT {despacho.OT}
                                </Badge>
                              )}
                              {isDevolucion && despacho.MotivoDevolucion && (
                                <p className="text-xs leading-relaxed text-amber-700">
                                  Motivo: {despacho.MotivoDevolucion}
                                </p>
                              )}
                              {isDevolucion && (
                                <p className="text-xs leading-relaxed text-slate-500">
                                  {isEstadoDespachoAnulado(despacho.EstadoDespacho)
                                    ? 'Devolución anulada; el efecto sobre stock y presupuesto fue revertido.'
                                    : despacho.ReversaPresupuesto
                                      ? `Monto revertido: ${formatCurrencyUsd(despacho.MontoReversionPresupuesto)}`
                                      : 'Sin reversión presupuestaria'}
                                </p>
                              )}
                              {isCierreParcial && despacho.MotivoCierreParcial && (
                                <p className="text-xs leading-relaxed text-rose-700">
                                  Motivo: {despacho.MotivoCierreParcial}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1.5">
                              <div className="font-medium">
                                {isCierreParcial
                                  ? 'CIERRE PARCIAL'
                                  : isDevolucion
                                    ? (despacho.CodigoDevolucion || `DEV-${despacho.IdDevolucion}`)
                                    : `DESP-${despacho.IdDespacho}`}
                              </div>
                              {isDevolucion && despacho.IdDespacho != null && (
                                <div className="text-xs text-muted-foreground">
                                  Origen DESP-{despacho.IdDespacho}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {new Date(fechaEvento).toLocaleString()}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <SummaryBadges values={areas} emptyLabel="Sin área registrada" />
                          </TableCell>
                          <TableCell className="align-top">
                            <SummaryBadges values={codigosCuenta} emptyLabel="Sin cuenta configurada" tone="accent" />
                          </TableCell>
                          <TableCell className="font-medium text-slate-700">
                            <div className="space-y-1">
                              <div>{despacho.NombreDespachador || '-'}</div>
                              {isDevolucion && (
                                <div className="text-xs font-normal text-muted-foreground">Usuario de devolución</div>
                              )}
                              {isCierreParcial && despacho.NombreUsuarioCierreParcial && (
                                <div className="text-xs font-normal text-muted-foreground">Usuario de cierre parcial</div>
                              )}
                              {isDespachoReal && !canOpenDevolucionHistorial(despacho) && (
                                <div className="text-xs font-normal text-muted-foreground">Devolución completa</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{despacho.ItemsDespachados}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={solicitudEstado.className}>{solicitudEstado.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={despachoEstado.className}>{despachoEstado.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isDespachoReal ? (
                              <div className="flex justify-end gap-1.5">
                                {canReturn && canOpenDevolucionHistorial(despacho) ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 transition-colors"
                                    onClick={() => handleOpenDevolucion(despacho)}
                                    disabled={loadingDevolucionModalId === despacho.IdDespacho || isSavingDevolucion}
                                  >
                                    {loadingDevolucionModalId === despacho.IdDespacho ? (
                                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <Undo2 className="w-4 h-4 mr-2" />
                                    )}
                                    {loadingDevolucionModalId === despacho.IdDespacho ? 'Cargando...' : 'Devolver'}
                                  </Button>
                                ) : canReturn ? (
                                  <span title="Devolución completa">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-amber-700/60 hover:text-amber-700/60 hover:bg-transparent transition-colors"
                                      disabled
                                    >
                                      <Undo2 className="w-4 h-4 mr-2" />
                                      Devolver
                                    </Button>
                                  </span>
                                ) : null}
                                {canDownloadPdf && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                                    onClick={() => downloadDespachoPdf(despacho.IdDespacho as number)}
                                    disabled={downloadingPdf === despacho.IdDespacho}
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    {downloadingPdf === despacho.IdDespacho ? '...' : 'PDF'}
                                  </Button>
                                )}
                              </div>
                            ) : isDevolucion && despacho.IdDevolucion != null ? (
                              <div className="flex justify-end gap-1.5">
                                {canVoidReturn && canAnularDevolucionHistorial(despacho) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                                    onClick={() => handleOpenAnularDevolucion(despacho)}
                                    disabled={isAnulandoDevolucion}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Anular
                                  </Button>
                                )}
                                {canDownloadPdf && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                                    onClick={() => downloadDevolucionPdf(despacho.IdDevolucion as number, despacho.CodigoDevolucion)}
                                    disabled={downloadingDevolucionPdf === despacho.IdDevolucion}
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    {downloadingDevolucionPdf === despacho.IdDevolucion ? '...' : 'PDF'}
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin PDF</span>
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {!loadingHistorial && historialTotal > 0 && (
                <TablePagination
                  page={historialFiltros.page}
                  pageSize={historialFiltros.pageSize}
                  totalItems={historialTotal}
                  onPageChange={(nextPage) => setHistorialFiltros((current) => ({ ...current, page: nextPage }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Despacho */}
      <Dialog
        open={!!selectedSolicitud || loadingModalId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedSolicitud(null);
            setEditedItems({});
            setObservacionesDespacho('');
            setMotivoCierreParcial('');
            setItemSearch('');
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] !flex !flex-col !gap-0 p-0 shadow-2xl rounded-2xl sm:rounded-3xl animate-fade-in-up overflow-hidden">
          <DialogHeader className="sticky top-0 z-20 shrink-0 bg-gradient-to-b from-slate-50 to-white/90 backdrop-blur border-b border-slate-200 rounded-t-2xl sm:rounded-t-3xl shadow-xl animate-fade-in px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900">
              <Truck className="w-5 h-5 sm:w-7 sm:h-7 text-primary drop-shadow" /> Registrar Despacho
            </DialogTitle>
            <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
              {selectedSolicitud && (
                <>
                  <span className="font-semibold text-slate-700">
                    {selectedSolicitud.cabecera.CodigoSolicitud}
                    {selectedSolicitud.cabecera.OT ? ` · OT ${selectedSolicitud.cabecera.OT}` : ''}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-sm text-slate-600">
                    {selectedSolicitud.cabecera.AreaResumen || selectedSolicitud.cabecera.AreaNombre}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingModalId !== null && !selectedSolicitud && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Cargando detalle de la solicitud...</p>
            </div>
          )}

          {selectedSolicitud && (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col py-3 px-3 sm:py-6 sm:px-6 gap-4 sm:gap-6">
              {/* Barra de búsqueda + progreso — compacta, 1 sola fila */}
              <div className="shrink-0 flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-500 flex-wrap sm:flex-nowrap">
                {/* Icono modo scanner */}
                <div className={`shrink-0 p-2 rounded-lg transition-colors duration-300 ${scannerMode ? 'bg-primary text-white shadow ring-2 ring-primary/20' : 'bg-white text-slate-400 border border-slate-200'}`}>
                  <Search className="w-4 h-4" />
                </div>

                {/* Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <Input
                    autoFocus
                    placeholder={scannerMode ? "Escaneo de código..." : "Buscar material..."}
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    onKeyDown={handleScannerInput}
                    className="h-9 bg-white border-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all rounded-lg font-medium placeholder:text-slate-400 pr-8"
                  />
                  {scannerMode && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex gap-0.5 pointer-events-none">
                      <span className="w-1 h-3 bg-primary/30 rounded-full animate-pulse" />
                      <span className="w-1 h-3 bg-primary/50 rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-3 bg-primary/30 rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                </div>

                {/* Toggle scanner */}
                <Button
                  variant={scannerMode ? "default" : "outline"}
                  size="icon"
                  onClick={() => canDispatch && setScannerMode(!scannerMode)}
                  className="h-9 w-9 shrink-0 rounded-lg shadow-sm transition-all active:scale-95"
                  title={scannerMode ? "Desactivar Modo Scanner" : "Activar Modo Scanner"}
                  disabled={!canDispatch}
                >
                  <Truck className={`w-4 h-4 ${scannerMode ? 'animate-bounce' : ''}`} />
                </Button>

                {/* Separador */}
                <div className="hidden sm:block w-px h-8 bg-primary/20 shrink-0" />

                {/* Progreso inline */}
                <div className="flex items-center gap-2 flex-1 min-w-[160px] sm:min-w-0 sm:max-w-[220px]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Progreso</span>
                      <span className={`text-[11px] font-black tabular-nums ${progresoDespacho().porcentaje === 100 ? 'text-emerald-600' : 'text-primary'}`}>
                        {progresoDespacho().asignados}/{progresoDespacho().total}
                      </span>
                    </div>
                    <Progress value={progresoDespacho().porcentaje} className="h-1.5 bg-white/60" />
                  </div>
                  <span className={`shrink-0 text-xs font-black tabular-nums ${progresoDespacho().porcentaje === 100 ? 'text-emerald-600' : 'text-primary/70'}`}>
                    {progresoDespacho().porcentaje}%
                  </span>
                </div>
              </div>

              {/* Información de la solicitud — tira compacta */}
              <div className="shrink-0 flex flex-wrap items-stretch divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                {/* Solicitante */}
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[130px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Solicitante</span>
                  <span className="text-sm font-bold text-slate-800 truncate">
                    {selectedSolicitud.cabecera.NombreSolicitante}
                  </span>
                </div>
                {/* Fecha */}
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[100px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Fecha</span>
                  <span className="text-sm font-bold text-slate-800">
                    {formatStoredDateAsUtc(selectedSolicitud.cabecera.FechaSolicitud)}
                  </span>
                </div>
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[80px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">OT</span>
                  <span className="text-sm font-bold text-slate-800">
                    {selectedSolicitud.cabecera.OT || <span className="text-slate-400 font-normal">—</span>}
                  </span>
                </div>
              </div>

              {/* Tabla compacta de materiales — flexibilidad nativa */}
              <div className="flex-1 min-h-[160px] max-h-[336px] flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                <div
                  className={[
                    'flex-1',
                    'overflow-y-auto overflow-x-auto',
                    // Scrollbar premium slim
                    '[&::-webkit-scrollbar]:w-1.5',
                    '[&::-webkit-scrollbar]:h-1.5',
                    '[&::-webkit-scrollbar-track]:rounded-full',
                    '[&::-webkit-scrollbar-track]:bg-slate-100',
                    '[&::-webkit-scrollbar-thumb]:rounded-full',
                    '[&::-webkit-scrollbar-thumb]:bg-slate-300',
                    'hover:[&::-webkit-scrollbar-thumb]:bg-slate-400',
                  ].join(' ')}
                >
                  <Table className="text-sm min-w-[640px]">
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="w-16 text-center text-xs font-bold uppercase">Cód.</TableHead>
                        <TableHead className="text-xs font-bold uppercase">Material</TableHead>
                        <TableHead className="text-center w-20 text-xs font-bold uppercase">U.M.</TableHead>
                        <TableHead className="text-center w-24 text-xs font-bold uppercase">Aprobado</TableHead>
                        <TableHead className="text-center w-24 text-xs font-bold uppercase text-slate-500">Entregado</TableHead>
                        <TableHead className="text-center w-20 text-xs font-bold uppercase text-amber-600">Stock</TableHead>
                        <TableHead className="text-center w-24 text-xs font-bold uppercase text-blue-600">Pendiente</TableHead>
                        <TableHead className="text-center w-40 text-xs font-bold uppercase bg-primary/5 text-primary">A Entregar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSolicitud.detalle
                        .filter(item => 
                          !itemSearch || 
                          item.Descripcion.toLowerCase().includes(itemSearch.toLowerCase()) ||
                          item.Codigo.toLowerCase().includes(itemSearch.toLowerCase())
                        )
                        .map((item) => {
                        const estadoItem = getItemEstado(item);
                        const qty = editedItems[item.IdDetalleSolicitud] || 0;
                        const maxPermitido = Math.min(item.CantidadPendiente, item.EnStock);
                        const isAprobada = isSolicitudDespachableState(selectedSolicitud.cabecera.Estado);
                        const yaEntregado = item.CantidadEntregada ?? (item.CantidadAprobada - item.CantidadPendiente);
                        const estadoItemClassName =
                          estadoItem.tone === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : estadoItem.tone === 'success'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : estadoItem.tone === 'warning'
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-50 text-slate-700';
                        
                        return (
                          <TableRow key={item.IdDetalleSolicitud} className={qty > 0 ? "bg-primary/5" : "hover:bg-slate-50"}>
                            <TableCell className="text-center font-mono text-xs text-slate-500">{item.Codigo}</TableCell>
                            <TableCell>
                              <div className="font-semibold text-slate-900 leading-tight mb-1">{item.Descripcion}</div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${estadoItemClassName}`}>
                                  {estadoItem.label}
                                </Badge>
                                {item.AreaNombre && (
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 text-[10px] px-1.5 py-0">
                                    {item.AreaNombre}
                                  </Badge>
                                )}
                                {item.RecursoNombre && (
                                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0">
                                    {item.RecursoNombre}
                                  </Badge>
                                )}
                                {item.CodigoCuenta && (
                                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0">
                                    {item.CodigoCuenta}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-xs font-medium text-slate-500">
                                {item.UnidadMedida || 'UND'}
                            </TableCell>
                            <TableCell className="text-center font-bold text-slate-700">
                                {item.CantidadAprobada}
                            </TableCell>
                            <TableCell className="text-center font-bold text-slate-500">
                                {yaEntregado}
                            </TableCell>
                            <TableCell className="text-center font-black text-amber-600">
                                {item.EnStock}
                            </TableCell>
                            <TableCell className="text-center font-black text-blue-600">
                                {item.CantidadPendiente}
                            </TableCell>
                            <TableCell className="border-l border-slate-100 bg-slate-50/50 p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max={maxPermitido}
                                  value={qty}
                                  disabled={!canDispatch || !isAprobada || item.CantidadPendiente === 0}
                                  className="w-20 text-center font-black text-primary border-primary/20 shadow-inner h-9 bg-white focus-visible:ring-primary/30"
                                  onChange={(e) => handleCantidadChange(item.IdDetalleSolicitud, e.target.value)}
                                  onBlur={(e) => {
                                      const val = parseFloat(e.target.value);
                                      const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(maxPermitido, val));
                                      handleCantidadChange(item.IdDetalleSolicitud, clamped.toString());
                                  }}
                                />
                                {canDispatch && item.CantidadPendiente > 0 && isAprobada && item.EnStock > 0 && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="px-2 h-9 text-[10px] font-bold text-primary border-primary/20 hover:bg-primary hover:text-white transition-colors"
                                    onClick={() => handleCantidadChange(item.IdDetalleSolicitud, String(maxPermitido))}
                                    title="Despachar máximo posible"
                                  >
                                    MAX
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {selectedSolicitud.detalle.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                            No hay materiales en esta solicitud.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
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
                    {canDispatch && canClosePartial
                      ? 'El despacho actual es parcial. Puedes registrar solo esta entrega con Parcial o cerrar el saldo restante con Cerrar parcial.'
                      : canDispatch
                        ? 'El despacho actual es parcial. Puedes registrar solo esta entrega con Parcial.'
                        : 'La solicitud tiene saldo pendiente. Puedes cerrar el saldo restante con Cerrar parcial.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Observaciones */}
              <div className="shrink-0 space-y-2">
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
                    rows={2}
                    disabled={!isSolicitudDespachableState(selectedSolicitud.cabecera.Estado)}
                    className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none transition-all placeholder:text-slate-400 font-medium text-slate-700"
                  />
                </div>
              </div>

              {canClosePartial && hayCantidadesPendientes() && (
                <div className="shrink-0 space-y-2">
                  <Label
                    htmlFor="motivo-cierre-parcial"
                    className="text-xs font-semibold tracking-wide uppercase text-slate-600"
                  >
                    Motivo del cierre parcial
                  </Label>
                  <div className="border border-rose-200 rounded-xl bg-rose-50 p-1.5 shadow-inner transition-all hover:bg-rose-100/70">
                    <Textarea
                      id="motivo-cierre-parcial"
                      placeholder="Explica por qué ya no se despachará el saldo restante..."
                      value={motivoCierreParcial}
                      onChange={(e) => setMotivoCierreParcial(e.target.value)}
                      rows={2}
                      disabled={!isSolicitudDespachableState(selectedSolicitud.cabecera.Estado)}
                      className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none transition-all placeholder:text-rose-300 font-medium text-rose-900"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-0 border-t border-slate-100 p-3 sm:p-4 bg-slate-50/80 backdrop-blur rounded-b-2xl sm:rounded-b-3xl shrink-0">
            {isSolicitudDespachableState(selectedSolicitud?.cabecera.Estado) && (
              <div className="flex w-full flex-wrap justify-end gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none sm:w-28 min-w-[90px] border-slate-200 text-slate-600 hover:bg-white font-bold transition-all"
                  onClick={() => {
                    setSelectedSolicitud(null);
                    setEditedItems({});
                    setObservacionesDespacho('');
                    setMotivoCierreParcial('');
                  }}
                  disabled={isDispatching}
                >
                  Cancelar
                </Button>

                {hayCantidadesPendientes() && (
                  canClosePartial && (
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none sm:w-44 min-w-[120px] border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    onClick={() => handleDespachar('cerrar_parcial')}
                    disabled={isDispatching || hayExcedeStock() || !motivoCierreParcialValido}
                  >
                    <XCircle className="w-4 h-4" />
                    Cerrar parcial
                  </Button>
                  )
                )}

                {canDispatch && hayCantidadesPendientes() && (
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none sm:w-36 min-w-[90px] border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    onClick={() => handleDespachar('parcial')}
                    disabled={isDispatching || hayDespachoVacio() || hayExcedeStock()}
                  >
                    <Package className="w-4 h-4" />
                    Parcial
                  </Button>
                )}

                {canDispatch && (
                  <Button
                    className={`flex-1 sm:flex-none sm:w-44 min-w-[120px] text-white font-black shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                      esDespachoCompleto() 
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' 
                      : 'bg-slate-400 cursor-not-allowed opacity-70'
                    }`}
                    onClick={() => handleDespachar('total')}
                    disabled={!esDespachoCompleto() || isDispatching || hayExcedeStock()}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Despacho Total
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedDevolucionDetalle || loadingDevolucionModalId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            devolucionAbortRef.current?.abort();
            setLoadingDevolucionModalId(null);
            resetDevolucionState();
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-6xl max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] !flex !flex-col !gap-0 p-0 shadow-2xl rounded-2xl sm:rounded-3xl overflow-hidden">
          <DialogHeader className="sticky top-0 z-20 shrink-0 bg-gradient-to-b from-amber-50 to-white/90 backdrop-blur border-b border-amber-100 rounded-t-2xl sm:rounded-t-3xl shadow-xl px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900">
              <Undo2 className="w-5 h-5 sm:w-7 sm:h-7 text-amber-700" /> Registrar Devolución
            </DialogTitle>
            <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
              {selectedDevolucionDetalle && (
                <>
                  <span className="font-semibold text-slate-700">
                    DESP-{selectedDevolucionDetalle.cabecera.IdDespacho} · {selectedDevolucionDetalle.cabecera.CodigoSolicitud}
                    {selectedDevolucionDetalle.cabecera.OT ? ` · OT ${selectedDevolucionDetalle.cabecera.OT}` : ''}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-sm text-slate-600">
                    {selectedDevolucionDetalle.cabecera.AreaResumen || selectedDevolucionDetalle.cabecera.AreaNombre}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingDevolucionModalId !== null && !selectedDevolucionDetalle && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <RefreshCw className="w-8 h-8 text-amber-700 animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Cargando detalle para devolución...</p>
            </div>
          )}

          {selectedDevolucionDetalle && (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col py-3 px-3 sm:py-6 sm:px-6 gap-4 sm:gap-6">
              <div className="shrink-0 flex flex-wrap items-stretch divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[140px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Solicitante</span>
                  <span className="text-sm font-bold text-slate-800 truncate">{selectedDevolucionDetalle.cabecera.NombreSolicitante}</span>
                </div>
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[120px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Fecha despacho</span>
                  <span className="text-sm font-bold text-slate-800">{formatStoredDateAsUtc(selectedDevolucionDetalle.cabecera.FechaDespacho)}</span>
                </div>
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[120px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Límite reversión</span>
                  <span className="text-sm font-bold text-slate-800">{formatStoredDateAsUtc(selectedDevolucionDetalle.cabecera.FechaLimiteReversion)}</span>
                </div>
                <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-[100px] flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">OT</span>
                  <span className="text-sm font-bold text-slate-800">
                    {selectedDevolucionDetalle.cabecera.OT || <span className="text-slate-400 font-normal">—</span>}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Áreas / actividades</span>
                      <SummaryBadges
                        values={getAreaValues(selectedDevolucionDetalle.cabecera)}
                        emptyLabel="Sin área registrada"
                      />
                    </div>
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Códigos de cuenta</span>
                      <SummaryBadges
                        values={getCodigoCuentaValues(selectedDevolucionDetalle.cabecera)}
                        emptyLabel="Sin cuenta configurada"
                        tone="accent"
                      />
                    </div>
                  </div>

                  <Alert className={selectedDevolucionDetalle.cabecera.ReversaPresupuestoPreview
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 rounded-xl'
                    : 'border-amber-300 bg-amber-50 text-amber-900 rounded-xl'}>
                    <AlertCircle className={selectedDevolucionDetalle.cabecera.ReversaPresupuestoPreview ? 'h-5 w-5 text-emerald-600' : 'h-5 w-5 text-amber-600'} />
                    <AlertDescription className="font-semibold">
                      {selectedDevolucionDetalle.cabecera.ReversaPresupuestoPreview
                        ? 'Esta devolución revierte presupuesto y reingresa stock porque está dentro de la ventana de reversión.'
                        : 'Esta devolución solo reingresa a stock porque el despacho ya está fuera de la ventana de reversión presupuestaria.'}
                    </AlertDescription>
                  </Alert>

                  {sinSaldoDisponibleDevolver() && (
                    <Alert className="border-red-300 bg-red-50 text-red-900 rounded-xl">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <AlertDescription className="font-semibold">
                        Este despacho ya no tiene saldo disponible para devolución en sus líneas.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Devoluciones registradas</p>
                      <p className="text-xs text-muted-foreground">Se actualiza después de guardar</p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      {devolucionesRegistradas.length}
                    </Badge>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {loadingDevolucionesRegistradas ? (
                      <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Cargando devoluciones...
                      </div>
                    ) : devolucionesRegistradas.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-muted-foreground">No hay devoluciones registradas para este despacho.</div>
                    ) : (
                      devolucionesRegistradas.map((devolucion) => {
                        const estadoDevolucion = getEstadoDevolucionBadgeProps(devolucion.Estado);

                        return (
                        <div key={devolucion.IdDevolucion} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-900">{devolucion.CodigoDevolucion}</span>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={estadoDevolucion.className}
                              >
                                {estadoDevolucion.label}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={devolucion.ReversaPresupuesto
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'}
                              >
                                {devolucion.ReversaPresupuesto ? 'Revierte presupuesto' : 'Solo stock'}
                              </Badge>
                              {canDownloadPdf && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                                  onClick={() => downloadDevolucionPdf(devolucion.IdDevolucion, devolucion.CodigoDevolucion)}
                                  disabled={downloadingDevolucionPdf === devolucion.IdDevolucion}
                                >
                                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                                  {downloadingDevolucionPdf === devolucion.IdDevolucion ? '...' : 'PDF'}
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">{new Date(devolucion.FechaDevolucion).toLocaleString()}</p>
                          <p className="text-sm text-slate-700">{devolucion.Motivo}</p>
                          <p className="text-xs text-muted-foreground">
                            {devolucion.ItemsDevueltos} línea{devolucion.ItemsDevueltos !== 1 ? 's' : ''} · {isEstadoDespachoAnulado(devolucion.Estado)
                              ? 'Movimiento anulado'
                              : `Reversión ${formatCurrencyUsd(devolucion.MontoReversionPresupuesto)}`}
                          </p>
                        </div>
                      )})
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="motivo-devolucion"
                    className="text-xs font-semibold tracking-wide uppercase text-slate-600"
                  >
                    Motivo de la devolución
                  </Label>
                  <div className="border border-slate-200 rounded-xl bg-slate-50 p-1.5 shadow-inner transition-all hover:bg-slate-100/50">
                    <Textarea
                      id="motivo-devolucion"
                      placeholder="Ejemplo: material no utilizado, sobrante, entrega corregida..."
                      value={motivoDevolucion}
                      onChange={(e) => setMotivoDevolucion(e.target.value)}
                      rows={2}
                      className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none transition-all placeholder:text-slate-400 font-medium text-slate-700"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="observaciones-devolucion"
                    className="text-xs font-semibold tracking-wide uppercase text-slate-600"
                  >
                    Observaciones generales
                  </Label>
                  <div className="border border-slate-200 rounded-xl bg-slate-50 p-1.5 shadow-inner transition-all hover:bg-slate-100/50">
                    <Textarea
                      id="observaciones-devolucion"
                      placeholder="Observaciones adicionales sobre la devolución..."
                      value={observacionesDevolucion}
                      onChange={(e) => setObservacionesDevolucion(e.target.value)}
                      rows={2}
                      className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none transition-all placeholder:text-slate-400 font-medium text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-[180px] max-h-[360px] flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                <div className="flex-1 overflow-y-auto overflow-x-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
                  <Table className="text-sm min-w-[980px]">
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="w-20 text-center text-xs font-bold uppercase">Cód.</TableHead>
                        <TableHead className="text-xs font-bold uppercase">Material</TableHead>
                        <TableHead className="text-center w-20 text-xs font-bold uppercase">U.M.</TableHead>
                        <TableHead className="text-center w-24 text-xs font-bold uppercase">Despachada</TableHead>
                        <TableHead className="text-center w-24 text-xs font-bold uppercase text-slate-500">Devuelta</TableHead>
                        <TableHead className="text-center w-24 text-xs font-bold uppercase text-blue-600">Disponible</TableHead>
                        <TableHead className="text-center w-32 text-xs font-bold uppercase bg-amber-50 text-amber-700">A devolver</TableHead>
                        <TableHead className="text-xs font-bold uppercase">Observación línea</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedDevolucionDetalle.detalle.map((item) => {
                        const cantidad = cantidadesDevolucion[item.IdDetalleDespacho] || 0;
                        const excede = cantidad > item.CantidadDisponibleDevolver;

                        return (
                          <TableRow key={item.IdDetalleDespacho} className={cantidad > 0 ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                            <TableCell className="text-center font-mono text-xs text-slate-500">{item.Codigo}</TableCell>
                            <TableCell>
                              <div className="font-semibold text-slate-900 leading-tight mb-1">{item.Descripcion}</div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {item.AreaNombre && (
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 text-[10px] px-1.5 py-0">
                                    {item.AreaNombre}
                                  </Badge>
                                )}
                                {item.CodigoCuenta && (
                                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0">
                                    {item.CodigoCuenta}
                                  </Badge>
                                )}
                                {excede && (
                                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px] px-1.5 py-0">
                                    Excede saldo
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-xs font-medium text-slate-500">{item.UnidadMedida || 'UND'}</TableCell>
                            <TableCell className="text-center font-bold text-slate-700">{item.CantidadDespachada}</TableCell>
                            <TableCell className="text-center font-bold text-slate-500">{item.CantidadYaDevuelta}</TableCell>
                            <TableCell className="text-center font-black text-blue-600">{item.CantidadDisponibleDevolver}</TableCell>
                            <TableCell className="border-l border-slate-100 bg-slate-50/50 p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.CantidadDisponibleDevolver}
                                  value={cantidad}
                                  disabled={item.CantidadDisponibleDevolver === 0 || isSavingDevolucion}
                                  className="w-20 text-center font-black text-amber-700 border-amber-200 shadow-inner h-9 bg-white focus-visible:ring-amber-300"
                                  onChange={(e) => handleCantidadDevolucionChange(item.IdDetalleDespacho, e.target.value)}
                                  onBlur={(e) => {
                                    const value = parseFloat(e.target.value);
                                    const clamped = Number.isNaN(value) ? 0 : Math.max(0, Math.min(item.CantidadDisponibleDevolver, value));
                                    handleCantidadDevolucionChange(item.IdDetalleDespacho, clamped.toString());
                                  }}
                                />
                                {item.CantidadDisponibleDevolver > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="px-2 h-9 text-[10px] font-bold text-amber-700 border-amber-200 hover:bg-amber-100 transition-colors"
                                    onClick={() => handleCantidadDevolucionChange(item.IdDetalleDespacho, String(item.CantidadDisponibleDevolver))}
                                    disabled={isSavingDevolucion}
                                  >
                                    MAX
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                value={observacionesLineaDevolucion[item.IdDetalleDespacho] || ''}
                                onChange={(e) => handleObservacionLineaDevolucionChange(item.IdDetalleDespacho, e.target.value)}
                                placeholder="Estado, empaque, nota..."
                                disabled={isSavingDevolucion}
                                className="h-9 bg-white"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {hayDevolucionExcedeDisponible() && (
                <Alert className="border-red-300 bg-red-50 text-red-900 rounded-xl">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <AlertDescription className="font-semibold">
                    Una o más líneas exceden el saldo disponible para devolución. Ajusta las cantidades antes de guardar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="mt-0 border-t border-slate-100 p-3 sm:p-4 bg-slate-50/80 backdrop-blur rounded-b-2xl sm:rounded-b-3xl shrink-0">
            <div className="flex w-full flex-wrap justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none sm:w-28 min-w-[90px] border-slate-200 text-slate-600 hover:bg-white font-bold transition-all"
                onClick={() => {
                  devolucionAbortRef.current?.abort();
                  setLoadingDevolucionModalId(null);
                  resetDevolucionState();
                }}
                disabled={isSavingDevolucion}
              >
                Cancelar
              </Button>

              <Button
                 className="flex-1 sm:flex-none sm:w-52 min-w-[140px] border border-black bg-black text-white hover:bg-zinc-900 font-black shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 disabled:!opacity-100 disabled:!bg-slate-200 disabled:!text-slate-500 disabled:!border-slate-300 disabled:shadow-none"
                onClick={handleGuardarDevolucion}
                disabled={isSavingDevolucion || hayDevolucionVacia() || hayDevolucionExcedeDisponible() || !motivoDevolucionValido || sinSaldoDisponibleDevolver()}
              >
                {isSavingDevolucion ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Undo2 className="w-4 h-4" />
                )}
                {isSavingDevolucion ? 'Guardando...' : 'Registrar devolución'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!devolucionAnulacionTarget}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isAnulandoDevolucion) {
            resetAnulacionDevolucionState();
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-xl p-0 overflow-hidden rounded-2xl border-rose-200 shadow-2xl">
          <DialogHeader className="bg-gradient-to-b from-rose-50 to-white border-b border-rose-100 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
              <XCircle className="h-5 w-5 text-rose-700" /> Anular devolución
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              {devolucionAnulacionTarget
                ? `Confirma la anulación de ${devolucionAnulacionTarget.codigoDevolucion || `DEV-${devolucionAnulacionTarget.idDevolucion}`}.`
                : 'Confirma la anulación de la devolución seleccionada.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <Alert className="border-rose-200 bg-rose-50 text-rose-900 rounded-xl">
              <AlertCircle className="h-5 w-5 text-rose-600" />
              <AlertDescription className="font-medium">
                La anulación revierte el movimiento de devolución. Registra el motivo para dejar trazabilidad de la corrección.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="motivo-anulacion-devolucion" className="text-xs font-semibold tracking-wide uppercase text-slate-600">
                Motivo de la anulación
              </Label>
              <div className="border border-rose-200 rounded-xl bg-rose-50/60 p-1.5 shadow-inner">
                <Textarea
                  id="motivo-anulacion-devolucion"
                  placeholder="Explica por qué se debe anular esta devolución..."
                  value={motivoAnulacionDevolucion}
                  onChange={(e) => setMotivoAnulacionDevolucion(e.target.value)}
                  rows={3}
                  disabled={isAnulandoDevolucion}
                  className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none placeholder:text-rose-300 font-medium text-rose-950"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observaciones-anulacion-devolucion" className="text-xs font-semibold tracking-wide uppercase text-slate-600">
                Observaciones
              </Label>
              <div className="border border-slate-200 rounded-xl bg-slate-50 p-1.5 shadow-inner">
                <Textarea
                  id="observaciones-anulacion-devolucion"
                  placeholder="Detalle adicional opcional para la anulación..."
                  value={observacionesAnulacionDevolucion}
                  onChange={(e) => setObservacionesAnulacionDevolucion(e.target.value)}
                  rows={2}
                  disabled={isAnulandoDevolucion}
                  className="bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none placeholder:text-slate-400 font-medium text-slate-700"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex w-full flex-wrap justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none sm:w-28 min-w-[90px] border-slate-200 text-slate-600 hover:bg-white font-bold transition-all"
                onClick={resetAnulacionDevolucionState}
                disabled={isAnulandoDevolucion}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 sm:flex-none sm:w-48 min-w-[140px] border border-black bg-black text-white hover:bg-zinc-900 font-black shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 disabled:!opacity-100 disabled:!bg-slate-200 disabled:!text-slate-500 disabled:!border-slate-300 disabled:shadow-none"
                onClick={handleConfirmarAnulacionDevolucion}
                disabled={isAnulandoDevolucion || !motivoAnulacionDevolucionValido}
              >
                {isAnulandoDevolucion ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {isAnulandoDevolucion ? 'Anulando...' : 'Confirmar anulación'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
