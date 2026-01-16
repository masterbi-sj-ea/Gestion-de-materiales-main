import { useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Search, Plus, Upload, Package, Edit, Trash2 } from 'lucide-react';
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
}

export default function MaterialesPage() {
  const { user, token } = useAuth();
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState('todas');
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [formNumeroArticulo, setFormNumeroArticulo] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formUnidadMedida, setFormUnidadMedida] = useState('');
  const [formGrupoArticulos, setFormGrupoArticulos] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  // Permisos según rol (ajustar según tus roles reales si hace falta)
  const canEdit = !!user; // por ahora, cualquier usuario autenticado
  const canCreate = !!user;

  const categorias = ['Todas'];

  const cargarMateriales = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const resp = await fetch('http://localhost:4000/api/materiales/con-stock', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) {
        console.error('Error al cargar materiales', await resp.text());
        return;
      }
      const data = await resp.json();
      const mapped: Material[] = (data as any[]).map((m) => ({
        id: m.IdMaterial as number,
        numeroArticulo: m.NumeroArticulo as string,
        descripcion: m.DescripcionArticulo as string,
        unidadMedida: m.UnidadMedida as string,
        grupoArticulos: (m.GrupoArticulos as string) ?? null,
        enStock: m.EnStock ?? null,
        ultimaFechaCompra: (m.UltimaFechaCompra as string) ?? null,
        ultimoPrecioCompra: m.UltimoPrecioCompra ?? null,
        ultimaMonedaCompra: (m.UltimaMonedaCompra as string) ?? null,
      }));
      setMateriales(mapped);
      setPage(1);
    } catch (error) {
      console.error('Error al cargar materiales', error);
    } finally {
      setLoading(false);
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
      window.alert('Debes iniciar sesión para guardar materiales');
      return;
    }

    if (!formNumeroArticulo || !formDescripcion || !formUnidadMedida) {
      window.alert('Número de artículo, descripción y unidad de medida son obligatorios');
      return;
    }

    const body = {
      numeroArticulo: formNumeroArticulo,
      descripcionArticulo: formDescripcion,
      unidadMedida: formUnidadMedida,
      grupoArticulos: formGrupoArticulos || null,
    };

    try {
      if (editingMaterial) {
        await fetch(`http://localhost:4000/api/materiales/${editingMaterial.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      } else {
        await fetch('http://localhost:4000/api/materiales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      }

      setDialogOpen(false);
      setEditingMaterial(null);
      await cargarMateriales();
    } catch (error) {
      console.error('Error al guardar material', error);
      window.alert('Error al guardar material');
    }
  };

  const handleEliminar = async (id: number) => {
    if (!token) {
      window.alert('Debes iniciar sesión para eliminar materiales');
      return;
    }
    if (!window.confirm('¿Estás seguro de eliminar este material?')) return;

    try {
      await fetch(`http://localhost:4000/api/materiales/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await cargarMateriales();
    } catch (error) {
      console.error('Error al eliminar material', error);
      window.alert('Error al eliminar material');
    }
  };

  const filteredMateriales = materiales.filter((material) => {
    const matchesSearch =
      material.numeroArticulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.descripcion.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategoria = selectedCategoria === 'todas';
    return matchesSearch && matchesCategoria;
  });

  const totalMateriales = filteredMateriales.length;
  const totalPages = Math.max(1, Math.ceil(totalMateriales / pageSize));

  const pagedMateriales = filteredMateriales.slice((page - 1) * pageSize, page * pageSize);

  // Cálculo de valores de inventario (sobre todos los materiales cargados)
  const TIPO_CAMBIO_USD_A_CORD = 36.5; // 1 USD = 36.5 C$

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
      // Precio ya en USD
      const valorUsd = qty * price;
      totalValorUSD += valorUsd;
      totalValorCord += valorUsd * TIPO_CAMBIO_USD_A_CORD;
    } else {
      // Asumimos moneda local (Córdobas)
      const valorCord = qty * price;
      totalValorCord += valorCord;
      totalValorUSD += valorCord / TIPO_CAMBIO_USD_A_CORD;
    }
  }

  // Resetear a página 1 cuando cambia el filtro de búsqueda
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
  };

  const handleImport = async () => {
    if (!token) {
      window.alert('Debes iniciar sesión para importar materiales');
      return;
    }
    if (!importFile) {
      window.alert('Selecciona un archivo CSV primero');
      return;
    }

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      setImportLoading(true);
      const resp = await fetch('http://localhost:4000/api/materiales/importar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('Error al importar materiales', text);
        window.alert('Error al importar materiales. Revisa la consola para más detalles.');
        return;
      }

      const result = await resp.json();
      window.alert(result.message || 'Importación realizada correctamente');
      setImportFile(null);
      await cargarMateriales();
    } catch (error) {
      console.error('Error al importar materiales', error);
      window.alert('Error al importar materiales');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Catálogo de Materiales</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de materiales desde la base de datos
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={handleImport}
              disabled={importLoading || !importFile}
            >
              <Upload className="w-4 h-4 mr-2" />
              {importLoading ? 'Importando...' : 'Importar CSV'}
            </Button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canCreate} onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Material
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingMaterial ? 'Editar Material' : 'Agregar Nuevo Material'}</DialogTitle>
                <DialogDescription>
                  {editingMaterial
                    ? 'Modifica la información del material seleccionado'
                    : 'Completa la información del nuevo material'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unidad">Unidad de medida</Label>
                    <Input
                      id="unidad"
                      placeholder="Unidad"
                      value={formUnidadMedida}
                      onChange={(e) => setFormUnidadMedida(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2"></div>
                  <div className="space-y-2"></div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditingMaterial(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleGuardar} disabled={!canCreate}>
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
            <div className="text-2xl">{totalMateriales}</div>
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
              {totalValorUSD.toLocaleString(undefined, {
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
              {totalValorCord.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              C$
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa {TIPO_CAMBIO_USD_A_CORD} C$ por 1 USD
              {materialesConStockSinPrecio > 0
                ? ` · ${materialesConStockSinPrecio} materiales con stock sin precio`
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
                {categorias.map(cat => (
                  <SelectItem key={cat} value={cat.toLowerCase()}>
                    {cat}
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
                  {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedMateriales.map((material) => (
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
                            onClick={() => handleOpenDialog(material)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEliminar(material.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div>
              Mostrando{' '}
              {totalMateriales === 0
                ? '0 de 0 materiales'
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalMateriales)} de ${totalMateriales} materiales`}
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
    </div>
  );
}