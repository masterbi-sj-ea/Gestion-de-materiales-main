import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
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
import { Plus, Calendar, FileText, Edit, Trash2, AlertTriangle } from 'lucide-react';
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
}

export default function CortesPage() {
  const [cortes, setCortes] = useState<CorteStock[]>([]);
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
  const [total, setTotal] = useState(0);
  const { token } = useAuth();

  const cargarCortes = async () => {
    if (!token) return;

    try {
      const resp = await fetch(`${API_BASE_URL}/cortes`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: CorteStock[] = (data as any[]).map((c) => ({
        id: c.IdCorte as number,
        fechaCorte: c.FechaCorte as string,
        descripcion: (c.Descripcion as string) ?? null,
        fechaInicio: (c.FechaInicio as string) ?? c.FechaCorte,
        fechaFin: (c.FechaFin as string) ?? null,
        ambito: (c.Ambito as string) ?? 'STOCK',
        esMaximo: !!c.EsMaximo,
      }));
      setCortes(mapped);
      setTotal(mapped.length);
      setPage(1);
    } catch (error) {
      console.error('Error al cargar cortes de stock', error);
    }
  };

  useEffect(() => {
    cargarCortes();
  }, [token]);

  const handleGuardarCorte = async () => {
    if (!token) return;

    if (!descripcion.trim()) {
      setDescripcionError('La descripción del corte es obligatoria para poder identificarlo después.');
      return;
    }

    setDescripcionError(null);

    try {
      const isEdit = !!editingCorte;
      const url = isEdit
        ? `${API_BASE_URL}/cortes/${editingCorte!.id}`
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
          // Enviamos fechas como 'yyyy-MM-dd' para evitar problemas de zona horaria
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null,
          ambito,
          esMaximo,
        }),
      });

      if (!resp.ok) {
        console.error('Error HTTP al crear corte', await resp.text());
        return;
      }

      setDialogOpen(false);
      setEditingCorte(null);
      setDescripcion('');
      setFechaInicio('');
      setFechaFin('');
      setAmbito('STOCK');
      setEsMaximo(true);
      await cargarCortes();
    } catch (error) {
      console.error('Error al crear corte de stock', error);
    }
  };

  const cortesPagina = cortes.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const abrirNuevoCorte = () => {
    setEditingCorte(null);
    setDescripcion('');
    setDescripcionError(null);
    setFechaInicio('');
    setFechaFin('');
    setAmbito('STOCK');
    setEsMaximo(true);
    setDialogOpen(true);
  };

  const abrirEdicionCorte = (corte: CorteStock) => {
    setEditingCorte(corte);
    setDescripcion(corte.descripcion ?? '');
    setDescripcionError(null);
    // Formato yyyy-MM-dd para inputs type="date"
    const toDateInput = (iso: string | null | undefined) => {
      if (!iso) return '';
      const d = new Date(iso);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    setFechaInicio(toDateInput(corte.fechaInicio));
    setFechaFin(toDateInput(corte.fechaFin ?? null));
    setAmbito(corte.ambito as any);
    setEsMaximo(corte.esMaximo);
    setDialogOpen(true);
  };

  const handleEliminarCorte = async (corte: CorteStock) => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/cortes/${corte.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        console.error('Error HTTP al eliminar corte', await resp.text());
        sileo.error({ title: 'Error al eliminar corte', description: 'No se pudo eliminar el corte de stock.' });
        return;
      }

      await cargarCortes();
      sileo.success({ title: 'Corte eliminado', description: `El corte #${corte.id} fue eliminado correctamente.` });
    } catch (error) {
      console.error('Error al eliminar corte de stock', error);
      sileo.error({ title: 'Error al eliminar corte', description: 'Ocurrió un error inesperado al eliminar el corte.' });
    }
  };

  return (
    <div className="space-y-6 px-2 sm:px-4 md:px-8 max-w-full">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between w-full">
        <div>
          <h1>Cortes de Stock</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de cortes de stock usados para solicitudes, stock y presupuestos
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={abrirNuevoCorte}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Corte de Stock
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-md sm:max-w-lg md:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingCorte ? 'Editar Corte de Stock' : 'Nuevo Corte de Stock'}</DialogTitle>
              <DialogDescription>
                Crea un nuevo corte de stock que se utilizará como referencia para solicitudes y presupuestos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="descripcion-corte">Descripción</Label>
                <Input
                  id="descripcion-corte"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Corte Noviembre 2025, Cierre de mes, etc."
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
                  <Select value={ambito} onValueChange={(value: any) => setAmbito(value)}>
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
              Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
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
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto w-full">
            <Table className="min-w-[700px] w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>ID Corte</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Rango</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cortesPagina.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron cortes de stock
                    </TableCell>
                  </TableRow>
                ) : (
                  cortesPagina.map((corte) => (
                    <TableRow key={corte.id}>
                      <TableCell className="font-mono text-xs">{corte.id}</TableCell>
                      <TableCell>
                        <div>{new Date(corte.fechaCorte).toLocaleDateString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(corte.fechaCorte).toLocaleTimeString()}
                        </div>
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
                        <div className="text-xs">
                          {new Date(corte.fechaInicio).toLocaleDateString()} {'->'}{' '}
                          {corte.fechaFin ? new Date(corte.fechaFin).toLocaleDateString() : 'sin fin'}
                        </div>
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>{corte.descripcion || 'Sin descripción'}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => abrirEdicionCorte(corte)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDelete({ open: true, corte })}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {/* Modal de confirmación de eliminación */}
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
