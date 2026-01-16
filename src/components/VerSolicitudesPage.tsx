import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Search, Eye, Edit, FileText, Clock, CheckCircle, XCircle, Truck, Package } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Solicitud {
  id: string;
  numero: string;
  fecha: string;
  area: string;
  solicitante: string;
  estado: 'borrador' | 'pendiente' | 'aprobada' | 'rechazada' | 'en_despacho' | 'despachada_parcial' | 'despachada_total';
  items: number;
  total: number;
  observaciones?: string;
  comentarioRechazo?: string;
}
type EstadoDb =
  | 'PENDIENTE'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'EN_DESPACHO'
  | 'DESPACHADA_PARCIAL'
  | 'DESPACHADA_TOTAL'
  | 'BORRADOR'
  | string;

interface SolicitudResumenApi {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  Estado: EstadoDb;
  IdSolicitante: number;
  NombreSolicitante: string;
  RolSolicitante: string | null;
  IdArea: number | null;
  AreaNombre: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
  Comentario: string | null;
  TotalItems: number;
  TotalMonto: number;
}

interface SolicitudDetalleApi {
  IdDetalleSolicitud: number;
  IdSolicitud: number;
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedidaMaterial: string;
  GrupoArticulos: string | null;
  CantidadSolicitada: number;
  CantidadAprobada: number | null;
  UnidadMedidaDetalle: string | null;
  ComentarioLinea: string | null;
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
  UltimaMonedaCompra: string | null;
}

function mapEstadoDesdeBackend(estadoDb: EstadoDb): Solicitud['estado'] {
  const v = (estadoDb || '').toUpperCase();
  switch (v) {
    case 'BORRADOR':
      return 'borrador';
    case 'PENDIENTE':
      return 'pendiente';
    case 'APROBADA':
      return 'aprobada';
    case 'RECHAZADA':
      return 'rechazada';
    case 'EN_DESPACHO':
      return 'en_despacho';
    case 'DESPACHADA_PARCIAL':
      return 'despachada_parcial';
    case 'DESPACHADA_TOTAL':
      return 'despachada_total';
    default:
      return 'pendiente';
  }
}

const estadoConfig = {
  borrador: { label: 'Borrador', color: 'bg-slate-100 text-slate-700', icon: FileText },
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  aprobada: { label: 'Aprobada', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: XCircle },
  en_despacho: { label: 'En Despacho', color: 'bg-blue-100 text-blue-700', icon: Truck },
  despachada_parcial: { label: 'Desp. Parcial', color: 'bg-cyan-100 text-cyan-700', icon: Package },
  despachada_total: { label: 'Despachada', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
};

export default function VerSolicitudesPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('todas');
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [detalleSeleccionado, setDetalleSeleccionado] = useState<SolicitudDetalleApi[]>([]);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    const fetchSolicitudes = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set('soloMias', 'true');
        if (selectedEstado !== 'todas') {
          // El backend espera estados en mayúsculas (PENDIENTE, APROBADA, ...)
          const estadoBackend = selectedEstado
            .toUpperCase()
            .replace('DESPACHADA_PARCIAL', 'DESPACHADA_PARCIAL')
            .replace('DESPACHADA_TOTAL', 'DESPACHADA_TOTAL')
            .replace('EN_DESPACHO', 'EN_DESPACHO');
          params.set('estado', estadoBackend);
        }

        const response = await fetch(`http://localhost:4000/api/solicitudes?${params.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Error al cargar solicitudes');
        }

        const data: SolicitudResumenApi[] = await response.json();

        const mapped: Solicitud[] = data.map((s) => ({
          id: String(s.IdSolicitud),
          numero: s.CodigoSolicitud,
          fecha: s.FechaSolicitud,
          area: s.AreaNombre ?? '-',
          solicitante: s.NombreSolicitante,
          estado: mapEstadoDesdeBackend(s.Estado),
          items: s.TotalItems ?? 0,
          total: s.TotalMonto ?? 0,
          observaciones: s.Comentario ?? undefined,
        }));

        setSolicitudes(mapped);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Error al cargar solicitudes', err);
        setError('Error al cargar solicitudes');
      } finally {
        setLoading(false);
      }
    };

    fetchSolicitudes();

    return () => {
      controller.abort();
    };
  }, [token, selectedEstado]);

  const filteredSolicitudes = solicitudes.filter((sol) => {
    const matchesSearch =
      sol.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sol.area.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEstado = selectedEstado === 'todas' || sol.estado === selectedEstado;
    return matchesSearch && matchesEstado;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSolicitudes.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedSolicitudes = filteredSolicitudes.slice(startIndex, startIndex + pageSize);

  const handleVerDetalle = (solicitud: Solicitud) => {
    setSelectedSolicitud(solicitud);
    if (!token) return;

    setDetalleSeleccionado([]);
    setDetalleError(null);
    setDetalleLoading(true);

    fetch(`http://localhost:4000/api/solicitudes/${solicitud.id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Error al obtener detalle de la solicitud');
        }
        const data: { cabecera: any; detalle: SolicitudDetalleApi[] } = await res.json();
        setDetalleSeleccionado(data.detalle || []);
      })
      .catch((err: any) => {
        console.error('Error al obtener detalle de solicitud', err);
        setDetalleError('Error al obtener detalle de la solicitud');
      })
      .finally(() => {
        setDetalleLoading(false);
      });
  };

  const handleEditar = (id: string) => {
    navigate(`/solicitudes/crear?id=${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Mis Solicitudes</h1>
          <p className="text-muted-foreground mt-1">
            Historial y seguimiento de solicitudes
          </p>
        </div>
        {user?.role === 'solicitante' && (
          <Button onClick={() => navigate('/solicitudes/crear')}>
            <FileText className="w-4 h-4 mr-2" />
            Nueva Solicitud
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número o área..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedEstado} onValueChange={setSelectedEstado}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los estados</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="aprobada">Aprobada</SelectItem>
                <SelectItem value="rechazada">Rechazada</SelectItem>
                <SelectItem value="en_despacho">En Despacho</SelectItem>
                <SelectItem value="despachada_parcial">Despachada Parcial</SelectItem>
                <SelectItem value="despachada_total">Despachada Total</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Solicitudes */}
      <Card>
        <CardHeader>
          <CardTitle>
            Solicitudes ({filteredSolicitudes.length})
            {loading && <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 text-sm text-red-600">
              {error}
            </div>
          )}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSolicitudes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No se encontraron solicitudes
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSolicitudes.map((solicitud) => {
                    const config = estadoConfig[solicitud.estado];
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={solicitud.id}>
                        <TableCell className="font-medium">{solicitud.numero}</TableCell>
                        <TableCell>{new Date(solicitud.fecha).toLocaleDateString()}</TableCell>
                        <TableCell>{solicitud.area}</TableCell>
                        <TableCell>{solicitud.solicitante}</TableCell>
                        <TableCell className="text-center">{solicitud.items}</TableCell>
                        <TableCell className="text-right">${solicitud.total.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={config.color}>
                            <Icon className="w-3 h-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVerDetalle(solicitud)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {(solicitud.estado === 'borrador' || solicitud.estado === 'rechazada') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditar(solicitud.id)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredSolicitudes.length > pageSize && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-muted-foreground">
                Mostrando {startIndex + 1}–
                {Math.min(startIndex + pageSize, filteredSolicitudes.length)} de {filteredSolicitudes.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span>
                  Página {safePage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Detalle */}
      <Dialog open={!!selectedSolicitud} onOpenChange={() => setSelectedSolicitud(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de Solicitud</DialogTitle>
            <DialogDescription>
              {selectedSolicitud?.numero}
            </DialogDescription>
          </DialogHeader>
          {selectedSolicitud && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Fecha</div>
                  <div className="font-medium">
                    {new Date(selectedSolicitud.fecha).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Estado</div>
                  <div>
                    <Badge className={estadoConfig[selectedSolicitud.estado].color}>
                      {estadoConfig[selectedSolicitud.estado].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Área</div>
                  <div className="font-medium">{selectedSolicitud.area}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Solicitante</div>
                  <div className="font-medium">{selectedSolicitud.solicitante}</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-2">Resumen</div>
                <div className="flex justify-between items-center">
                  <span>Total de items:</span>
                  <span className="font-medium">
                    {detalleSeleccionado.reduce((acc, d) => acc + (d.CantidadSolicitada ?? 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-lg mt-2">
                  <span>Total:</span>
                  <span className="font-medium">
                    $
                    {detalleSeleccionado
                      .reduce(
                        (acc, d) => acc + (d.UltimoPrecioCompra ?? 0) * (d.CantidadSolicitada ?? 0),
                        0,
                      )
                      .toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="text-sm text-muted-foreground mb-2">Detalle de materiales</div>
                {detalleLoading && (
                  <div className="text-sm text-muted-foreground">Cargando detalle...</div>
                )}
                {detalleError && (
                  <div className="text-sm text-red-600">{detalleError}</div>
                )}
                {!detalleLoading && !detalleError && detalleSeleccionado.length === 0 && (
                  <div className="text-sm text-muted-foreground">No hay líneas de detalle</div>
                )}
                {!detalleLoading && !detalleError && detalleSeleccionado.length > 0 && (
                  <div className="border rounded-md max-h-80 w-full max-w-full overflow-y-auto overflow-x-auto">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow className="bg-slate-50 sticky top-0 z-10">
                          <TableHead>N° Artículo</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead className="text-right">Cant. Solicitada</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead className="text-right">En stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detalleSeleccionado.map((d) => (
                          <TableRow key={d.IdDetalleSolicitud}>
                            <TableCell>{d.NumeroArticulo}</TableCell>
                            <TableCell>{d.DescripcionArticulo}</TableCell>
                            <TableCell className="text-right">{d.CantidadSolicitada}</TableCell>
                            <TableCell>{d.UnidadMedidaDetalle || d.UnidadMedidaMaterial}</TableCell>
                            <TableCell className="text-right">{d.EnStock ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {selectedSolicitud.comentarioRechazo && (
                <div className="border-t pt-4">
                  <div className="text-sm text-muted-foreground mb-2">Motivo de Rechazo</div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    {selectedSolicitud.comentarioRechazo}
                  </div>
                </div>
              )}

              {selectedSolicitud.observaciones && (
                <div className="border-t pt-4">
                  <div className="text-sm text-muted-foreground mb-2">Observaciones</div>
                  <div className="p-3 bg-slate-50 rounded-lg text-sm">
                    {selectedSolicitud.observaciones}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
