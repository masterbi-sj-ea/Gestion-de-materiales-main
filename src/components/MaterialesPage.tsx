import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type MouseEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from '../contexts/PermisosContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Search, Plus, Upload, Package, Edit, Trash2, Eye, RefreshCw, Clock3, RotateCcw } from 'lucide-react';
import { API_BASE_URL } from '../services/apiConfig';
import { sileo } from 'sileo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,                        
} from './ui/table';
import './MaterialesPage.css';

interface Material {
  id: number;
  numeroArticulo: string;
  descripcion: string;
  unidadMedida: string;
  grupoArticulos: string | null;
  activo: boolean;
  enStock: number | null;
  ultimaFechaCompra: string | null;
  ultimoPrecioCompra: number | null;

  // Imagen (viene de vw_MaterialesConImagen)
  idImagen?: number | null;
  rutaImagenFinal?: string | null;
  tieneImagen?: boolean | null;
  fuenteImagen?: string | null;
}

type CategoriaOption = {
  value: string;
  label: string;
};

type EstadoMaterialFilter = 'activos' | 'inactivos' | 'todos';

const ALL_CATEGORIES_VALUE = 'todas';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCategoria(value: unknown): string {
  return safeTrim(value).toLowerCase();
}

function buildMaterialSearchIndex(material: Material): string {
  return [
    material.numeroArticulo,
    material.descripcion,
    material.grupoArticulos,
    material.unidadMedida,
    material.activo ? 'activo' : 'inactivo',
  ]
    .map((value) => normalizeSearchValue(value))
    .filter((value) => value.length > 0)
    .join(' ');
}

function formatMaterialDate(value: string | null): string {
  const raw = safeTrim(value);
  if (!raw) return '-';

  const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat('es-NI', { timeZone: 'UTC' }).format(parsed);
}

function formatLastUpdatedLabel(value: Date | null): string {
  if (!value) return 'Sin sincronizar';

  const now = new Date();
  const sameDay = value.toDateString() === now.toDateString();

  if (sameDay) {
    return `Actualizado ${new Intl.DateTimeFormat('es-NI', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)}`;
  }

  return `Actualizado ${new Intl.DateTimeFormat('es-NI', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)}`;
}

async function getImageAspectRatio(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        resolve(null);
        return;
      }

      resolve(image.naturalWidth / image.naturalHeight);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function getImageViewportStyle(aspectRatio: number | null): CSSProperties {
  const safeRatio = aspectRatio && Number.isFinite(aspectRatio)
    ? Math.min(1.65, Math.max(0.72, aspectRatio))
    : 1;

  const profile =
    safeRatio < 0.9 ? 'portrait' :
    safeRatio > 1.15 ? 'landscape' :
    'square';

  const widthMap = {
    portrait: 380,
    square: 470,
    landscape: 620,
  } as const;

  return {
    width: `min(100%, ${widthMap[profile]}px)`,
    aspectRatio: safeRatio,
    maxHeight: '460px',
  };
}

async function readResponseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      return message || fallback;
    }

    const text = (await response.text().catch(() => '')).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

export default function MaterialesPage() {
  const { user, token } = useAuth();
  const { modulos, cargandoPermisos, puedeAcceder, getPermisosModulo } = usePermisos();
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstado, setSelectedEstado] = useState<EstadoMaterialFilter>('activos');
  const [selectedCategoria, setSelectedCategoria] = useState<string>(ALL_CATEGORIES_VALUE);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [modoImportacion, setModoImportacion] = useState<'ACTUALIZAR' | 'REEMPLAZAR'>('ACTUALIZAR');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [formNumeroArticulo, setFormNumeroArticulo] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formUnidadMedida, setFormUnidadMedida] = useState('');
  const [formGrupoArticulos, setFormGrupoArticulos] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    numeroArticulo: string;
    descripcion: string;
    src: string;
    aspectRatio: number | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; material: Material | null }>({ open: false, material: null });

  const materialesModuleCode = useMemo(
    () => modulos.find((modulo) => modulo.path === '/materiales')?.id ?? 'materiales',
    [modulos],
  );
  const canView = !!user && puedeAcceder(user.role, materialesModuleCode);
  const modulePermissions = user ? getPermisosModulo(user.role, materialesModuleCode) : null;
  const canCreate = !!modulePermissions?.puedeCrear;
  const canEdit = !!modulePermissions?.puedeEditar;
  const canDelete = !!modulePermissions?.puedeEliminar;
  const canImport = canCreate;
  const showActions = canView || canEdit || canDelete;

  const categorias: CategoriaOption[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of materiales) {
      const label = safeTrim(m.grupoArticulos);
      if (!label) continue;
      const key = label.toLowerCase();
      if (!map.has(key)) {
        map.set(key, label);
      }
    }

    const options = Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }))
      .map(([value, label]) => ({ value, label }));

    return [{ value: ALL_CATEGORIES_VALUE, label: 'Todas' }, ...options];
  }, [materiales]);

  const normalizedSearchTerm = useMemo(() => normalizeSearchValue(searchTerm), [searchTerm]);
  const searchTokens = useMemo(
    () => normalizedSearchTerm.split(/\s+/).filter((token) => token.length > 0),
    [normalizedSearchTerm],
  );

  const materialesPorEstado = useMemo(() => {
    if (selectedEstado === 'todos') {
      return materiales;
    }

    return materiales.filter((material) => selectedEstado === 'activos' ? material.activo : !material.activo);
  }, [materiales, selectedEstado]);

  const filteredMateriales = useMemo(() => {
    const categoria = selectedCategoria;
    const hasSearch = searchTokens.length > 0;

    return materialesPorEstado.filter((material) => {
      const searchIndex = hasSearch ? buildMaterialSearchIndex(material) : '';
      const matchesSearch = !hasSearch
        ? true
        : searchTokens.every((token) => searchIndex.includes(token));

      const matchesCategoria =
        categoria === ALL_CATEGORIES_VALUE ||
        normalizeCategoria(material.grupoArticulos) === categoria;

      return matchesSearch && matchesCategoria;
    });
  }, [materialesPorEstado, searchTokens, selectedCategoria]);

  const cargarMateriales = async () => {
    if (!token || !canView) return;
    try {
      setLoading(true);
      const resp = await fetch(`${API_BASE_URL}/materiales/con-stock?incluirInactivos=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) {
        console.error('Error al cargar materiales', await resp.text());
        return;
      }
      const data = await resp.json();
      const rows: any[] = Array.isArray(data) ? data : [];
      const mapped: Material[] = rows.map((m) => ({
        id: Number(m?.IdMaterial ?? 0),
        numeroArticulo: String(m?.NumeroArticulo ?? ''),
        descripcion: String(m?.DescripcionArticulo ?? ''),
        unidadMedida: String(m?.UnidadMedida ?? ''),
        grupoArticulos: safeTrim(m?.GrupoArticulos) || null,
        activo: m?.Activo != null ? Boolean(m.Activo) : true,
        enStock: m?.EnStock ?? null,
        ultimaFechaCompra: (m?.UltimaFechaCompra as string) ?? null,
        ultimoPrecioCompra: m?.UltimoPrecioCompra ?? null,

        idImagen: m?.id_imagen != null ? Number(m.id_imagen) : null,
        rutaImagenFinal: safeTrim(m?.RutaImagenFinal) || null,
        tieneImagen: m?.TieneImagen != null ? Boolean(m.TieneImagen) : null,
        fuenteImagen: safeTrim(m?.FuenteImagen) || null,
      }));
      setMateriales(mapped);
      setLastUpdatedAt(new Date());
      setPage(1);
    } catch (error) {
      console.error('Error al cargar materiales', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivar = async (material: Material) => {
    if (!token) {
      sileo.error({ title: 'Atención', description: 'Debes iniciar sesión para reactivar materiales' });
      return;
    }

    if (!canEdit) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para reactivar materiales' });
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/materiales/${material.id}/reactivar`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const message = await readResponseMessage(resp, 'Error al reactivar material');
        sileo.error({ title: 'Error', description: message });
        return;
      }

      const payload = await resp.json().catch(() => null) as { Resultado?: string } | null;

      await cargarMateriales();

      if (payload?.Resultado === 'YA_ACTIVO') {
        sileo.info({
          title: 'Material ya activo',
          description: `${material.numeroArticulo} ya estaba activo en el catálogo.`,
        });
      } else {
        sileo.success({
          title: 'Material reactivado',
          description: `${material.numeroArticulo} volvió a quedar disponible en el catálogo operativo.`,
        });
      }
    } catch (error) {
      console.error('Error al reactivar material', error);
      sileo.error({ title: 'Error', description: 'Error al reactivar material' });
    }
  };

  const handleVerImagen = async (material: Material) => {
    if (!token || !canView) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para ver imágenes de materiales' });
      return;
    }

    if (imagePreview?.src) {
      URL.revokeObjectURL(imagePreview.src);
    }

    setImagePreview({
      numeroArticulo: material.numeroArticulo,
      descripcion: material.descripcion,
      src: '',
      aspectRatio: null,
      loading: true,
      error: null
    });
    setImageDialogOpen(true);

    try {
      const response = await fetch(`${API_BASE_URL}/materiales/imagen-archivo/${encodeURIComponent(material.numeroArticulo)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.status === 204 || response.status === 404) {
        throw new Error('Sin imagen disponible');
      }

      if (!response.ok) {
        throw new Error('No se pudo cargar la imagen');
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Imagen vacía');
      }
      
      const objectUrl = URL.createObjectURL(blob);
      const aspectRatio = await getImageAspectRatio(objectUrl);
      setImagePreview(prev => prev ? { ...prev, src: objectUrl, aspectRatio, loading: false } : null);
    } catch (error: any) {
      setImagePreview(prev => prev ? { ...prev, error: error.message || 'Error al cargar imagen', loading: false } : null);
    }
  };

  useEffect(() => {
    if (!token || cargandoPermisos || !canView) return;
    cargarMateriales();
  }, [token, cargandoPermisos, canView]);

  const handleOpenDialog = (material?: Material) => {
    const isEdit = !!material;
    if (isEdit && !canEdit) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para editar materiales' });
      return;
    }
    if (!isEdit && !canCreate) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para crear materiales' });
      return;
    }

    const mat = material ?? null;
    setEditingMaterial(mat);
    setFormNumeroArticulo(mat?.numeroArticulo ?? '');
    setFormDescripcion(mat?.descripcion ?? '');
    setFormUnidadMedida(mat?.unidadMedida ?? '');
    setFormGrupoArticulos(mat?.grupoArticulos ?? '');
    setDialogOpen(true);
  };

  const handleGuardar = async () => {
    if (!token) {
      sileo.error({ title: 'Error', description: 'Debes iniciar sesión para guardar materiales' });
      return;
    }

    const isEdit = !!editingMaterial;
    if (isEdit && !canEdit) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para editar materiales' });
      return;
    }
    if (!isEdit && !canCreate) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para crear materiales' });
      return;
    }

    if (!formNumeroArticulo || !formDescripcion || !formUnidadMedida) {
      sileo.error({ title: 'Campos requeridos', description: 'Número de artículo, descripción y unidad de medida son obligatorios' });
      return;
    }

    const body = {
      numeroArticulo: formNumeroArticulo,
      descripcionArticulo: formDescripcion,
      unidadMedida: formUnidadMedida,
      grupoArticulos: formGrupoArticulos || null,
    };

    try {
      let resp: Response;
      if (editingMaterial) {
        resp = await fetch(`${API_BASE_URL}/materiales/${editingMaterial.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      } else {
        resp = await fetch(`${API_BASE_URL}/materiales`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        sileo.error({ title: 'Error al guardar', description: text || 'Error al guardar material' });
        return;
      }

      setDialogOpen(false);
      setEditingMaterial(null);
      await cargarMateriales();

      const accion = isEdit ? 'actualizado' : 'creado';
      sileo.success({ title: 'Éxito', description: `Material ${accion} correctamente: ${formNumeroArticulo}` });
    } catch (error) {
      console.error('Error al guardar material', error);
      sileo.error({ title: 'Error', description: 'Error al guardar material' });
    }
  };

  const handleEliminar = async (id: number) => {
    if (!token) {
      sileo.error({ title: 'Atención', description: 'Debes iniciar sesión para desactivar materiales' });
      return;
    }

    if (!canDelete) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para desactivar materiales' });
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/materiales/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        sileo.error({ title: 'Error', description: text || 'Error al desactivar material' });
        return;
      }

      await cargarMateriales();

      sileo.success({
        title: 'Material desactivado',
        description: `El material quedó oculto del catálogo operativo sin borrar su historial (ID ${id})`,
      });
    } catch (error) {
      console.error('Error al desactivar material', error);
      sileo.error({ title: 'Error', description: 'Error al desactivar material' });
    }
  };

  const totalMaterialesActivos = useMemo(
    () => materiales.reduce((acc, material) => acc + (material.activo ? 1 : 0), 0),
    [materiales],
  );
  const totalMaterialesInactivos = Math.max(0, materiales.length - totalMaterialesActivos);
  const totalMaterialesCatalogo = materialesPorEstado.length;
  const totalMaterialesFiltrados = filteredMateriales.length;
  const totalPages = Math.max(1, Math.ceil(totalMaterialesFiltrados / pageSize));
  const totalCategoriasCatalogo = Math.max(0, categorias.length - 1);
  const materialesConStock = useMemo(
    () => materialesPorEstado.reduce((acc, material) => acc + ((material.enStock ?? 0) > 0 ? 1 : 0), 0),
    [materialesPorEstado],
  );

  const pagedMateriales = useMemo(
    () => filteredMateriales.slice((page - 1) * pageSize, page * pageSize),
    [filteredMateriales, page, pageSize],
  );

  const inventoryTotals = useMemo(() => {
    let totalValorUSD = 0;
    let materialesConStockSinPrecio = 0;

    for (const m of materialesPorEstado) {
      const qty = m.enStock ?? 0;
      const price = m.ultimoPrecioCompra;

      if (!qty || price === null || price === undefined) {
        if (qty > 0) {
          materialesConStockSinPrecio++;
        }
        continue;
      }

      totalValorUSD += qty * price;
    }

    return { totalValorUSD, materialesConStockSinPrecio };
  }, [materialesPorEstado]);

  // Resetear a página 1 cuando cambia el filtro de búsqueda/categoría/estado
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedCategoria, selectedEstado]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
  };

  const handleImport = async () => {
    if (!token) {
      sileo.error({ title: 'Atención', description: 'Debes iniciar sesión para importar materiales' });
      return;
    }
    if (!canImport) {
      sileo.error({ title: 'Sin acceso', description: 'No tienes permiso para importar materiales' });
      return;
    }
    if (!importFile) {
      sileo.warning({ title: 'Archivo requerido', description: 'Selecciona un archivo CSV o Excel primero' });
      return;
    }

    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('modo', modoImportacion);

    sileo.info({
      title: "Carga Iniciada",
      description: `Procesando archivo: ${importFile.name} en modo ${modoImportacion.toLowerCase()}. Por favor, espere...`,
      duration: 3000
    });

    try {
      setImportLoading(true);
      const resp = await fetch(`${API_BASE_URL}/materiales/importar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('Error al importar materiales', text);
        sileo.error({ title: 'Error de importación', description: 'Error al importar materiales. Revisa la consola para más detalles.' });
        return;
      }

      const result = await resp.json();
      const stats = result?.stats;
      const idCorte = result?.idCorte;
      const modoResult = result?.modo;
      
      let descriptionStr = `Se han procesado ${stats?.totalProcesados || 0} artículos correctamente.`;
      
      if (modoResult === 'REEMPLAZAR') {
        descriptionStr =
          `Reemplazo total aplicado. Se actualizaron, insertaron o reactivaron los materiales del archivo; ` +
          `los ausentes quedaron inactivos y su stock fue llevado a 0. ${descriptionStr}`;
      } else {
        descriptionStr =
          `Actualización parcial aplicada. Se procesaron únicamente los materiales del archivo; ` +
          `los ausentes no fueron modificados. ${descriptionStr}`;
      }

      if (stats?.snapshotDate) descriptionStr += ` Fecha de inventario: ${stats.snapshotDate}.`;
      if (idCorte) descriptionStr += ` Transacción de stock asociada: #${idCorte}.`;

      sileo.success({
        title: "Carga Completada",
        description: descriptionStr,
        duration: 8000
      });

      setImportFile(null);
      setFileInputKey((k) => k + 1);
      await cargarMateriales();
    } catch (error) {
      console.error('Error al importar materiales', error);
      sileo.error({ title: 'Error inesperado', description: 'Ocurrió un error al intentar importar los materiales.' });
    } finally {
      setImportLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!token || !canView || loading) return;
    await cargarMateriales();
  };

  if (cargandoPermisos) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-500">
          Validando permisos del módulo de materiales...
        </CardContent>
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card className="border-amber-200 bg-amber-50/70">
        <CardContent className="py-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Acceso restringido</h2>
          <p className="mt-2 text-sm text-slate-600">
            No tienes permisos para ver el catálogo de materiales.
          </p>
        </CardContent>
      </Card>
    );
  }

  const imageViewportStyle = getImageViewportStyle(imagePreview?.aspectRatio ?? null);
  const lastUpdatedLabel = formatLastUpdatedLabel(lastUpdatedAt);
  const headerStatusLabel = loading ? 'Sincronizando catálogo' : 'Catálogo operativo';
  const importDisabledReason =
    !canImport
      ? 'Tu rol no tiene permiso para importar materiales. Necesitas permisos de creación en este módulo.'
      : importLoading
        ? 'La importación está en proceso. Espera a que finalice para volver a cargar otro archivo.'
        : !importFile
          ? 'Selecciona primero un archivo CSV o Excel para habilitar la importación.'
          : null;
  const importModeFileHint =
    modoImportacion === 'REEMPLAZAR'
      ? importFile
        ? `${importFile.name} se procesará como catálogo oficial completo`
        : 'Usa este modo cuando el archivo represente el catálogo oficial nuevo'
      : importFile
        ? `${importFile.name} se procesará sin alterar materiales ausentes`
        : 'Usa este modo para cargas parciales o ajustes puntuales';
  const importButtonLabel =
    !canImport
      ? 'Sin permiso'
      : importLoading
        ? 'Importando...'
        : !importFile
          ? 'Selecciona archivo'
          : 'Importar ahora';

  const handleImportFileTriggerClick = (event: MouseEvent<HTMLLabelElement>) => {
    if (!canImport) {
      event.preventDefault();
      sileo.error({
        title: 'Sin acceso',
        description: 'Tu rol no tiene permiso para importar materiales en este módulo.',
      });
      return;
    }

    if (importLoading) {
      event.preventDefault();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="materials-hero">
        <div className="materials-hero__glow materials-hero__glow--blue" />
        <div className="materials-hero__glow materials-hero__glow--mint" />

        <div className="materials-hero__grid">
          <div className="materials-hero__content">
            <div className="materials-hero__eyebrow">
              <div className="materials-hero__eyebrow-icon">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <div className="materials-hero__eyebrow-label">Inventario maestro</div>
                <div className="materials-hero__eyebrow-title">Centro de control del catálogo</div>
              </div>
            </div>

            <div className="materials-hero__copy">
              <h1 className="materials-hero__title">Catálogo de Materiales</h1>
              <p className="materials-hero__description">
                Supervisa, actualiza e importa el inventario maestro desde una consola de trabajo
                unificada, pensada para operación diaria, trazabilidad y velocidad de ejecución.
              </p>
            </div>

            <div className="materials-hero__stats">
              <article className="materials-stat-card">
                <span className="materials-stat-card__label">
                  {selectedEstado === 'todos'
                    ? 'Catálogo total'
                    : selectedEstado === 'inactivos'
                      ? 'Inactivos'
                      : 'Activos'}
                </span>
                <strong className="materials-stat-card__value">
                  {totalMaterialesCatalogo.toLocaleString()}
                </strong>
                <span className="materials-stat-card__meta">
                  Activos {totalMaterialesActivos.toLocaleString()} | Inactivos {totalMaterialesInactivos.toLocaleString()}
                </span>
              </article>
              <article className="materials-stat-card materials-stat-card--large">
                <span className="materials-stat-card__label">Valor Inventario (USD)</span>
                <strong className="materials-stat-card__value">
                  {inventoryTotals.totalValorUSD.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
                <span className="materials-stat-card__meta">Valor principal del catálogo normalizado a USD</span>
              </article>
              <article className="materials-stat-card materials-stat-card--large">
                <span className="materials-stat-card__label">Materiales con stock</span>
                <strong className="materials-stat-card__value">
                  {materialesConStock.toLocaleString()}
                </strong>
                <span className="materials-stat-card__meta">Materiales visibles con existencia mayor a 0</span>
              </article>
              <article className="materials-stat-card materials-stat-card--large">
                <span className="materials-stat-card__label">Sin precio USD</span>
                <strong className="materials-stat-card__value">
                  {inventoryTotals.materialesConStockSinPrecio.toLocaleString()}
                </strong>
                <span className="materials-stat-card__meta">Materiales con stock que aún no tienen precio cargado en USD</span>
              </article>
            </div>
          </div>

          <aside className="materials-command">
            <div className="materials-command__header">
              <div>
                <div className="materials-command__eyebrow">Acciones rápidas</div>
                <div className="materials-command__title">Operación del catálogo</div>
              </div>
              <div className={`materials-command__status ${loading ? 'is-loading' : ''}`}>
                <span className="materials-command__status-dot" />
                <span>{headerStatusLabel}</span>
              </div>
            </div>

            <div className="materials-sync-card">
              <div className="materials-sync-card__icon">
                <Clock3 className="h-4 w-4" />
              </div>
              <div>
                <div className="materials-sync-card__label">Última sincronización</div>
                <div className="materials-sync-card__value">{lastUpdatedLabel}</div>
              </div>
            </div>

            <div className={`materials-command__actions ${canCreate ? 'has-secondary' : ''}`}>
              <Button
                type="button"
                variant="outline"
                onClick={handleRefresh}
                disabled={loading}
                className="materials-command__button materials-command__button--ghost"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Actualizando...' : 'Actualizar catálogo'}</span>
              </Button>

              {canCreate && (
                <Button
                  type="button"
                  onClick={() => handleOpenDialog()}
                  className="materials-command__button materials-command__button--primary"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nuevo material</span>
                </Button>
              )}
            </div>

            <div className="materials-import">
              <input
                key={fileInputKey}
                type="file"
                id="file-upload"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                disabled={!canImport || importLoading}
                className="hidden"
              />

              <div className={`materials-import__config mb-3 ${!canImport ? 'opacity-60' : ''}`}>
                <Select 
                  value={modoImportacion} 
                  onValueChange={(v: any) => {
                    if (!canImport || importLoading) return;
                    setModoImportacion(v);
                  }}
                >
                  <SelectTrigger className="w-full bg-white/50 border-slate-200" disabled={!canImport || importLoading}>
                    <SelectValue placeholder="Modo de importación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTUALIZAR">Modo ACTUALIZAR: carga parcial sin tocar ausentes</SelectItem>
                    <SelectItem value="REEMPLAZAR">Modo REEMPLAZAR: catálogo oficial, desactiva ausentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="materials-import__row">
                <label
                  htmlFor="file-upload"
                  className={`materials-import__trigger ${!canImport || importLoading ? 'is-disabled' : ''}`}
                  title={importFile ? importFile.name : 'Seleccionar archivo CSV o Excel'}
                  onClick={handleImportFileTriggerClick}
                >
                  <div className="materials-import__icon">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div className="materials-import__copy">
                    <div className="materials-import__title">
                      {importFile ? 'Archivo listo para importar' : 'Subir CSV o Excel'}
                    </div>
                    <div className="materials-import__subtitle">
                      {importModeFileHint}
                    </div>
                  </div>
                </label>

                <Button
                  variant="outline"
                  onClick={handleImport}
                  disabled={!canImport || importLoading || !importFile}
                  className="materials-import__button"
                >
                  <Upload className="h-4 w-4" />
                  <span>{importButtonLabel}</span>
                </Button>
              </div>

              <div className={`materials-import__hint ${importDisabledReason ? 'is-muted' : 'is-ready'}`}>
                {importDisabledReason ?? `Listo para importar ${importFile?.name} en modo ${modoImportacion.toLowerCase()}.`}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl sm:max-w-[95vw] md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? 'Editar Material' : 'Agregar Nuevo Material'}</DialogTitle>
            <DialogDescription>
              {editingMaterial
                ? 'Modifica la información del material seleccionado'
                : 'Completa la información del nuevo material'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo">Número de artículo</Label>
                <Input
                  id="codigo"
                  placeholder="Código de material"
                  value={formNumeroArticulo}
                  onChange={(e) => setFormNumeroArticulo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grupo">Grupo de artículos</Label>
                <Input
                  id="grupo"
                  placeholder="Grupo / familia"
                  value={formGrupoArticulos}
                  onChange={(e) => setFormGrupoArticulos(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input
                id="descripcion"
                placeholder="Descripción del material"
                value={formDescripcion}
                onChange={(e) => setFormDescripcion(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unidad">Unidad de medida</Label>
                <Input
                  id="unidad"
                  placeholder="Unidad"
                  value={formUnidadMedida}
                  onChange={(e) => setFormUnidadMedida(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleGuardar}
              disabled={editingMaterial ? !canEdit : !canCreate}
              className="w-full sm:w-auto"
            >
              {editingMaterial ? 'Guardar cambios' : 'Guardar Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">


      {/* Tarjetas KPI removidas — mantenemos el espacio para futuras métricas */}
      </div>

      {/* Filtros y Búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle>Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <div className="min-w-[320px] flex-1">
              <Input
                type="search"
                placeholder="Buscar por código, descripción, grupo o unidad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-11 rounded-xl border-slate-200 bg-white"
              />
            </div>
            <Select value={selectedEstado} onValueChange={(value: string) => setSelectedEstado(value as EstadoMaterialFilter)}>
              <SelectTrigger className="h-11 w-[180px] rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activos">Activos</SelectItem>
                <SelectItem value="inactivos">Inactivos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedCategoria} onValueChange={setSelectedCategoria}>
              <SelectTrigger className="h-11 w-[200px] rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número de artículo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Grupo de artículos</TableHead>
                  <TableHead>Unidad de medida</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Última compra</TableHead>
                  <TableHead className="text-right">Último precio (USD)</TableHead>
                  {showActions && <TableHead className="text-center">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-6">
                      Cargando materiales...
                    </TableCell>
                  </TableRow>
                ) : pagedMateriales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-6">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedMateriales.map((material) => (
                    <TableRow key={material.id} className={!material.activo ? 'bg-slate-50/70 text-slate-600' : undefined}>
                      <TableCell className="font-medium">{material.numeroArticulo}</TableCell>
                      <TableCell>{material.descripcion}</TableCell>
                      <TableCell>
                        {material.grupoArticulos ? (
                          <Badge variant="outline">{material.grupoArticulos}</Badge>
                        ) : (
                          <span className="text-muted-foreground">(Sin grupo)</span>
                        )}
                      </TableCell>
                      <TableCell>{material.unidadMedida}</TableCell>
                      <TableCell>
                        {material.activo ? (
                          <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Activo</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Inactivo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {material.enStock !== null ? material.enStock : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMaterialDate(material.ultimaFechaCompra)}
                      </TableCell>
                      <TableCell className="text-right">
                        {material.ultimoPrecioCompra !== null
                          ? `${material.ultimoPrecioCompra.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} USD`
                          : '-'}
                      </TableCell>
                      {showActions && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canView && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleVerImagen(material)}
                                title="Ver imagen"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenDialog(material)}
                                title="Editar material"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {material.activo ? (
                              canDelete && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                onClick={() => setConfirmDelete({ open: true, material })}
                                title="Desactivar material"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Desactivar</span>
                              </Button>
                              )
                            ) : (
                              canEdit && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                                  onClick={() => handleReactivar(material)}
                                  title="Reactivar material"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  <span className="hidden sm:inline">Reactivar</span>
                                </Button>
                              )
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div>
              Mostrando{' '}
              {totalMaterialesFiltrados === 0
                ? '0 de 0 materiales'
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalMaterialesFiltrados)} de ${totalMaterialesFiltrados} materiales`}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={imageDialogOpen}
        onOpenChange={(open) => {
          setImageDialogOpen(open);
            if (!open) {
              if (imagePreview?.src) {
                URL.revokeObjectURL(imagePreview.src);
              }
              setImagePreview(null);
            }
          }}
        >
          <DialogContent className="w-[92vw] max-w-[880px] overflow-hidden border-slate-200 p-0">
            <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle>Imagen del artículo</DialogTitle>
                <DialogDescription className="max-w-2xl text-sm leading-relaxed">
                  {imagePreview
                    ? `${imagePreview.numeroArticulo} · ${imagePreview.descripcion}`
                    : 'No hay imagen para mostrar'}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="bg-slate-100/80 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex max-h-[72vh] min-h-[240px] items-center justify-center overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-inner sm:min-h-[300px] sm:p-5">
                <div
                  className="mx-auto flex w-full items-center justify-center overflow-hidden rounded-xl bg-slate-50"
                  style={imageViewportStyle}
                >
                  {imagePreview?.loading ? (
                    <span className="px-3 text-center text-slate-500">Cargando imagen...</span>
                  ) : imagePreview?.error ? (
                    <span className="px-3 text-center text-red-500">{imagePreview.error}</span>
                  ) : imagePreview?.src ? (
                    <img
                      src={imagePreview.src}
                      alt={`Imagen ${imagePreview.numeroArticulo}`}
                      className="h-full w-full rounded-lg object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="px-3 text-center text-slate-500">Sin imagen</span>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de confirmación de eliminación (PRO) */}
        <Dialog open={confirmDelete.open} onOpenChange={open => setConfirmDelete(v => ({ ...v, open }))}>
        <DialogContent className="sm:max-w-md w-[90vw] md:w-full rounded-2xl mx-auto border-destructive/20 shadow-lg shadow-destructive/10">
          <DialogHeader className="mb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl pb-2">
              Desactivar material
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              ¿Seguro que deseas desactivar el material <span className="font-semibold text-foreground">{confirmDelete.material?.numeroArticulo}</span>?
              <br /><span className="text-sm mt-2 block text-muted-foreground">El material dejará de mostrarse en el catálogo operativo, pero conservará historial, relaciones y trazabilidad.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-6">
            <Button
              variant="destructive"
              className="w-full sm:w-2/3 rounded-xl h-11 font-bold shadow-md hover:shadow-lg transition-all"
              onClick={async () => {
                if (confirmDelete.material) {
                  await handleEliminar(confirmDelete.material.id);
                  setConfirmDelete({ open: false, material: null });
                }
              }}
            >
              Sí, desactivar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
