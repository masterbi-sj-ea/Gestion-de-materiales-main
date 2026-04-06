import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from '../contexts/PermisosContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { sileo } from 'sileo';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CheckCircle, XCircle, Eye, Clock, AlertCircle, DollarSign, Building2, ClipboardList, Package, UserRound } from 'lucide-react';
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
  fechaAprobacion?: string;
  estadoAprobacion?: string;
  comentarioAprobacion?: string | null;
  nombreAprobador?: string | null;
}

interface DetalleSolicitudItem {
  NumeroArticulo?: string | null;
  DescripcionArticulo?: string | null;
  CantidadSolicitada?: number | null;
  UnidadMedidaMaterial?: string | null;
  UltimoPrecioCompra?: number | null;
  EnStock?: number | null;
  GrupoArticulos?: string | null;
  UltimaFechaCompra?: string | null;
  ComentarioLinea?: string | null;
}

export default function AprobacionPage() {
  const { token, user } = useAuth();
  const { getPermisosModulo } = usePermisos();
  const [pendientes, setPendientes] = useState<Solicitud[]>([]);
  const [aprobadas, setAprobadas] = useState<Solicitud[]>([]);
  const [rechazadas, setRechazadas] = useState<Solicitud[]>([]);
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [detalleSolicitud, setDetalleSolicitud] = useState<DetalleSolicitudItem[]>([]);
  const [modalAction, setModalAction] = useState<'aprobar' | 'rechazar' | 'ver' | null>(null);
  const [comentario, setComentario] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [procesandoAccion, setProcesandoAccion] = useState(false);

  const permisosModulo = user ? getPermisosModulo(user.role, 'aprobaciones') : null;
  const puedeAprobar = !!permisosModulo?.puedeAprobar;

  const mapSolicitud = (s: any): Solicitud => ({
    id: String(s.IdSolicitud ?? s.id ?? ''),
    numero: s.CodigoSolicitud ?? s.numero ?? '-',
    fecha: s.FechaSolicitud ?? s.fecha ?? new Date().toISOString(),
    area: s.AreaNombre ?? s.area ?? 'Sin área',
    solicitante: s.NombreSolicitante ?? s.solicitante ?? 'Sin solicitante',
    items: Number(s.TotalItems ?? s.items ?? 0),
    total: Number(s.TotalMonto ?? s.total ?? 0),
    presupuestoArea: Number(s.PresupuestoArea ?? 0),
    consumoAcumulado: Number(s.ConsumoAcumulado ?? 0),
    excedePresupuesto:
      Number(s.PresupuestoArea ?? 0) > 0
        ? Number(s.ConsumoAcumulado ?? 0) + Number(s.TotalMonto ?? 0) > Number(s.PresupuestoArea ?? 0)
        : false,
    fechaAprobacion: s.FechaAprobacion,
    estadoAprobacion: s.EstadoAprobacion,
    comentarioAprobacion: s.ComentarioAprobacion ?? null,
    nombreAprobador: s.NombreAprobador ?? null,
  });

  const cargarSolicitudes = async () => {
    if (!token) return;
    setCargando(true);
    try {
      const [pendResp, aprResp, rejResp] = await Promise.all([
        apiFetch('/solicitudes?estado=PENDIENTE'),
        apiFetch('/solicitudes?estado=APROBADA'),
        apiFetch('/solicitudes?estado=RECHAZADA'),
      ]);

      const [pendJson, aprJson, rejJson] = await Promise.all([
        pendResp.ok ? pendResp.json() : [],
        aprResp.ok ? aprResp.json() : [],
        rejResp.ok ? rejResp.json() : [],
      ]);

      setPendientes((pendJson || []).map(mapSolicitud));
      setAprobadas((aprJson || []).map(mapSolicitud));
      setRechazadas((rejJson || []).map(mapSolicitud));
    } catch (error) {
      console.error('Error al cargar aprobaciones', error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, [token]);

  useEffect(() => {
    if (!selectedSolicitud || !token) return;

    const cargarDetalle = async () => {
      setCargandoDetalle(true);
      try {
        const resp = await apiFetch(`/solicitudes/${selectedSolicitud.id}`);
        if (resp.ok) {
          const data = await resp.json();
          setDetalleSolicitud(data.detalle || []);
        }
      } catch (error) {
        console.error('Error al cargar detalle', error);
      } finally {
        setCargandoDetalle(false);
      }
    };

    cargarDetalle();
  }, [selectedSolicitud, token]);

  const handleOpenModal = (solicitud: Solicitud, action: 'aprobar' | 'rechazar' | 'ver') => {
    setSelectedSolicitud(solicitud);
    setModalAction(action);
    setComentario('');
    setDetalleSolicitud([]);
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

      await cargarSolicitudes();
      setSelectedSolicitud(null);
      setModalAction(null);
      setComentario('');
      setDetalleSolicitud([]);
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
  const formatCurrency = (value: number) => `$${Number(value || 0).toLocaleString()}`;
  const formatQuantity = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: Number.isInteger(value || 0) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  const formatOptionalDate = (iso?: string | null) =>
    iso ? new Date(String(iso).replace('Z', '')).toLocaleDateString() : 'Sin referencia';

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

  const renderTable = (
    solicitudes: Solicitud[],
    options: { showViewAction?: boolean; showDecisionActions?: boolean } = {},
  ) => {
    const showViewAction = options.showViewAction ?? false;
    const showDecisionActions = options.showDecisionActions ?? false;
    const showActionsColumn = showViewAction || showDecisionActions;

    return (
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-muted/30">
              <TableHead className="text-xs font-semibold text-muted-foreground">Número</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Área</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Solicitante</TableHead>
              <TableHead className="text-center text-xs font-semibold text-muted-foreground">Items</TableHead>
              <TableHead className="text-right text-xs font-semibold text-muted-foreground">Total</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Estado Presup.</TableHead>
              {showActionsColumn && <TableHead className="text-right text-xs font-semibold text-muted-foreground">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {solicitudes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showActionsColumn ? 8 : 7} className="text-center py-12 text-muted-foreground">
                  {cargando ? 'Cargando...' : 'No hay solicitudes en este estado'}
                </TableCell>
              </TableRow>
            ) : (
              solicitudes.map((solicitud) => {
                const tienePresupuesto = solicitud.presupuestoArea > 0;

                return (
                  <TableRow key={solicitud.id}>
                    <TableCell className="font-medium tabular-nums">{solicitud.numero}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(solicitud.fecha)}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={solicitud.area}>
                      {solicitud.area}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate" title={solicitud.solicitante}>
                      {solicitud.solicitante}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{solicitud.items}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatCurrency(solicitud.total)}</TableCell>
                    <TableCell>
                      {!tienePresupuesto ? (
                        <Badge variant="outline">N/D</Badge>
                      ) : solicitud.excedePresupuesto ? (
                        <Badge variant="destructive">
                          <AlertCircle className="w-3 h-3" />
                          Excede
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <CheckCircle className="w-3 h-3" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    {showActionsColumn && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
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
                                className="text-primary hover:text-primary"
                                aria-label="Aprobar"
                                title="Aprobar"
                                onClick={() => handleOpenModal(solicitud, 'aprobar')}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
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
    );
  };

  const aprobadasHoy = useMemo(() => {
    const hoy = new Date().toDateString();
    return aprobadas.filter((s) => {
      if (!s.fechaAprobacion) return false;
      return new Date(s.fechaAprobacion.replace('Z', '')).toDateString() === hoy;
    });
  }, [aprobadas]);

  const presupuestoModal = useMemo(() => {
    if (!selectedSolicitud) return null;

    const presupuestoArea = Number(selectedSolicitud.presupuestoArea || 0);
    const consumoAcumulado = Number(selectedSolicitud.consumoAcumulado || 0);
    const disponibleActual = presupuestoArea - consumoAcumulado;
    const saldoPosterior = disponibleActual - Number(selectedSolicitud.total || 0);

    return {
      presupuestoArea,
      consumoAcumulado,
      disponibleActual,
      saldoPosterior,
      tienePresupuesto: presupuestoArea > 0,
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

  const renderMaterialShowcase = () => {
    if (cargandoDetalle) {
      return (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.98)_0%,rgba(30,41,59,0.96)_56%,rgba(248,250,252,0.98)_100%)] px-6 py-6 text-white shadow-[0_24px_50px_-30px_rgba(15,23,42,0.75)]">
            <div className="max-w-2xl space-y-3">
              <div className="h-3 w-32 rounded-full bg-white/20" />
              <div className="h-8 w-3/4 rounded-full bg-white/15" />
              <div className="h-4 w-full rounded-full bg-white/10" />
            </div>
          </div>
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/95 px-5 py-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.45)]"
              >
                <div className="animate-pulse space-y-4">
                  <div className="h-4 w-40 rounded-full bg-slate-200" />
                  <div className="h-6 w-4/5 rounded-full bg-slate-200" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="h-20 rounded-2xl bg-slate-100" />
                    <div className="h-20 rounded-2xl bg-slate-100" />
                    <div className="h-20 rounded-2xl bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (detalleSolicitud.length === 0) {
      return (
        <div className="overflow-hidden rounded-[28px] border border-dashed border-slate-300 bg-white/90 px-6 py-10 text-center shadow-[0_20px_50px_-40px_rgba(15,23,42,0.5)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Package className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-950">
            No encontramos materiales para mostrar
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Esta solicitud no devolvio lineas de detalle en la consulta actual. Cuando haya materiales disponibles,
            los veras aqui con un resumen visual completo.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(140deg,rgba(15,23,42,0.98)_0%,rgba(30,41,59,0.98)_48%,rgba(240,253,250,0.96)_100%)] px-5 py-5 text-white shadow-[0_24px_60px_-34px_rgba(15,23,42,0.85)] sm:px-6 sm:py-6">
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative space-y-5">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-200">
                Radiografia de materiales
              </div>
              <div className="max-w-2xl">
                <h3 className="text-xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
                  Una vista clara para decidir con contexto, no con tablas frias.
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Cada tarjeta muestra el impacto economico, la cobertura de stock y el contexto operativo de cada
                  linea solicitada.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Lineas solicitadas
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{resumenMateriales.lineas}</div>
                <p className="mt-2 text-xs text-slate-300">Materiales distintos incluidos en la solicitud.</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Volumen requerido
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {formatQuantity(resumenMateriales.unidades)}
                </div>
                <p className="mt-2 text-xs text-slate-300">Suma de unidades pedidas en todas las lineas.</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Cobertura inmediata
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {resumenMateriales.lineasCubiertas}/{resumenMateriales.lineas}
                </div>
                <p className="mt-2 text-xs text-slate-300">Lineas con stock suficiente segun el inventario visible.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {detalleSolicitud.map((item, index) => {
            const stockStatus = getStockStatus(item);
            const materialTotal = getMaterialTotal(item);

            return (
              <article
                key={`${item.NumeroArticulo ?? 'linea'}-${index}`}
                className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_100%)] shadow-[0_24px_50px_-38px_rgba(15,23,42,0.45)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#0f172a_0%,#14b8a6_100%)]" />
                <div className="px-5 py-5 sm:px-6 sm:py-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-950/10">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-white">
                          {item.NumeroArticulo || 'Sin codigo'}
                        </Badge>
                        {item.GrupoArticulos && (
                          <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">
                            {item.GrupoArticulos}
                          </Badge>
                        )}
                        <Badge variant="outline" className={stockStatus.className}>
                          {stockStatus.label}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
                          {item.DescripcionArticulo || 'Material sin descripcion'}
                        </h4>
                        {item.ComentarioLinea && (
                          <p className="max-w-3xl text-sm leading-6 text-slate-500">{item.ComentarioLinea}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 text-left shadow-sm lg:min-w-[220px] lg:text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Impacto economico
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatCurrency(materialTotal)}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Estimado con ultimo precio de compra registrado.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Cantidad</div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatQuantity(Number(item.CantidadSolicitada ?? 0))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{item.UnidadMedidaMaterial || 'Unidad no definida'}</p>
                    </div>

                    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Ultimo precio
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatCurrency(Number(item.UltimoPrecioCompra ?? 0))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Referencia historica disponible.</p>
                    </div>

                    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Stock visible</div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatQuantity(Number(item.EnStock ?? 0))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Existencia reflejada por el backend.</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Unidad: {item.UnidadMedidaMaterial || 'Sin definir'}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Ultima compra: {formatOptionalDate(item.UltimaFechaCompra)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Valor lineal: {formatCurrency(materialTotal)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSidebarPanels = () => {
    if (!selectedSolicitud) return null;

    return (
      <div className="space-y-4">
        <div
          className={`overflow-hidden rounded-[28px] border shadow-[0_20px_55px_-40px_rgba(15,23,42,0.55)] ${selectedSolicitud.excedePresupuesto
            ? 'border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(255,255,255,0.98))]'
            : 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))]'
            }`}
        >
          <div className="border-b border-black/5 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Analisis presupuestario
                </div>
                <div className="mt-2 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950">
                  <DollarSign className="h-5 w-5" />
                  {presupuestoModal?.tienePresupuesto ? 'Control presupuestario del area' : 'Sin presupuesto configurado'}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  selectedSolicitud.excedePresupuesto
                    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                }
              >
                {selectedSolicitud.excedePresupuesto ? 'Riesgo alto' : 'Saldo saludable'}
              </Badge>
            </div>
          </div>

          <div className="space-y-3 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[22px] border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Presupuesto area</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {formatCurrency(presupuestoModal?.presupuestoArea ?? 0)}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Consumo acumulado</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {formatCurrency(presupuestoModal?.consumoAcumulado ?? 0)}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500">Disponible actual</span>
                <span className="text-base font-semibold text-slate-950">
                  {presupuestoModal?.tienePresupuesto ? formatCurrency(presupuestoModal.disponibleActual) : 'N/D'}
                </span>
              </div>
              <div className="my-4 h-px bg-slate-200" />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Saldo despues de esta decision</span>
                <span className={`text-xl font-semibold tracking-tight ${selectedSolicitud.excedePresupuesto ? 'text-red-600' : 'text-emerald-600'}`}>
                  {presupuestoModal?.tienePresupuesto ? formatCurrency(presupuestoModal.saldoPosterior) : 'N/D'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200/80 px-5 py-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              Contexto de la solicitud
            </div>
          </div>
          <div className="space-y-3 px-5 py-5 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500">Fecha registrada</span>
              <span className="font-medium text-slate-900">{formatDate(selectedSolicitud.fecha)}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500">Estado de revision</span>
              <span className={`font-medium ${modalAction === 'aprobar' ? 'text-emerald-700' : modalAction === 'rechazar' ? 'text-red-700' : 'text-slate-900'}`}>
                {modalAction === 'aprobar' ? 'Lista para aprobar' : modalAction === 'rechazar' ? 'Lista para rechazar' : 'Solo lectura'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500">Lineas cubiertas</span>
              <span className="font-medium text-slate-900">
                {resumenMateriales.lineasCubiertas}/{resumenMateriales.lineas || 0}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500">Valor estimado</span>
              <span className="font-medium text-slate-900">{formatCurrency(resumenMateriales.valorTotal)}</span>
            </div>
          </div>
        </div>

        {modalAction === 'ver' && resumenDecision && (
          <div className={`overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br ${resumenDecision.accentClassName} shadow-[0_20px_55px_-40px_rgba(15,23,42,0.45)]`}>
            <div className="space-y-4 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Ultima decision registrada
                  </div>
                  <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                    Historial mas reciente de aprobacion
                  </div>
                </div>
                <Badge variant="outline" className={resumenDecision.badgeClassName}>
                  {resumenDecision.label}
                </Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Responsable</span>
                  <span className="font-medium text-slate-900">{selectedSolicitud.nombreAprobador || 'Sin registro'}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Fecha</span>
                  <span className="font-medium text-slate-900">{formatOptionalDate(selectedSolicitud.fechaAprobacion)}</span>
                </div>
                <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4 text-slate-700 shadow-sm">
                  {selectedSolicitud.comentarioAprobacion?.trim()
                    ? selectedSolicitud.comentarioAprobacion
                    : 'No se registro comentario en la ultima decision.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {(modalAction === 'rechazar' || modalAction === 'aprobar') && (
          <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.45)]">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {modalAction === 'rechazar' ? 'Motivo de rechazo' : 'Comentario de aprobacion'}
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {modalAction === 'rechazar' ? 'Deja una justificacion clara para el solicitante.' : 'Agrega contexto util para el seguimiento interno.'}
              </div>
            </div>
            <div className="px-5 py-5">
              <Label htmlFor="comentario" className="sr-only">
                Comentario
              </Label>
              <Textarea
                id="comentario"
                placeholder={
                  modalAction === 'rechazar'
                    ? 'Explica claramente por que la solicitud no puede avanzar...'
                    : 'Agrega una observacion que ayude al equipo a entender la decision...'
                }
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={modalAction === 'rechazar' ? 5 : 4}
                className="min-h-[140px] rounded-[22px] border-slate-200 bg-slate-50/80 text-sm shadow-inner"
              />
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {modalAction === 'rechazar'
                  ? 'Este comentario es obligatorio y quedara registrado como parte del historial de aprobacion.'
                  : 'Este comentario es opcional, pero ayuda a dejar trazabilidad para auditoria y seguimiento.'}
              </p>
            </div>
          </div>
        )}

        {selectedSolicitud.excedePresupuesto && (
          <Alert variant="destructive" className="border-red-200 bg-red-50/90">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Esta solicitud excede el presupuesto disponible del area.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Gestión de Aprobaciones</h1>
        <p className="text-muted-foreground mt-1">
          Revisar y aprobar solicitudes de materiales
        </p>
        {!puedeAprobar && (
          <p className="text-sm text-muted-foreground mt-2">
            Tu acceso actual es de solo lectura. Puedes revisar solicitudes, pero no aprobarlas ni rechazarlas.
          </p>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Pendientes</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
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
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{aprobadasHoy.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: ${aprobadasHoy.reduce((sum, s) => sum + s.total, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Rechazadas</CardTitle>
            <XCircle className="w-4 h-4 text-muted-foreground" />
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
              {renderTable(pendientes, { showViewAction: true, showDecisionActions: puedeAprobar })}
            </TabsContent>

            <TabsContent value="aprobadas" className="mt-6">
              {renderTable(aprobadas, { showViewAction: true })}
            </TabsContent>

            <TabsContent value="rechazadas" className="mt-6">
              {renderTable(rechazadas, { showViewAction: true })}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Modal de Acción ─────────────────────────────────────── */}
      <Dialog
        open={!!modalAction}
        onOpenChange={() => {
          setModalAction(null);
          setSelectedSolicitud(null);
          setComentario('');
          setDetalleSolicitud([]);
        }}
      >
        <DialogContent className="!block w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-0 bg-white !p-0 shadow-[0_40px_80px_-20px_rgba(15,23,42,0.5),0_0_0_1px_rgba(15,23,42,0.07)] sm:max-w-[760px]">

          {/* ── Header premium ─────────────────────────────── */}
          <div
            style={{
              background:
                modalAction === 'aprobar'
                  ? 'linear-gradient(135deg, #16a34a 0%, #334155 100%)'
                  : modalAction === 'rechazar'
                    ? 'linear-gradient(135deg, #16a34a 0%, #334155 100%)'
                    : 'linear-gradient(135deg, #16a34a 0%, #334155 100%)',
            }}
            className="relative overflow-hidden px-6 pt-5 pb-4"
          >
            {/* decorative glow orbs */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-20 w-20 rounded-full bg-white/5 blur-xl" />

            <DialogHeader className="relative text-left">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
                    {modalAction === 'ver' ? 'Revisión' : modalAction === 'aprobar' ? 'Aprobación' : 'Rechazo'}
                  </div>
                  <DialogTitle className="text-lg font-semibold leading-tight text-white">
                    {modalAction === 'ver'
                      ? 'Detalle de solicitud'
                      : modalAction === 'aprobar'
                        ? 'Aprobar solicitud'
                        : 'Rechazar solicitud'}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 font-mono text-xs tracking-wider text-white/50">
                    {selectedSolicitud?.numero}
                  </DialogDescription>
                </div>
                {modalAction !== 'ver' && (
                  <Badge
                    variant="outline"
                    className={`shrink-0 border text-[11px] font-semibold ${modalAction === 'aprobar'
                      ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                      : 'border-red-400/30 bg-red-400/15 text-red-300'
                      }`}
                  >
                    {modalAction === 'aprobar' ? 'Confirmación' : 'Requiere motivo'}
                  </Badge>
                )}
              </div>
            </DialogHeader>

            {/* Info strip inside header */}
            {selectedSolicitud && (
              <div className="relative mt-4 grid grid-cols-4 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/8 overflow-hidden">
                {[
                  { label: 'Área', value: selectedSolicitud.area },
                  { label: 'Solicitante', value: selectedSolicitud.solicitante },
                  { label: 'Fecha', value: formatDate(selectedSolicitud.fecha) },
                  {
                    label: 'Total',
                    value: formatCurrency(selectedSolicitud.total),
                    accent: selectedSolicitud.excedePresupuesto,
                  },
                ].map((field) => (
                  <div key={field.label} className="px-3 py-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">{field.label}</p>
                    <p
                      className={`mt-0.5 truncate text-sm font-semibold ${field.accent ? 'text-red-300' : 'text-white'
                        }`}
                      title={field.value}
                    >
                      {field.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Body ───────────────────────────────────────── */}
          {selectedSolicitud && (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="px-6 py-4 space-y-4">

                {/* Alerta excede presupuesto */}
                {selectedSolicitud.excedePresupuesto && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-sm font-medium text-red-700">
                      Esta solicitud excede el presupuesto disponible del área
                    </p>
                  </div>
                )}

                {/* ── Tabla de materiales ─────────────────── */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Materiales solicitados
                    </p>
                    {!cargandoDetalle && detalleSolicitud.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        {detalleSolicitud.length} {detalleSolicitud.length === 1 ? 'línea' : 'líneas'}
                      </span>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    {cargandoDetalle ? (
                      /* Skeleton loading */
                      <div className="divide-y divide-slate-100">
                        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 bg-slate-50 px-4 py-2.5">
                          {['#', 'Descripción', 'Cant.', 'Precio', 'Total', 'Stock'].map((h) => (
                            <div key={h} className="h-3 w-12 rounded-full bg-slate-200" />
                          ))}
                        </div>
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 animate-pulse">
                            <div className="h-5 w-5 rounded bg-slate-100" />
                            <div className="space-y-1.5">
                              <div className="h-3 w-3/4 rounded-full bg-slate-100" />
                              <div className="h-2.5 w-1/2 rounded-full bg-slate-100" />
                            </div>
                            <div className="h-3 w-10 rounded-full bg-slate-100" />
                            <div className="h-3 w-14 rounded-full bg-slate-100" />
                            <div className="h-3 w-14 rounded-full bg-slate-100" />
                            <div className="h-5 w-20 rounded-full bg-slate-100" />
                          </div>
                        ))}
                      </div>
                    ) : detalleSolicitud.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-600">Sin materiales registrados</p>
                        <p className="mt-0.5 text-xs text-slate-400">No se encontraron líneas de detalle para esta solicitud</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400 w-8">#</th>
                            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">Artículo / Descripción</th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Cant.</th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Precio</th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</th>
                            <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {detalleSolicitud.map((item, index) => {
                            const stockStatus = getStockStatus(item);
                            const lineTotal = getMaterialTotal(item);
                            return (
                              <tr
                                key={`${item.NumeroArticulo ?? 'item'}-${index}`}
                                className="group transition-colors hover:bg-slate-50/70"
                              >
                                {/* # */}
                                <td className="px-4 py-3 text-center">
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 group-hover:bg-slate-200">
                                    {index + 1}
                                  </span>
                                </td>

                                {/* Artículo + descripción */}
                                <td className="px-3 py-3 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {item.NumeroArticulo && (
                                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500">
                                        {item.NumeroArticulo}
                                      </span>
                                    )}
                                    {item.GrupoArticulos && (
                                      <span className="rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                                        {item.GrupoArticulos}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-sm font-medium text-slate-800 leading-snug">
                                    {item.DescripcionArticulo || 'Sin descripción'}
                                  </p>
                                  {item.ComentarioLinea && (
                                    <p className="mt-0.5 text-xs text-slate-400 italic">{item.ComentarioLinea}</p>
                                  )}
                                </td>

                                {/* Cantidad */}
                                <td className="px-3 py-3 text-right tabular-nums">
                                  <span className="text-sm font-semibold text-slate-800">
                                    {formatQuantity(Number(item.CantidadSolicitada ?? 0))}
                                  </span>
                                  <p className="text-[10px] text-slate-400">{item.UnidadMedidaMaterial || '—'}</p>
                                </td>

                                {/* Precio unitario */}
                                <td className="px-3 py-3 text-right tabular-nums">
                                  <span className="text-sm font-medium text-slate-700">
                                    {formatCurrency(Number(item.UltimoPrecioCompra ?? 0))}
                                  </span>
                                  {item.UltimaFechaCompra && (
                                    <p className="text-[10px] text-slate-400">{formatOptionalDate(item.UltimaFechaCompra)}</p>
                                  )}
                                </td>

                                {/* Total línea */}
                                <td className="px-3 py-3 text-right tabular-nums">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {formatCurrency(lineTotal)}
                                  </span>
                                </td>

                                {/* Stock badge */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stockStatus.className}`}>
                                    {stockStatus.label}
                                  </span>
                                  <p className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                                    {formatQuantity(Number(item.EnStock ?? 0))} uds
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>

                        {/* Footer totalizador */}
                        {detalleSolicitud.length > 1 && (
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                              <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">
                                Total estimado
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-sm font-bold text-slate-900 tabular-nums">
                                  {formatCurrency(detalleSolicitud.reduce((s, i) => s + getMaterialTotal(i), 0))}
                                </span>
                              </td>
                              <td className="px-4 py-2.5" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    )}
                  </div>
                </div>

                {/* Estado de decisión (modo Ver) */}
                {modalAction === 'ver' && resumenDecision && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500">Última decisión</span>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold ${resumenDecision.badgeClassName}`}
                      >
                        {resumenDecision.label}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                      {selectedSolicitud.nombreAprobador && (
                        <span><strong className="text-slate-700">Responsable:</strong> {selectedSolicitud.nombreAprobador}</span>
                      )}
                      {selectedSolicitud.fechaAprobacion && (
                        <span><strong className="text-slate-700">Fecha:</strong> {formatOptionalDate(selectedSolicitud.fechaAprobacion)}</span>
                      )}
                    </div>
                    {selectedSolicitud.comentarioAprobacion?.trim() && (
                      <p className="mt-2 border-t border-slate-200 pt-2 text-xs leading-5 text-slate-600 italic">
                        "{selectedSolicitud.comentarioAprobacion}"
                      </p>
                    )}
                  </div>
                )}

                {/* Comentario (aprobar / rechazar) */}
                {(modalAction === 'rechazar' || modalAction === 'aprobar') && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-500">
                      {modalAction === 'aprobar'
                        ? 'Comentario opcional — queda registrado como trazabilidad.'
                        : 'Motivo del rechazo — obligatorio para continuar.'}
                    </p>
                    <Label htmlFor="modal-comentario" className="sr-only">Comentario</Label>
                    <Textarea
                      id="modal-comentario"
                      placeholder={
                        modalAction === 'rechazar'
                          ? 'Explica el motivo del rechazo...'
                          : 'Comentario opcional...'
                      }
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      rows={modalAction === 'rechazar' ? 3 : 2}
                      className="resize-none rounded-xl border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────── */}
          <div className="border-t border-slate-100 bg-white px-6 py-3.5">
            <div className="flex w-full items-center justify-between gap-3">
              {/* totalizador rápido */}
              <div className="hidden sm:block">
                {!cargandoDetalle && detalleSolicitud.length > 0 && (
                  <p className="text-xs text-slate-400">
                    <span className="font-semibold text-slate-700">{detalleSolicitud.length}</span> líneas ·{' '}
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(detalleSolicitud.reduce((s, i) => s + getMaterialTotal(i), 0))}
                    </span>{' '}
                    estimado
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setModalAction(null);
                    setSelectedSolicitud(null);
                    setComentario('');
                    setDetalleSolicitud([]);
                  }}
                  style={{
                    height: '36px',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 16px',
                    transition: 'all 0.15s',
                    background: '#dc2626',
                    color: '#ffffff',
                    boxShadow: '0 1px 8px rgba(220,38,38,0.3)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#b91c1c'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; }}
                >
                  {modalAction === 'ver' ? 'Cerrar' : 'Cancelar'}
                </button>

                {modalAction !== 'ver' && (
                  <button
                    type="button"
                    onClick={handleConfirmarAccion}
                    disabled={procesandoAccion}
                    style={{
                      height: '36px',
                      minWidth: '160px',
                      borderRadius: '12px',
                      border: 'none',
                      cursor: procesandoAccion ? 'not-allowed' : 'pointer',
                      opacity: procesandoAccion ? 0.7 : 1,
                      fontSize: '14px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '0 16px',
                      transition: 'all 0.15s',
                      background: modalAction === 'aprobar' ? '#16a34a' : '#dc2626',
                      color: '#ffffff',
                      boxShadow: modalAction === 'aprobar'
                        ? '0 1px 8px rgba(22,163,74,0.35)'
                        : '0 1px 8px rgba(220,38,38,0.35)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        modalAction === 'aprobar' ? '#15803d' : '#b91c1c';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        modalAction === 'aprobar' ? '#16a34a' : '#dc2626';
                    }}
                  >
                    {modalAction === 'aprobar' ? (
                      <>
                        <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                        {procesandoAccion ? 'Procesando...' : 'Confirmar aprobación'}
                      </>
                    ) : (
                      <>
                        <XCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                        {procesandoAccion ? 'Procesando...' : 'Confirmar rechazo'}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

        </DialogContent>
      </Dialog>

    </div>
  );
}
