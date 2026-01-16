import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Search, Plus, Edit, Trash2, Users, Shield, UserCheck, Lock, Package } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  // Nombre de rol tal como viene de la BD (sin obligación de coincidir con códigos fijos)
  rol: string;
  area?: string;
  estado: 'activo' | 'inactivo';
  ultimoAcceso?: string;
  rolId?: number;
  areaId?: number;
}

const rolConfig = {
  admin: { label: 'Administrador', color: 'bg-purple-100 text-purple-700', icon: Shield },
  solicitante: { label: 'Solicitante', color: 'bg-blue-100 text-blue-700', icon: UserCheck },
  jefe_produccion: { label: 'Jefe de Producción', color: 'bg-green-100 text-green-700', icon: Users },
  bodeguero: { label: 'Encargado de Bodega', color: 'bg-orange-100 text-orange-700', icon: Package },
} as const;

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRol, setSelectedRol] = useState('todos');
  const [selectedEstado, setSelectedEstado] = useState('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRolId, setFormRolId] = useState<string>('');
  const [formAreaId, setFormAreaId] = useState<string>('');
  const [formEstado, setFormEstado] = useState<'activo' | 'inactivo'>('activo');
  const [roles, setRoles] = useState<{ id: number; nombre: string }[]>([]);
  const [areas, setAreas] = useState<{ id: number; nombre: string }[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const { token } = useAuth();

  const cargarUsuarios = async () => {
    try {
      const resp = await fetch('http://localhost:4000/api/usuarios', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: Usuario[] = (data as any[]).map((u) => ({
        id: String(u.IdUsuario),
        nombre: u.NombreCompleto,
        email: u.Email,
        // RolPrincipal viene directamente desde la BD y se muestra tal cual
        rol: u.RolPrincipal ?? '',
        rolId: u.IdRolPrincipal ?? undefined,
        estado: u.Activo ? 'activo' : 'inactivo',
        // Área principal del usuario (opcional)
        area: u.AreaNombre ?? undefined,
        areaId: u.IdArea ?? undefined,
        ultimoAcceso: u.FechaCreacion,
      }));
      setUsuarios(mapped);
      setTotal(mapped.length);
      setPage(1);
    } catch (error) {
      console.error('Error al cargar usuarios', error);
    }
  };

  const cargarRoles = async () => {
    try {
      const resp = await fetch('http://localhost:4000/api/roles', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped = (data as any[]).map((r) => ({ id: r.IdRol as number, nombre: r.Nombre as string }));
      setRoles(mapped);
    } catch (error) {
      console.error('Error al cargar roles', error);
    }
  };

  const cargarAreas = async () => {
    try {
      const resp = await fetch('http://localhost:4000/api/areas', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped = (data as any[]).map((a) => ({ id: a.IdArea as number, nombre: a.Nombre as string }));
      setAreas(mapped);
    } catch (error) {
      console.error('Error al cargar áreas', error);
    }
  };

  useEffect(() => {
    if (!token) return;
    cargarUsuarios();
    cargarRoles();
    cargarAreas();
  }, [token, page, pageSize]);

  const filteredUsuarios = usuarios.filter(user => {
    const matchesSearch = user.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRol = selectedRol === 'todos' || user.rol === selectedRol;
    const matchesEstado = selectedEstado === 'todos' || user.estado === selectedEstado;
    return matchesSearch && matchesRol && matchesEstado;
  });

  const handleOpenDialog = (usuario?: Usuario) => {
    setEditingUsuario(usuario || null);
    setFormNombre(usuario?.nombre || '');
    setFormEmail(usuario?.email || '');
    setFormRolId(usuario?.rolId ? String(usuario.rolId) : '');
    setFormAreaId(usuario?.areaId ? String(usuario.areaId) : '');
    setFormEstado(usuario?.estado || 'activo');
    setDialogOpen(true);
  };

  const handleGuardarUsuario = async () => {
    try {
      if (!formNombre || !formEmail) return;

      if (editingUsuario) {
        await fetch(`http://localhost:4000/api/usuarios/${editingUsuario.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            nombreCompleto: formNombre,
            email: formEmail,
            activo: formEstado === 'activo',
            idRolPrincipal: formRolId ? Number(formRolId) : null,
            idArea: formAreaId ? Number(formAreaId) : null,
          }),
        });
      } else {
        await fetch('http://localhost:4000/api/usuarios', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            nombreCompleto: formNombre,
            email: formEmail,
            hashPassword: '123456',
            activo: formEstado === 'activo',
            idRolPrincipal: formRolId ? Number(formRolId) : null,
            idArea: formAreaId ? Number(formAreaId) : null,
          }),
        });
      }

      setDialogOpen(false);
      await cargarUsuarios();
    } catch (error) {
      console.error('Error al guardar usuario', error);
    }
  };

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      await fetch(`http://localhost:4000/api/usuarios/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await cargarUsuarios();
    } catch (error) {
      console.error('Error al eliminar usuario', error);
    }
  };

  const handleResetPassword = (email: string) => {
    console.log('Enviando link de restablecimiento a:', email);
    alert(`Link de restablecimiento enviado a ${email}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Gestión de Usuarios</h1>
          <p className="text-muted-foreground mt-1">
            Administración de usuarios y roles del sistema
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingUsuario ? 'Editar Usuario' : 'Nuevo Usuario'}
              </DialogTitle>
              <DialogDescription>
                {editingUsuario ? 'Modifica la información del usuario' : 'Agrega un nuevo usuario al sistema'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre Completo</Label>
                  <Input
                    id="nombre"
                    placeholder="Juan Pérez"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rol">Rol</Label>
                  <Select value={formRolId} onValueChange={(value: string) => setFormRolId(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((rol) => (
                        <SelectItem key={rol.id} value={String(rol.id)}>
                          {rol.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="area">Área (opcional)</Label>
                  <Select value={formAreaId} onValueChange={(value: string) => setFormAreaId(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar área" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Solo para rol Solicitante
                  </p>
                </div>
              </div>
              {!editingUsuario && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password-confirm">Confirmar Contraseña</Label>
                      <Input
                        id="password-confirm"
                        type="password"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Select value={formEstado} onValueChange={(value: 'activo' | 'inactivo') => setFormEstado(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGuardarUsuario}>
                {editingUsuario ? 'Guardar Cambios' : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Usuarios</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              En el sistema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Activos</CardTitle>
            <UserCheck className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-green-600">
              {usuarios.filter(u => u.estado === 'activo').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Usuarios activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Administradores</CardTitle>
            <Shield className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {usuarios.filter(u => u.rol === 'admin').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Con privilegios completos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Solicitantes</CardTitle>
            <UserCheck className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {usuarios.filter(u => u.rol === 'solicitante').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Por área
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedRol} onValueChange={setSelectedRol}>
              <SelectTrigger>
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los roles</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="solicitante">Solicitante</SelectItem>
                <SelectItem value="jefe_produccion">Jefe de Producción</SelectItem>
                <SelectItem value="bodeguero">Encargado de Bodega</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedEstado} onValueChange={setSelectedEstado}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Usuarios */}
      <Card>
        <CardHeader>
          <CardTitle>Usuarios ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
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
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Último Acceso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsuarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No se encontraron usuarios
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsuarios
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((usuario) => {
                    const config = rolConfig[usuario.rol as keyof typeof rolConfig];
                    return (
                      <TableRow key={usuario.id}>
                        <TableCell className="font-medium">{usuario.nombre}</TableCell>
                        <TableCell>{usuario.email}</TableCell>
                        <TableCell>
                          {config ? (
                            <Badge className={config.color}>
                              <config.icon className="w-3 h-3 mr-1" />
                              {config.label}
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700">
                              {usuario.rol || 'Sin rol'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{usuario.area || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {usuario.ultimoAcceso ? new Date(usuario.ultimoAcceso).toLocaleString() : 'Nunca'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={usuario.estado === 'activo' ? 'secondary' : 'outline'}>
                            {usuario.estado === 'activo' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResetPassword(usuario.email)}
                            >
                              <Lock className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(usuario)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEliminar(usuario.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
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

      {/* Información de Roles */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5 text-blue-600" />
            Permisos por Rol
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="font-medium mb-2 flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-700">Administrador</Badge>
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Acceso completo al sistema</li>
              <li>• Gestión de usuarios y roles</li>
              <li>• Configuración de presupuestos</li>
              <li>• Configuración de reportes</li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-2 flex items-center gap-2">
              <Badge className="bg-green-100 text-green-700">Jefe de Producción</Badge>
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Aprobar o rechazar solicitudes</li>
              <li>• Ver impacto presupuestario</li>
              <li>• Acceso a reportes y auditoría</li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-2 flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-700">Solicitante</Badge>
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Crear solicitudes de materiales</li>
              <li>• Ver stock y presupuesto de su área</li>
              <li>• Editar solicitudes rechazadas</li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-2 flex items-center gap-2">
              <Badge className="bg-orange-100 text-orange-700">Encargado de Bodega</Badge>
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Gestionar despachos</li>
              <li>• Control de inventario</li>
              <li>• Registrar salidas de materiales</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}