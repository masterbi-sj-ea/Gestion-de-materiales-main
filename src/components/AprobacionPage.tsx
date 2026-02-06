import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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
      const headers = { Authorization: `Bearer ${token}` };
      const [pendResp, aprResp, rejResp] = await Promise.all([
        fetch('http://localhost:4000/api/solicitudes?estado=PENDIENTE', { headers }),
        fetch('http://localhost:4000/api/solicitudes?estado=APROBADA', { headers }),
        fetch('http://localhost:4000/api/solicitudes?estado=RECHAZADA', { headers }),
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
        const resp = await fetch(`http://localhost:4000/api/solicitudes/${selectedSolicitud.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
      alert('Debes ingresar un comentario al rechazar la solicitud');
      return;
    }

    if (!selectedSolicitud || !token) return;

    try {
      const resp = await fetch(`http://localhost:4000/api/solicitudes/${selectedSolicitud.id}/aprobaciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          estado: modalAction === 'aprobar' ? 'APROBADA' : 'RECHAZADA',
          comentario: comentario || null,
        }),
      });

      if (!resp.ok) {
        console.error('Error al registrar aprobación', await resp.text());
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
    }

    setSelectedSolicitud(null);
    setModalAction(null);
    setComentario('');
  };

  const renderTable = (solicitudes: Solicitud[], showActions: boolean = false) => (
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
            <TableHead>Estado Presup.</TableHead>
            {showActions && <TableHead className="text-right">Acciones</TableHead>}
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
              const disponible = solicitud.presupuestoArea - solicitud.consumoAcumulado;
              const saldoDespues = disponible - solicitud.total;
              const tienePresupuesto = solicitud.presupuestoArea > 0;
              
              return (
                <TableRow key={solicitud.id}>
                  <TableCell className="font-medium">{solicitud.numero}</TableCell>
                  <TableCell>{new Date(solicitud.fecha.replace('Z', '')).toLocaleDateString()}</TableCell>
                  <TableCell>{solicitud.area}</TableCell>
                  <TableCell>{solicitud.solicitante}</TableCell>
                  <TableCell className="text-center">{solicitud.items}</TableCell>
                  <TableCell className="text-right">${solicitud.total.toLocaleString()}</TableCell>
                  <TableCell>
                    {!tienePresupuesto ? (
                      <Badge variant="outline" className="gap-1">
                        N/D
                      </Badge>
                    ) : solicitud.excedePresupuesto ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Excede
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        OK
                      </Badge>
                    )}
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenModal(solicitud, 'ver')}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => handleOpenModal(solicitud, 'aprobar')}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
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
            <Clock className="w-4 h-4 text-yellow-600" />
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
            <CheckCircle className="w-4 h-4 text-green-600" />
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
            <XCircle className="w-4 h-4 text-red-600" />
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
              <Card className={selectedSolicitud.excedePresupuesto ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'}>
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
                    <span className="font-medium text-green-600">
                      ${(selectedSolicitud.presupuestoArea - selectedSolicitud.consumoAcumulado).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">Saldo después de aprobación:</span>
                    <span className={`font-medium ${selectedSolicitud.excedePresupuesto ? 'text-red-600' : 'text-blue-600'}`}>
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
                <div className="bg-slate-100 p-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
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

          <DialogFooter>
            <Button
              variant="outline"
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
                onClick={handleConfirmarAccion}
                className={modalAction === 'rechazar' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                {modalAction === 'aprobar' ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Aprobar
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Rechazar
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
