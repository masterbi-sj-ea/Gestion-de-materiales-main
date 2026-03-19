import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Search, Plus, Upload, Package, Edit, Trash2, Eye, CheckCircle2 } from 'lucide-react';
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

interface Material {
  id: number;
  numeroArticulo: string;
  descripcion: string;
  unidadMedida: string;
  grupoArticulos: string | null;
  enStock: number | null;
  ultimaFechaCompra: string | null;
  ultimoPrecioCompra: number | null;
  ultimaMonedaCompra: string | null;

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

const ALL_CATEGORIES_VALUE = 'todas';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCategoria(value: unknown): string {
  return safeTrim(value).toLowerCase();
}

export default function MaterialesPage() {
  const { user, token } = useAuth();
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState<string>(ALL_CATEGORIES_VALUE);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
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
    loading: boolean;
    error: string | null;
  } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; material: Material | null }>({ open: false, material: null });

  // Permisos según rol (ajustar según tus roles reales si hace falta)
  const canEdit = !!user; // por ahora, cualquier usuario autenticado
  const canCreate = !!user;

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

  const normalizedSearchTerm = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const filteredMateriales = useMemo(() => {
    const categoria = selectedCategoria;
    const hasSearch = normalizedSearchTerm.length > 0;

    return materiales.filter((material) => {
      const matchesSearch = !hasSearch
        ? true
        : material.numeroArticulo.toLowerCase().includes(normalizedSearchTerm) ||
          material.descripcion.toLowerCase().includes(normalizedSearchTerm);

      const matchesCategoria =
        categoria === ALL_CATEGORIES_VALUE ||
        normalizeCategoria(material.grupoArticulos) === categoria;

      return matchesSearch && matchesCategoria;
    });
  }, [materiales, normalizedSearchTerm, selectedCategoria]);

  const cargarMateriales = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const resp = await fetch(`${API_BASE_URL}/materiales/con-stock`, {
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
        enStock: m?.EnStock ?? null,
        ultimaFechaCompra: (m?.UltimaFechaCompra as string) ?? null,
        ultimoPrecioCompra: m?.UltimoPrecioCompra ?? null,
        ultimaMonedaCompra: safeTrim(m?.UltimaMonedaCompra) || null,

        idImagen: m?.id_imagen != null ? Number(m.id_imagen) : null,
        rutaImagenFinal: safeTrim(m?.RutaImagenFinal) || null,
        tieneImagen: m?.TieneImagen != null ? Boolean(m.TieneImagen) : null,
        fuenteImagen: safeTrim(m?.FuenteImagen) || null,
      }));
      setMateriales(mapped);
      setPage(1);
    } catch (error) {
      console.error('Error al cargar materiales', error);
    } finally {
      setLoading(false);
    }
  };

  const getPublicBaseUrl = () => API_BASE_URL.replace(/\/api\/?$/i, '');

  const resolveImageSrc = (ruta: string): string => {
    const trimmed = ruta.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const base = getPublicBaseUrl();
    const normalized = trimmed.replace(/\\/g, '/');
    const raw = normalized.startsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
    return encodeURI(raw);
  };

  const handleVerImagen = async (material: Material) => {
    setImagePreview({
      numeroArticulo: material.numeroArticulo,
      descripcion: material.descripcion,
      src: '',
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

      if (response.status === 404) {
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
      setImagePreview(prev => prev ? { ...prev, src: objectUrl, loading: false } : null);
    } catch (error: any) {
      setImagePreview(prev => prev ? { ...prev, error: error.message || 'Error al cargar imagen', loading: false } : null);
    }
  };

  useEffect(() => {
    if (!token) return;
    cargarMateriales();
  }, [token]);

  const handleOpenDialog = (material?: Material) => {
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
      const isEdit = !!editingMaterial;
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
      sileo.error({ title: 'Atención', description: 'Debes iniciar sesión para eliminar materiales' });
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
        sileo.error({ title: 'Error', description: text || 'Error al eliminar material' });
        return;
      }

      await cargarMateriales();

      sileo.success({ title: 'Eliminado', description: `Material eliminado correctamente (ID ${id})` });
    } catch (error) {
      console.error('Error al eliminar material', error);
      sileo.error({ title: 'Error', description: 'Error al eliminar material' });
    }
  };

  const totalMaterialesCatalogo = materiales.length;
  const totalMaterialesFiltrados = filteredMateriales.length;
  const totalPages = Math.max(1, Math.ceil(totalMaterialesFiltrados / pageSize));

  const pagedMateriales = useMemo(
    () => filteredMateriales.slice((page - 1) * pageSize, page * pageSize),
    [filteredMateriales, page, pageSize],
  );

  // Cálculo de valores de inventario (sobre todos los materiales cargados)
  const TIPO_CAMBIO_USD_A_CORD = 36.5; // 1 USD = 36.5 C$

  const inventoryTotals = useMemo(() => {
    let totalValorUSD = 0;
    let totalValorCord = 0;
    let materialesConStockSinPrecio = 0;

    for (const m of materiales) {
      const qty = m.enStock ?? 0;
      const price = m.ultimoPrecioCompra;

      if (!qty || price === null || price === undefined) {
        if (qty > 0) {
          materialesConStockSinPrecio++;
        }
        continue;
      }

      const moneda = (m.ultimaMonedaCompra || 'COR').toUpperCase();

      if (moneda.includes('USD')) {
        const valorUsd = qty * price;
        totalValorUSD += valorUsd;
        totalValorCord += valorUsd * TIPO_CAMBIO_USD_A_CORD;
      } else {
        const valorCord = qty * price;
        totalValorCord += valorCord;
        totalValorUSD += valorCord / TIPO_CAMBIO_USD_A_CORD;
      }
    }

    return { totalValorUSD, totalValorCord, materialesConStockSinPrecio };
  }, [materiales]);

  // Resetear a página 1 cuando cambia el filtro de búsqueda/categoría
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedCategoria]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
  };

  const handleImport = async () => {
    if (!token) {
      sileo.error({ title: 'Atención', description: 'Debes iniciar sesión para importar materiales' });
      return;
    }
    if (!importFile) {
      sileo.warning({ title: 'Archivo requerido', description: 'Selecciona un archivo CSV primero' });
      return;
    }

    const formData = new FormData();
    formData.append('file', importFile);

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
      
      let descriptionStr = `Se han procesado ${stats?.totalProcesados || 0} artículos correctamente.`;
      if (stats?.snapshotDate) descriptionStr += ` Fecha de inventario: ${stats.snapshotDate}.`;
      if (idCorte) descriptionStr += ` Corte STOCK: #${idCorte}.`;

      sileo.success({
        title: "Importación Exitosa",
        description: descriptionStr,
        duration: 6000
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Catálogo de Materiales</h1>
          <p className="text-slate-500 text-sm md:text-base">
            Gestión y control de inventario maestro
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* Import Section - Responsive Container */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex-1 sm:flex-none">
            <input
              key={fileInputKey}
              type="file"
              id="file-upload"
              accept=".csv,.xlsx"
              onChange={handleFileChange}
              className="hidden"
            />
            <label 
              htmlFor="file-upload" 
              className="flex-1 sm:w-40 md:w-56 text-[11px] md:text-xs font-medium px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg transition-all truncate text-slate-600 border border-transparent hover:border-slate-100"
            >
              {importFile ? importFile.name : "Subir CSV o Excel"}
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleImport}
              disabled={importLoading || !importFile}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-3 shrink-0"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden xs:inline">{importLoading ? '...' : 'Importar'}</span>
            </Button>
          </div>

          <div className="hidden sm:block h-8 w-px bg-slate-200 mx-1" />

          {/* Create Button - Matching Import size */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                disabled={!canCreate} 
                onClick={() => handleOpenDialog()} 
                className="w-full sm:w-auto bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white shadow-sm h-11 px-6 text-xs font-semibold transition-all active:scale-[0.98] shrink-0 rounded-xl"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <span>Nuevo Material</span>
              </Button>
            </DialogTrigger>
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
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditingMaterial(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button onClick={handleGuardar} disabled={!canCreate} className="w-full sm:w-auto">
                  {editingMaterial ? 'Guardar cambios' : 'Guardar Material'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total materiales */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Materiales</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{totalMaterialesCatalogo}</div>
            <p className="text-xs text-muted-foreground mt-1">Ítems en catálogo</p>
          </CardContent>
        </Card>

        {/* Valor inventario en USD */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Valor Inventario (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {inventoryTotals.totalValorUSD.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USD
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Incluye materiales en USD y C$ convertidos a USD
            </p>
          </CardContent>
        </Card>

        {/* Valor inventario en C$ */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Valor Inventario (C$)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {inventoryTotals.totalValorCord.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              C$
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa {TIPO_CAMBIO_USD_A_CORD} C$ por 1 USD
              {inventoryTotals.materialesConStockSinPrecio > 0
                ? ` · ${inventoryTotals.materialesConStockSinPrecio} materiales con stock sin precio`
                : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y Búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle>Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedCategoria} onValueChange={setSelectedCategoria}>
              <SelectTrigger className="w-full md:w-[200px]">
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
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Última compra</TableHead>
                  <TableHead className="text-right">Último precio</TableHead>
                  {canEdit && <TableHead className="text-center">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 8 : 7} className="text-center text-muted-foreground py-6">
                      Cargando materiales...
                    </TableCell>
                  </TableRow>
                ) : pagedMateriales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 8 : 7} className="text-center text-muted-foreground py-6">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedMateriales.map((material) => (
                    <TableRow key={material.id}>
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
                      <TableCell className="text-right">
                        {material.enStock !== null ? material.enStock : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {material.ultimaFechaCompra
                          ? new Date(material.ultimaFechaCompra).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {material.ultimoPrecioCompra !== null
                          ? `${material.ultimoPrecioCompra.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} ${material.ultimaMonedaCompra || ''}`
                          : '-'}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVerImagen(material)}
                                title="Ver imagen"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(material)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDelete({ open: true, material })}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
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
          <DialogContent className="w-[95vw] max-w-[960px] h-[85vh] max-h-[85vh] p-0 sm:h-auto sm:max-h-[90vh] sm:p-6">
            <DialogHeader>
              <DialogTitle>Imagen del artículo</DialogTitle>
              <DialogDescription>
                {imagePreview
                  ? `${imagePreview.numeroArticulo} · ${imagePreview.descripcion}`
                  : 'No hay imagen para mostrar'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex h-full flex-col sm:block">
              <div className="flex-1 overflow-auto p-4 sm:p-0">
                <div className="flex w-full items-center justify-center min-h-[240px] h-full border rounded-md bg-slate-50">
                  {imagePreview?.loading ? (
                    <span className="px-3 text-center text-slate-500">Cargando imagen...</span>
                  ) : imagePreview?.error ? (
                    <span className="px-3 text-center text-red-500">{imagePreview.error}</span>
                  ) : imagePreview?.src ? (
                    <img
                      src={imagePreview.src}
                      alt={`Imagen ${imagePreview.numeroArticulo}`}
                      className="w-full h-full max-h-[72vh] object-contain"
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
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              ¿Seguro que deseas eliminar el material <span className="font-semibold text-foreground">{confirmDelete.material?.numeroArticulo}</span>?
              <br /><span className="text-sm mt-2 block text-muted-foreground">Esta acción no se puede deshacer y puede afectar históricos vinculados.</span>
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
              Sí, eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}