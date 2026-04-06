import { useEffect, useMemo, useState } from 'react';
import { sileo } from 'sileo';
import { Shield, Plus, Users, MapPin, Tags, RefreshCcw, Trash, Edit } from 'lucide-react';
import { apiFetch } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';

interface CoberturaAcceso {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipoAlcance: string;
  activo: boolean;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  fechaCreacion: string | null;
  totalUsuarios: number;
  totalAreas: number;
  totalCatalogos: number;
}

interface CoberturaUsuario {
  idUsuario: number;
  nombreCompleto: string;
  email: string | null;
  activo: boolean;
}

interface CoberturaArea {
  idArea: number;
  codigo: string | null;
  nombre: string;
  activo: boolean;
}

interface CatalogoSolicitud {
  idCatalogoSolicitud: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface CoberturaDetalle {
  cobertura: CoberturaAcceso | null;
  usuarios: CoberturaUsuario[];
  areas: CoberturaArea[];
  catalogos: CatalogoSolicitud[];
}

interface UsuarioOption {
  IdUsuario: number;
  NombreCompleto: string;
  Email: string;
  Activo: boolean;
}

interface AreaOption {
  IdArea: number;
  Codigo: string;
  Nombre: string;
  Activo: boolean;
}

async function readResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value: string | null): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-SV', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function CoberturasAccesoPage() {
  const { token } = useAuth();
  const [coberturas, setCoberturas] = useState<CoberturaAcceso[]>([]);
  const [detalle, setDetalle] = useState<CoberturaDetalle | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoSolicitud[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogosWarning, setCatalogosWarning] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignUserOpen, setAssignUserOpen] = useState(false);
  const [assignAreaOpen, setAssignAreaOpen] = useState(false);
  const [assignCatalogOpen, setAssignCatalogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<{ path: string; id: number } | null>(null);

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoAlcance, setTipoAlcance] = useState<'GLOBAL' | 'RESTRINGIDO'>('RESTRINGIDO');
  const [editNombre, setEditNombre] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editTipoAlcance, setEditTipoAlcance] = useState<'GLOBAL' | 'RESTRINGIDO'>('RESTRINGIDO');
  const [editActivo, setEditActivo] = useState(true);
  const [editVigenteDesde, setEditVigenteDesde] = useState<string | null>(null);
  const [editVigenteHasta, setEditVigenteHasta] = useState<string | null>(null);
  const [idUsuarioAsignar, setIdUsuarioAsignar] = useState('');
  const [idAreaAsignar, setIdAreaAsignar] = useState('');
  const [idCatalogoAsignar, setIdCatalogoAsignar] = useState('');

  const cargarDatosBase = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    setCatalogosWarning(null);

    try {
      const [coberturasResp, usuariosResp, areasResp, catalogosResp] = await Promise.all([
        apiFetch('/coberturas-acceso'),
        apiFetch('/coberturas-acceso/usuarios-disponibles'),
        apiFetch('/coberturas-acceso/areas-disponibles'),
        apiFetch('/coberturas-acceso/catalogos-solicitud'),
      ]);

      if (!coberturasResp.ok) {
        throw new Error(await readResponseError(coberturasResp, 'No se pudieron cargar las coberturas'));
      }

      if (!usuariosResp.ok) {
        throw new Error(await readResponseError(usuariosResp, 'No se pudieron cargar los usuarios'));
      }

      if (!areasResp.ok) {
        throw new Error(await readResponseError(areasResp, 'No se pudieron cargar las áreas'));
      }

      const [coberturasJson, usuariosJson, areasJson] = await Promise.all([
        coberturasResp.json(),
        usuariosResp.json(),
        areasResp.json(),
      ]);

      const catalogosJson = catalogosResp.ok ? await catalogosResp.json() : [];

      if (!catalogosResp.ok) {
        setCatalogosWarning(await readResponseError(catalogosResp, 'No se pudieron cargar los catálogos de solicitud.'));
      }

      const coberturasList = (coberturasJson || []) as CoberturaAcceso[];
      setCoberturas(coberturasList);
      setUsuarios((usuariosJson || []) as UsuarioOption[]);
      setAreas((areasJson || []) as AreaOption[]);
      setCatalogos((catalogosJson || []) as CatalogoSolicitud[]);

      setSelectedId((current) => {
        if (current && coberturasList.some((item) => item.id === current)) {
          return current;
        }

        return coberturasList[0]?.id ?? null;
      });
    } catch (loadError: any) {
      console.error('Error al cargar datos base de coberturas', loadError);
      setError(loadError?.message || 'No se pudieron cargar las coberturas de acceso');
    } finally {
      setLoading(false);
    }
  };

  const cargarDetalle = async (idCobertura: number) => {
    setLoadingDetalle(true);

    try {
      const response = await apiFetch(`/coberturas-acceso/${idCobertura}`);
      if (!response.ok) {
        throw new Error(await readResponseError(response, 'No se pudo cargar el detalle de la cobertura'));
      }

      const payload = await response.json();
      setDetalle(payload as CoberturaDetalle);
    } catch (detailError: any) {
      console.error('Error al cargar detalle de cobertura', detailError);
      setDetalle(null);
      sileo.error({
        title: 'No se pudo cargar el detalle',
        description: detailError?.message || 'Ocurrió un error al cargar la cobertura',
      });
    } finally {
      setLoadingDetalle(false);
    }
  };

  useEffect(() => {
    cargarDatosBase();
  }, [token]);

  useEffect(() => {
    if (selectedId) {
      cargarDetalle(selectedId);
    } else {
      setDetalle(null);
    }
  }, [selectedId]);

  const metricas = useMemo(() => {
    const activas = coberturas.filter((item) => item.activo).length;
    const globales = coberturas.filter((item) => item.tipoAlcance === 'GLOBAL').length;
    const restringidas = coberturas.filter((item) => item.tipoAlcance === 'RESTRINGIDO').length;

    return { activas, globales, restringidas };
  }, [coberturas]);

  const usuariosDisponibles = useMemo(() => {
    const asignados = new Set((detalle?.usuarios || []).map((item) => item.idUsuario));
    return usuarios.filter((item) => item.Activo && !asignados.has(item.IdUsuario));
  }, [detalle, usuarios]);

  const areasDisponibles = useMemo(() => {
    const asignadas = new Set((detalle?.areas || []).map((item) => item.idArea));
    return areas.filter((item) => item.Activo && !asignadas.has(item.IdArea));
  }, [detalle, areas]);

  const catalogosDisponibles = useMemo(() => {
    const asignados = new Set((detalle?.catalogos || []).map((item) => item.idCatalogoSolicitud));
    return catalogos.filter((item) => item.activo && !asignados.has(item.idCatalogoSolicitud));
  }, [detalle, catalogos]);

  const resetCreateForm = () => {
    setNombre('');
    setDescripcion('');
    setTipoAlcance('RESTRINGIDO');
  };

  const handleCrearCobertura = async () => {
    if (!nombre.trim()) {
      sileo.error({ title: 'Nombre requerido', description: 'Debes ingresar un nombre para la cobertura.' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch('/coberturas-acceso', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          tipoAlcance,
          activo: true,
        }),
      });

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'No se pudo crear la cobertura'));
      }

      const payload = await response.json();
      const idCobertura = Number(payload?.idCobertura || 0);

      setCreateOpen(false);
      resetCreateForm();
      await cargarDatosBase();
      if (idCobertura > 0) {
        setSelectedId(idCobertura);
      }

      sileo.success({ title: 'Cobertura creada', description: 'La cobertura fue registrada correctamente.' });
    } catch (submitError: any) {
      console.error('Error al crear cobertura', submitError);
      sileo.error({ title: 'No se pudo crear', description: submitError?.message || 'Ocurrió un error al crear la cobertura.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAsignar = async (path: string, payload: Record<string, number>, onClose: () => void, successTitle: string, successDescription: string) => {
    if (!selectedId) return;

    setSubmitting(true);
    try {
      const response = await apiFetch(`/coberturas-acceso/${selectedId}/${path}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'No se pudo completar la asignación'));
      }

      onClose();
      await cargarDetalle(selectedId);
      // Actualizar conteos locales sin recargar todo el listado
      setCoberturas((prev) => prev.map((c) => {
        if (c.id !== selectedId) return c;
        if (path === 'usuarios') return { ...c, totalUsuarios: Math.max(0, (c.totalUsuarios || 0) + 1) };
        if (path === 'areas') return { ...c, totalAreas: Math.max(0, (c.totalAreas || 0) + 1) };
        if (path === 'catalogos') return { ...c, totalCatalogos: Math.max(0, (c.totalCatalogos || 0) + 1) };
        return c;
      }));
      sileo.success({ title: successTitle, description: successDescription });
    } catch (assignError: any) {
      console.error('Error al asignar en cobertura', assignError);
      sileo.error({ title: 'No se pudo asignar', description: assignError?.message || 'Ocurrió un error al asignar.' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = () => {
    if (!detalle?.cobertura) return;
    setEditNombre(detalle.cobertura.nombre || '');
    setEditDescripcion(detalle.cobertura.descripcion || '');
    setEditTipoAlcance(detalle.cobertura.tipoAlcance === 'GLOBAL' ? 'GLOBAL' : 'RESTRINGIDO');
    setEditActivo(Boolean(detalle.cobertura.activo));
    setEditVigenteDesde(detalle.cobertura.vigenteDesde ? String(detalle.cobertura.vigenteDesde).slice(0,10) : null);
    setEditVigenteHasta(detalle.cobertura.vigenteHasta ? String(detalle.cobertura.vigenteHasta).slice(0,10) : null);
    setEditOpen(true);
  };

  const handleActualizarCobertura = async () => {
    if (!selectedId) return;

    // Validación de rango de fechas: vigenteDesde debe ser <= vigenteHasta
    if (editVigenteDesde && editVigenteHasta) {
      const desde = new Date(editVigenteDesde);
      const hasta = new Date(editVigenteHasta);
      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || desde > hasta) {
        sileo.error({ title: 'Fechas inválidas', description: 'La fecha "Vigente desde" debe ser anterior o igual a "Vigente hasta".' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: any = {
        nombre: editNombre.trim(),
        descripcion: editDescripcion.trim() || null,
        tipoAlcance: editTipoAlcance,
        vigenteDesde: editVigenteDesde || null,
        vigenteHasta: editVigenteHasta || null,
        activo: editActivo,
      };

      const response = await apiFetch(`/coberturas-acceso/${selectedId}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!response.ok) {
        throw new Error(await readResponseError(response, 'No se pudo actualizar la cobertura'));
      }

      setEditOpen(false);
      await cargarDetalle(selectedId);
      await cargarDatosBase();
      sileo.success({ title: 'Cobertura actualizada', description: 'Los cambios se guardaron correctamente.' });
    } catch (err: any) {
      console.error('Error actualizando cobertura', err);
      sileo.error({ title: 'No se pudo actualizar', description: err?.message || 'Ocurrió un error al actualizar la cobertura.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = (path: string, id: number) => {
    if (!selectedId) return;
    setConfirmPayload({ path, id });
    setConfirmOpen(true);
  };

  const performRemove = async () => {
    if (!selectedId || !confirmPayload) return;
    const { path, id } = confirmPayload;
    setConfirmOpen(false);
    setConfirmPayload(null);

    const prevDetalle = detalle;
    const prevCoberturas = coberturas;

    setSubmitting(true);
    try {
      // Optimistic update: actualizar UI local antes del refetch

      if (path === 'catalogos') {
        setDetalle((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            catalogos: prev.catalogos.filter((c) => Number(c.idCatalogoSolicitud ?? (c as any).id ?? 0) !== Number(id)),
          };
        });
        setCoberturas((prev) => prev.map((c) => (c.id === selectedId ? { ...c, totalCatalogos: Math.max(0, c.totalCatalogos - 1) } : c)));
      } else if (path === 'usuarios') {
        setDetalle((prev) => {
          if (!prev) return prev;
          return { ...prev, usuarios: prev.usuarios.filter((u) => Number(u.idUsuario ?? (u as any).IdUsuario ?? 0) !== Number(id)) };
        });
        setCoberturas((prev) => prev.map((c) => (c.id === selectedId ? { ...c, totalUsuarios: Math.max(0, c.totalUsuarios - 1) } : c)));
      } else if (path === 'areas') {
        setDetalle((prev) => {
          if (!prev) return prev;
          return { ...prev, areas: prev.areas.filter((a) => Number(a.idArea ?? (a as any).IdArea ?? 0) !== Number(id)) };
        });
        setCoberturas((prev) => prev.map((c) => (c.id === selectedId ? { ...c, totalAreas: Math.max(0, c.totalAreas - 1) } : c)));
      }

      const response = await apiFetch(`/coberturas-acceso/${selectedId}/${path}/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        // revert optimistic update
        setDetalle(prevDetalle);
        setCoberturas(prevCoberturas);
        throw new Error(await readResponseError(response, 'No se pudo quitar la asignación'));
      }

      // Refetch parcial para asegurar consistencia del detalle
      await cargarDetalle(selectedId);
      sileo.success({ title: 'Asignación removida', description: 'Se quitó la asignación correctamente.' });
    } catch (err: any) {
      console.error('Error al remover asignación', err);
      // Revertir optimistic update ante error de red/excepción
      setDetalle(prevDetalle);
      setCoberturas(prevCoberturas);
      sileo.error({ title: 'No se pudo remover', description: err?.message || 'Ocurrió un error al quitar la asignación.' });
      // Refetch de seguridad
      cargarDetalle(selectedId).catch(() => {});
      cargarDatosBase().catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Coberturas de Acceso</h1>
          <p className="text-muted-foreground mt-1">
            Administra qué usuarios, áreas y catálogos quedan habilitados por cobertura.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargarDatosBase} disabled={loading || submitting}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Recargar
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nueva cobertura
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crear Cobertura de Acceso</DialogTitle>
                <DialogDescription>
                  Define el grupo de acceso y su alcance principal antes de asignar usuarios, áreas y catálogos.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="cobertura-nombre">Nombre</Label>
                  <Input id="cobertura-nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Cobertura Laboratorio y Despacho" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cobertura-descripcion">Descripción</Label>
                  <Textarea id="cobertura-descripcion" value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Describe el alcance operativo de la cobertura" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de alcance</Label>
                  <Select value={tipoAlcance} onValueChange={(value: 'GLOBAL' | 'RESTRINGIDO') => setTipoAlcance(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar alcance" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto w-full">
                      <SelectItem value="RESTRINGIDO">RESTRINGIDO</SelectItem>
                      <SelectItem value="GLOBAL">GLOBAL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }} disabled={submitting}>
                  Cancelar
                </Button>
                <Button onClick={handleCrearCobertura} disabled={submitting}>
                  Crear cobertura
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {catalogosWarning && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-950">
          <AlertDescription>{catalogosWarning}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle>{coberturas.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Activas</CardDescription>
            <CardTitle>{metricas.activas}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Globales</CardDescription>
            <CardTitle>{metricas.globales}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Restringidas</CardDescription>
            <CardTitle>{metricas.restringidas}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Listado de coberturas</CardTitle>
            <CardDescription>Selecciona una cobertura para revisar su detalle y administrar asignaciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Alcance</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Usuarios</TableHead>
                    <TableHead className="text-center">Áreas</TableHead>
                    <TableHead className="text-center">Catálogos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Cargando coberturas...
                      </TableCell>
                    </TableRow>
                  ) : coberturas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No hay coberturas registradas todavía.
                      </TableCell>
                    </TableRow>
                  ) : (
                    coberturas.map((cobertura) => (
                      <TableRow
                        key={cobertura.id}
                        className={selectedId === cobertura.id ? 'bg-muted/50' : 'cursor-pointer'}
                        onClick={() => setSelectedId(cobertura.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{cobertura.nombre}</div>
                          <div className="text-xs text-muted-foreground">{cobertura.descripcion || 'Sin descripción'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cobertura.tipoAlcance === 'GLOBAL' ? 'default' : 'secondary'}>
                            {cobertura.tipoAlcance}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cobertura.activo ? 'default' : 'outline'}>
                            {cobertura.activo ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{cobertura.totalUsuarios}</TableCell>
                        <TableCell className="text-center">{cobertura.totalAreas}</TableCell>
                        <TableCell className="text-center">{cobertura.totalCatalogos}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Detalle de cobertura</CardTitle>
                <CardDescription>Vista operativa de usuarios, áreas y catálogos asignados.</CardDescription>
              </div>
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingDetalle ? (
              <div className="text-sm text-muted-foreground">Cargando detalle...</div>
            ) : !detalle?.cobertura ? (
              <div className="text-sm text-muted-foreground">Selecciona una cobertura para ver su detalle.</div>
            ) : (
              <>
                <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{detalle.cobertura.nombre}</h2>
                    <Badge variant={detalle.cobertura.tipoAlcance === 'GLOBAL' ? 'default' : 'secondary'}>{detalle.cobertura.tipoAlcance}</Badge>
                    <Badge variant={detalle.cobertura.activo ? 'default' : 'outline'}>{detalle.cobertura.activo ? 'Activa' : 'Inactiva'}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{detalle.cobertura.descripcion || 'Sin descripción registrada.'}</p>
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <div>Vigente desde: {formatDate(detalle.cobertura.vigenteDesde)}</div>
                    <div>Vigente hasta: {formatDate(detalle.cobertura.vigenteHasta)}</div>
                  </div>
                  <div className="flex gap-3 mt-2 text-sm">
                    <div className="flex items-center gap-2"><strong>Usuarios:</strong> <span className="text-muted-foreground">{detalle.usuarios.length}</span></div>
                    <div className="flex items-center gap-2"><strong>Áreas:</strong> <span className="text-muted-foreground">{detalle.areas.length}</span></div>
                    <div className="flex items-center gap-2"><strong>Catálogos:</strong> <span className="text-muted-foreground">{detalle.catalogos.length}</span></div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={!selectedId} onClick={openEditDialog}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar cobertura
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Editar Cobertura</DialogTitle>
                        <DialogDescription>Modifica el nombre, alcance, fechas y estado de la cobertura.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>Nombre</Label>
                          <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Descripción</Label>
                          <Textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Tipo de alcance</Label>
                          <Select value={editTipoAlcance} onValueChange={(v: any) => setEditTipoAlcance(v)}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar alcance" /></SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto w-full">
                              <SelectItem value="RESTRINGIDO">RESTRINGIDO</SelectItem>
                              <SelectItem value="GLOBAL">GLOBAL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>Vigente desde</Label>
                            <Input type="date" value={editVigenteDesde ?? ''} onChange={(e) => setEditVigenteDesde(e.target.value || null)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Vigente hasta</Label>
                            <Input type="date" value={editVigenteHasta ?? ''} onChange={(e) => setEditVigenteHasta(e.target.value || null)} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input id="activo-checkbox" type="checkbox" checked={editActivo} onChange={(e) => setEditActivo(e.target.checked)} />
                          <Label htmlFor="activo-checkbox">Activo</Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>Cancelar</Button>
                        <Button onClick={handleActualizarCobertura} disabled={submitting}>Guardar</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmar remoción</DialogTitle>
                        <DialogDescription>¿Confirma que desea quitar esta asignación?</DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmPayload(null); }} disabled={submitting}>Cancelar</Button>
                        <Button onClick={performRemove} disabled={submitting}>Quitar</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={assignUserOpen} onOpenChange={setAssignUserOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={!selectedId}>
                        <Users className="w-4 h-4 mr-2" />
                        Asignar usuario
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Asignar Usuario</DialogTitle>
                        <DialogDescription>Agrega un usuario a la cobertura seleccionada.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2 py-2">
                        <Label>Usuario</Label>
                        <Select value={idUsuarioAsignar} onValueChange={setIdUsuarioAsignar}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar usuario" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto w-full">
                            {usuariosDisponibles.map((usuario) => (
                              <SelectItem key={usuario.IdUsuario} value={String(usuario.IdUsuario)}>
                                {usuario.NombreCompleto}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAssignUserOpen(false)} disabled={submitting}>Cancelar</Button>
                        <Button
                          onClick={() => handleAsignar('usuarios', { idUsuario: Number(idUsuarioAsignar) }, () => { setAssignUserOpen(false); setIdUsuarioAsignar(''); }, 'Usuario asignado', 'El usuario fue agregado a la cobertura.')}
                          disabled={!idUsuarioAsignar || submitting}
                        >
                          Guardar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={assignAreaOpen} onOpenChange={setAssignAreaOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={!selectedId}>
                        <MapPin className="w-4 h-4 mr-2" />
                        Asignar área
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Asignar Área</DialogTitle>
                        <DialogDescription>Agrega un área a la cobertura seleccionada.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2 py-2">
                        <Label>Área</Label>
                        <Select value={idAreaAsignar} onValueChange={setIdAreaAsignar}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar área" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto w-full">
                            {areasDisponibles.map((area) => (
                              <SelectItem key={area.IdArea} value={String(area.IdArea)}>
                                {area.Nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAssignAreaOpen(false)} disabled={submitting}>Cancelar</Button>
                        <Button
                          onClick={() => handleAsignar('areas', { idArea: Number(idAreaAsignar) }, () => { setAssignAreaOpen(false); setIdAreaAsignar(''); }, 'Área asignada', 'El área fue agregada a la cobertura.')}
                          disabled={!idAreaAsignar || submitting}
                        >
                          Guardar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={assignCatalogOpen} onOpenChange={setAssignCatalogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={!selectedId}>
                        <Tags className="w-4 h-4 mr-2" />
                        Asignar catálogo
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Asignar Catálogo</DialogTitle>
                        <DialogDescription>Agrega un catálogo habilitado a la cobertura seleccionada.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2 py-2">
                        <Label>Catálogo</Label>
                        <Select value={idCatalogoAsignar} onValueChange={setIdCatalogoAsignar}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar catálogo" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto w-full">
                            {catalogosDisponibles.map((catalogo) => (
                              <SelectItem key={catalogo.idCatalogoSolicitud} value={String(catalogo.idCatalogoSolicitud)}>
                                {catalogo.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAssignCatalogOpen(false)} disabled={submitting}>Cancelar</Button>
                        <Button
                          onClick={() => handleAsignar('catalogos', { idCatalogoSolicitud: Number(idCatalogoAsignar) }, () => { setAssignCatalogOpen(false); setIdCatalogoAsignar(''); }, 'Catálogo asignado', 'El catálogo fue agregado a la cobertura.')}
                          disabled={!idCatalogoAsignar || submitting}
                        >
                          Guardar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Usuarios</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {detalle.usuarios.length === 0 ? (
                        <div className="text-muted-foreground">Sin usuarios asignados.</div>
                      ) : (
                        detalle.usuarios.map((usuario) => (
                          <div key={usuario.idUsuario} className="rounded-lg border p-3 flex items-start justify-between">
                            <div>
                              <div className="font-medium">{usuario.nombreCompleto}</div>
                              <div className="text-muted-foreground text-xs">{usuario.email || 'Sin correo'}</div>
                            </div>
                            <div className="ml-4">
                              <Button variant="ghost" size="sm" onClick={() => handleRemove('usuarios', usuario.idUsuario)} disabled={submitting}>
                                <Trash className="w-4 h-4 mr-1" /> Quitar
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Áreas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {detalle.areas.length === 0 ? (
                        <div className="text-muted-foreground">Sin áreas asignadas.</div>
                      ) : (
                        detalle.areas.map((area) => (
                          <div key={area.idArea} className="rounded-lg border p-3 flex items-start justify-between">
                            <div>
                              <div className="font-medium">{area.nombre}</div>
                              <div className="text-muted-foreground text-xs">{area.codigo || 'Sin código'}</div>
                            </div>
                            <div className="ml-4">
                              <Button variant="ghost" size="sm" onClick={() => handleRemove('areas', area.idArea)} disabled={submitting}>
                                <Trash className="w-4 h-4 mr-1" /> Quitar
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Catálogos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {detalle.catalogos.length === 0 ? (
                        <div className="text-muted-foreground">Sin catálogos asignados.</div>
                      ) : (
                        detalle.catalogos.map((catalogo) => (
                          <div key={catalogo.idCatalogoSolicitud} className="rounded-lg border p-3 flex items-start justify-between">
                            <div>
                              <div className="font-medium">{catalogo.nombre}</div>
                              <div className="text-muted-foreground text-xs">{catalogo.descripcion || catalogo.codigo || 'Sin descripción'}</div>
                            </div>
                            <div className="ml-4">
                              <Button variant="ghost" size="sm" onClick={() => handleRemove('catalogos', catalogo.idCatalogoSolicitud)} disabled={submitting}>
                                <Trash className="w-4 h-4 mr-1" /> Quitar
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}