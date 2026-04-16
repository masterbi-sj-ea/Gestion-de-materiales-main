import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCatalogosSolicitud, type RecursoListado } from '../hooks/useCatalogosSolicitud';
import { apiFetch } from '../services/apiClient';

// Componentes UI
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';

// Subcomponentes del formulario
import { FormularioDestino } from './solicitudes/features/FormularioDestino';
import { TablaDetalleSolicitud } from './solicitudes/features/TablaDetalleSolicitud';
import { FormularioAgregarMaterial } from './solicitudes/features/FormularioAgregarMaterial';
import {
  getBudgetPreviewUserMessage,
  PresupuestoSolicitudPreview,
  type SolicitudPresupuestoPreviewData,
} from './solicitudes/features/PresupuestoSolicitudPreview';

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

function mapRecursoListado(raw: any): RecursoListado {
  return {
    id: Number(raw?.IdRecurso ?? raw?.id ?? 0),
    nombre: String(raw?.Nombre ?? raw?.nombre ?? ''),
    catalogoId: raw?.IdCatalogoSolicitud ?? raw?.IdCatalogo ?? raw?.catalogoId ?? null,
    codigoCuenta: raw?.CodigoCuenta ?? raw?.codigoCuenta ?? null,
    nombreCuenta: raw?.NombreCuenta ?? raw?.nombreCuenta ?? null,
  };
}

function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type CodigoCuentaPreviewSource = 'catalogo' | 'catalogo-ambiguous' | 'area' | 'centroCosto' | 'none';

interface CodigoCuentaPreviewData {
  codigoCuenta: string;
  idCentroCosto: number | null;
  idRecurso: number | null;
  source: CodigoCuentaPreviewSource;
  recursos: RecursoListado[];
}

export interface ItemSolicitud {
  idMaterial: number;
  grupoArticulos: string | null;
  numeroArticulo: string;
  descripcionArticulo: string;
  unidadMedida: string;
  idArea?: number | null;
  idRecurso?: number | null;
  recursoNombre?: string | null;
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
  const rehidratandoSolicitudRef = useRef(false);
  
  // -- Estados Globales de la Solicitud --
  const [items, setItems] = useState<ItemSolicitud[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [ot, setOt] = useState('');
  const [fechaSolicitud, setFechaSolicitud] = useState<string>(() => getLocalDateInputValue());
  
  // -- Estados de Cabecera (Destino) --
  const [idAreaDestino, setIdAreaDestino] = useState<string>('');
  const [idCatalogoSolicitud, setIdCatalogoSolicitud] = useState<string>('');

  // -- Estados de Interfaz de Búsqueda --
  const [selectedGrupo, setSelectedGrupo] = useState<string>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [selectedRecursoMaterialId, setSelectedRecursoMaterialId] = useState<string>('');
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
    catalogos,
    catalogosApplied,
    materialesApplied,
    isLoadingCatalogosPermitidos,
    isLoadingMateriales,
    errorCatalogos
  } = useCatalogosSolicitud(token, idAreaDestino, idCatalogoSolicitud);

  // -- Estados del Servidor --
  const [loading, setLoading] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

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
  const catalogoPreviewId = idCatalogoSolicitud || (catalogos.length === 1 ? String(catalogos[0].id) : '');

  const {
    data: codigoCuentaAreaPreviewData,
    error: errorCodigoCuentaAreaPreview,
    isLoading: isLoadingCodigoCuentaAreaPreview,
  } = useQuery<CodigoCuentaPreviewData>({
    queryKey: ['codigoCuentaAreaPreview', token, idAreaDestino, catalogoPreviewId],
    queryFn: async () => {
      if (!idAreaDestino || !catalogoPreviewId) {
        return { codigoCuenta: '', idCentroCosto: null, idRecurso: null, source: 'none', recursos: [] };
      }

      const query = new URLSearchParams({ areaId: idAreaDestino });
      query.set('catalogoId', catalogoPreviewId);

      const resp = await apiFetch(`/area-recursos/codigo-cuenta?${query.toString()}`);
      if (!resp.ok) {
        let message = 'No se pudo resolver el código de cuenta del área';
        try {
          const payload = await resp.json();
          message = payload?.message || message;
        } catch {
          // ignorar cuerpo inválido
        }
        throw new Error(message);
      }

      const json = await resp.json();
      return {
        codigoCuenta: String(json?.codigoCuenta ?? ''),
        idCentroCosto: json?.idCentroCosto ?? null,
        idRecurso: json?.idRecurso ?? null,
        source: String(json?.source ?? 'none') as CodigoCuentaPreviewSource,
        recursos: Array.isArray(json?.recursos) ? json.recursos.map(mapRecursoListado) : [],
      };
    },
    enabled: !!token && !!idAreaDestino && !!catalogoPreviewId,
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: recursosMaterialData,
    error: errorRecursoMaterial,
    isLoading: isResolviendoRecurso,
  } = useQuery({
    queryKey: ['recursoPorMaterial', token, idAreaDestino, selectedMaterialId],
    queryFn: async () => {
      if (!idAreaDestino || !selectedMaterialId) {
        return { recursos: [], resolved: null as RecursoListado | null };
      }

      const resp = await apiFetch(`/area-recursos/material?areaId=${idAreaDestino}&idMaterial=${selectedMaterialId}`);
      if (!resp.ok) {
        let message = 'No se pudo resolver el recurso del material';
        try {
          const payload = await resp.json();
          message = payload?.message || message;
        } catch {
          // ignorar cuerpo inválido
        }
        throw new Error(message);
      }

      const json = await resp.json();
      const recursos = Array.isArray(json?.recursos)
        ? json.recursos.map(mapRecursoListado)
        : [];

      const resolvedId = Number(json?.resolved?.IdRecurso ?? json?.resolved?.id ?? 0);
      const resolved = resolvedId > 0
        ? recursos.find((recurso: RecursoListado) => recurso.id === resolvedId) ?? null
        : null;

      return { recursos, resolved };
    },
    enabled: !!token && !!idAreaDestino && !!selectedMaterialId,
    staleTime: 10 * 60 * 1000,
  });

  const recursosMaterial = recursosMaterialData?.recursos || [];
  const recursoMaterialSeleccionado = useMemo(() => {
    if (selectedRecursoMaterialId) {
      return recursosMaterial.find((recurso: RecursoListado) => String(recurso.id) === selectedRecursoMaterialId) || null;
    }

    return recursosMaterialData?.resolved ?? null;
  }, [recursosMaterial, recursosMaterialData?.resolved, selectedRecursoMaterialId]);

  const codigoCuentaMaterial = recursoMaterialSeleccionado?.codigoCuenta || '';
  const codigoCuentaAreaPreview = String(codigoCuentaAreaPreviewData?.codigoCuenta ?? '');
  const codigoCuentaAreaPreviewSource = codigoCuentaAreaPreviewData?.source ?? 'none';
  const codigoCuentaPreview = codigoCuentaMaterial || codigoCuentaAreaPreview || '';
  const codigoCuentaPreviewPlaceholder = !idAreaDestino
    ? 'Selecciona un área'
    : !selectedMaterialId
      ? isLoadingCodigoCuentaAreaPreview
        ? 'Cargando cuenta del área...'
        : codigoCuentaAreaPreview
          ? codigoCuentaAreaPreviewSource === 'catalogo'
            ? 'Código según catálogo seleccionado'
            : 'Código cargado automáticamente'
          : catalogoPreviewId
            ? codigoCuentaAreaPreviewSource === 'catalogo-ambiguous'
              ? 'No se pudo resolver una cuenta única para el catálogo seleccionado'
              : 'Sin cuenta configurada para esta área/catálogo'
            : 'Selecciona un catálogo'
      : isResolviendoRecurso
        ? 'Resolviendo cuenta...'
        : recursosMaterial.length > 1 && !selectedRecursoMaterialId
          ? 'Selecciona un recurso'
          : recursosMaterial.length === 0
            ? 'Sin cuenta para este material'
            : 'Sin cuenta';
  const error = errorLocal || errorCatalogos || errorRecursoMaterial?.message || (errorCodigoCuentaAreaPreview instanceof Error ? errorCodigoCuentaAreaPreview.message : null) || null;

  const stockActualSeleccionado = materialSeleccionado?.enStock ?? null;
  const stockRestante = (stockActualSeleccionado != null && cantidad)
    ? stockActualSeleccionado - Number(cantidad || '0')
    : null;

  const total = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);

  const previewPayload = useMemo(() => ({
    idSolicitud: editId ? Number(editId) : null,
    fechaSolicitud,
    estado: 'PENDIENTE',
    idArea: idAreaDestino ? Number(idAreaDestino) : null,
    detalle: items.map((item) => ({
      idMaterial: item.idMaterial,
      cantidadSolicitada: item.cantidad,
      unidadMedida: item.unidadMedida ?? null,
      comentarioLinea: null,
      idArea: item.idArea ?? (idAreaDestino ? Number(idAreaDestino) : null),
      idRecurso: item.idRecurso ?? null,
    })),
  }), [editId, fechaSolicitud, idAreaDestino, items]);

  const canRequestBudgetPreview = items.length > 0 && Boolean(idAreaDestino || items.some((item) => item.idArea));

  const {
    data: presupuestoPreview,
    error: presupuestoPreviewError,
    isLoading: isLoadingPresupuestoPreview,
    isFetching: isFetchingPresupuestoPreview,
  } = useQuery<SolicitudPresupuestoPreviewData>({
    queryKey: ['solicitudPresupuestoPreview', token, previewPayload],
    queryFn: async () => {
      const response = await apiFetch('/solicitudes/presupuesto-preview', {
        method: 'POST',
        body: JSON.stringify(previewPayload),
      });

      if (!response.ok) {
        let message = 'No se pudo calcular el impacto presupuestario.';
        try {
          const payload = await response.json();
          message = payload?.message || message;
        } catch {
          // ignorar respuesta inválida
        }
        throw new Error(message);
      }

      return response.json();
    },
    enabled: !!token && canRequestBudgetPreview,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const presupuestoPreviewMessage = presupuestoPreviewError instanceof Error ? presupuestoPreviewError.message : null;
  const presupuestoPreviewLoading = isLoadingPresupuestoPreview || isFetchingPresupuestoPreview;
  const solicitudBloqueadaPorPresupuesto = Boolean(presupuestoPreview?.bloqueada);
  const presupuestoPreviewUserMessage = getBudgetPreviewUserMessage(presupuestoPreview ?? null);

  useEffect(() => {
    setSelectedRecursoMaterialId('');
  }, [idAreaDestino, selectedMaterialId]);

  useEffect(() => {
    if (rehidratandoSolicitudRef.current) {
      rehidratandoSolicitudRef.current = false;
    } else {
      setIdCatalogoSolicitud('');
    }
    setSelectedGrupo('');
    setSelectedMaterialId('');
    setSelectedRecursoMaterialId('');
    setCantidad('');
  }, [idAreaDestino]);

  useEffect(() => {
    if (!idAreaDestino) {
      if (idCatalogoSolicitud) {
        setIdCatalogoSolicitud('');
      }
      return;
    }

    if (isLoadingCatalogosPermitidos) {
      return;
    }

    if (catalogos.length === 0) {
      if (idCatalogoSolicitud) {
        setIdCatalogoSolicitud('');
      }
      return;
    }

    const selectedIsValid = catalogos.some((catalogo) => String(catalogo.id) === idCatalogoSolicitud);
    if (selectedIsValid) {
      return;
    }

    if (catalogos.length === 1) {
      setIdCatalogoSolicitud(String(catalogos[0].id));
      return;
    }

    if (idCatalogoSolicitud) {
      setIdCatalogoSolicitud('');
    }
  }, [catalogos, idAreaDestino, idCatalogoSolicitud, isLoadingCatalogosPermitidos]);

  useEffect(() => {
    setSelectedGrupo('');
    setSelectedMaterialId('');
    setSelectedRecursoMaterialId('');
    setCantidad('');
  }, [idCatalogoSolicitud]);

  useEffect(() => {
    if (gruposUnicos.length === 0) {
      if (selectedGrupo) {
        setSelectedGrupo('');
      }
      return;
    }

    if (gruposUnicos.includes(selectedGrupo)) {
      return;
    }

    if (gruposUnicos.length === 1) {
      setSelectedGrupo(gruposUnicos[0]);
      return;
    }

    if (selectedGrupo) {
      setSelectedGrupo('');
    }
  }, [gruposUnicos, selectedGrupo]);

  useEffect(() => {
    if (!selectedMaterialId) {
      return;
    }

    const materialValidoEnGrupo = materialesFiltrados.some((material: any) => String(material.idMaterial) === selectedMaterialId);
    if (materialValidoEnGrupo) {
      return;
    }

    setSelectedMaterialId('');
    setSelectedRecursoMaterialId('');
    setCantidad('');
  }, [materialesFiltrados, selectedMaterialId]);

  useEffect(() => {
    if (recursosMaterial.length !== 1) {
      return;
    }

    if (selectedRecursoMaterialId && selectedRecursoMaterialId === String(recursosMaterial[0].id)) {
      return;
    }

    setSelectedRecursoMaterialId(String(recursosMaterial[0].id));
  }, [recursosMaterial, selectedRecursoMaterialId]);

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
        setOt(cabecera.OT ?? cabecera.Ot ?? '');
        rehidratandoSolicitudRef.current = true;
        setIdAreaDestino(cabecera.IdArea ? String(cabecera.IdArea) : '');
        setIdCatalogoSolicitud(
          cabecera.IdCatalogoSolicitud != null && cabecera.IdCatalogoSolicitud !== ''
            ? String(cabecera.IdCatalogoSolicitud)
            : cabecera.idCatalogoSolicitud != null && cabecera.idCatalogoSolicitud !== ''
              ? String(cabecera.idCatalogoSolicitud)
              : ''
        );

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
            idRecurso: d.IdRecurso != null ? Number(d.IdRecurso) : null,
            recursoNombre: d.RecursoNombre ?? d.NombreRecurso ?? null,
            codigoCuenta: d.CodigoCuenta ?? d.codigoCuenta ?? null,
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

    if (isResolviendoRecurso) {
      toast.info({
        title: 'Resolviendo recurso del material',
        description: 'Espera un momento antes de agregar la línea.',
      });
      return;
    }

    if (recursosMaterial.length === 0) {
      toast.error({
        title: 'Material sin recurso configurado',
        description: 'Este material no tiene un recurso activo válido para el área seleccionada.',
      });
      return;
    }

    const recursoSeleccionado = recursoMaterialSeleccionado ?? (recursosMaterial.length === 1 ? recursosMaterial[0] : null);

    const cantidadNumber = Number(cantidad);
    if (material.enStock != null && cantidadNumber > material.enStock) {
      toast.warning({
        title: 'La cantidad solicitada excede el stock disponible',
        description: 'Ajusta la cantidad según el stock actual.',
      });
      return;
    }

    if (recursosMaterial.length > 1 && !recursoSeleccionado) {
      toast.info({
        title: 'Selecciona el recurso del material',
        description: 'Este material tiene más de un recurso posible dentro del área.',
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
      idRecurso: recursoSeleccionado?.id ?? null,
      recursoNombre: recursoSeleccionado?.nombre ?? null,
      codigoCuenta: recursoSeleccionado?.codigoCuenta ?? null,
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
    setSelectedRecursoMaterialId('');
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

    if (canRequestBudgetPreview && presupuestoPreviewLoading) {
      toast.info({
        title: 'Validando presupuesto',
        description: 'Espera a que termine el cálculo presupuestario antes de enviar.',
      });
      return;
    }

    if (solicitudBloqueadaPorPresupuesto) {
      toast.error({
        title: 'Solicitud bloqueada por presupuesto',
        description: presupuestoPreviewUserMessage || 'La solicitud excede el presupuesto disponible o tiene datos incompletos.',
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
    const catalogoSolicitudFinalId = idCatalogoSolicitud
      ? Number(idCatalogoSolicitud)
      : catalogos.length === 1
        ? Number(catalogos[0].id)
        : null;

    if (!Number.isInteger(catalogoSolicitudFinalId) || Number(catalogoSolicitudFinalId) <= 0) {
      toast.error({
        title: 'Catálogo requerido',
        description: 'Debes seleccionar un catálogo válido antes de enviar la solicitud.',
      });
      return;
    }

    const lineasSinRecurso = items.filter((it) => !it.idRecurso);
    if (lineasSinRecurso.length > 0) {
      toast.error({
        title: 'Hay líneas sin recurso',
        description: 'Cada línea debe tener un recurso válido antes de enviar la solicitud.',
      });
      return;
    }

    setLoading(true);
    setErrorLocal(null);

      try {
      const payload = {
        idSolicitante: user?.id ? Number(user.id) : null,
        fechaSolicitud,
        estado: 'PENDIENTE',
        nuevoEstado: 'PENDIENTE',
        area: areaSeleccionada ? (areaSeleccionada.nombre ?? null) : null,
        comentario: observaciones?.trim() || null,
        idCorteStock: null,
        idArea: areaSeleccionada ? Number(areaSeleccionada.id) : null,
        idRecurso: null,
        idCatalogoSolicitud: catalogoSolicitudFinalId,
        idCentroCosto: areaSeleccionada ? areaSeleccionada.idCentroCosto ?? null : null,
        ot: ot?.trim() || null,
        detalle: items.map((it) => ({
          idMaterial: it.idMaterial,
          cantidadSolicitada: it.cantidad,
          unidadMedida: it.unidadMedida ?? null,
          comentarioLinea: (it as any).comentarioLinea ?? null,
          idArea: it.idArea ?? (areaSeleccionada ? Number(areaSeleccionada.id) : null),
          idRecurso: it.idRecurso ?? null,
        })),
      };
      console.log('[FRONT] payload crear solicitud:', payload);

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
                  <div className="w-20 sm:min-w-[90px]">
                    <Input
                      value={ot}
                      onChange={(e) => setOt(e.target.value)}
                      placeholder="OT / Comentario"
                      className="border-0 bg-transparent text-[10px] sm:text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                    />
                  </div>
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
        catalogos={catalogos}
        idAreaDestino={idAreaDestino}
        setIdAreaDestino={setIdAreaDestino}
        idCatalogoSolicitud={idCatalogoSolicitud}
        setIdCatalogoSolicitud={setIdCatalogoSolicitud}
        codigoCuentaPreview={codigoCuentaPreview}
        codigoCuentaPlaceholder={codigoCuentaPreviewPlaceholder}
        gruposUnicos={gruposUnicos}
        selectedGrupo={selectedGrupo}
        setSelectedGrupo={setSelectedGrupo}
        materialesFiltrados={materialesFiltrados}
        materialesApplied={materialesApplied}
        isLoadingMateriales={isLoadingMateriales}
        selectedMaterialId={selectedMaterialId}
        setSelectedMaterialId={setSelectedMaterialId}
        materialSeleccionado={materialSeleccionado}
      />

      {/* Agregar Materiales */}
      <FormularioAgregarMaterial
        areaSeleccionada={Boolean(idAreaDestino)}
        recursosMaterial={recursosMaterial}
        selectedRecursoMaterialId={selectedRecursoMaterialId}
        setSelectedRecursoMaterialId={setSelectedRecursoMaterialId}
        codigoCuentaMaterial={codigoCuentaMaterial}
        isResolviendoRecurso={isResolviendoRecurso}
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

      <PresupuestoSolicitudPreview
        visible={canRequestBudgetPreview || presupuestoPreviewLoading || Boolean(presupuestoPreviewMessage)}
        loading={presupuestoPreviewLoading}
        error={presupuestoPreviewMessage}
        preview={presupuestoPreview ?? null}
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
            disabled={loading || items.length === 0 || (canRequestBudgetPreview && presupuestoPreviewLoading) || solicitudBloqueadaPorPresupuesto}
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
