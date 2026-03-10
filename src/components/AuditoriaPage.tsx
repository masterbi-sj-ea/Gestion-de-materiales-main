import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../services/apiConfig';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Search, Eye, FileText, Edit, Trash2, CheckCircle, XCircle, Package } from 'lucide-react';
import { Button } from './ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface RegistroAuditoria {
  id: number;
  fecha: string;   // ISO string
  hora: string;    // HH:mm:ss
  usuario: string;
  rol: string;
  accion: 'crear' | 'editar' | 'eliminar' | 'aprobar' | 'rechazar' | 'despachar' | 'login' | 'otro';
  modulo: string;
  entidad: string;
  valorAnterior?: string;
  valorNuevo?: string;
  detalles: string;
}

const accionConfig = {
  crear: { label: 'Crear', icon: FileText, color: 'bg-green-100 text-green-700' },
  editar: { label: 'Editar', icon: Edit, color: 'bg-blue-100 text-blue-700' },
  eliminar: { label: 'Eliminar', icon: Trash2, color: 'bg-red-100 text-red-700' },
  aprobar: { label: 'Aprobar', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700' },
  rechazar: { label: 'Rechazar', icon: XCircle, color: 'bg-orange-100 text-orange-700' },
  despachar: { label: 'Despachar', icon: Package, color: 'bg-purple-100 text-purple-700' },
  login: { label: 'Login', icon: FileText, color: 'bg-slate-100 text-slate-700' },
  otro: { label: 'Otro', icon: FileText, color: 'bg-slate-100 text-slate-700' },
} as const;

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModulo, setSelectedModulo] = useState('todos');
  const [selectedAccion, setSelectedAccion] = useState('todas');
  const [selectedRegistro, setSelectedRegistro] = useState<RegistroAuditoria | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    const fetchAuditoria = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const resp = await fetch(`${API_BASE_URL}/auditoria?page=${page}&pageSize=${pageSize}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!resp.ok) return;
        const data = await resp.json() as {
          items: {
            IdAuditoria: number;
            FechaAccion: string;
            TipoAccion: string;
            DetalleJson: string | null;
            UsuarioNombre: string | null;
            Email: string | null;
            RolNombre: string | null;
          }[];
          total: number;
          page: number;
          pageSize: number;
        };

        const mapped: RegistroAuditoria[] = data.items.map(item => {
          const fechaObj = new Date(item.FechaAccion);
          const fecha = fechaObj.toISOString();
          const hora = fechaObj.toTimeString().substring(0, 8);

          let detalles = '';
          let modulo = '';
          let entidad = '';
          let rol = '';
          let valorAnterior: string | undefined;
          let valorNuevo: string | undefined;

          const tipo = item.TipoAccion.toUpperCase();

          if (item.DetalleJson) {
            try {
              const d = JSON.parse(item.DetalleJson);

              // Datos directos que vienen desde la BD
              detalles = d.detalles ?? d.descripcion ?? '';
              modulo = d.modulo ?? '';
              entidad = d.entidad ?? '';
              rol = d.rol ?? d.rolNombre ?? '';

              valorAnterior = d.valorAnterior;
              valorNuevo = d.valorNuevo;
            } catch {
              // Si el JSON viene mal formado, mostramos solo el tipo de acción, nunca el JSON crudo
              detalles = '';
            }
          }

          // Fallbacks suaves si faltan datos
          if (!modulo) {
            if (tipo.includes('ROL') || tipo.includes('PERMISO')) modulo = 'Roles y Permisos';
            else if (tipo.includes('USUARIO')) modulo = 'Usuarios';
            else if (tipo.includes('MATERIAL')) modulo = 'Materiales';
            else if (tipo.includes('SOLICITUD')) modulo = 'Solicitudes';
            else if (tipo.includes('DESPACH')) modulo = 'Despacho';
            else if (tipo.includes('LOGIN')) modulo = 'Autenticación';
            else modulo = 'General';
          }

          if (!entidad) {
            entidad = item.UsuarioNombre || item.Email || '';
          }

          // Si no vino rol en el detalle, usamos el que devuelve la API desde BD
          if (!rol && item.RolNombre) {
            rol = item.RolNombre;
          }

          if (!detalles) {
            detalles = item.TipoAccion;
          }

          const accionTipo = tipo;
          let accion: RegistroAuditoria['accion'] = 'otro';
          if (accionTipo.includes('CREAR')) accion = 'crear';
          else if (accionTipo.includes('EDITAR') || accionTipo.includes('ACTUALIZAR')) accion = 'editar';
          else if (accionTipo.includes('ELIMINAR') || accionTipo.includes('DESACTIVAR')) accion = 'eliminar';
          else if (accionTipo.includes('APROBAR')) accion = 'aprobar';
          else if (accionTipo.includes('RECHAZAR')) accion = 'rechazar';
          else if (accionTipo.includes('DESPACH')) accion = 'despachar';
          else if (accionTipo.includes('LOGIN')) accion = 'login';

          return {
            id: item.IdAuditoria,
            fecha,
            hora,
            usuario: item.UsuarioNombre || item.Email || 'Desconocido',
            rol,
            accion,
            modulo,
            entidad,
            valorAnterior,
            valorNuevo,
            detalles: detalles || item.TipoAccion,
          };
        });

        setRegistros(mapped);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditoria();
  }, [page, pageSize, token]);

  const filteredRegistros = registros.filter(reg => {
    const matchesSearch = reg.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         reg.entidad.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         reg.detalles.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModulo = selectedModulo === 'todos' || reg.modulo.toLowerCase() === selectedModulo;
    const matchesAccion = selectedAccion === 'todas' || reg.accion === selectedAccion;
    return matchesSearch && matchesModulo && matchesAccion;
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Registro de Auditoría</h1>
        <p className="text-muted-foreground mt-1">
          Historial completo de acciones en el sistema
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Registros</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Últimas 24 horas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Aprobaciones</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {registros.filter(r => r.accion === 'aprobar').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Solicitudes aprobadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Despachos</CardTitle>
            <Package className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {registros.filter(r => r.accion === 'despachar').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Completados hoy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Modificaciones</CardTitle>
            <Edit className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {registros.filter(r => r.accion === 'editar').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cambios registrados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Búsqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuario, entidad o detalle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedModulo} onValueChange={setSelectedModulo}>
              <SelectTrigger>
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los módulos</SelectItem>
                <SelectItem value="solicitudes">Solicitudes</SelectItem>
                <SelectItem value="materiales">Materiales</SelectItem>
                <SelectItem value="despacho">Despacho</SelectItem>
                <SelectItem value="presupuesto">Presupuesto</SelectItem>
                <SelectItem value="usuarios">Usuarios</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedAccion} onValueChange={setSelectedAccion}>
              <SelectTrigger>
                <SelectValue placeholder="Acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las acciones</SelectItem>
                <SelectItem value="crear">Crear</SelectItem>
                <SelectItem value="editar">Editar</SelectItem>
                <SelectItem value="eliminar">Eliminar</SelectItem>
                <SelectItem value="aprobar">Aprobar</SelectItem>
                <SelectItem value="rechazar">Rechazar</SelectItem>
                <SelectItem value="despachar">Despachar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Paginación */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
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

      {/* Tabla de Auditoría */}
      <Card>
        <CardHeader>
          <CardTitle>Registros de Auditoría ({filteredRegistros.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Detalles</TableHead>
                  <TableHead className="text-right">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-16 mt-1" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredRegistros.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No se encontraron registros con los filtros aplicados
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRegistros.map((registro) => {
                    const config = accionConfig[registro.accion];
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={registro.id}>
                        <TableCell className="font-medium">
                          <div>{new Date(registro.fecha).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">{registro.hora}</div>
                        </TableCell>
                        <TableCell>{registro.usuario}</TableCell>
                        <TableCell>
                          {registro.rol ? (
                            <Badge variant="outline">{registro.rol}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={config.color}>
                            <Icon className="w-3 h-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{registro.modulo}</TableCell>
                        <TableCell className="font-medium">{registro.entidad}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {registro.detalles}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedRegistro(registro)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalle */}
      <Dialog open={!!selectedRegistro} onOpenChange={() => setSelectedRegistro(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Registro de Auditoría</DialogTitle>
            <DialogDescription>
              ID: {selectedRegistro?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedRegistro && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Fecha</div>
                  <div className="font-medium">
                    {new Date(selectedRegistro.fecha).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Hora</div>
                  <div className="font-medium">{selectedRegistro.hora}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Usuario</div>
                  <div className="font-medium">{selectedRegistro.usuario}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Rol</div>
                  {selectedRegistro.rol ? (
                    <Badge variant="outline">{selectedRegistro.rol}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Módulo</div>
                  <div className="font-medium">{selectedRegistro.modulo}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Acción</div>
                  <Badge className={accionConfig[selectedRegistro.accion].color}>
                    {accionConfig[selectedRegistro.accion].label}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-2">Entidad Afectada</div>
                <div className="font-medium text-lg">{selectedRegistro.entidad}</div>
              </div>

              {(selectedRegistro.valorAnterior || selectedRegistro.valorNuevo) && (
                <div className="border-t pt-4">
                  <div className="text-sm text-muted-foreground mb-2">Cambios Realizados</div>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedRegistro.valorAnterior && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Valor Anterior</div>
                        <div className="font-medium">{selectedRegistro.valorAnterior}</div>
                      </div>
                    )}
                    {selectedRegistro.valorNuevo && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Valor Nuevo</div>
                        <div className="font-medium">{selectedRegistro.valorNuevo}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-2">Detalles</div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  {selectedRegistro.detalles}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
