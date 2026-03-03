import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCatalogosSolicitud } from '../hooks/useCatalogosSolicitud';
import { apiFetch } from '../services/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { FormularioDestino } from './solicitudes/features/FormularioDestino';
import { TablaDetalleSolicitud } from './solicitudes/features/TablaDetalleSolicitud';
import { FormularioAgregarMaterial } from './solicitudes/features/FormularioAgregarMaterial';
import { AlertCircle, Plus, Save, Send, User, CalendarDays, Tag } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { sileo as toast } from 'sileo';

interface ItemSolicitud {
  idMaterial: number;
  grupoArticulos: string | null;
  numeroArticulo: string;
  descripcionArticulo: string;
  unidadMedida: string;
  idArea?: number | null;
  idRecurso?: number | null; // <-- Agregar
  codigoCuenta?: string | null; // <-- Agregar
  areaNombre?: string | null; // <-- Opcional para mostrar en tabla
  cantidad: number;
  stockDisponible: number | null;
  costoUnitario: number;
  subtotal: number;
}

export default function CrearSolicitudPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [items, setItems] = useState<ItemSolicitud[]>([]);
  const [selectedGrupo, setSelectedGrupo] = useState<string>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [ot, setOt] = useState('');
  const [fechaSolicitud, setFechaSolicitud] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [idAreaDestino, setIdAreaDestino] = useState<string>('');
  const [idRecurso, setIdRecurso] = useState<string>('');
  
  // Custom Hook: Abstrae la lógica de carga de catálogos y cálculos en cascada
  const { 
    materiales, 
    areas, 
    recursos, 
    codigoCuenta, 
    idCentroCostoCalculado, 
    errorCatalogos
  } = useCatalogosSolicitud(token, idAreaDestino, idRecurso);

  const [loading, setLoading] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const error = errorLocal || errorCatalogos; // Mostraremos cualquier error

  const [editId, setEditId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingCantidad, setEditingCantidad] = useState<string>('');

  const gruposUnicos = Array.from(
    new Set(materiales.map((m: any) => m.grupoArticulos).filter((g: any): g is string => !!g)),
  );

  const materialesFiltrados = materiales.filter((m: any) => {
    return (!selectedGrupo || m.grupoArticulos === selectedGrupo);
  });

  const materialSeleccionado = selectedMaterialId
    ? materiales.find((m: any) => String(m.idMaterial) === selectedMaterialId) || null
    : null;

  const stockActualSeleccionado = materialSeleccionado?.enStock ?? null;
  const stockRestante =
    stockActualSeleccionado != null && cantidad
      ? stockActualSeleccionado - Number(cantidad || '0')
      : null;

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Limpiar recurso si cambia el área (opcional pero lo hacía el código original)
  useEffect(() => {
    setIdRecurso('');
  }, [idAreaDestino]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    setEditId(id);
  }, [location.search]);

  useEffect(() => {
    if (!token || !editId) return;

    const cargarSolicitud = async () => {
      try {
        setErrorLocal(null);

        const resp = await apiFetch(`/solicitudes/${editId}`);

        if (!resp.ok) {
          throw new Error('No se pudo cargar la solicitud');
        }

        const data: { cabecera: any; detalle: any[] } = await resp.json();
        const cabecera = data.cabecera || null;
        const detalle = data.detalle || [];

        if (!cabecera) {
          throw new Error('Solicitud no encontrada');
        }

        const estado = String(cabecera.Estado ?? '').toUpperCase();
        if (estado !== 'RECHAZADA' && estado !== 'BORRADOR') {
          toast.error({
            title: 'No se puede editar esta solicitud',
            description: 'Solo se permiten editar solicitudes rechazadas o en borrador.',
          });
          navigate('/solicitudes');
          return;
        }

        const fecha = cabecera.FechaSolicitud
          ? new Date(String(cabecera.FechaSolicitud)).toISOString().slice(0, 10)
          : fechaSolicitud;

        setFechaSolicitud(fecha);
        setObservaciones(cabecera.Comentario ?? '');
        setIdAreaDestino(cabecera.IdArea ? String(cabecera.IdArea) : '');
        setIdRecurso('');

        const mappedItems: ItemSolicitud[] = detalle.map((d: any) => {
          const cantidad = Number(d.CantidadSolicitada ?? 0);
          const costoUnitario = Number(d.UltimoPrecioCompra ?? 0);
          return {
            idMaterial: Number(d.IdMaterial),
            grupoArticulos: d.GrupoArticulos ?? null,
            numeroArticulo: d.NumeroArticulo ?? '',
            descripcionArticulo: d.DescripcionArticulo ?? '',
            unidadMedida: d.UnidadMedidaDetalle ?? d.UnidadMedidaMaterial ?? '',
            idArea: d.IdArea != null ? Number(d.IdArea) : d.IdAreaDestino != null ? Number(d.IdAreaDestino) : null,
            cantidad,
            stockDisponible: d.EnStock ?? null,
            costoUnitario,
            subtotal: cantidad * costoUnitario,
          };
        });

        setItems(mappedItems);
      } catch (e: any) {
        console.error('Error al cargar solicitud para edición', e);
        setErrorLocal(e?.message || 'Error al cargar la solicitud');
      }
    };

    cargarSolicitud();
  }, [editId, token, navigate, fechaSolicitud]);

  const handleAgregarItem = () => {
    if (!selectedMaterialId || !cantidad || Number(cantidad) <= 0) return;

    const material = materiales.find((m) => String(m.idMaterial) === selectedMaterialId);
    if (!material) return;

    const cantidadNumber = Number(cantidad);
    if (material.enStock != null && cantidadNumber > material.enStock) {
      toast.warning({
        title: 'La cantidad solicitada excede el stock disponible',
        description: 'Ajusta la cantidad según el stock actual.',
      });
      return;
    }

    const costoUnitario = material.ultimoPrecioCompra ?? 0;
    const areaNombreActual = idAreaDestino ? areas.find((a: any) => String(a.id) === idAreaDestino)?.nombre : null;

    const nuevoItem: ItemSolicitud = {
      idMaterial: material.idMaterial,
      grupoArticulos: material.grupoArticulos,
      numeroArticulo: material.numeroArticulo,
      descripcionArticulo: material.descripcionArticulo,
      unidadMedida: material.unidadMedida,
      idArea: idAreaDestino ? Number(idAreaDestino) : null,
      idRecurso: idRecurso ? Number(idRecurso) : null,
      codigoCuenta: codigoCuenta || null,
      areaNombre: areaNombreActual,
      cantidad: cantidadNumber,
      stockDisponible: material.enStock,
      costoUnitario,
      subtotal: cantidadNumber * costoUnitario,
    };

    setItems((prev) => [...prev, nuevoItem]);

    // Limpiar campos pero mantener info de material seleccionado visible
  setCantidad('');
  setSelectedMaterialId('');
  };

  const handleEliminarItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditarItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    setEditingIndex(index);
    setEditingCantidad(String(item.cantidad));
  };

  const handleCancelarEdicionItem = () => {
    setEditingIndex(null);
    setEditingCantidad('');
  };

  const handleGuardarEdicionItem = () => {
    if (editingIndex === null) return;
    const nuevaCantidad = Number(editingCantidad);
    if (!editingCantidad || Number.isNaN(nuevaCantidad) || nuevaCantidad <= 0) return;

    const item = items[editingIndex];
    if (item?.stockDisponible != null && nuevaCantidad > item.stockDisponible) {
      toast.warning({
        title: 'La cantidad solicitada excede el stock disponible',
        description: `Stock disponible: ${item.stockDisponible}`,
      });
      return;
    }

    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== editingIndex) return item;
        const subtotal = nuevaCantidad * (item.costoUnitario ?? 0);
        return { ...item, cantidad: nuevaCantidad, subtotal };
      }),
    );

    setEditingIndex(null);
    setEditingCantidad('');
  };

  const handleGuardarBorrador = async () => {
    await handleEnviarSolicitud(true);
  };

  const handleEnviarSolicitud = async (comoBorrador = false) => {
    if (!token) {
      toast.error({
        title: 'No hay sesión activa',
        description: 'Inicia sesión nuevamente para continuar.',
      });
      return;
    }

    if (items.length === 0) {
      toast.info({
        title: 'Agrega materiales a la solicitud',
        description: 'Debes incluir al menos un material antes de enviar.',
      });
      return;
    }

    const areaSeleccionada = idAreaDestino ? areas.find((a: any) => String(a.id) === idAreaDestino) : null;

    setLoading(true);
    setErrorLocal(null);

    try {
      const payload = {
        fechaSolicitud,
        estado: comoBorrador ? 'PENDIENTE' : 'PENDIENTE',
        nuevoEstado: 'PENDIENTE',
        area: null,
        comentario: observaciones || null,
        idCorteStock: null,
        idArea: areaSeleccionada ? areaSeleccionada.id : null,
        idRecurso: idRecurso ? Number(idRecurso) : null,
        idCentroCosto: idCentroCostoCalculado || (areaSeleccionada ? areaSeleccionada.idCentroCosto : null),
        ot: ot || null,
        detalle: items.map((it) => ({
          idMaterial: it.idMaterial,
          cantidadSolicitada: it.cantidad,
          unidadMedida: it.unidadMedida,
          comentarioLinea: null,
          idArea: it.idArea ?? (areaSeleccionada ? areaSeleccionada.id : null),
          idRecurso: it.idRecurso ?? (idRecurso ? Number(idRecurso) : null),
          areaNombre: it.areaNombre || (areaSeleccionada ? areaSeleccionada.nombre : null),
          codigoCuenta: it.codigoCuenta || null, // <-- Ahora sí it.codigoCuenta existe y tiene valor por línea
        })),
      };

      const resp = await apiFetch(
        editId ? `/solicitudes/${editId}` : '/solicitudes',
        {
          method: editId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Error HTTP al crear solicitud');
      }
      const data = await resp.json();

      // Descargar PDF automáticamente (igual que en Despacho) tras la creación
      const idSolicitudFinal = data.IdSolicitud ?? data.idSolicitud ?? null;
      if (idSolicitudFinal && !editId && !comoBorrador) {
        try {
          const pdfResp = await apiFetch(`/solicitudes/${idSolicitudFinal}/pdf`);
          if (pdfResp.ok) {
            const blob = await pdfResp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Solicitud_${idSolicitudFinal}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }
        } catch (pdfErr) {
          console.error('Error al descargar PDF:', pdfErr);
        }
      }

      toast.success({
        title: editId
          ? 'Solicitud actualizada correctamente'
          : comoBorrador
            ? 'Solicitud guardada correctamente'
            : 'Solicitud creada correctamente',
        description: editId
          ? 'La solicitud quedó actualizada y enviada a revisión.'
          : comoBorrador
            ? 'El borrador quedó disponible en el listado de solicitudes.'
            : 'Se registró y quedó en estado pendiente.',
      });
      navigate('/solicitudes');
    } catch (e: any) {
      console.error('Error al crear solicitud', e);
      setErrorLocal(e?.message || 'Error al crear la solicitud');
      toast.error({
        title: 'No se pudo crear la solicitud',
        description: 'Intenta nuevamente o contacta al administrador.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y datos de usuario */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="h-20 w-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400" />
        <CardContent className="pt-0">
          <div className="-mt-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Bloque estilo perfil de usuario */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full border-4 border-white bg-slate-900/80 text-white flex items-center justify-center text-xl font-semibold shadow-md">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.18em] text-slate-400">Solicitante</div>
                <div className="text-lg font-semibold leading-tight text-slate-900">{user?.name}</div>
                <div className="text-xs text-slate-500">{user?.email}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs">
                    {user?.role || 'Sin rol asignado'}
                  </Badge>
                  {idAreaDestino && (() => {
                    const area = areas.find((a: any) => String(a.id) === idAreaDestino);
                    if (!area) return null;
                    return (
                      <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-xs">
                        {area.codigo} · {area.nombre}
                      </Badge>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Chips de contexto: estado, fecha, OT, centro de costo */}
            <div className="flex-1 flex flex-col gap-2 md:items-end">
              <div className="flex flex-wrap gap-2 md:justify-end">
                <div className="flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1 border border-yellow-200">
                  <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="text-xs font-medium text-yellow-800">Pendiente</span>
                </div>
                <div className="rounded-full bg-slate-50 px-3 py-1 border border-slate-200 flex items-center gap-2">
                  <CalendarDays className="w-3 h-3 text-slate-500" />
                  <input
                    type="date"
                    value={fechaSolicitud}
                    onChange={(e) => setFechaSolicitud(e.target.value)}
                    className="border-0 bg-transparent text-xs text-slate-700 focus:outline-none focus:ring-0"
                  />
                </div>
                <div className="rounded-full bg-slate-50 px-3 py-1 border border-slate-200 flex items-center gap-2">
                  <Tag className="w-3 h-3 text-slate-500" />
                  <input
                    placeholder="OT (opcional)"
                    value={ot}
                    onChange={(e) => setOt(e.target.value)}
                    className="border-0 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0 min-w-[90px]"
                  />
                </div>
              </div>
            </div>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Área destino y centro de costo */}
      <FormularioDestino 
        areas={areas}
        recursos={recursos}
        idAreaDestino={idAreaDestino}
        setIdAreaDestino={setIdAreaDestino}
        idRecurso={idRecurso}
        setIdRecurso={setIdRecurso}
        codigoCuenta={codigoCuenta}
      />

      {/* Agregar Materiales */}
      <FormularioAgregarMaterial
        gruposUnicos={gruposUnicos}
        selectedGrupo={selectedGrupo}
        setSelectedGrupo={setSelectedGrupo}
        materialesFiltrados={materialesFiltrados}
        selectedMaterialId={selectedMaterialId}
        setSelectedMaterialId={setSelectedMaterialId}
        cantidad={cantidad}
        setCantidad={setCantidad}
        onAgregarItem={handleAgregarItem}
        materialSeleccionado={materialSeleccionado}
        stockActualSeleccionado={stockActualSeleccionado}
        stockRestante={stockRestante}
      />

      {/* Lista de Items */}
      <TablaDetalleSolicitud
        items={items}
        total={total}
        editingIndex={editingIndex}
        editingCantidad={editingCantidad}
        setEditingCantidad={setEditingCantidad}
        onEditarItem={handleEditarItem}
        onGuardarEdicionItem={handleGuardarEdicionItem}
        onCancelarEdicionItem={handleCancelarEdicionItem}
        onEliminarItem={handleEliminarItem}
      />

      {/* Observaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Observaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Ingresa cualquier observación o comentario adicional..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/solicitudes')}>
          Cancelar
        </Button>
        <Button variant="outline" onClick={handleGuardarBorrador} disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          Guardar Borrador
        </Button>
        <Button onClick={() => handleEnviarSolicitud(false)} disabled={loading}>
          <Send className="w-4 h-4 mr-2" />
          Enviar Solicitud
        </Button>
      </div>
    </div>
  );
}
