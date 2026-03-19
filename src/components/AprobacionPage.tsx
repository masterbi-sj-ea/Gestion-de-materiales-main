import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { sileo } from 'sileo';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CheckCircle, XCircle, Eye, Clock, AlertCircle, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { apiFetch } from '../services/apiClient';

interface Solicitud {
  id: string;
  numero: string;
  fecha: string;
  area: string;
  solicitante: string;
  items: number;
  total: number;
  presupuestoArea: number;
  consumoAcumulado: number;
  excedePresupuesto: boolean;
  fechaAprobacion?: string;
}

export default function AprobacionPage() {
  const { token } = useAuth();
  const [pendientes, setPendientes] = useState<Solicitud[]>([]);
  const [aprobadas, setAprobadas] = useState<Solicitud[]>([]);
  const [rechazadas, setRechazadas] = useState<Solicitud[]>([]);
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [detalleSolicitud, setDetalleSolicitud] = useState<any[]>([]);
  const [modalAction, setModalAction] = useState<'aprobar' | 'rechazar' | 'ver' | null>(null);
  const [comentario, setComentario] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const mapSolicitud = (s: any): Solicitud => ({
    id: String(s.IdSolicitud ?? s.id ?? ''),
    numero: s.CodigoSolicitud ?? s.numero ?? '-',
    fecha: s.FechaSolicitud ?? s.fecha ?? new Date().toISOString(),
    area: s.AreaNombre ?? s.area ?? 'Sin área',
    solicitante: s.NombreSolicitante ?? s.solicitante ?? 'Sin solicitante',
    items: Number(s.TotalItems ?? s.items ?? 0),
    total: Number(s.TotalMonto ?? s.total ?? 0),
    presupuestoArea: Number(s.PresupuestoArea ?? 0),
    consumoAcumulado: Number(s.ConsumoAcumulado ?? 0),
    excedePresupuesto:
      Number(s.PresupuestoArea ?? 0) > 0
        ? Number(s.ConsumoAcumulado ?? 0) + Number(s.TotalMonto ?? 0) > Number(s.PresupuestoArea ?? 0)
        : false,
    fechaAprobacion: s.FechaAprobacion,
  });

  const cargarSolicitudes = async () => {
    if (!token) return;
    setCargando(true);
    try {
      const [pendResp, aprResp, rejResp] = await Promise.all([
        apiFetch('/solicitudes?estado=PENDIENTE'),
        apiFetch('/solicitudes?estado=APROBADA'),
        apiFetch('/solicitudes?estado=RECHAZADA'),
      ]);

      const [pendJson, aprJson, rejJson] = await Promise.all([
        pendResp.ok ? pendResp.json() : [],
        aprResp.ok ? aprResp.json() : [],
        rejResp.ok ? rejResp.json() : [],
      ]);

      setPendientes((pendJson || []).map(mapSolicitud));
      setAprobadas((aprJson || []).map(mapSolicitud));
      setRechazadas((rejJson || []).map(mapSolicitud));
    } catch (error) {
      console.error('Error al cargar aprobaciones', error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, [token]);

  useEffect(() => {
    if (!selectedSolicitud || !token) return;

    const cargarDetalle = async () => {
      setCargandoDetalle(true);
      try {
        const resp = await apiFetch(`/solicitudes/${selectedSolicitud.id}`);
        if (resp.ok) {
          const data = await resp.json();
          setDetalleSolicitud(data.detalle || []);
        }
      } catch (error) {
        console.error('Error al cargar detalle', error);
      } finally {
        setCargandoDetalle(false);
      }
    };

    cargarDetalle();
  }, [selectedSolicitud, token]);

  const handleOpenModal = (solicitud: Solicitud, action: 'aprobar' | 'rechazar' | 'ver') => {
    setSelectedSolicitud(solicitud);
    setModalAction(action);
    setComentario('');
    setDetalleSolicitud([]);
  };

  const handleConfirmarAccion = async () => {
    if (modalAction === 'rechazar' && !comentario.trim()) {
      sileo.error('Comentario requerido', { description: 'Debes ingresar un comentario al rechazar la solicitud.' });
      return;
    }

    if (!selectedSolicitud || !token) return;

    try {
      const resp = await apiFetch(`/solicitudes/${selectedSolicitud.id}/aprobaciones`, {
        method: 'POST',
        body: JSON.stringify({
          estado: modalAction === 'aprobar' ? 'APROBADA' : 'RECHAZADA',
          comentario: comentario || null,
        }),
      });

      if (!resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await resp.json().catch(() => null)
          : await resp.text().catch(() => null);

        const message =
          (payload && typeof payload === 'object' && 'message' in payload ? (payload as any).message : null) ||
          (typeof payload === 'string' ? payload : null) ||
          'Error al registrar aprobación';

        console.error('Error al registrar aprobación', message);
        sileo.error('Error al registrar aprobación', { description: message });
        return;
      }

      const actualizada = selectedSolicitud;
      setPendientes((prev) => prev.filter((s) => s.id !== selectedSolicitud.id));
      if (modalAction === 'aprobar') {
        setAprobadas((prev) => [actualizada, ...prev]);
      } else {
        setRechazadas((prev) => [actualizada, ...prev]);
      }
    } catch (error) {
      console.error('Error al aprobar/rechazar solicitud', error);
      sileo.error('Error al registrar aprobación', { description: 'Ocurrió un error al registrar la aprobación.' });
    }

    setSelectedSolicitud(null);
    setModalAction(null);
    setComentario('');
  };

  const formatDate = (iso: string) => new Date(String(iso).replace('Z', '')).toLocaleDateString();
  const formatCurrency = (value: number) => `$${Number(value || 0).toLocaleString()}`;

  const renderTable = (solicitudes: Solicitud[], showActions: boolean = false) => (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-muted/30">
            <TableHead className="text-xs font-semibold text-muted-foreground">Número</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">Fecha</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">Área</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">Solicitante</TableHead>
            <TableHead className="text-center text-xs font-semibold text-muted-foreground">Items</TableHead>
            <TableHead className="text-right text-xs font-semibold text-muted-foreground">Total</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">Estado Presup.</TableHead>
            {showActions && <TableHead className="text-right text-xs font-semibold text-muted-foreground">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {solicitudes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showActions ? 8 : 7} className="text-center py-12 text-muted-foreground">
                {cargando ? 'Cargando...' : 'No hay solicitudes en este estado'}
              </TableCell>
            </TableRow>
          ) : (
            solicitudes.map((solicitud) => {
              const tienePresupuesto = solicitud.presupuestoArea > 0;

              return (
                <TableRow key={solicitud.id}>
                  <TableCell className="font-medium tabular-nums">{solicitud.numero}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(solicitud.fecha)}</TableCell>
                  <TableCell className="max-w-[260px] truncate" title={solicitud.area}>
                    {solicitud.area}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate" title={solicitud.solicitante}>
                    {solicitud.solicitante}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{solicitud.items}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(solicitud.total)}</TableCell>
                  <TableCell>
                    {!tienePresupuesto ? (
                      <Badge variant="outline">N/D</Badge>
                    ) : solicitud.excedePresupuesto ? (
                      <Badge variant="destructive">
                        <AlertCircle className="w-3 h-3" />
                        Excede
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <CheckCircle className="w-3 h-3" />
                        OK
                      </Badge>
                    )}
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Ver detalle"
                          title="Ver detalle"
                          onClick={() => handleOpenModal(solicitud, 'ver')}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-primary hover:text-primary"
                          aria-label="Aprobar"
                          title="Aprobar"
                          onClick={() => handleOpenModal(solicitud, 'aprobar')}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          aria-label="Rechazar"
                          title="Rechazar"
                          onClick={() => handleOpenModal(solicitud, 'rechazar')}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  const aprobadasHoy = useMemo(() => {
    const hoy = new Date().toDateString();
    return aprobadas.filter((s) => {
      if (!s.fechaAprobacion) return false;
      return new Date(s.fechaAprobacion.replace('Z', '')).toDateString() === hoy;
    });
  }, [aprobadas]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Gestión de Aprobaciones</h1>
        <p className="text-muted-foreground mt-1">
          Revisar y aprobar solicitudes de materiales
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Pendientes</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{pendientes.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Requieren revisión
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Aprobadas Hoy</CardTitle>
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{aprobadasHoy.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: ${aprobadasHoy.reduce((sum, s) => sum + s.total, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Rechazadas</CardTitle>
            <XCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{rechazadas.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Esta semana
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="pendientes">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pendientes">
                Pendientes ({pendientes.length})
              </TabsTrigger>
              <TabsTrigger value="aprobadas">
                Aprobadas ({aprobadas.length})
              </TabsTrigger>
              <TabsTrigger value="rechazadas">
                Rechazadas ({rechazadas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes" className="mt-6">
              {renderTable(pendientes, true)}
            </TabsContent>

            <TabsContent value="aprobadas" className="mt-6">
              {renderTable(aprobadas, false)}
            </TabsContent>

            <TabsContent value="rechazadas" className="mt-6">
              {renderTable(rechazadas, false)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modal de Acción */}
      <Dialog open={!!modalAction} onOpenChange={() => {
        setModalAction(null);
        setSelectedSolicitud(null);
        setComentario('');
      }}>
        <DialogContent className="w-auto max-w-[95vw] sm:max-w-fit md:min-w-[700px]">
          <DialogHeader>
            <DialogTitle>
              {modalAction === 'ver'
                ? 'Detalle de Solicitud'
                : modalAction === 'aprobar'
                  ? 'Aprobar Solicitud'
                  : 'Rechazar Solicitud'}
            </DialogTitle>
            <DialogDescription>
              {selectedSolicitud?.numero}
            </DialogDescription>
          </DialogHeader>

          {selectedSolicitud && (
            <div className="space-y-4">
              {/* Información de la solicitud */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Área</div>
                  <div className="font-medium">{selectedSolicitud.area}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Solicitante</div>
                  <div className="font-medium">{selectedSolicitud.solicitante}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Items</div>
                  <div className="font-medium">{selectedSolicitud.items}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="font-medium">${selectedSolicitud.total.toLocaleString()}</div>
                </div>
              </div>

              {/* Análisis presupuestario */}
              <Card
                className={
                  selectedSolicitud.excedePresupuesto
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-primary/30 bg-primary/5'
                }
              >
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Análisis Presupuestario
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Presupuesto área:</span>
                    <span className="font-medium">${selectedSolicitud.presupuestoArea.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Consumo acumulado:</span>
                    <span className="font-medium">${selectedSolicitud.consumoAcumulado.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Disponible actual:</span>
                    <span className="font-medium text-primary">
                      ${(selectedSolicitud.presupuestoArea - selectedSolicitud.consumoAcumulado).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">Saldo después de aprobación:</span>
                    <span className={`font-medium ${selectedSolicitud.excedePresupuesto ? 'text-destructive' : 'text-primary'}`}>
                      ${(selectedSolicitud.presupuestoArea - selectedSolicitud.consumoAcumulado - selectedSolicitud.total).toLocaleString()}
                    </span>
                  </div>
                  {selectedSolicitud.excedePresupuesto && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Esta solicitud excede el presupuesto disponible del área
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Items de la solicitud */}
              <div className="border rounded-md overflow-hidden">
                <div className="bg-muted p-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Materiales solicitados
                </div>
                <div className="max-h-60 overflow-y-auto">
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead className="py-2 h-8 text-xs">Código</TableHead>
                        <TableHead className="py-2 h-8 text-xs">Descripción</TableHead>
                        <TableHead className="py-2 h-8 text-xs text-right">Cant.</TableHead>
                        <TableHead className="py-2 h-8 text-xs text-right">Unitario</TableHead>
                        <TableHead className="py-2 h-8 text-xs text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cargandoDetalle ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                            Cargando items...
                            </TableCell>
                        </TableRow>
                        ) : detalleSolicitud.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                            No se encontraron items.
                            </TableCell>
                        </TableRow>
                        ) : (
                        detalleSolicitud.map((item, idx) => (
                            <TableRow key={idx}>
                            <TableCell className="py-2 text-xs font-medium">{item.NumeroArticulo}</TableCell>
                            <TableCell className="py-2 text-xs">{item.DescripcionArticulo}</TableCell>
                            <TableCell className="py-2 text-xs text-right">{item.CantidadSolicitada} {item.UnidadMedidaMaterial}</TableCell>
                            <TableCell className="py-2 text-xs text-right">
                                ${(item.UltimoPrecioCompra ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="py-2 text-xs text-right font-semibold">
                                ${(Number(item.CantidadSolicitada ?? 0) * Number(item.UltimoPrecioCompra ?? 0)).toLocaleString()}
                            </TableCell>
                            </TableRow>
                        ))
                        )}
                    </TableBody>
                    </Table>
                </div>
              </div>

              {/* Comentario */}
              {modalAction === 'rechazar' && (
                <div className="space-y-2">
                  <Label htmlFor="comentario">
                    Motivo del Rechazo <span className="text-red-600">*</span>
                  </Label>
                  <Textarea
                    id="comentario"
                    placeholder="Ingresa el motivo del rechazo..."
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    rows={4}
                  />
                </div>
              )}

              {modalAction === 'aprobar' && (
                <div className="space-y-2">
                  <Label htmlFor="comentario">Comentario Opcional</Label>
                  <Textarea
                    id="comentario"
                    placeholder="Ingresa algún comentario si lo deseas..."
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto order-2 sm:order-1 font-semibold"
              onClick={() => {
                setModalAction(null);
                setSelectedSolicitud(null);
                setComentario('');
                setDetalleSolicitud([]);
              }}
            >
              {modalAction === 'ver' ? 'Cerrar' : 'Cancelar'}
            </Button>
            {modalAction !== 'ver' && (
              <Button
                size="lg"
                onClick={handleConfirmarAccion}
                variant={modalAction === 'rechazar' ? 'destructive' : 'default'}
                className={`w-full sm:min-w-[150px] order-1 sm:order-2 font-bold shadow-md transition-all active:scale-95 ${
                  modalAction === 'aprobar' ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-100' : ''
                }`}
              >
                {modalAction === 'aprobar' ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Confirmar Aprobación
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 mr-2" />
                    Confirmar Rechazo
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
