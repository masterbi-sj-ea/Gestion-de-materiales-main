import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from '../contexts/PermisosContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  Plus,
  Calendar,
  FileText,
  Edit,
  Trash2,
  AlertTriangle,
  Eye,
  RefreshCw,
  Save,
  Boxes,
} from 'lucide-react';
import { API_BASE_URL } from '../services/apiConfig';
import { sileo } from 'sileo';

interface CorteStock {
  id: number;
  fechaCorte: string;
  descripcion?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  ambito: string;
  esMaximo: boolean;
  estado?: string | null;
}

interface CorteDetalleCabecera {
  idCorte: number;
  fechaCorte: string | null;
  descripcion: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  ambito: string | null;
  esMaximo: boolean;
  estado: string | null;
  fechaAprobacion: string | null;
  fechaAplicacion: string | null;
  observacionRevision: string | null;
  observacionAplicacion: string | null;
  totalLineas: number;
  lineasConDiferencia: number;
  lineasPendientes: number;
}

interface CorteDetalleLinea {
  idDetalleCorte: number;
  idMaterial: number | null;
  numeroArticulo: string | null;
  descripcionArticulo: string | null;
  unidadMedida: string | null;
  stockSistema: number;
  conteoFisico: number | null;
  diferencia: number;
  costoUnitarioReferencia: number;
  valorDiferencia: number;
  estadoLinea: string | null;
  comentarioLinea: string | null;
}

interface CorteDetalleResponse {
  cabecera: CorteDetalleCabecera | null;
  detalle: CorteDetalleLinea[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-NI').format(parsed);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

function normalizeEstadoCorte(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || 'BORRADOR';
}

function getEstadoCorteBadgeProps(value: string | null | undefined) {
  switch (normalizeEstadoCorte(value)) {
    case 'EN_CONTEO':
      return { label: 'En conteo', className: 'border-blue-200 bg-blue-50 text-blue-700' };
    case 'EN_REVISION':
      return { label: 'En revisión', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'APROBADO':
      return { label: 'Aprobado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'APLICADO':
      return { label: 'Aplicado', className: 'border-violet-200 bg-violet-50 text-violet-700' };
    case 'BORRADOR':
    default:
      return { label: 'Borrador', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function getEstadoLineaBadgeProps(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'SIN_DIFERENCIA':
      return { label: 'Sin diferencia', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'APROBADO':
      return { label: 'Aprobado', className: 'border-blue-200 bg-blue-50 text-blue-700' };
    case 'APLICADO':
      return { label: 'Aplicado', className: 'border-violet-200 bg-violet-50 text-violet-700' };
    case 'PENDIENTE':
      return { label: 'Pendiente', className: 'border-slate-200 bg-slate-50 text-slate-700' };
    default:
      return { label: normalized || 'N/D', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function mapCorteRow(row: any): CorteStock {
  return {
    id: Number(row?.IdCorte ?? row?.id ?? 0),
    fechaCorte: String(row?.FechaCorte ?? row?.fechaCorte ?? ''),
    descripcion: (row?.Descripcion ?? row?.descripcion ?? null) as string | null,
    fechaInicio: String(row?.FechaInicio ?? row?.fechaInicio ?? row?.FechaCorte ?? ''),
    fechaFin: (row?.FechaFin ?? row?.fechaFin ?? null) as string | null,
    ambito: String(row?.Ambito ?? row?.ambito ?? 'STOCK'),
    esMaximo: Boolean(row?.EsMaximo ?? row?.esMaximo ?? false),
    estado: (row?.Estado ?? row?.estado ?? null) as string | null,
  };
}

function mapDetalleResponse(payload: any): CorteDetalleResponse {
  const cabecera = payload?.cabecera
    ? {
        idCorte: Number(payload.cabecera.idCorte ?? payload.cabecera.IdCorte ?? 0),
        fechaCorte: (payload.cabecera.fechaCorte ?? payload.cabecera.FechaCorte ?? null) as string | null,
        descripcion: (payload.cabecera.descripcion ?? payload.cabecera.Descripcion ?? null) as string | null,
        fechaInicio: (payload.cabecera.fechaInicio ?? payload.cabecera.FechaInicio ?? null) as string | null,
        fechaFin: (payload.cabecera.fechaFin ?? payload.cabecera.FechaFin ?? null) as string | null,
        ambito: (payload.cabecera.ambito ?? payload.cabecera.Ambito ?? null) as string | null,
        esMaximo: Boolean(payload.cabecera.esMaximo ?? payload.cabecera.EsMaximo ?? false),
        estado: (payload.cabecera.estado ?? payload.cabecera.Estado ?? null) as string | null,
        fechaAprobacion: (payload.cabecera.fechaAprobacion ?? payload.cabecera.FechaAprobacion ?? null) as string | null,
        fechaAplicacion: (payload.cabecera.fechaAplicacion ?? payload.cabecera.FechaAplicacion ?? null) as string | null,
        observacionRevision: (payload.cabecera.observacionRevision ?? payload.cabecera.ObservacionRevision ?? null) as string | null,
        observacionAplicacion: (payload.cabecera.observacionAplicacion ?? payload.cabecera.ObservacionAplicacion ?? null) as string | null,
        totalLineas: Number(payload.cabecera.totalLineas ?? payload.cabecera.TotalLineas ?? 0),
        lineasConDiferencia: Number(payload.cabecera.lineasConDiferencia ?? payload.cabecera.LineasConDiferencia ?? 0),
        lineasPendientes: Number(payload.cabecera.lineasPendientes ?? payload.cabecera.LineasPendientes ?? 0),
      }
    : null;

  const detalle = Array.isArray(payload?.detalle)
    ? payload.detalle.map((row: any) => ({
        idDetalleCorte: Number(row?.idDetalleCorte ?? row?.IdDetalleCorte ?? 0),
        idMaterial: row?.idMaterial == null && row?.IdMaterial == null ? null : Number(row?.idMaterial ?? row?.IdMaterial ?? 0),
        numeroArticulo: (row?.numeroArticulo ?? row?.NumeroArticulo ?? null) as string | null,
        descripcionArticulo: (row?.descripcionArticulo ?? row?.DescripcionArticulo ?? row?.Descripcion ?? null) as string | null,
        unidadMedida: (row?.unidadMedida ?? row?.UnidadMedida ?? null) as string | null,
        stockSistema: Number(row?.stockSistema ?? row?.StockSistema ?? 0),
        conteoFisico: row?.conteoFisico == null && row?.ConteoFisico == null ? null : Number(row?.conteoFisico ?? row?.ConteoFisico ?? 0),
        diferencia: Number(row?.diferencia ?? row?.Diferencia ?? 0),
        costoUnitarioReferencia: Number(row?.costoUnitarioReferencia ?? row?.CostoUnitarioReferencia ?? 0),
        valorDiferencia: Number(row?.valorDiferencia ?? row?.ValorDiferencia ?? 0),
        estadoLinea: (row?.estadoLinea ?? row?.EstadoLinea ?? null) as string | null,
        comentarioLinea: (row?.comentarioLinea ?? row?.ComentarioLinea ?? null) as string | null,
      }))
    : [];

  return { cabecera, detalle };
}

export default function CortesPage() {
  const [cortes, setCortes] = useState<CorteStock[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; corte: CorteStock | null }>({ open: false, corte: null });
  const [editingCorte, setEditingCorte] = useState<CorteStock | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [descripcionError, setDescripcionError] = useState<string | null>(null);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [ambito, setAmbito] = useState<'STOCK' | 'SOLICITUDES' | 'PRESUPUESTO' | 'GENERAL'>('STOCK');
  const [esMaximo, setEsMaximo] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [selectedCorteId, setSelectedCorteId] = useState<number | null>(null);
  const [selectedCorteDetalle, setSelectedCorteDetalle] = useState<CorteDetalleResponse | null>(null);
  const [loadingDetalleId, setLoadingDetalleId] = useState<number | null>(null);
  const [processingSnapshot, setProcessingSnapshot] = useState(false);
  const [savingConteo, setSavingConteo] = useState(false);
  const [conteoDrafts, setConteoDrafts] = useState<Record<number, string>>({});
  const [comentarioDrafts, setComentarioDrafts] = useState<Record<number, string>>({});
  const { token, user } = useAuth();
  const { getPermisosModulo } = usePermisos();

  const permisosModulo = user ? getPermisosModulo(user.role, 'cortes') : null;
  const canView = !!permisosModulo?.puedeVer;
  const canCreate = !!permisosModulo?.puedeCrear;
  const canEdit = !!permisosModulo?.puedeEditar;
  const canDelete = !!permisosModulo?.puedeEliminar;
  const total = cortes.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetFormularioCorte = () => {
    setEditingCorte(null);
    setDescripcion('');
    setDescripcionError(null);
    setFechaInicio('');
    setFechaFin('');
    setAmbito('STOCK');
    setEsMaximo(true);
  };

  const seedConteoState = (detalle: CorteDetalleLinea[]) => {
    const nextConteos: Record<number, string> = {};
    const nextComentarios: Record<number, string> = {};

    detalle.forEach((linea) => {
      nextConteos[linea.idDetalleCorte] = linea.conteoFisico == null ? '' : String(linea.conteoFisico);
      nextComentarios[linea.idDetalleCorte] = linea.comentarioLinea ?? '';
    });

    setConteoDrafts(nextConteos);
    setComentarioDrafts(nextComentarios);
  };

  const cargarCortes = async () => {
    if (!token || !canView) {
      setCortes([]);
      return;
    }

    setLoadingList(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/cortes`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        throw new Error('No se pudo cargar la lista de cortes.');
      }

      const data = await resp.json();
      const mapped = Array.isArray(data) ? data.map(mapCorteRow) : [];
      setCortes(mapped);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(mapped.length / pageSize))));
    } catch (error) {
      console.error('Error al cargar cortes de stock', error);
      sileo.error({ title: 'Error', description: 'No se pudo cargar la lista de cortes.' });
    } finally {
      setLoadingList(false);
    }
  };

  const fetchDetalleCorte = async (idCorte: number): Promise<CorteDetalleResponse> => {
    const resp = await fetch(`${API_BASE_URL}/cortes/${idCorte}/detalle`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new Error(payload?.message || 'No se pudo cargar el detalle del corte.');
    }

    return mapDetalleResponse(payload);
  };

  const recargarDetalleCorte = async (idCorte: number) => {
    const detalle = await fetchDetalleCorte(idCorte);
    setSelectedCorteDetalle(detalle);
    seedConteoState(detalle.detalle);
  };

  useEffect(() => {
    void cargarCortes();
  }, [token, canView]);

  const handleGuardarCorte = async () => {
    if (!token) {
      return;
    }

    if (!editingCorte && !canCreate) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para crear cortes.' });
      return;
    }

    if (editingCorte && !canEdit) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para editar cortes.' });
      return;
    }

    if (!descripcion.trim()) {
      setDescripcionError('La descripción del corte es obligatoria para poder identificarlo después.');
      return;
    }

    setDescripcionError(null);

    try {
      const isEdit = !!editingCorte;
      const url = isEdit
        ? `${API_BASE_URL}/cortes/${editingCorte.id}`
        : `${API_BASE_URL}/cortes`;
      const method = isEdit ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          descripcion: descripcion || null,
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null,
          ambito,
          esMaximo,
        }),
      });

      if (!resp.ok) {
        const errorBody = await resp.json().catch(() => null);
        throw new Error(errorBody?.message || 'No se pudo guardar el corte.');
      }

      setDialogOpen(false);
      resetFormularioCorte();
      await cargarCortes();
      sileo.success({ title: isEdit ? 'Corte actualizado' : 'Corte creado', description: 'La información del corte fue guardada correctamente.' });
    } catch (error) {
      console.error('Error al guardar corte de stock', error);
      sileo.error({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo guardar el corte.' });
    }
  };

  const abrirNuevoCorte = () => {
    if (!canCreate) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para crear cortes.' });
      return;
    }

    resetFormularioCorte();
    setDialogOpen(true);
  };

  const abrirEdicionCorte = (corte: CorteStock) => {
    if (!canEdit) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para editar cortes.' });
      return;
    }

    const toDateInput = (iso: string | null | undefined) => {
      if (!iso) return '';
      const d = new Date(iso);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setEditingCorte(corte);
    setDescripcion(corte.descripcion ?? '');
    setDescripcionError(null);
    setFechaInicio(toDateInput(corte.fechaInicio));
    setFechaFin(toDateInput(corte.fechaFin ?? null));
    setAmbito(corte.ambito as 'STOCK' | 'SOLICITUDES' | 'PRESUPUESTO' | 'GENERAL');
    setEsMaximo(corte.esMaximo);
    setDialogOpen(true);
  };

  const abrirDetalleCorte = async (corte: CorteStock) => {
    if (!token || !canView) {
      return;
    }

    setDetalleOpen(true);
    setSelectedCorteId(corte.id);
    setSelectedCorteDetalle(null);
    setLoadingDetalleId(corte.id);

    try {
      const detalle = await fetchDetalleCorte(corte.id);
      setSelectedCorteDetalle(detalle);
      seedConteoState(detalle.detalle);
    } catch (error) {
      console.error('Error al cargar detalle del corte', error);
      sileo.error({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo cargar el detalle del corte.' });
    } finally {
      setLoadingDetalleId(null);
    }
  };

  const handleEliminarCorte = async (corte: CorteStock) => {
    if (!token || !canDelete) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para eliminar cortes.' });
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/cortes/${corte.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const errorBody = await resp.json().catch(() => null);
        throw new Error(errorBody?.message || 'No se pudo eliminar el corte de stock.');
      }

      await cargarCortes();
      sileo.success({ title: 'Corte eliminado', description: `El corte #${corte.id} fue eliminado correctamente.` });
    } catch (error) {
      console.error('Error al eliminar corte de stock', error);
      sileo.error({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo eliminar el corte.' });
    }
  };

  const handleCargarSnapshot = async () => {
    if (!token || !selectedCorteId) {
      return;
    }

    if (!canCreate) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para cargar snapshot.' });
      return;
    }

    setProcessingSnapshot(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/cortes/${selectedCorteId}/snapshot`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(payload?.message || 'No se pudo cargar el snapshot del corte.');
      }

      await Promise.all([
        cargarCortes(),
        recargarDetalleCorte(selectedCorteId),
      ]);

      sileo.success({
        title: 'Snapshot cargado',
        description: payload?.lineasSnapshot
          ? `Se cargaron ${payload.lineasSnapshot} líneas al corte.`
          : 'El snapshot del corte fue cargado correctamente.',
      });
    } catch (error) {
      console.error('Error al cargar snapshot del corte', error);
      sileo.error({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo cargar el snapshot.' });
    } finally {
      setProcessingSnapshot(false);
    }
  };

  const handleGuardarConteo = async () => {
    if (!token || !selectedCorteId || !selectedCorteDetalle) {
      return;
    }

    if (!canEdit) {
      sileo.error({ title: 'Sin permiso', description: 'No tienes permiso para registrar conteo.' });
      return;
    }

    const detallePayload: Array<{ idDetalleCorte: number; conteoFisico: number; comentarioLinea: string | null }> = [];

    for (const linea of selectedCorteDetalle.detalle) {
      const rawConteo = (conteoDrafts[linea.idDetalleCorte] ?? '').trim();
      if (!rawConteo) {
        continue;
      }

      const conteoFisico = Number(rawConteo);
      if (!Number.isFinite(conteoFisico) || conteoFisico < 0) {
        sileo.error({
          title: 'Conteo inválido',
          description: `La línea ${linea.numeroArticulo || linea.idDetalleCorte} tiene un conteo no válido.`,
        });
        return;
      }

      detallePayload.push({
        idDetalleCorte: linea.idDetalleCorte,
        conteoFisico,
        comentarioLinea: (comentarioDrafts[linea.idDetalleCorte] ?? '').trim() || null,
      });
    }

    if (!detallePayload.length) {
      sileo.error({ title: 'Sin datos', description: 'Debes capturar al menos una línea de conteo.' });
      return;
    }

    setSavingConteo(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/cortes/${selectedCorteId}/conteo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ detalle: detallePayload }),
      });

      const payload = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(payload?.message || 'No se pudo registrar el conteo del corte.');
      }

      await Promise.all([
        cargarCortes(),
        recargarDetalleCorte(selectedCorteId),
      ]);

      sileo.success({
        title: 'Conteo registrado',
        description: payload?.nuevoEstado
          ? `El corte cambió a estado ${String(payload.nuevoEstado).replace(/_/g, ' ').toLowerCase()}.`
          : 'El conteo fue registrado correctamente.',
      });
    } catch (error) {
      console.error('Error al registrar conteo del corte', error);
      sileo.error({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo registrar el conteo.' });
    } finally {
      setSavingConteo(false);
    }
  };

  const cortesPagina = cortes.slice((page - 1) * pageSize, page * pageSize);
  const selectedEstado = normalizeEstadoCorte(selectedCorteDetalle?.cabecera?.estado);
  const selectedEstadoBadge = getEstadoCorteBadgeProps(selectedEstado);
  const puedeCargarSnapshot = canCreate && selectedEstado === 'BORRADOR';
  const puedeRegistrarConteo = canEdit && selectedEstado === 'EN_CONTEO';
  const lineasContadas = selectedCorteDetalle?.detalle.filter((linea) => (conteoDrafts[linea.idDetalleCorte] ?? '').trim().length > 0).length ?? 0;

  if (!canView) {
    return (
      <div className="space-y-6 px-2 sm:px-4 md:px-8 max-w-full">
        <div>
          <h1>Cortes de Stock</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de cortes de stock usados para solicitudes, stock y presupuestos
          </p>
        </div>

        <Card>
          <CardContent className="py-10">
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-semibold text-slate-900">Sin acceso a cortes</h2>
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
    <div className="space-y-6 px-2 sm:px-4 md:px-8 max-w-full">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between w-full">
        <div>
          <h1>Cortes de Stock</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de cortes de stock usados para solicitudes, stock y presupuestos
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              resetFormularioCorte();
            }
          }}
        >
          {canCreate && (
            <DialogTrigger asChild>
              <Button onClick={abrirNuevoCorte}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Corte de Stock
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="w-full max-w-md sm:max-w-lg md:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingCorte ? 'Editar Corte de Stock' : 'Nuevo Corte de Stock'}</DialogTitle>
              <DialogDescription>
                Crea o ajusta un corte base. La operación de snapshot y conteo se realiza desde el detalle del corte.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="descripcion-corte">Descripción</Label>
                <Input
                  id="descripcion-corte"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Corte físico abril, cierre de bodega, etc."
                />
                {descripcionError && (
                  <p className="text-xs text-red-600">{descripcionError}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fecha-inicio">Fecha inicio</Label>
                  <Input
                    id="fecha-inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fecha-fin">Fecha fin (opcional)</Label>
                  <Input
                    id="fecha-fin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="space-y-2">
                  <Label htmlFor="ambito-corte">Ámbito</Label>
                  <Select value={ambito} onValueChange={(value: 'STOCK' | 'SOLICITUDES' | 'PRESUPUESTO' | 'GENERAL') => setAmbito(value)}>
                    <SelectTrigger id="ambito-corte">
                      <SelectValue placeholder="Seleccionar ámbito" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STOCK">Stock</SelectItem>
                      <SelectItem value="SOLICITUDES">Solicitudes</SelectItem>
                      <SelectItem value="PRESUPUESTO">Presupuesto</SelectItem>
                      <SelectItem value="GENERAL">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4 mt-4 md:mt-7">
                  <div className="space-y-0.5">
                    <Label htmlFor="es-maximo">Marcar como vigente/máximo</Label>
                    <p className="text-xs text-muted-foreground">
                      Si está activado, este corte será el vigente para el ámbito seleccionado.
                    </p>
                  </div>
                  <Switch id="es-maximo" checked={esMaximo} onCheckedChange={setEsMaximo} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGuardarCorte}>
                {editingCorte ? 'Guardar Cambios' : 'Crear Corte'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Cortes ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground mb-3 gap-2">
            <div>
              Página {page} de {totalPages}
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto w-full">
            <Table className="min-w-[900px] w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>ID Corte</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Rango</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingList ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Cargando cortes...
                    </TableCell>
                  </TableRow>
                ) : cortesPagina.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron cortes de stock
                    </TableCell>
                  </TableRow>
                ) : (
                  cortesPagina.map((corte) => {
                    const estadoBadge = getEstadoCorteBadgeProps(corte.estado);
                    const isOpening = loadingDetalleId === corte.id;

                    return (
                      <TableRow key={corte.id}>
                        <TableCell className="font-mono text-xs">{corte.id}</TableCell>
                        <TableCell>
                          <div>{formatDate(corte.fechaCorte)}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(corte.fechaCorte)}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100">
                            {corte.ambito}
                          </span>
                          {corte.esMaximo && (
                            <div className="text-[10px] text-green-600 mt-1">Vigente</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={estadoBadge.className}>
                            {estadoBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {formatDate(corte.fechaInicio)} {'->'} {corte.fechaFin ? formatDate(corte.fechaFin) : 'sin fin'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span>{corte.descripcion || 'Sin descripción'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => abrirDetalleCorte(corte)}
                              disabled={loadingDetalleId !== null}
                              title="Abrir detalle operativo"
                            >
                              {isOpening ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            </Button>
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => abrirEdicionCorte(corte)}
                                title="Editar cabecera"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDelete({ open: true, corte })}
                                title="Eliminar corte"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
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
        </CardContent>
      </Card>

      <Dialog
        open={detalleOpen}
        onOpenChange={(open) => {
          setDetalleOpen(open);
          if (!open) {
            setSelectedCorteId(null);
            setSelectedCorteDetalle(null);
            setLoadingDetalleId(null);
            setConteoDrafts({});
            setComentarioDrafts({});
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-slate-700" />
              {selectedCorteDetalle?.cabecera ? `Corte #${selectedCorteDetalle.cabecera.idCorte}` : 'Detalle de corte'}
            </DialogTitle>
            <DialogDescription>
              Flujo mínimo de operación: cargar snapshot y capturar conteo físico.
            </DialogDescription>
          </DialogHeader>

          {loadingDetalleId !== null && !selectedCorteDetalle ? (
            <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Cargando detalle del corte...
            </div>
          ) : selectedCorteDetalle?.cabecera ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Estado</div>
                    <Badge variant="outline" className={`mt-2 ${selectedEstadoBadge.className}`}>
                      {selectedEstadoBadge.label}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Líneas</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{selectedCorteDetalle.cabecera.totalLineas}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Con diferencia</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-700">{selectedCorteDetalle.cabecera.lineasConDiferencia}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Pendientes</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{selectedCorteDetalle.cabecera.lineasPendientes}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Descripción</div>
                      <div className="mt-1 font-medium text-slate-900">{selectedCorteDetalle.cabecera.descripcion || 'Sin descripción'}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Ámbito</div>
                      <div className="mt-1 font-medium text-slate-900">{selectedCorteDetalle.cabecera.ambito || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Fecha corte</div>
                      <div className="mt-1 font-medium text-slate-900">{formatDateTime(selectedCorteDetalle.cabecera.fechaCorte)}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Rango</div>
                      <div className="mt-1 font-medium text-slate-900">
                        {formatDate(selectedCorteDetalle.cabecera.fechaInicio)} {'->'} {selectedCorteDetalle.cabecera.fechaFin ? formatDate(selectedCorteDetalle.cabecera.fechaFin) : 'sin fin'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Fecha aprobación</div>
                      <div className="mt-1 font-medium text-slate-900">{formatDateTime(selectedCorteDetalle.cabecera.fechaAprobacion)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Fecha aplicación</div>
                      <div className="mt-1 font-medium text-slate-900">{formatDateTime(selectedCorteDetalle.cabecera.fechaAplicacion)}</div>
                    </div>
                  </div>
                  {selectedCorteDetalle.cabecera.observacionRevision && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Observación revisión</div>
                      <div className="mt-1 text-sm text-slate-700">{selectedCorteDetalle.cabecera.observacionRevision}</div>
                    </div>
                  )}
                  {selectedCorteDetalle.cabecera.observacionAplicacion && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Observación aplicación</div>
                      <div className="mt-1 text-sm text-slate-700">{selectedCorteDetalle.cabecera.observacionAplicacion}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Detalle por línea</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div>
                      {puedeRegistrarConteo
                        ? `Líneas con conteo capturado en pantalla: ${lineasContadas} de ${selectedCorteDetalle.detalle.length}`
                        : `Líneas del corte: ${selectedCorteDetalle.detalle.length}`}
                    </div>
                    {puedeCargarSnapshot && (
                      <Button onClick={handleCargarSnapshot} disabled={processingSnapshot}>
                        {processingSnapshot ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Cargando snapshot...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Cargar snapshot
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-x-auto">
                    <Table className="min-w-[1200px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">Stock sistema</TableHead>
                          <TableHead className="text-right">Conteo físico</TableHead>
                          <TableHead className="text-right">Diferencia</TableHead>
                          <TableHead className="text-right">Valor diferencia</TableHead>
                          <TableHead>Estado línea</TableHead>
                          <TableHead>Comentario</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedCorteDetalle.detalle.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              Este corte todavía no tiene líneas de snapshot cargadas.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedCorteDetalle.detalle.map((linea) => {
                            const estadoLineaBadge = getEstadoLineaBadgeProps(linea.estadoLinea);

                            return (
                              <TableRow key={linea.idDetalleCorte}>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-medium text-slate-900">{linea.numeroArticulo || `Material #${linea.idMaterial ?? '-'}`}</div>
                                    <div className="text-xs text-muted-foreground">{linea.descripcionArticulo || 'Sin descripción'}</div>
                                    <div className="text-[11px] text-slate-500">{linea.unidadMedida || 'Sin UM'}</div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatNumber(linea.stockSistema)}</TableCell>
                                <TableCell className="text-right">
                                  {puedeRegistrarConteo ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.0001"
                                      value={conteoDrafts[linea.idDetalleCorte] ?? ''}
                                      onChange={(event) => setConteoDrafts((current) => ({
                                        ...current,
                                        [linea.idDetalleCorte]: event.target.value,
                                      }))}
                                      className="w-32 ml-auto text-right"
                                    />
                                  ) : (
                                    <span className="font-medium">{formatNumber(linea.conteoFisico)}</span>
                                  )}
                                </TableCell>
                                <TableCell className={`text-right font-semibold ${linea.diferencia > 0 ? 'text-emerald-700' : linea.diferencia < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                                  {formatNumber(linea.diferencia)}
                                </TableCell>
                                <TableCell className={`text-right font-semibold ${linea.valorDiferencia > 0 ? 'text-emerald-700' : linea.valorDiferencia < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                                  {formatNumber(linea.valorDiferencia)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={estadoLineaBadge.className}>
                                    {estadoLineaBadge.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {puedeRegistrarConteo ? (
                                    <Textarea
                                      value={comentarioDrafts[linea.idDetalleCorte] ?? ''}
                                      onChange={(event) => setComentarioDrafts((current) => ({
                                        ...current,
                                        [linea.idDetalleCorte]: event.target.value,
                                      }))}
                                      className="min-h-20"
                                      placeholder="Observación de conteo"
                                    />
                                  ) : (
                                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{linea.comentarioLinea || '-'}</div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              No se pudo cargar el detalle del corte.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalleOpen(false)}>
              Cerrar
            </Button>
            {puedeRegistrarConteo && (
              <Button onClick={handleGuardarConteo} disabled={savingConteo}>
                {savingConteo ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Guardando conteo...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Registrar conteo
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete.open} onOpenChange={(open) => setConfirmDelete((current) => ({ ...current, open }))}>
        <DialogContent className="sm:max-w-md w-[90vw] md:w-full rounded-2xl mx-auto border-destructive/20 shadow-lg shadow-destructive/10">
          <DialogHeader className="mb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl pb-2">
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              ¿Seguro que deseas eliminar el corte <span className="font-semibold text-foreground">#{confirmDelete.corte?.id}</span>?
              <br /><span className="text-sm mt-2 block text-muted-foreground">Esta acción no se puede deshacer y afectará el histórico.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-6">
            <Button
              variant="destructive"
              className="w-full sm:w-2/3 rounded-xl h-11 font-bold shadow-md hover:shadow-lg transition-all"
              onClick={async () => {
                if (confirmDelete.corte) {
                  await handleEliminarCorte(confirmDelete.corte);
                  setConfirmDelete({ open: false, corte: null });
                }
              }}
            >
              Sí, eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
