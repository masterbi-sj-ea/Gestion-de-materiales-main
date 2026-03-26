import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCatalogosSolicitud } from '../hooks/useCatalogosSolicitud';
import { apiFetch } from '../services/apiClient';

// Componentes UI
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';

// Subcomponentes del formulario
import { FormularioDestino } from './solicitudes/features/FormularioDestino';
import { TablaDetalleSolicitud } from './solicitudes/features/TablaDetalleSolicitud';
import { FormularioAgregarMaterial } from './solicitudes/features/FormularioAgregarMaterial';

// Iconos y Utilidades
import { AlertCircle, Send, CalendarDays, Tag, Clock } from 'lucide-react';
import { sileo as toast } from 'sileo';

/**
 * Obtiene la URL de la imagen del material desde el backend de forma segura.
 */
async function obtenerBlobUrlImagenMaterial(numeroArticulo: string): Promise<string | null> {
  if (!numeroArticulo) return null;
  
  try {
    const response = await apiFetch(`/materiales/imagen-archivo/${encodeURIComponent(numeroArticulo)}`);
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    return blob && blob.size > 0 ? URL.createObjectURL(blob) : null;
  } catch (error) {
    console.error('Error al cargar imagen:', error);
    return null; // Resolvemos silenciosamente para no interrumpir el flujo principal
  }
}

export interface ItemSolicitud {
  idMaterial: number;
  grupoArticulos: string | null;
  numeroArticulo: string;
  descripcionArticulo: string;
  unidadMedida: string;
  idArea?: number | null;
  idRecurso?: number | null;
  codigoCuenta?: string | null;
  areaNombre?: string | null;
  cantidad: number;
  stockDisponible: number | null;
  costoUnitario: number;
  subtotal: number;
  tieneImagen?: boolean | number | null;
  rutaImagenFinal?: string | null;
}

export default function CrearSolicitudPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // -- Estados Globales de la Solicitud --
  const [items, setItems] = useState<ItemSolicitud[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [ot, setOt] = useState('');
  const [fechaSolicitud, setFechaSolicitud] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // -- Estados de Cabecera (Destino) --
  const [idAreaDestino, setIdAreaDestino] = useState<string>('');
  const [idRecurso, setIdRecurso] = useState<string>('');

  // -- Estados de Interfaz de Búsqueda --
  const [selectedGrupo, setSelectedGrupo] = useState<string>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [cantidad, setCantidad] = useState('');
  
  // -- Estados Visuales de Material --
  const [imagenMaterialUrl, setImagenMaterialUrl] = useState<string | null>(null);
  const [imagenMaterialLoading, setImagenMaterialLoading] = useState(false);
  const [imagenMaterialError, setImagenMaterialError] = useState<string | null>(null);
  
  // -- Estados de Edición de Tabla --
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingCantidad, setEditingCantidad] = useState<string>('');

  // -- Estados de Modos (Edición / Clonación) --
  const [editId, setEditId] = useState<string | null>(null);
  const [cloneId, setCloneId] = useState<string | null>(null);

  // -- Hook Personalizado: Catálogos --
  const { 
    materiales, 
    areas, 
    recursos, 
    codigoCuenta, 
    idCentroCostoCalculado, 
    errorCatalogos
  } = useCatalogosSolicitud(token, idAreaDestino, idRecurso);

  // -- Estados del Servidor --
  const [loading, setLoading] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const error = errorLocal || errorCatalogos;

  // -- Datos Derivados Memorizados --
  const gruposUnicos = useMemo(() => Array.from(
    new Set(materiales.map((m: any) => m.grupoArticulos).filter(Boolean))
  ), [materiales]);

  const materialesFiltrados = useMemo(() => materiales.filter((m: any) => {
    return !selectedGrupo || m.grupoArticulos === selectedGrupo;
  }), [materiales, selectedGrupo]);

  const materialSeleccionado = useMemo(() => 
    selectedMaterialId ? materiales.find((m: any) => String(m.idMaterial) === selectedMaterialId) || null : null
  , [selectedMaterialId, materiales]);

  const stockActualSeleccionado = materialSeleccionado?.enStock ?? null;
  const stockRestante = (stockActualSeleccionado != null && cantidad)
    ? stockActualSeleccionado - Number(cantidad || '0')
    : null;

  const total = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);

  // -- Efecto: Inicializar lectura de parámetros URL --
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setEditId(params.get('id'));
    setCloneId(params.get('clone'));
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function cargarImagen() {
      if (!materialSeleccionado?.numeroArticulo) {
        setImagenMaterialLoading(false);
        setImagenMaterialError(null);
        setImagenMaterialUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }

      const tieneImagenRegistrada = Boolean(
        materialSeleccionado.tieneImagen || materialSeleccionado.rutaImagenFinal
      );

      setImagenMaterialLoading(true);
      setImagenMaterialError(null);

      try {
        const url = await obtenerBlobUrlImagenMaterial(materialSeleccionado.numeroArticulo);
        objectUrl = url;

        if (cancelled) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }

        if (!objectUrl) {
          setImagenMaterialUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setImagenMaterialError(
            tieneImagenRegistrada
              ? 'La imagen está registrada, pero el archivo no está disponible en el servidor.'
              : null
          );
          return;
        }

        setImagenMaterialUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      } catch (error: any) {
        if (cancelled) return;

        setImagenMaterialUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });

        setImagenMaterialError(error?.message || 'No se pudo cargar la imagen del material');
      } finally {
        if (!cancelled) setImagenMaterialLoading(false);
      }
    }

    cargarImagen();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    materialSeleccionado?.numeroArticulo,
    materialSeleccionado?.tieneImagen,
    materialSeleccionado?.rutaImagenFinal,
  ]);

  useEffect(() => {
    const targetId = editId || cloneId;
    if (!token || !targetId) return;

    const cargarSolicitud = async () => {
      try {
        setErrorLocal(null);

        const resp = await apiFetch(`/solicitudes/${targetId}`);

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
        
        // Si es edición, validar que sea rechazada
        if (editId && (estado !== 'RECHAZADA' && estado !== 'BORRADOR')) {
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

        // Si es clonación, usamos la fecha de hoy, no la original
        if (editId) {
          setFechaSolicitud(fecha);
        }
        
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
            tieneImagen: d.TieneImagen ?? d.tieneImagen ?? null,
            rutaImagenFinal: d.RutaImagenFinal ?? d.rutaImagenFinal ?? null,
          };
        });

        setItems(mappedItems);
        
        if (cloneId) {
          toast.info({
            title: 'Solicitud clonada',
            description: 'Se han cargado los materiales de la solicitud anterior. Revisa y envía.',
          });
        }
      } catch (e: any) {
        console.error('Error al cargar solicitud', e);
        setErrorLocal(e?.message || 'Error al cargar la solicitud');
      }
    };

    cargarSolicitud();
  }, [editId, cloneId, token, navigate]);

  const handleAgregarItem = () => {
    if (!selectedMaterialId || !cantidad || Number(cantidad) <= 0) return;

    if (items.length >= 9) {
      toast.warning({
        title: 'Límite máximo alcanzado',
        description: 'No se pueden agregar más de 9 materiales por solicitud.',
      });
      return;
    }

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
      tieneImagen: material.tieneImagen ?? null,
      rutaImagenFinal: material.rutaImagenFinal ?? null,
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

  const handleEnviarSolicitud = async () => {
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

    // Validación profesional: No permitir envío si faltan áreas en el detalle
    const lineasSinArea = items.filter(it => !it.idArea && !idAreaDestino);
    if (lineasSinArea.length > 0) {
      toast.error({
        title: 'Información incompleta',
        description: 'Todas las líneas deben tener un área de destino asignada.',
      });
      return;
    }

    const areaSeleccionada = idAreaDestino ? areas.find((a: any) => String(a.id) === idAreaDestino) : null;

    setLoading(true);
    setErrorLocal(null);

    try {
      const payload = {
        fechaSolicitud,
        estado: 'PENDIENTE',
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
          codigoCuenta: it.codigoCuenta || null,
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
        let message = 'Error HTTP al crear solicitud';
        try {
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errJson = await resp.json();
            message = errJson?.message || JSON.stringify(errJson);
          } else {
            const text = await resp.text();
            message = text || message;
          }
        } catch {
          const text = await resp.text().catch(() => '');
          message = text || message;
        }
        throw new Error(message);
      }
      const data = await resp.json();

      // Descargar PDF automáticamente (igual que en Despacho) tras la creación
      const idSolicitudFinal = data.IdSolicitud ?? data.idSolicitud ?? null;
      if (idSolicitudFinal && !editId) {
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
          : 'Solicitud creada correctamente',
        description: editId
          ? 'La solicitud quedó actualizada y enviada a revisión.'
          : 'Se registró y quedó en estado pendiente.',
      });
      navigate('/solicitudes');
    } catch (e: any) {
      console.error('Error al crear solicitud', e);
      setErrorLocal(e?.message || 'Error al crear la solicitud');
      toast.error({
        title: 'No se pudo crear la solicitud',
        description: e?.message || 'Intenta nuevamente o contacta al administrador.',
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
          <div className="-mt-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Bloque estilo perfil de usuario */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
              <div className="h-16 w-16 min-w-[64px] rounded-full border-4 border-white bg-slate-900/80 text-white flex items-center justify-center text-xl font-semibold shadow-md">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col items-center sm:items-start">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Solicitante</div>
                <div className="text-lg font-semibold leading-tight text-slate-900">{user?.name}</div>
                <div className="text-xs text-slate-500">{user?.email}</div>
                <div className="mt-2 flex flex-wrap justify-center sm:justify-start items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-0.5 text-[10px]">
                    {user?.role || 'Sin rol asignado'}
                  </Badge>
                  {idAreaDestino && (() => {
                    const area = areas.find((a: any) => String(a.id) === idAreaDestino);
                    if (!area) return null;
                    return (
                      <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-[10px]">
                        {area.codigo} · {area.nombre}
                      </Badge>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Chips de contexto: estado, fecha, OT, centro de costo */}
            <div className="flex-1 flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-2 justify-center lg:justify-end">
                <div className="flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1 border border-yellow-200">
                  <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="text-[10px] sm:text-xs font-medium text-yellow-800 uppercase tracking-wider">Pendiente</span>
                </div>
                <div className="rounded-full bg-slate-50 px-3 py-1 border border-slate-200 flex items-center gap-2">
                  <CalendarDays className="w-3 h-3 text-slate-500" />
                  <input
                    type="date"
                    value={fechaSolicitud}
                    onChange={(e) => setFechaSolicitud(e.target.value)}
                    className="border-0 bg-transparent text-[10px] sm:text-xs text-slate-700 focus:outline-none focus:ring-0 w-24 sm:w-auto"
                  />
                </div>
                <div className="rounded-full bg-slate-50 px-3 py-1 border border-slate-200 flex items-center gap-2">
                  <Tag className="w-3 h-3 text-slate-500" />
                  <input
                    placeholder="OT (opcional)"
                    value={ot}
                    onChange={(e) => setOt(e.target.value)}
                    className="border-0 bg-transparent text-[10px] sm:text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0 w-20 sm:min-w-[90px]"
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
        imagenMaterialUrl={imagenMaterialUrl}
        imagenMaterialLoading={imagenMaterialLoading}
        imagenMaterialError={imagenMaterialError}
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
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pb-12 mb-8">
        <div className="w-full sm:w-auto">
          <Button 
            size="lg"
            onClick={handleEnviarSolicitud} 
            disabled={loading || items.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 px-8"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Clock className="w-5 h-5 animate-spin" />
                Procesando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Enviar Solicitud
              </span>
            )}
          </Button>
        </div>
        <div className="w-full sm:w-auto">
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => navigate('/solicitudes')}
            className="w-full font-semibold border-slate-300 hover:bg-slate-50 transition-all px-8"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
