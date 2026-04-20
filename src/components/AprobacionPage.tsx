import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAprobacionesRealtime, type ApprovalSoundTone } from '../contexts/AprobacionesRealtimeContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { sileo } from 'sileo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';
import {
  CheckCircle,
  XCircle,
  Eye,
  BellOff,
  BellRing,
  Clock,
  AlertCircle,
  Radio,
  DollarSign,
  FileText,
  Package,
  Search,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { apiFetch } from '../services/apiClient';

type TabKey = 'pendientes' | 'aprobadas' | 'rechazadas';

interface Solicitud {
  id: string;
  numero: string;
  fecha: string;
  estado: string;
  area: string;
  areaResumen?: string;
  areasDetalle: string[];
  codigoCuenta?: string | null;
  codigoCuentaResumen?: string;
  codigosCuentaDetalle: string[];
  ot?: string | null;
  centroCostoCodigo?: string | null;
  centroCostoNombre?: string | null;
  comentario?: string | null;
  rolSolicitante?: string | null;
  solicitante: string;
  items: number;
  total: number;
  presupuestoArea: number;
  consumoAcumulado: number;
  presupuestoEstado: 'CONTROLADO' | 'SIN_PRESUPUESTO' | 'EXCEDE_PRESUPUESTO';
  presupuestoBloqueada: boolean;
  presupuestoMensaje?: string | null;
  presupuestoSolicitudActual: number;
  presupuestoDisponibleDespues: number | null;
  fechaAprobacion?: string;
  estadoAprobacion?: string;
  comentarioAprobacion?: string | null;
  nombreAprobador?: string | null;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function resolvePresupuestoEstado(args: {
  rawEstado: unknown;
  presupuestoArea: number;
  consumoAcumulado: number;
  solicitudActual: number;
}): Solicitud['presupuestoEstado'] {
  const normalized = String(args.rawEstado ?? '').trim().toUpperCase();

  if (
    normalized === 'CONTROLADO'
    || normalized === 'SIN_PRESUPUESTO'
    || normalized === 'EXCEDE_PRESUPUESTO'
  ) {
    return normalized as Solicitud['presupuestoEstado'];
  }

  if (args.presupuestoArea <= 0) {
    return 'SIN_PRESUPUESTO';
  }

  return args.consumoAcumulado + args.solicitudActual > args.presupuestoArea
    ? 'EXCEDE_PRESUPUESTO'
    : 'CONTROLADO';
}

interface DetalleSolicitudItem {
  IdArea?: number | null;
  AreaNombre?: string | null;
  IdRecurso?: number | null;
  RecursoNombre?: string | null;
  NumeroArticulo?: string | null;
  DescripcionArticulo?: string | null;
  CantidadSolicitada?: number | null;
  CantidadAprobada?: number | null;
  UnidadMedidaMaterial?: string | null;
  CodigoCuenta?: string | null;
  UltimoPrecioCompra?: number | null;
  EnStock?: number | null;
  GrupoArticulos?: string | null;
  UltimaFechaCompra?: string | null;
  ComentarioLinea?: string | null;
}

interface SolicitudCabeceraDetalle {
  numero: string;
  fecha: string;
  area: string;
  areaResumen?: string;
  areasDetalle: string[];
  codigoCuenta?: string | null;
  codigoCuentaResumen?: string;
  codigosCuentaDetalle: string[];
  solicitante: string;
  comentario?: string | null;
  estado: string;
  centroCostoCodigo?: string | null;
  centroCostoNombre?: string | null;
  ot?: string | null;
  catalogoNombre?: string | null;
}

interface AprobacionHistorialItem {
  IdAprobacion: number;
  NombreAprobador: string;
  EmailAprobador?: string | null;
  FechaAprobacion: string;
  Estado: string;
  Comentario?: string | null;
}

interface PaginationByTab {
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
}

interface TotalsByTab {
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
}

interface TabSummaryMetrics {
  totalMonto: number;
  aprobadasHoyCount: number;
  aprobadasHoyMonto: number;
}

interface SummaryByTab {
  pendientes: TabSummaryMetrics;
  aprobadas: TabSummaryMetrics;
  rechazadas: TabSummaryMetrics;
}

interface SolicitudesListResponse {
  data: any[];
  total: number;
  page: number;
  pageSize: number;
  summary?: Partial<TabSummaryMetrics>;
}

type LoadMode = 'paged' | 'full';

type SummaryCarrier = {
  area?: string;
  areaResumen?: string;
  areasDetalle?: string[];
  codigoCuenta?: string | null;
  codigoCuentaResumen?: string;
  codigosCuentaDetalle?: string[];
};

function createEmptyTabSummary(): TabSummaryMetrics {
  return {
    totalMonto: 0,
    aprobadasHoyCount: 0,
    aprobadasHoyMonto: 0,
  };
}

function createEmptySummaryByTab(): SummaryByTab {
  return {
    pendientes: createEmptyTabSummary(),
    aprobadas: createEmptyTabSummary(),
    rechazadas: createEmptyTabSummary(),
  };
}

function isSolicitudesListResponse(value: unknown): value is SolicitudesListResponse {
  return typeof value === 'object'
    && value !== null
    && Array.isArray((value as SolicitudesListResponse).data)
    && typeof (value as SolicitudesListResponse).total === 'number';
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

function uniqueStrings(values: Array<unknown>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)),
  );
}

function getAreaValues(entry: SummaryCarrier): string[] {
  if ((entry.areasDetalle?.length ?? 0) > 0) {
    return uniqueStrings(entry.areasDetalle ?? []);
  }

  return uniqueStrings([entry.areaResumen ?? null, entry.area ?? null]);
}

function getCodigoCuentaValues(entry: SummaryCarrier): string[] {
  if ((entry.codigosCuentaDetalle?.length ?? 0) > 0) {
    return uniqueStrings(entry.codigosCuentaDetalle ?? []);
  }

  return uniqueStrings([entry.codigoCuentaResumen ?? null, entry.codigoCuenta ?? null]);
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
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }

  if (tone === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
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
  const className = getBadgeToneClasses(tone);

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleValues.map((value) => (
        <Badge key={value} variant="outline" className={`max-w-full truncate ${className}`}>
          {value}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className={className}>
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
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesSolicitudSearch(solicitud: Solicitud, searchTerm: string): boolean {
  const query = normalizeSearch(searchTerm);
  if (!query) {
    return true;
  }

  const haystack = normalizeSearch([
    solicitud.numero,
    solicitud.estado,
    solicitud.area,
    solicitud.areaResumen,
    solicitud.areasDetalle.join(' '),
    solicitud.codigoCuenta,
    solicitud.codigoCuentaResumen,
    solicitud.codigosCuentaDetalle.join(' '),
    solicitud.ot,
    solicitud.centroCostoCodigo,
    solicitud.centroCostoNombre,
    solicitud.solicitante,
    solicitud.comentario,
  ].join(' '));

  return haystack.includes(query);
}

function fallbackCabeceraFromSolicitud(solicitud: Solicitud): SolicitudCabeceraDetalle {
  return {
    numero: solicitud.numero,
    fecha: solicitud.fecha,
    area: solicitud.areaResumen ?? solicitud.area,
    areaResumen: solicitud.areaResumen ?? solicitud.area,
    areasDetalle: getAreaValues(solicitud),
    codigoCuenta: solicitud.codigoCuenta ?? null,
    codigoCuentaResumen: solicitud.codigoCuentaResumen ?? solicitud.codigoCuenta ?? '',
    codigosCuentaDetalle: getCodigoCuentaValues(solicitud),
    solicitante: solicitud.solicitante,
    comentario: solicitud.comentario ?? null,
    estado: solicitud.estado,
    centroCostoCodigo: solicitud.centroCostoCodigo ?? null,
    centroCostoNombre: solicitud.centroCostoNombre ?? null,
    ot: solicitud.ot ?? null,
    catalogoNombre: null,
  };
}

function mapCabeceraDetalle(cabecera: any, fallback: Solicitud): SolicitudCabeceraDetalle {
  const base = fallbackCabeceraFromSolicitud(fallback);

  if (!cabecera || typeof cabecera !== 'object') {
    return base;
  }

  return {
    numero: cabecera.CodigoSolicitud ?? base.numero,
    fecha: cabecera.FechaSolicitud ?? base.fecha,
    area: cabecera.AreaResumen ?? cabecera.AreaNombre ?? cabecera.Area ?? base.area,
    areaResumen: cabecera.AreaResumen ?? cabecera.AreaNombre ?? cabecera.Area ?? base.areaResumen,
    areasDetalle: uniqueStrings([
      ...(Array.isArray(cabecera.AreasDetalle) ? cabecera.AreasDetalle : []),
      cabecera.AreaResumen,
      cabecera.AreaNombre,
      cabecera.Area,
      ...base.areasDetalle,
    ]),
    codigoCuenta: cabecera.CodigoCuenta ?? base.codigoCuenta ?? null,
    codigoCuentaResumen: cabecera.CodigoCuentaResumen ?? cabecera.CodigoCuenta ?? base.codigoCuentaResumen ?? '',
    codigosCuentaDetalle: uniqueStrings([
      ...(Array.isArray(cabecera.CodigosCuentaDetalle) ? cabecera.CodigosCuentaDetalle : []),
      cabecera.CodigoCuentaResumen,
      cabecera.CodigoCuenta,
      ...base.codigosCuentaDetalle,
    ]),
    solicitante: cabecera.NombreSolicitante ?? base.solicitante,
    comentario: cabecera.Comentario ?? base.comentario,
    estado: cabecera.Estado ?? base.estado,
    centroCostoCodigo: cabecera.CentroCostoCodigo ?? base.centroCostoCodigo,
    centroCostoNombre: cabecera.CentroCostoNombre ?? base.centroCostoNombre,
    ot: cabecera.OT ?? base.ot,
    catalogoNombre: cabecera.CatalogoNombre ?? null,
  };
}

function mapDetalleSolicitudItem(item: any): DetalleSolicitudItem {
  return {
    IdArea: item.IdArea ?? null,
    AreaNombre: item.AreaNombre ?? null,
    IdRecurso: item.IdRecurso ?? null,
    RecursoNombre: item.RecursoNombre ?? null,
    NumeroArticulo: item.NumeroArticulo ?? item.Codigo ?? null,
    DescripcionArticulo: item.DescripcionArticulo ?? item.Descripcion ?? null,
    CantidadSolicitada: Number(item.CantidadSolicitada ?? 0),
    CantidadAprobada: item.CantidadAprobada == null ? null : Number(item.CantidadAprobada),
    UnidadMedidaMaterial: item.UnidadMedidaMaterial ?? item.UnidadMedidaDetalle ?? item.UnidadMedida ?? null,
    CodigoCuenta: item.CodigoCuenta ?? null,
    UltimoPrecioCompra: item.UltimoPrecioCompra == null ? null : Number(item.UltimoPrecioCompra),
    EnStock: item.EnStock == null ? null : Number(item.EnStock),
    GrupoArticulos: item.GrupoArticulos ?? null,
    UltimaFechaCompra: item.UltimaFechaCompra ?? null,
    ComentarioLinea: item.ComentarioLinea ?? null,
  };
}

function mapAprobacionHistorial(item: any): AprobacionHistorialItem {
  return {
    IdAprobacion: Number(item.IdAprobacion ?? 0),
    NombreAprobador: item.NombreAprobador ?? 'Sin responsable',
    EmailAprobador: item.EmailAprobador ?? null,
    FechaAprobacion: item.FechaAprobacion ?? new Date().toISOString(),
    Estado: item.Estado ?? 'PENDIENTE',
    Comentario: item.Comentario ?? null,
  };
}

function getEstadoBadgeConfig(estado: string | null | undefined) {
  const normalized = String(estado ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'APROBADA':
      return {
        label: 'Aprobada',
        className: 'bg-green-100 text-green-700 border border-green-300',
        icon: CheckCircle,
      };
    case 'RECHAZADA':
      return {
        label: 'Rechazada',
        className: 'bg-red-100 text-red-700 border border-red-300',
        icon: XCircle,
      };
    case 'COMPLETADA':
    case 'DESPACHADA':
      return {
        label: 'Completada',
        className: 'bg-teal-100 text-teal-700 border border-teal-300',
        icon: CheckCircle,
      };
    case 'CERRADA_PARCIAL':
      return {
        label: 'Cerrada parcial',
        className: 'bg-rose-100 text-rose-700 border border-rose-300',
        icon: XCircle,
      };
    case 'PARCIALMENTE_DESPACHADA':
      return {
        label: 'Parcialmente despachada',
        className: 'bg-orange-100 text-orange-700 border border-orange-300',
        icon: Clock,
      };
    case 'EN_DESPACHO':
      return {
        label: 'En despacho',
        className: 'bg-blue-100 text-blue-700 border border-blue-300',
        icon: Clock,
      };
    default:
      return {
        label: 'Pendiente',
        className: 'bg-amber-100 text-amber-700 border border-amber-300',
        icon: Clock,
      };
  }
}

function getPresupuestoBadgeConfig(estado: Solicitud['presupuestoEstado']) {
  switch (estado) {
    case 'CONTROLADO':
      return {
        label: 'Controlado',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'EXCEDE_PRESUPUESTO':
      return {
        label: 'Excede presupuesto',
        className: 'border-red-200 bg-red-50 text-red-700',
      };
    case 'SIN_PRESUPUESTO':
    default:
      return {
        label: 'Sin presupuesto',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      };
  }
}

function shouldBlockBudgetApproval(solicitud: Pick<Solicitud, 'presupuestoBloqueada'>): boolean {
  return Boolean(solicitud.presupuestoBloqueada);
}

export default function AprobacionPage() {
  const { token } = useAuth();
  const {
    pendingCount,
    realtimeConnected,
    lastEventAt,
    latestPendingRequest,
    eventVersion,
    canUseBrowserNotifications,
    notificationPermission,
    pushNotificationsEnabled,
    pushNotificationsBusy,
    pushNotificationsReason,
    enablePushNotifications,
    soundEnabled,
    setSoundEnabled,
    soundTone,
    setSoundTone,
    canApproveAprobaciones,
  } = useAprobacionesRealtime();
  const pageSize = 8;
  const [pendientes, setPendientes] = useState<Solicitud[]>([]);
  const [aprobadas, setAprobadas] = useState<Solicitud[]>([]);
  const [rechazadas, setRechazadas] = useState<Solicitud[]>([]);
  const [totals, setTotals] = useState<TotalsByTab>({ pendientes: 0, aprobadas: 0, rechazadas: 0 });
  const [tabSummaries, setTabSummaries] = useState<SummaryByTab>(createEmptySummaryByTab());
  const [loadMode, setLoadMode] = useState<LoadMode>('paged');
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [detalleCabecera, setDetalleCabecera] = useState<SolicitudCabeceraDetalle | null>(null);
  const [detalleSolicitud, setDetalleSolicitud] = useState<DetalleSolicitudItem[]>([]);
  const [aprobacionesHistorial, setAprobacionesHistorial] = useState<AprobacionHistorialItem[]>([]);
  const [modalAction, setModalAction] = useState<'aprobar' | 'rechazar' | 'ver' | null>(null);
  const [comentario, setComentario] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [cargandoAprobaciones, setCargandoAprobaciones] = useState(false);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('pendientes');
  const [pages, setPages] = useState<PaginationByTab>({ pendientes: 1, aprobadas: 1, rechazadas: 1 });
  const isSearchMode = searchTerm.trim().length > 0;
  const puedeAprobar = canApproveAprobaciones;

  const mapSolicitud = (s: any): Solicitud => ({
    id: String(s.IdSolicitud ?? s.id ?? ''),
    numero: s.CodigoSolicitud ?? s.numero ?? '-',
    fecha: s.FechaSolicitud ?? s.fecha ?? new Date().toISOString(),
    estado: s.Estado ?? s.estado ?? 'PENDIENTE',
    area: s.AreaResumen ?? s.AreaNombre ?? s.area ?? 'Sin área',
    areaResumen: s.AreaResumen ?? s.AreaNombre ?? s.area ?? 'Sin área',
    areasDetalle: uniqueStrings([
      ...(Array.isArray(s.AreasDetalle) ? s.AreasDetalle : []),
      s.AreaResumen,
      s.AreaNombre,
      s.area,
    ]),
    codigoCuenta: s.CodigoCuenta ?? s.AreaCodigoCuenta ?? s.CentroCostoCodigo ?? s.codigoCuenta ?? null,
    codigoCuentaResumen: s.CodigoCuentaResumen ?? s.AreaCodigoCuenta ?? s.CentroCostoCodigo ?? '',
    codigosCuentaDetalle: uniqueStrings([
      ...(Array.isArray(s.CodigosCuentaDetalle) ? s.CodigosCuentaDetalle : []),
      s.CodigoCuenta,
      s.AreaCodigoCuenta,
      s.CentroCostoCodigo,
      s.codigoCuenta,
    ]),
    ot: s.OT ?? s.ot ?? null,
    centroCostoCodigo: s.CentroCostoCodigo ?? null,
    centroCostoNombre: s.CentroCostoNombre ?? null,
    comentario: s.Comentario ?? s.comentario ?? null,
    rolSolicitante: s.RolSolicitante ?? null,
    solicitante: s.NombreSolicitante ?? s.solicitante ?? 'Sin solicitante',
    items: Number(s.TotalItems ?? s.items ?? 0),
    total: Number(s.TotalMonto ?? s.total ?? 0),

    presupuestoArea: Number(s.PresupuestoArea ?? 0),
    consumoAcumulado: Number(s.ConsumoAcumulado ?? 0),

    presupuestoEstado: String(s.PresupuestoEstado ?? 'SIN_PRESUPUESTO').toUpperCase() as Solicitud['presupuestoEstado'],
    presupuestoBloqueada: Boolean(s.PresupuestoBloqueada ?? false),
    presupuestoMensaje: s.PresupuestoMensaje ?? null,
    presupuestoSolicitudActual: Number(s.PresupuestoSolicitudActual ?? s.TotalMonto ?? s.total ?? 0),
    presupuestoDisponibleDespues:
      s.PresupuestoDisponibleDespues == null ? null : Number(s.PresupuestoDisponibleDespues),

    fechaAprobacion: s.FechaAprobacion,
    estadoAprobacion: s.EstadoAprobacion,
    comentarioAprobacion: s.ComentarioAprobacion ?? null,
    nombreAprobador: s.NombreAprobador ?? null,
  });

  const isApprovalToday = (value?: string | null) => {
    if (!value) {
      return false;
    }

    return new Date(String(value).replace('Z', '')).toDateString() === new Date().toDateString();
  };

  const buildSummaryFromSolicitudes = (items: Solicitud[]): TabSummaryMetrics => {
    const aprobadasHoy = items.filter((item) => isApprovalToday(item.fechaAprobacion));

    return {
      totalMonto: items.reduce((sum, item) => sum + item.total, 0),
      aprobadasHoyCount: aprobadasHoy.length,
      aprobadasHoyMonto: aprobadasHoy.reduce((sum, item) => sum + item.total, 0),
    };
  };

  const normalizeListPayload = (payload: unknown): SolicitudesListResponse => {
    if (isSolicitudesListResponse(payload)) {
      return payload;
    }

    const data = Array.isArray(payload) ? payload : [];
    return {
      data,
      total: data.length,
      page: 1,
      pageSize: data.length || pageSize,
      summary: undefined,
    };
  };

  const cargarSolicitudes = async (mode: LoadMode, signal?: AbortSignal): Promise<{ pendingTotal: number } | null> => {
    if (!token) return null;
    setCargando(true);
    try {
      const endpoints = mode === 'full'
        ? [
          '/solicitudes?estado=PENDIENTE',
          '/solicitudes?estado=APROBADA',
          '/solicitudes?estado=RECHAZADA',
        ]
        : [
          `/solicitudes?estado=PENDIENTE&page=${pages.pendientes}&pageSize=${pageSize}`,
          `/solicitudes?estado=APROBADA&page=${pages.aprobadas}&pageSize=${pageSize}`,
          `/solicitudes?estado=RECHAZADA&page=${pages.rechazadas}&pageSize=${pageSize}`,
        ];

      const [pendResp, aprResp, rejResp] = await Promise.all([
        apiFetch(endpoints[0], { signal }),
        apiFetch(endpoints[1], { signal }),
        apiFetch(endpoints[2], { signal }),
      ]);

      const [pendJson, aprJson, rejJson] = await Promise.all([
        pendResp.ok ? pendResp.json() : [],
        aprResp.ok ? aprResp.json() : [],
        rejResp.ok ? rejResp.json() : [],
      ]);

      const pendingPayload = normalizeListPayload(pendJson);
      const approvedPayload = normalizeListPayload(aprJson);
      const rejectedPayload = normalizeListPayload(rejJson);

      const pendingData = pendingPayload.data.map(mapSolicitud);
      const approvedData = approvedPayload.data.map(mapSolicitud);
      const rejectedData = rejectedPayload.data.map(mapSolicitud);
        const pendingTotal = mode === 'full' ? pendingData.length : pendingPayload.total;

      setPendientes(pendingData);
      setAprobadas(approvedData);
      setRechazadas(rejectedData);

      if (mode === 'full') {
        setTotals({
          pendientes: pendingData.length,
          aprobadas: approvedData.length,
          rechazadas: rejectedData.length,
        });
        setTabSummaries({
          pendientes: buildSummaryFromSolicitudes(pendingData),
          aprobadas: buildSummaryFromSolicitudes(approvedData),
          rechazadas: buildSummaryFromSolicitudes(rejectedData),
        });
      } else {
        setTotals({
          pendientes: pendingPayload.total,
          aprobadas: approvedPayload.total,
          rechazadas: rejectedPayload.total,
        });
        setTabSummaries({
          pendientes: {
            ...createEmptyTabSummary(),
            ...(pendingPayload.summary ?? {}),
          },
          aprobadas: {
            ...createEmptyTabSummary(),
            ...(approvedPayload.summary ?? {}),
          },
          rechazadas: {
            ...createEmptyTabSummary(),
            ...(rejectedPayload.summary ?? {}),
          },
        });
      }

      setLoadMode(mode);
      return { pendingTotal };
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      console.error('Error al cargar aprobaciones', error);
      return null;
    } finally {
      if (!signal?.aborted) {
        setCargando(false);
      }
    }
  };

  const closeModal = () => {
    setModalAction(null);
    setSelectedSolicitud(null);
    setDetalleCabecera(null);
    setComentario('');
    setDetalleSolicitud([]);
    setAprobacionesHistorial([]);
  };

  useEffect(() => {
    if (!token) return;
    if (isSearchMode || loadMode !== 'paged') return;

    const controller = new AbortController();
    cargarSolicitudes('paged', controller.signal);
    return () => controller.abort();
  }, [token, isSearchMode, loadMode, pages.pendientes, pages.aprobadas, pages.rechazadas]);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    if (isSearchMode && loadMode !== 'full') {
      cargarSolicitudes('full', controller.signal);
    }

    if (!isSearchMode && loadMode === 'full') {
      cargarSolicitudes('paged', controller.signal);
    }

    return () => controller.abort();
  }, [token, isSearchMode, loadMode]);

  useEffect(() => {
    if (!token || eventVersion === 0) {
      return;
    }

    void cargarSolicitudes(isSearchMode ? 'full' : loadMode);
  }, [eventVersion, isSearchMode, loadMode, token]);

  useEffect(() => {
    if (!selectedSolicitud || !token) return;

    const controller = new AbortController();

    const cargarDetalle = async () => {
      setCargandoDetalle(true);
      setCargandoAprobaciones(true);
      try {
        const [detalleResp, aprobacionesResp] = await Promise.all([
          apiFetch(`/solicitudes/${selectedSolicitud.id}`, { signal: controller.signal }),
          apiFetch(`/solicitudes/${selectedSolicitud.id}/aprobaciones`, { signal: controller.signal }),
        ]);

        if (detalleResp.ok) {
          const data = await detalleResp.json();
          setDetalleCabecera(mapCabeceraDetalle(data?.cabecera, selectedSolicitud));
          setDetalleSolicitud(
            Array.isArray(data?.detalle)
              ? data.detalle.map(mapDetalleSolicitudItem)
              : [],
          );
        } else {
          setDetalleCabecera(fallbackCabeceraFromSolicitud(selectedSolicitud));
          setDetalleSolicitud([]);
        }

        if (aprobacionesResp.ok) {
          const data = await aprobacionesResp.json();
          const historial = Array.isArray(data)
            ? data
              .map(mapAprobacionHistorial)
              .sort((left, right) => new Date(right.FechaAprobacion).getTime() - new Date(left.FechaAprobacion).getTime())
            : [];
          setAprobacionesHistorial(historial);
        } else if (aprobacionesResp.status === 404) {
          setAprobacionesHistorial([]);
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        console.error('Error al cargar detalle', error);
        setDetalleCabecera(fallbackCabeceraFromSolicitud(selectedSolicitud));
      } finally {
        if (!controller.signal.aborted) {
          setCargandoDetalle(false);
          setCargandoAprobaciones(false);
        }
      }
    };

    cargarDetalle();

    return () => controller.abort();
  }, [eventVersion, selectedSolicitud, token]);

  const handleOpenModal = (solicitud: Solicitud, action: 'aprobar' | 'rechazar' | 'ver') => {
    setSelectedSolicitud(solicitud);
    setDetalleCabecera(fallbackCabeceraFromSolicitud(solicitud));
    setModalAction(action);
    setComentario('');
    setDetalleSolicitud([]);
    setAprobacionesHistorial([]);
  };

  const handleConfirmarAccion = async () => {
    if (!puedeAprobar) {
      sileo.error({
        title: 'Sin permiso para aprobar',
        description: 'Tu rol tiene acceso de lectura al módulo, pero no puede aprobar ni rechazar solicitudes.',
      });
      return;
    }

    if (modalAction === 'rechazar' && !comentario.trim()) {
      sileo.error({
        title: 'Comentario requerido',
        description: 'Debes ingresar un comentario al rechazar la solicitud.',
      });
      return;
    }

    if (!selectedSolicitud || !token) return;

    if (modalAction === 'aprobar' && shouldBlockBudgetApproval(selectedSolicitud)) {
      sileo.error({
        title: 'Aprobación bloqueada',
        description: selectedSolicitud.presupuestoMensaje || 'La solicitud no cumple la validación presupuestaria.',
      });
      return;
    }

    try {
      setProcesandoAccion(true);
      const resp = await apiFetch(`/solicitudes/${selectedSolicitud.id}/aprobaciones`, {
        method: 'POST',
        body: JSON.stringify({
          estado: modalAction === 'aprobar' ? 'APROBADA' : 'RECHAZADA',
          comentario: comentario || null,
        }),
      });

      if (!resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await resp.json().catch(() => null)
          : await resp.text().catch(() => null);

        const message =
          (payload && typeof payload === 'object' && 'message' in payload ? (payload as any).message : null) ||
          (typeof payload === 'string' ? payload : null) ||
          'Error al registrar aprobación';

        console.error('Error al registrar aprobación', message);
        sileo.error({
          title: 'Error al registrar aprobación',
          description: message,
        });
        return;
      }

      await cargarSolicitudes(isSearchMode ? 'full' : 'paged');
      closeModal();
    } catch (error) {
      console.error('Error al aprobar/rechazar solicitud', error);
      sileo.error({
        title: 'Error al registrar aprobación',
        description: 'Ocurrió un error al registrar la aprobación.',
      });
    } finally {
      setProcesandoAccion(false);
    }
  };

  const formatDate = (iso: string) => new Date(String(iso).replace('Z', '')).toLocaleDateString();
  const formatCurrency = (value: number) =>
    `${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;
  const formatQuantity = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: Number.isInteger(value || 0) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  const formatOptionalDate = (iso?: string | null) =>
    iso ? new Date(String(iso).replace('Z', '')).toLocaleDateString() : 'Sin referencia';
  const formatDateTime = (iso?: string | null) =>
    iso ? new Date(String(iso).replace('Z', '')).toLocaleString() : 'Sin registro';

  const livePendingLabel = pendingCount === 1
    ? '1 pendiente en cola global'
    : `${pendingCount} pendientes en cola global`;
  const notificationStatusLabel = !canUseBrowserNotifications
    ? 'Requiere HTTPS'
    : pushNotificationsBusy
    ? 'Configurando'
    : pushNotificationsEnabled
    ? 'Activas'
    : notificationPermission === 'denied'
      ? 'Bloqueadas'
      : 'Por activar';
  const notificationStatusHelp = pushNotificationsReason
    ? pushNotificationsReason
    : !canUseBrowserNotifications
    ? 'Las notificaciones externas requieren HTTPS o localhost. En esta URL actual se mantendrán solo las alertas dentro de la app.'
    : pushNotificationsEnabled
    ? 'El service worker ya quedó vinculado a este equipo para avisarte aunque no tengas abierta la pantalla de aprobaciones.'
    : notificationPermission === 'denied'
      ? 'El navegador las tiene bloqueadas. Reactívalas desde la configuración del sitio para recibir avisos externos.'
      : 'Actívalas para recibir avisos profesionales incluso con la app en segundo plano o cerrada.';
  const latestRealtimeLabel = latestPendingRequest
    ? `${latestPendingRequest.codigo} · ${latestPendingRequest.solicitante} · ${latestPendingRequest.area}`
    : 'Sin ingresos recientes';
  const soundToneLabel: Record<ApprovalSoundTone, string> = {
    classic: 'Clasico',
    soft: 'Suave',
    bell: 'Campana',
    urgent: 'Urgente',
  };

  const handleEnableBrowserNotifications = async () => {
    try {
      await enablePushNotifications();
    } catch (error) {
      console.error('No se pudo solicitar permiso de notificaciones', error);
    }
  };

  const getMaterialTotal = (item: DetalleSolicitudItem) =>
    Number(item.CantidadSolicitada ?? 0) * Number(item.UltimoPrecioCompra ?? 0);

  const getStockStatus = (item: DetalleSolicitudItem) => {
    const solicitado = Number(item.CantidadSolicitada ?? 0);
    const stock = Number(item.EnStock ?? 0);

    if (!item.EnStock || stock <= 0) {
      return {
        label: 'Sin stock visible',
        className: 'border-slate-200 bg-slate-100 text-slate-600',
      };
    }

    if (stock >= solicitado) {
      return {
        label: 'Stock cubre la solicitud',
        className: 'border-green-300 bg-green-50 text-green-700',
      };
    }

    return {
      label: 'Stock parcial',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  };

  const detalleContext = useMemo(() => {
    if (!selectedSolicitud) {
      return null;
    }

    return detalleCabecera ?? fallbackCabeceraFromSolicitud(selectedSolicitud);
  }, [detalleCabecera, selectedSolicitud]);

  const buildTabView = (tab: TabKey, items: Solicitud[], currentPage: number) => {
    if (!isSearchMode) {
      return {
        filtered: items,
        safePage: currentPage,
        pageItems: items,
        totalItems: totals[tab],
      };
    }

    const filtered = items.filter((item) => matchesSolicitudSearch(item, searchTerm));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      filtered,
      safePage,
      pageItems: filtered.slice(start, start + pageSize),
      totalItems: filtered.length,
    };
  };

  const pendientesView = useMemo(
    () => buildTabView('pendientes', pendientes, pages.pendientes),
    [pendientes, pages.pendientes, searchTerm, isSearchMode, totals.pendientes],
  );
  const aprobadasView = useMemo(
    () => buildTabView('aprobadas', aprobadas, pages.aprobadas),
    [aprobadas, pages.aprobadas, searchTerm, isSearchMode, totals.aprobadas],
  );
  const rechazadasView = useMemo(
    () => buildTabView('rechazadas', rechazadas, pages.rechazadas),
    [rechazadas, pages.rechazadas, searchTerm, isSearchMode, totals.rechazadas],
  );

  useEffect(() => {
    setPages({ pendientes: 1, aprobadas: 1, rechazadas: 1 });
  }, [searchTerm]);

  useEffect(() => {
    if (isSearchMode) {
      return;
    }

    const nextPages = { ...pages };
    let changed = false;

    (['pendientes', 'aprobadas', 'rechazadas'] as TabKey[]).forEach((tab) => {
      const maxPages = Math.max(1, Math.ceil(totals[tab] / pageSize));
      if (pages[tab] > maxPages) {
        nextPages[tab] = maxPages;
        changed = true;
      }
    });

    if (changed) {
      setPages(nextPages);
    }
  }, [isSearchMode, pageSize, pages, totals]);

  const goToPage = (tab: TabKey, nextPage: number) => {
    setPages((current) => ({ ...current, [tab]: nextPage }));
  };

  const tabPresentation = {
    pendientes: {
      title: 'Pendientes por decidir',
      helper: 'Solicitudes que requieren validacion inmediata.',
      accent: 'from-amber-50 via-white to-white',
      chip: 'border-amber-200 bg-amber-50 text-amber-700',
      count: pendientesView.totalItems,
      icon: Clock,
    },
    aprobadas: {
      title: 'Decisiones aprobadas',
      helper: 'Solicitudes autorizadas y listas para ejecucion.',
      accent: 'from-emerald-50 via-white to-white',
      chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      count: aprobadasView.totalItems,
      icon: CheckCircle,
    },
    rechazadas: {
      title: 'Decisiones rechazadas',
      helper: 'Solicitudes detenidas por control operativo.',
      accent: 'from-rose-50 via-white to-white',
      chip: 'border-rose-200 bg-rose-50 text-rose-700',
      count: rechazadasView.totalItems,
      icon: XCircle,
    },
  } as const;
  const activeTabPresentation = tabPresentation[activeTab];

  const renderTable = (
    tab: TabKey,
    view: { filtered: Solicitud[]; pageItems: Solicitud[]; safePage: number; totalItems: number },
    options: { showViewAction?: boolean; showDecisionActions?: boolean } = {},
  ) => {
    const showViewAction = options.showViewAction ?? false;
    const showDecisionActions = options.showDecisionActions ?? false;
    const showActionsColumn = showViewAction || showDecisionActions;
    const solicitudes = view.pageItems;
    const tabMeta = tabPresentation[tab];
    const TabIcon = tabMeta.icon;

    return (
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.45)]">
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r ${tabMeta.accent} px-4 py-3`}>
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${tabMeta.chip}`}>
              <TabIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{tabMeta.title}</p>
              <p className="text-xs text-slate-500">{tabMeta.helper}</p>
            </div>
          </div>
          <Badge variant="outline" className={tabMeta.chip}>
            {view.totalItems} registros visibles
          </Badge>
        </div>
        <div className="overflow-x-auto">
        <Table className="min-w-[700px] text-slate-900">
          <TableHeader className="bg-slate-50">
            <TableRow className="hover:bg-muted/30">
              <TableHead className="text-xs font-semibold text-muted-foreground">Solicitud</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Cobertura</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Solicitante</TableHead>
              <TableHead className="text-center text-xs font-semibold text-muted-foreground">Items</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Presupuesto</TableHead>
              <TableHead className="text-right text-xs font-semibold text-muted-foreground">Total (USD)</TableHead>
              {showActionsColumn && (
                <TableHead className="text-right text-xs font-semibold text-muted-foreground">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {solicitudes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showActionsColumn ? 7 : 6} className="py-14 text-center text-muted-foreground">
                  {cargando
                    ? 'Cargando solicitudes...'
                    : searchTerm.trim()
                      ? 'No hay resultados para la búsqueda actual'
                      : 'No hay solicitudes en este estado'}
                </TableCell>
              </TableRow>
            ) : (
              solicitudes.map((solicitud) => {
                const areas = getAreaValues(solicitud);
                const codigosCuenta = getCodigoCuentaValues(solicitud);

                return (
                  <TableRow key={solicitud.id}>
                    <TableCell className="min-w-[240px] align-top">
                      <div className="space-y-2 py-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold tabular-nums text-slate-900">{solicitud.numero}</span>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            {formatDate(solicitud.fecha)}
                          </Badge>
                          {solicitud.ot && (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              OT {solicitud.ot}
                            </Badge>
                          )}
                        </div>
                        <SummaryBadges values={areas} emptyLabel="Sin área registrada" />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[220px] align-top">
                      <div className="space-y-2 py-1">
                        <SummaryBadges values={codigosCuenta} emptyLabel="Sin cuenta configurada" tone="accent" />
                        <div className="text-xs text-slate-500">
                          {solicitud.comentario?.trim() || 'Sin comentario del solicitante'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[220px] align-top">
                      <div className="space-y-1 py-1">
                        <div className="font-medium text-slate-900">{solicitud.solicitante}</div>
                        <div className="text-xs text-slate-500">
                          {solicitud.rolSolicitante?.trim() || 'Rol no informado'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{solicitud.items}</TableCell>
                    <TableCell className="min-w-[240px] align-top">
                      {(() => {
                        const presupuestoBadge = getPresupuestoBadgeConfig(solicitud.presupuestoEstado);
                        const saldoTexto =
                          solicitud.presupuestoDisponibleDespues == null
                            ? 'N/D'
                            : formatCurrency(solicitud.presupuestoDisponibleDespues);

                        return (
                          <div className="space-y-2 py-1">
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                              <span>{formatCurrency(solicitud.presupuestoSolicitudActual)} solicitud</span>
                              <span>{solicitud.presupuestoArea > 0 ? formatCurrency(solicitud.presupuestoArea) : 'Sin base'}</span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className={presupuestoBadge.className}>
                                {presupuestoBadge.label}
                              </Badge>
                              <span className="text-xs text-slate-500">Disponible después: {saldoTexto}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-900">
                      {formatCurrency(solicitud.total)}
                    </TableCell>
                    {showActionsColumn && (
                      <TableCell className="text-right align-top">
                        <div className="flex justify-end gap-1 py-1">
                          {showViewAction && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Ver detalle"
                              title="Ver detalle"
                              onClick={() => handleOpenModal(solicitud, 'ver')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          {showDecisionActions && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:text-slate-300 disabled:hover:bg-transparent"
                                aria-label="Aprobar"
                                title={shouldBlockBudgetApproval(solicitud)
                                  ? (solicitud.presupuestoMensaje || 'Solicitud bloqueada por presupuesto')
                                  : 'Aprobar'}
                                onClick={() => handleOpenModal(solicitud, 'aprobar')}
                                disabled={shouldBlockBudgetApproval(solicitud)}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-700 hover:bg-red-50 hover:text-red-700"
                                aria-label="Rechazar"
                                title="Rechazar"
                                onClick={() => handleOpenModal(solicitud, 'rechazar')}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
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

        <TablePagination
          page={view.safePage}
          pageSize={pageSize}
          totalItems={view.totalItems}
          onPageChange={(nextPage) => goToPage(tab, nextPage)}
        />
      </div>
    );
  };

  const aprobadasHoyFiltradas = useMemo(
    () => aprobadasView.filtered.filter((item) => isApprovalToday(item.fechaAprobacion)),
    [aprobadasView.filtered],
  );

  const pendientesCount = pendientesView.totalItems;
  const rechazadasCount = rechazadasView.totalItems;
  const montoPendiente = isSearchMode
    ? pendientesView.filtered.reduce((sum, item) => sum + item.total, 0)
    : tabSummaries.pendientes.totalMonto;
  const aprobadasHoyCount = isSearchMode
    ? aprobadasHoyFiltradas.length
    : tabSummaries.aprobadas.aprobadasHoyCount;
  const aprobadasHoyMonto = isSearchMode
    ? aprobadasHoyFiltradas.reduce((sum, item) => sum + item.total, 0)
    : tabSummaries.aprobadas.aprobadasHoyMonto;

  const presupuestoModal = useMemo(() => {
    if (!selectedSolicitud) return null;

    return {
      presupuestoArea: Number(selectedSolicitud.presupuestoArea || 0),
      consumoAcumulado: Number(selectedSolicitud.consumoAcumulado || 0),
      solicitudActual: Number(selectedSolicitud.presupuestoSolicitudActual || selectedSolicitud.total || 0),
      disponibleDespues: selectedSolicitud.presupuestoDisponibleDespues == null
        ? null
        : Number(selectedSolicitud.presupuestoDisponibleDespues),
      tienePresupuesto: selectedSolicitud.presupuestoEstado !== 'SIN_PRESUPUESTO',
      bloqueada: selectedSolicitud.presupuestoBloqueada,
      estado: selectedSolicitud.presupuestoEstado,
      mensaje: selectedSolicitud.presupuestoMensaje ?? null,
    };
  }, [selectedSolicitud]);

  const resumenMateriales = useMemo(() => {
    const lineas = detalleSolicitud.length;
    const unidades = detalleSolicitud.reduce((sum, item) => sum + Number(item.CantidadSolicitada ?? 0), 0);
    const valorTotal = detalleSolicitud.reduce((sum, item) => sum + getMaterialTotal(item), 0);
    const lineasCubiertas = detalleSolicitud.filter((item) => Number(item.EnStock ?? 0) >= Number(item.CantidadSolicitada ?? 0)).length;

    return {
      lineas,
      unidades,
      valorTotal,
      lineasCubiertas,
    };
  }, [detalleSolicitud]);

  const resumenDecision = useMemo(() => {
    if (!selectedSolicitud?.estadoAprobacion) return null;

    const estado = String(selectedSolicitud.estadoAprobacion).toUpperCase();
    if (estado === 'APROBADA') {
      return {
        label: 'Aprobada',
        badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        accentClassName: 'from-emerald-50 to-white',
      };
    }

    if (estado === 'RECHAZADA') {
      return {
        label: 'Rechazada',
        badgeClassName: 'border-red-200 bg-red-50 text-red-700',
        accentClassName: 'from-red-50 to-white',
      };
    }

    return {
      label: selectedSolicitud.estadoAprobacion,
      badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
      accentClassName: 'from-slate-50 to-white',
    };
  }, [selectedSolicitud]);

  const estadoSolicitudBadge = getEstadoBadgeConfig(detalleContext?.estado ?? selectedSolicitud?.estado);

  const renderDetalleMateriales = () => {
    if (cargandoDetalle) {
      return (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando detalle...
        </div>
      );
    }

    if (detalleSolicitud.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <Package className="h-4 w-4 shrink-0" />
          No hay líneas de detalle registradas.
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border">
        <div className="max-h-72 overflow-y-auto overflow-x-auto">
          <Table className="text-sm min-w-[680px]">
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead className="text-xs w-24">N° Artículo</TableHead>
                <TableHead className="text-xs">Descripción</TableHead>
                <TableHead className="text-xs">Área</TableHead>
                <TableHead className="text-xs">Cuenta</TableHead>
                <TableHead className="text-xs">Actividad / O.C.</TableHead>
                <TableHead className="text-right text-xs w-24">Cant. Sol.</TableHead>
                <TableHead className="text-right text-xs w-24">Cant. Apr.</TableHead>
                <TableHead className="text-xs w-20">Unidad</TableHead>
                <TableHead className="text-right text-xs w-20">En Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalleSolicitud.map((item, index) => (
                <TableRow key={`${item.NumeroArticulo ?? 'detalle'}-${index}`} className="text-sm">
                  <TableCell className="font-mono text-xs">{item.NumeroArticulo || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.DescripcionArticulo || 'Sin descripción'}</TableCell>
                  <TableCell>
                    {item.AreaNombre ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 truncate max-w-[120px]">
                        {item.AreaNombre}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.CodigoCuenta ? (
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                        {item.CodigoCuenta}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{item.ComentarioLinea || '—'}</TableCell>
                  <TableCell className="text-right">{formatQuantity(Number(item.CantidadSolicitada ?? 0))}</TableCell>
                  <TableCell className="text-right">
                    {item.CantidadAprobada != null ? (
                      <span
                        className={
                          Number(item.CantidadAprobada) < Number(item.CantidadSolicitada ?? 0)
                            ? 'font-medium text-amber-600'
                            : 'font-medium text-green-700'
                        }
                      >
                        {formatQuantity(Number(item.CantidadAprobada))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{item.UnidadMedidaMaterial || '-'}</TableCell>
                  <TableCell className="text-right">
                    {item.EnStock != null ? (
                      <span
                        className={
                          Number(item.EnStock) === 0
                            ? 'font-medium text-red-600'
                            : Number(item.EnStock) < Number(item.CantidadSolicitada ?? 0)
                              ? 'font-medium text-amber-600'
                              : ''
                        }
                      >
                        {formatQuantity(Number(item.EnStock))}
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
    );
  };

  const renderApprovalHistory = () => {
    if (!selectedSolicitud) {
      return null;
    }

    if (cargandoAprobaciones) {
      return (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando aprobaciones...
        </div>
      );
    }

    if (aprobacionesHistorial.length === 0) {
      return (
        <p className="py-2 text-sm text-muted-foreground">Sin aprobaciones registradas aún.</p>
      );
    }

    return (
      <div className="space-y-2">
        {aprobacionesHistorial.map((item) => {
          const aprobada = String(item.Estado).toUpperCase() === 'APROBADA';
          const rechazada = String(item.Estado).toUpperCase() === 'RECHAZADA';

          return (
            <div
              key={item.IdAprobacion}
              className={`flex items-start gap-3 rounded-lg border p-3 ${aprobada
                ? 'border-green-200 bg-green-50'
                : rechazada
                  ? 'border-red-200 bg-red-50'
                  : 'border-slate-200 bg-slate-50'
                }`}
            >
              <div className="mt-0.5">
                {aprobada ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : rechazada ? (
                  <XCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.NombreAprobador}</span>
                  <Badge
                    className={`px-1.5 py-0.5 text-xs ${aprobada
                      ? 'bg-green-100 text-green-700'
                      : rechazada
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                      }`}
                  >
                    {String(item.Estado).replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(item.FechaAprobacion)}
                  {item.EmailAprobador ? ` · ${item.EmailAprobador}` : ''}
                </div>
                {item.Comentario?.trim() && (
                  <div className="mt-1.5 rounded border border-slate-200 bg-white/80 px-2 py-1.5 text-sm text-slate-700">
                    {item.Comentario}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 shadow-[0_20px_55px_-38px_rgba(15,23,42,0.3)]">
        <CardContent className="bg-[linear-gradient(135deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.95)_48%,rgba(236,253,245,0.9)_100%)] px-5 py-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Operación de aprobaciones
                </div>
                <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Mesa de decisión</h1>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {pendingCount}
                </Badge>
                <Badge variant="outline" className={realtimeConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                  <Radio className="mr-1 h-3.5 w-3.5" />
                  {realtimeConnected ? 'Online' : 'Sync'}
                </Badge>
                <button
                  type="button"
                  onClick={handleEnableBrowserNotifications}
                  disabled={!canUseBrowserNotifications || pushNotificationsBusy || pushNotificationsEnabled}
                  title={notificationStatusHelp}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    pushNotificationsEnabled
                      ? 'cursor-default border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
                  }`}
                >
                  {pushNotificationsEnabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  aria-pressed={soundEnabled}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    soundEnabled
                      ? 'border-sky-300 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
                <select
                  value={soundTone}
                  onChange={(event) => setSoundTone(event.target.value as ApprovalSoundTone)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                  title={`Tono: ${soundToneLabel[soundTone]}`}
                >
                  <option value="classic">Clasico</option>
                  <option value="soft">Suave</option>
                  <option value="bell">Campana</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por solicitud, área, cuenta, OT o solicitante"
                  className="h-9 rounded-xl border-slate-200 bg-white pl-10 text-sm"
                />
              </div>
              {searchTerm.trim() ? (
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')} className="rounded-xl">
                  Limpiar
                </Button>
              ) : (
                <div className="hidden md:block" />
              )}
            </div>

            

            {!puedeAprobar && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Modo lectura: puedes revisar solicitudes, pero no aprobarlas ni rechazarlas.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      

      <Card className="border-slate-200/80 text-slate-900 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
        <CardContent className="pt-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-white px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Mesa operativa de decision
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{activeTabPresentation.title}</h2>
              <p className="text-sm text-slate-600">{activeTabPresentation.helper}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={activeTabPresentation.chip}>
                {activeTabPresentation.count} en {activeTab}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {pendientesView.totalItems + aprobadasView.totalItems + rechazadasView.totalItems} total visible
              </Badge>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setActiveTab('pendientes')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeTab === 'pendientes'
                  ? 'border border-amber-200 bg-white text-slate-950 shadow-sm'
                  : 'border border-transparent text-slate-700 hover:bg-white/70'
              }`}
            >
              <Clock className="h-4 w-4 text-amber-600" />
              Pendientes ({pendientesView.totalItems})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('aprobadas')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeTab === 'aprobadas'
                  ? 'border border-emerald-200 bg-white text-slate-950 shadow-sm'
                  : 'border border-transparent text-slate-700 hover:bg-white/70'
              }`}
            >
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Aprobadas ({aprobadasView.totalItems})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rechazadas')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeTab === 'rechazadas'
                  ? 'border border-rose-200 bg-white text-slate-950 shadow-sm'
                  : 'border border-transparent text-slate-700 hover:bg-white/70'
              }`}
            >
              <XCircle className="h-4 w-4 text-rose-600" />
              Rechazadas ({rechazadasView.totalItems})
            </button>
          </div>

          <div className="mt-6">
            {activeTab === 'pendientes' && renderTable('pendientes', pendientesView, { showViewAction: true, showDecisionActions: puedeAprobar })}
            {activeTab === 'aprobadas' && renderTable('aprobadas', aprobadasView, { showViewAction: true })}
            {activeTab === 'rechazadas' && renderTable('rechazadas', rechazadasView, { showViewAction: true })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!modalAction} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="flex flex-col max-h-[90vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b bg-slate-50 px-6 pb-4 pt-6">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5 text-primary" />
              {modalAction === 'ver'
                ? 'Detalle de Solicitud'
                : modalAction === 'aprobar'
                  ? 'Revisar y aprobar solicitud'
                  : 'Revisar y rechazar solicitud'}
            </DialogTitle>
            {selectedSolicitud && (
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-700">{detalleContext?.numero || selectedSolicitud.numero}</span>
                <span className="text-slate-400">·</span>
                <Badge className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs ${estadoSolicitudBadge.className}`}>
                  <estadoSolicitudBadge.icon className="h-3 w-3" />
                  {estadoSolicitudBadge.label}
                </Badge>
                {modalAction !== 'ver' && (
                  <Badge variant="outline" className={modalAction === 'aprobar'
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-red-300 bg-red-50 text-red-700'}>
                    {modalAction === 'aprobar' ? 'Pendiente de aprobación' : 'Pendiente de rechazo'}
                  </Badge>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          {selectedSolicitud && detalleContext && (
            <div className="flex-1 min-h-0 space-y-5 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Fecha" value={formatDate(detalleContext.fecha)} />
                <InfoField label="Solicitante" value={detalleContext.solicitante} />
              </div>

              <div className="flex flex-col gap-3 rounded-lg border bg-slate-50 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total ítems: </span>
                  <span className="font-semibold">{selectedSolicitud.items}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Total monto (USD): </span>
                  <span className="font-semibold text-base">{formatCurrency(selectedSolicitud.total)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Disponible después: </span>
                  <span className={`font-semibold ${shouldBlockBudgetApproval(selectedSolicitud) ? 'text-red-600' : 'text-slate-900'}`}>
                    {presupuestoModal?.disponibleDespues == null
                      ? 'N/D'
                      : formatCurrency(presupuestoModal.disponibleDespues)}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">OT: </span>
                  <span className="font-semibold">
                    {detalleContext.ot || (detalleSolicitud.some((item) => String(item.ComentarioLinea ?? '').trim().length > 0) ? 'Definida por línea' : 'No informada')}
                  </span>
                </div>
              </div>

              {modalAction !== 'ver' && selectedSolicitud.presupuestoEstado !== 'CONTROLADO' && (
                <Alert
                  variant={shouldBlockBudgetApproval(selectedSolicitud) ? 'destructive' : 'default'}
                  className={shouldBlockBudgetApproval(selectedSolicitud)
                    ? 'border-red-200 bg-red-50/90'
                    : 'border-amber-200 bg-amber-50/90 text-amber-900'}
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {presupuestoModal?.mensaje || 'La solicitud requiere revisión presupuestaria.'}
                  </AlertDescription>
                </Alert>
              )}

              {modalAction === 'ver' && resumenDecision && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Última decisión registrada
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {selectedSolicitud.nombreAprobador || 'Sin responsable'}
                      {selectedSolicitud.fechaAprobacion ? ` · ${formatDateTime(selectedSolicitud.fechaAprobacion)}` : ''}
                    </div>
                  </div>
                  <Badge variant="outline" className={resumenDecision.badgeClassName}>
                    {resumenDecision.label}
                  </Badge>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalle de Materiales
                </h3>
                {renderDetalleMateriales()}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Historial de Aprobaciones
                </h3>
                {renderApprovalHistory()}
              </div>

              {detalleContext.comentario?.trim() && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Observaciones
                  </h3>
                  <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                    {detalleContext.comentario}
                  </div>
                </div>
              )}

              {modalAction !== 'ver' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Decisión
                  </h3>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {modalAction === 'aprobar'
                          ? 'Puedes dejar un comentario opcional para trazabilidad de la aprobación.'
                          : 'Debes explicar el motivo del rechazo antes de continuar.'}
                      </p>
                      <Label htmlFor="comentario" className="sr-only">
                        Comentario
                      </Label>
                      <Textarea
                        id="comentario"
                        placeholder={modalAction === 'aprobar'
                          ? 'Comentario opcional...'
                          : 'Explica el motivo del rechazo...'}
                        value={comentario}
                        onChange={(event) => setComentario(event.target.value)}
                        rows={4}
                        className="min-h-[110px] resize-none rounded-xl border-slate-200 bg-slate-50 text-sm"
                      />
                    </div>
                    <div className="space-y-3 rounded-lg border bg-slate-50 p-4 text-sm">
                      <div className="font-semibold text-slate-900">Resumen presupuestario</div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Estado</span>
                        <Badge variant="outline" className={getPresupuestoBadgeConfig(selectedSolicitud.presupuestoEstado).className}>
                          {getPresupuestoBadgeConfig(selectedSolicitud.presupuestoEstado).label}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Presupuesto</span>
                        <span className="font-medium">
                          {presupuestoModal?.presupuestoArea ? formatCurrency(presupuestoModal.presupuestoArea) : 'N/D'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Solicitud actual</span>
                        <span className="font-medium">{formatCurrency(presupuestoModal?.solicitudActual ?? 0)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Disponible después</span>
                        <span
                          className={`font-semibold ${
                            shouldBlockBudgetApproval(selectedSolicitud) ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {presupuestoModal?.disponibleDespues == null
                            ? 'N/D'
                            : formatCurrency(presupuestoModal.disponibleDespues)}
                        </span>
                      </div>

                      {presupuestoModal?.mensaje?.trim() && (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          {presupuestoModal.mensaje}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 border-t bg-slate-50 px-6 py-4 sm:justify-between">
            <div className="hidden text-sm text-muted-foreground sm:block">
              {!cargandoDetalle && detalleSolicitud.length > 0
                ? `${detalleSolicitud.length} líneas · ${formatCurrency(resumenMateriales.valorTotal)} estimado`
                : 'Sin líneas de detalle'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={closeModal}>
                {modalAction === 'ver' ? 'Cerrar' : 'Cancelar'}
              </Button>
              {modalAction !== 'ver' && (
                <button
                  type="button"
                  onClick={handleConfirmarAccion}
                  disabled={
                    procesandoAccion
                    || (modalAction === 'aprobar' && Boolean(selectedSolicitud && shouldBlockBudgetApproval(selectedSolicitud)))
                  }
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-all disabled:pointer-events-none"
                  style={{
                    backgroundColor: modalAction === 'aprobar' ? '#16a34a' : '#dc2626',
                    color: '#ffffff',
                    opacity: procesandoAccion ? 0.85 : 1,
                    boxShadow: modalAction === 'aprobar'
                      ? '0 1px 2px rgba(22, 163, 74, 0.25)'
                      : '0 1px 2px rgba(220, 38, 38, 0.25)',
                  }}
                >
                  {modalAction === 'aprobar' ? (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  {procesandoAccion
                    ? 'Procesando...'
                    : modalAction === 'aprobar'
                      ? 'Confirmar aprobación'
                      : 'Confirmar rechazo'}
                </button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="break-words text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
