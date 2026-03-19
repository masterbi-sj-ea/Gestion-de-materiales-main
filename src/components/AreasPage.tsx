import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Edit, Trash2, MapPin, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../services/apiConfig';
import { sileo } from 'sileo';

interface Area {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  idCentroCosto?: number | null;
  centroCostoNombre?: string | null;
  codigoCuenta?: string | null;
  nombreCuenta?: string | null;
}

interface CentroCosto {
  id: number;
  codigo: string;
  nombre: string;
}

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [idCentroCosto, setIdCentroCosto] = useState<string>('');
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [nuevoCcCodigo, setNuevoCcCodigo] = useState('');
  const [nuevoCcNombre, setNuevoCcNombre] = useState('');
  const [creandoCentro, setCreandoCentro] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; area: Area | null }>({ open: false, area: null });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const { token } = useAuth();
  const noneCentroCostoValue = '__none__';

  const cargarAreas = async () => {
    if (!token) {
      // Si no hay token (usuario no autenticado), no intentamos llamar al backend protegido
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/areas`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: Area[] = (data as any[]).map((a) => ({
        id: a.IdArea as number,
        codigo: a.Codigo as string,
        nombre: a.Nombre as string,
        descripcion: (a.Descripcion as string) ?? null,
        activo: !!a.Activo,
        idCentroCosto: (a.IdCentroCosto as number) ?? null,
        centroCostoNombre: (a.CentroCostoNombre as string) ?? null,
        codigoCuenta: (a.CodigoCuenta as string) ?? null,
        nombreCuenta: (a.NombreCuenta as string) ?? null,
      }));
      setAreas(mapped);
      setTotal(mapped.length);
    } catch (error) {
      console.error('Error al cargar áreas', error);
    }
  };

  const cargarCentrosCosto = async () => {
    if (!token) return;

     try {
       const resp = await fetch(`${API_BASE_URL}/centros-costo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: CentroCosto[] = (data as any[]).map((c) => ({
        id: c.IdCentroCosto as number,
        codigo: (c.Codigo as string) ?? '',
        nombre: c.Nombre as string,
      }));
      setCentrosCosto(mapped);
    } catch (error) {
      console.error('Error al cargar centros de costo', error);
    }
  };

  useEffect(() => {
    cargarAreas();
    cargarCentrosCosto();
  }, [token]);

  const handleOpenDialog = (area?: Area) => {
    setEditingArea(area || null);
    setCodigo(area?.codigo || '');
    setNombre(area?.nombre || '');
    setDescripcion(area?.descripcion || '');
     setIdCentroCosto(
       area?.idCentroCosto !== undefined && area?.idCentroCosto !== null
         ? String(area.idCentroCosto)
         : '',
     );
    setDialogOpen(true);
  };

  const handleCrearCentroCostoRapido = async () => {
    if (!token) return;
    if (!nuevoCcCodigo.trim() || !nuevoCcNombre.trim()) return;

    try {
      const resp = await fetch(`${API_BASE_URL}/centros-costo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          codigo: nuevoCcCodigo.trim(),
          nombre: nuevoCcNombre.trim(),
          descripcion: null,
          activo: true,
        }),
      });

      if (!resp.ok) {
        console.error('Error HTTP al crear centro de costo', await resp.text());
        return;
      }

      const data = await resp.json();
      const idCreado = data.idCentroCosto as number | undefined;

      await cargarCentrosCosto();

      if (idCreado) {
        setIdCentroCosto(String(idCreado));
      }

      setNuevoCcCodigo('');
      setNuevoCcNombre('');
      setCreandoCentro(false);
    } catch (error) {
      console.error('Error al crear centro de costo rápido', error);
    }
  };

  const handleGuardar = async () => {
    if (!codigo || !nombre) return;

    try {
      if (editingArea) {
        await fetch(`${API_BASE_URL}/areas/${editingArea.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            codigo,
            nombre,
            descripcion,
            activo: editingArea.activo,
            idCentroCosto: idCentroCosto ? Number(idCentroCosto) : null,
          }),
        });
      } else {
        await fetch(`${API_BASE_URL}/areas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            codigo,
            nombre,
            descripcion,
            activo: true,
            idCentroCosto: idCentroCosto ? Number(idCentroCosto) : null,
          }),
        });
      }

      setDialogOpen(false);
      await cargarAreas();
    } catch (error) {
      console.error('Error al guardar área', error);
    }
  };

  const handleEliminar = async (id: number) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/areas/${id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!resp.ok) {
        sileo.error({ title: 'Error al eliminar', description: 'No se pudo eliminar el área.' });
        return;
      }
      await cargarAreas();
      sileo.success({ title: 'Área eliminada', description: 'El área fue eliminada correctamente.' });
    } catch (error) {
      console.error('Error al eliminar área', error);
      sileo.error({ title: 'Error inesperado', description: 'Ocurrió un error al intentar eliminar el área.' });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedAreas = areas.slice(startIndex, endIndex);
  const getCodigoCuentaLabel = (area: Area) => {
    if (!area.codigoCuenta) return '-';
    if (area.nombreCuenta) return `${area.codigoCuenta} - ${area.nombreCuenta}`;
    return area.codigoCuenta;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Gestión de Áreas</h1>
          <p className="text-muted-foreground mt-1">
            Administración de áreas del negocio
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Área
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingArea ? 'Editar Área' : 'Nueva Área'}</DialogTitle>
              <DialogDescription>
                {editingArea ? 'Modifica la información del área' : 'Crea una nueva área del negocio'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="codigo-area">Código</Label>
                <Input
                  id="codigo-area"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="PROD_A, MANTTO, ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombre-area">Nombre</Label>
                <Input
                  id="nombre-area"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Producción A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descripcion-area">Descripción</Label>
                <Input
                  id="descripcion-area"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Descripción del área"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="centro-costo-area">Centro de costo</Label>
                <div className="flex gap-2 items-center">
                  <Select
                    value={idCentroCosto || noneCentroCostoValue}
                    onValueChange={(value: string) =>
                      setIdCentroCosto(value === noneCentroCostoValue ? '' : value)
                    }
                  >
                    <SelectTrigger id="centro-costo-area">
                      <SelectValue placeholder="(Sin centro de costo)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={noneCentroCostoValue}>(Sin centro de costo)</SelectItem>
                      {centrosCosto.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.codigo ? `${c.codigo} - ${c.nombre}` : c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreandoCentro((v) => !v)}
                  >
                    + Nuevo
                  </Button>
                </div>
                {creandoCentro && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input
                      placeholder="Código CC"
                      value={nuevoCcCodigo}
                      onChange={(e) => setNuevoCcCodigo(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nombre CC"
                        value={nuevoCcNombre}
                        onChange={(e) => setNuevoCcNombre(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCrearCentroCostoRapido}
                        disabled={!nuevoCcCodigo.trim() || !nuevoCcNombre.trim()}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGuardar}>
                {editingArea ? 'Guardar Cambios' : 'Crear Área'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Áreas ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
            <div>
              Página {page} de {totalPages}
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Código de cuenta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedAreas.map((area, index) => (
                  <TableRow key={`${area.id}-${startIndex + index}`}>
                    <TableCell>{area.codigo}</TableCell>
                    <TableCell>{area.nombre}</TableCell>
                    <TableCell>{area.descripcion || '-'}</TableCell>
                    <TableCell>{getCodigoCuentaLabel(area)}</TableCell>
                    <TableCell>{area.activo ? 'Activa' : 'Inactiva'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDialog(area)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete({ open: true, area })}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de confirmación de eliminación (PRO) */}
      <Dialog open={confirmDelete.open} onOpenChange={open => setConfirmDelete(v => ({ ...v, open }))}>
        <DialogContent className="sm:max-w-md w-[90vw] md:w-full rounded-2xl mx-auto border-destructive/20 shadow-lg shadow-destructive/10">
          <DialogHeader className="mb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl pb-2">
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              ¿Seguro que deseas eliminar el área <span className="font-semibold text-foreground">{confirmDelete.area?.nombre}</span>?
              <br /><span className="text-sm mt-2 block text-muted-foreground">Esta acción no se puede deshacer.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-6">
            <Button
              variant="destructive"
              className="w-full sm:w-2/3 rounded-xl h-11 font-bold shadow-md hover:shadow-lg transition-all"
              onClick={async () => {
                if (confirmDelete.area) {
                  await handleEliminar(confirmDelete.area.id);
                  setConfirmDelete({ open: false, area: null });
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
