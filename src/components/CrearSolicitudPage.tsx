import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { AlertCircle, Plus, Trash2, DollarSign, Package, Save, Send, User, CalendarDays, Tag, Loader2, Pencil, Check, X } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface MaterialDisponible {
  idMaterial: number;
  numeroArticulo: string;
  descripcionArticulo: string;
  unidadMedida: string;
  grupoArticulos: string | null;
  enStock: number | null;
  ultimoPrecioCompra: number | null;
  ultimaMonedaCompra: string | null;
}

interface ItemSolicitud {
  idMaterial: number;
  grupoArticulos: string | null;
  numeroArticulo: string;
  descripcionArticulo: string;
  unidadMedida: string;
  cantidad: number;
  stockDisponible: number | null;
  costoUnitario: number;
  subtotal: number;
}

interface AreaListado {
  id: number;
  codigo: string;
  nombre: string;
  idCentroCosto: number | null;
  centroCostoNombre: string | null;
}

interface RecursoListado {
  id: number;
  nombre: string;
}

export default function CrearSolicitudPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [materiales, setMateriales] = useState<MaterialDisponible[]>([]);
  const [areas, setAreas] = useState<AreaListado[]>([]);
  const [recursos, setRecursos] = useState<RecursoListado[]>([]);
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
  const [codigoCuenta, setCodigoCuenta] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingCantidad, setEditingCantidad] = useState<string>('');

  const gruposUnicos = Array.from(
    new Set(materiales.map((m) => m.grupoArticulos).filter((g): g is string => !!g)),
  );

  const materialesFiltrados = materiales.filter((m) => {
    return (!selectedGrupo || m.grupoArticulos === selectedGrupo);
  });

  const materialSeleccionado = selectedMaterialId
    ? materiales.find((m) => String(m.idMaterial) === selectedMaterialId) || null
    : null;

  const stockActualSeleccionado = materialSeleccionado?.enStock ?? null;
  const stockRestante =
    stockActualSeleccionado != null && cantidad
      ? stockActualSeleccionado - Number(cantidad || '0')
      : null;

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    setEditId(id);
  }, [location.search]);

  useEffect(() => {
    if (!token) return;

    const cargarDatos = async () => {
      try {
        setError(null);

        const [matResp, areasResp] = await Promise.all([
          fetch('http://localhost:4000/api/materiales/con-stock', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('http://localhost:4000/api/areas', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!matResp.ok) {
          throw new Error('No se pudieron cargar los materiales');
        }
        if (!areasResp.ok) {
          throw new Error('No se pudieron cargar las áreas');
        }
        const materialesJson = await matResp.json();
        const areasJson = await areasResp.json();

        setMateriales(
          (materialesJson || []).map((m: any) => ({
            idMaterial: m.IdMaterial,
            numeroArticulo: m.NumeroArticulo,
            descripcionArticulo: m.DescripcionArticulo,
            unidadMedida: m.UnidadMedida,
            grupoArticulos: m.GrupoArticulos ?? null,
            enStock: m.EnStock ?? null,
            ultimoPrecioCompra: m.UltimoPrecioCompra ?? null,
            ultimaMonedaCompra: m.UltimaMonedaCompra ?? null,
          })),
        );

        const mappedAreas: AreaListado[] = (areasJson || [])
          .filter((a: any) => (a.Activo ?? a.activo) !== false)
          .map((a: any) => ({
            id: a.IdArea ?? a.id,
            codigo: a.Codigo ?? a.codigo,
            nombre: a.Nombre ?? a.nombre,
            idCentroCosto: a.IdCentroCosto ?? a.idCentroCosto ?? null,
            centroCostoNombre: a.CentroCostoNombre ?? a.centroCostoNombre ?? null,
          }));

        const uniqueAreas: AreaListado[] = Array.from(
          new Map<number, AreaListado>(mappedAreas.map((a) => [a.id, a])).values(),
        );

        setAreas(uniqueAreas);

      } catch (e: any) {
        console.error('Error al cargar datos para CrearSolicitudPage', e);
        setError(e?.message || 'Error al cargar datos iniciales');
      }
    };

    cargarDatos();
  }, [token]);

  useEffect(() => {
    if (!token || !editId) return;

    const cargarSolicitud = async () => {
      try {
        setError(null);

        const resp = await fetch(`http://localhost:4000/api/solicitudes/${editId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

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
          toast.error('No se puede editar esta solicitud', {
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
        setCodigoCuenta('');

        const mappedItems: ItemSolicitud[] = detalle.map((d: any) => {
          const cantidad = Number(d.CantidadSolicitada ?? 0);
          const costoUnitario = Number(d.UltimoPrecioCompra ?? 0);
          return {
            idMaterial: Number(d.IdMaterial),
            grupoArticulos: d.GrupoArticulos ?? null,
            numeroArticulo: d.NumeroArticulo ?? '',
            descripcionArticulo: d.DescripcionArticulo ?? '',
            unidadMedida: d.UnidadMedidaDetalle ?? d.UnidadMedidaMaterial ?? '',
            cantidad,
            stockDisponible: d.EnStock ?? null,
            costoUnitario,
            subtotal: cantidad * costoUnitario,
          };
        });

        setItems(mappedItems);
      } catch (e: any) {
        console.error('Error al cargar solicitud para edición', e);
        setError(e?.message || 'Error al cargar la solicitud');
      }
    };

    cargarSolicitud();
  }, [editId, token, navigate, fechaSolicitud]);

  useEffect(() => {
    if (!token) return;

    const cargarRecursosPorArea = async () => {
      if (!idAreaDestino) {
        setRecursos([]);
        setIdRecurso('');
        setCodigoCuenta('');
        return;
      }

      try {
        const resp = await fetch(
          `http://localhost:4000/api/area-recursos/recursos?idArea=${idAreaDestino}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!resp.ok) {
          setRecursos([]);
          setIdRecurso('');
          setCodigoCuenta('');
          return;
        }

        const recursosJson = await resp.json();
        setRecursos(
          (recursosJson || []).map((r: any) => ({
            id: r.IdRecurso ?? r.id,
            nombre: r.Nombre ?? r.nombre,
          })),
        );
        setIdRecurso('');
        setCodigoCuenta('');
      } catch (e) {
        console.error('Error al cargar recursos por área', e);
        setRecursos([]);
        setIdRecurso('');
        setCodigoCuenta('');
      }
    };

    cargarRecursosPorArea();
  }, [idAreaDestino, token]);

  useEffect(() => {
    if (!token) return;

    const cargarCodigoCuenta = async () => {
      if (!idAreaDestino || !idRecurso) {
        setCodigoCuenta('');
        return;
      }

      try {
        const resp = await fetch(
          `http://localhost:4000/api/area-recursos/codigo-cuenta?idArea=${idAreaDestino}&idRecurso=${idRecurso}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!resp.ok) {
          setCodigoCuenta('');
          return;
        }

        const data = await resp.json();
        setCodigoCuenta(data?.codigoCuenta ?? '');
      } catch (e) {
        console.error('Error al cargar código de cuenta', e);
        setCodigoCuenta('');
      }
    };

    cargarCodigoCuenta();
  }, [idAreaDestino, idRecurso, token]);

  const handleAgregarItem = () => {
    if (!selectedMaterialId || !cantidad || Number(cantidad) <= 0) return;

    const material = materiales.find((m) => String(m.idMaterial) === selectedMaterialId);
    if (!material) return;

    const cantidadNumber = Number(cantidad);
    if (material.enStock != null && cantidadNumber > material.enStock) {
      toast.warning('La cantidad solicitada excede el stock disponible', {
        description: 'Ajusta la cantidad según el stock actual.',
      });
      return;
    }

    const costoUnitario = material.ultimoPrecioCompra ?? 0;

    const nuevoItem: ItemSolicitud = {
      idMaterial: material.idMaterial,
      grupoArticulos: material.grupoArticulos,
      numeroArticulo: material.numeroArticulo,
      descripcionArticulo: material.descripcionArticulo,
      unidadMedida: material.unidadMedida,
      cantidad: cantidadNumber,
      stockDisponible: material.enStock,
      costoUnitario,
      subtotal: cantidadNumber * costoUnitario,
    };

    setItems((prev) => [...prev, nuevoItem]);
    setSelectedMaterialId('');
    setCantidad('');
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
      toast.warning('La cantidad solicitada excede el stock disponible', {
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
      toast.error('No hay sesión activa', {
        description: 'Inicia sesión nuevamente para continuar.',
      });
      return;
    }

    if (items.length === 0) {
      toast.info('Agrega materiales a la solicitud', {
        description: 'Debes incluir al menos un material antes de enviar.',
      });
      return;
    }

    const areaSeleccionada = idAreaDestino ? areas.find((a) => String(a.id) === idAreaDestino) : null;

    setLoading(true);
    setError(null);

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
        idCentroCosto: areaSeleccionada ? areaSeleccionada.idCentroCosto : null,
        ot: ot || null,
        detalle: items.map((it) => ({
          idMaterial: it.idMaterial,
          cantidadSolicitada: it.cantidad,
          unidadMedida: it.unidadMedida,
          comentarioLinea: null,
        })),
      };

      const resp = await fetch(
        editId ? `http://localhost:4000/api/solicitudes/${editId}` : 'http://localhost:4000/api/solicitudes',
        {
          method: editId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Error HTTP al crear solicitud');
      }
      const data = await resp.json();

      // Abrir vista elegante para impresión / PDF (solo en creación)
      if (!editId) {
        try {
          const idSolicitud = data.IdSolicitud ?? data.idSolicitud ?? null;
          const codigoSolicitud = data.CodigoSolicitud ?? data.codigoSolicitud ?? 'Solicitud';

        const areaSeleccionada = idAreaDestino ? areas.find((a) => String(a.id) === idAreaDestino) : null;

        const ventana = window.open('', '_blank');
        if (ventana) {
          // `fechaSolicitud` es YYYY-MM-DD. `new Date('YYYY-MM-DD')` se interpreta como UTC
          // y en zonas horarias negativas puede “retroceder” al día anterior.
          // Parseamos como fecha local para impresión.
          const [yy, mm, dd] = (fechaSolicitud || '').split('-').map((n) => Number(n));
          const fechaDate = yy && mm && dd ? new Date(yy, mm - 1, dd) : new Date();
          const fechaLocal = fechaDate.toLocaleDateString();
          const totalLocal = total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charSet="utf-8" />
  <title>${codigoSolicitud}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f7; margin:0; padding:32px; }
    .page { max-width:900px; margin:0 auto; background:white; border-radius:16px; box-shadow:0 20px 45px rgba(15,23,42,0.18); padding:32px 40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:24px; }
    .title { font-size:24px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#111827; }
    .subtitle { font-size:12px; text-transform:uppercase; color:#6b7280; letter-spacing:0.08em; }
    .badge { display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:500; background:#FEF3C7; color:#92400E; }
    .section { margin-top:24px; border-radius:12px; border:1px solid #E5E7EB; padding:16px 18px; background:#F9FAFB; }
    .section-title { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#6B7280; margin-bottom:8px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 24px; font-size:13px; color:#111827; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#9CA3AF; }
    table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
    th, td { padding:8px 10px; text-align:left; }
    th { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#9CA3AF; border-bottom:1px solid #E5E7EB; }
    tr:nth-child(even) td { background:#F9FAFB; }
    .text-right { text-align:right; }
    .footer { margin-top:24px; display:flex; justify-content:space-between; align-items:flex-end; gap:16px; }
    .total-label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#9CA3AF; }
    .total-value { font-size:22px; font-weight:600; color:#111827; }
    .muted { font-size:11px; color:#9CA3AF; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="subtitle">Solicitud de materiales</div>
        <div class="title">${codigoSolicitud}</div>
        <div style="margin-top:8px; font-size:12px; color:#6B7280;">Generada por ${user?.name ?? ''}</div>
      </div>
      <div style="text-align:right; font-size:12px; color:#4B5563;">
        <div><span style="color:#9CA3AF;">Fecha:</span> ${fechaLocal}</div>
        <div><span style="color:#9CA3AF;">Estado:</span> <span class="badge">Pendiente</span></div>
        ${ot ? `<div><span style="color:#9CA3AF;">OT:</span> ${ot}</div>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Información del solicitante</div>
      <div class="grid">
        <div>
          <div class="label">Nombre</div>
          <div>${user?.name ?? ''}</div>
        </div>
        <div>
          <div class="label">Correo</div>
          <div>${user?.email ?? ''}</div>
        </div>
        <div>
          <div class="label">Rol</div>
          <div>${user?.role ?? ''}</div>
        </div>
        <div>
          <div class="label">Área destino</div>
          <div>${areaSeleccionada ? `${areaSeleccionada.codigo} - ${areaSeleccionada.nombre}` : ''}</div>
        </div>
        <div>
          <div class="label">Código de cuenta</div>
          <div>${codigoCuenta ?? ''}</div>
        </div>
      </div>
    </div>

    <div class="section" style="margin-top:20px;">
      <div class="section-title">Detalle de materiales</div>
      <table>
        <thead>
          <tr>
            <th>Grupo</th>
            <th>N° Artículo</th>
            <th>Descripción</th>
            <th>Unidad</th>
            <th class="text-right">Stock</th>
            <th class="text-right">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${items
              .map(
                (it) => `
          <tr>
            <td>${it.grupoArticulos ?? '-'}</td>
            <td>${it.numeroArticulo}</td>
            <td>${it.descripcionArticulo}</td>
            <td>${it.unidadMedida}</td>
            <td class="text-right">${it.stockDisponible ?? 0}</td>
            <td class="text-right">${it.cantidad}</td>
          </tr>`,
              )
              .join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div class="muted">
        Este documento es un resumen de solicitud de materiales. Utilice la opción "Imprimir" del navegador para guardar como PDF.
      </div>
      <div>
        <div class="total-label">Total estimado</div>
        <div class="total-value">${totalLocal}</div>
      </div>
    </div>
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`);
          ventana.document.close();
        }
        } catch (printError) {
          console.error('Error al abrir vista de impresión de solicitud', printError);
        }
      }

      toast.success(
        editId
          ? 'Solicitud actualizada correctamente'
          : comoBorrador
            ? 'Solicitud guardada correctamente'
            : 'Solicitud creada correctamente',
        {
          description: editId
            ? 'La solicitud quedó actualizada y enviada a revisión.'
            : comoBorrador
              ? 'El borrador quedó disponible en el listado de solicitudes.'
              : 'Se registró y quedó en estado pendiente.',
        },
      );
      navigate('/solicitudes');
    } catch (e: any) {
      console.error('Error al crear solicitud', e);
      setError(e?.message || 'Error al crear la solicitud');
      toast.error('No se pudo crear la solicitud', {
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
                    const area = areas.find((a) => String(a.id) === idAreaDestino);
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
      <Card>
        <CardHeader>
          <CardTitle>Información de destino</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Área destino</Label>
              <Select value={idAreaDestino} onValueChange={setIdAreaDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar área" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recurso</Label>
              <Select value={idRecurso} onValueChange={setIdRecurso} disabled={!idAreaDestino || recursos.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !idAreaDestino
                        ? 'Selecciona un área primero'
                        : recursos.length === 0
                          ? 'Sin recursos disponibles'
                          : 'Seleccionar recurso'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {recursos.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Código de cuenta</Label>
              <Input
                value={codigoCuenta}
                readOnly
                placeholder="Se completa según área y recurso"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agregar Materiales */}
      <Card>
        <CardHeader>
          <CardTitle>Agregar Materiales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_140px_120px]">
              <div className="space-y-2">
                <Label>Grupo de artículos</Label>
                <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {gruposUnicos.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Material</Label>
                <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar material..." />
                  </SelectTrigger>
                  <SelectContent>
                    {materialesFiltrados.map((material) => (
                      <SelectItem key={material.idMaterial} value={String(material.idMaterial)}>
                        <div className="flex items-center justify-between gap-4">
                          <span>
                            {material.numeroArticulo} - {material.descripcionArticulo}
                          </span>
                          <Badge variant="outline" className="ml-2">
                            Stock: {material.enStock ?? 0}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label className="opacity-0">Acción</Label>
                <Button onClick={handleAgregarItem} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar
                </Button>
              </div>
            </div>

            {materialSeleccionado && (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">N° artículo</Label>
                  <Input
                    readOnly
                    value={materialSeleccionado.numeroArticulo}
                    className="bg-slate-50 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Unidad de medida</Label>
                  <Input
                    readOnly
                    value={materialSeleccionado.unidadMedida}
                    className="bg-slate-50 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Stock actual</Label>
                  <Input
                    readOnly
                    value={stockActualSeleccionado != null ? stockActualSeleccionado : ''}
                    className="bg-slate-50 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Stock después de solicitar</Label>
                  <Input
                    readOnly
                    value={
                      stockRestante != null && !Number.isNaN(stockRestante)
                        ? stockRestante
                        : ''
                    }
                    className="bg-slate-50 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Items */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de la Solicitud</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay items agregados</p>
              <p className="text-sm">Agrega materiales usando el formulario de arriba</p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grupo</TableHead>
                      <TableHead>N° Artículo</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.grupoArticulos || '-'}</TableCell>
                        <TableCell>{item.numeroArticulo}</TableCell>
                        <TableCell>{item.descripcionArticulo}</TableCell>
                        <TableCell>{item.unidadMedida}</TableCell>
                        <TableCell className="text-right">{item.stockDisponible ?? 0}</TableCell>
                        <TableCell className="text-right">
                          {editingIndex === index ? (
                            <Input
                              type="number"
                              min="1"
                              max={item.stockDisponible ?? undefined}
                              value={editingCantidad}
                              onChange={(e) => setEditingCantidad(e.target.value)}
                              className="h-8 w-24 ml-auto text-right"
                            />
                          ) : (
                            item.cantidad
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEliminarItem(index)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                          {editingIndex === index ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleGuardarEdicionItem}
                              >
                                <Check className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelarEdicionItem}
                              >
                                <X className="w-4 h-4 text-slate-500" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditarItem(index)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end mt-4 pt-4 border-t">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total estimado (último precio)</div>
                  <div className="text-3xl flex items-center gap-1">
                    <DollarSign className="w-5 h-5" />
                    {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
