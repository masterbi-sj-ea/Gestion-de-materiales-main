import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Edit, Trash2, Shield } from 'lucide-react';
import { API_BASE_URL } from '../services/apiConfig';

interface Rol {
  id: number;
  nombre: string;
  descripcion?: string | null;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRol, setEditingRol] = useState<Rol | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const { token } = useAuth();

  const cargarRoles = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/roles`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: Rol[] = (data as any[]).map((r) => ({
        id: r.IdRol as number,
        nombre: r.Nombre as string,
        descripcion: (r.Descripcion as string) ?? null,
      }));
      setRoles(mapped);
      setTotal(mapped.length);
      setPage(1);
    } catch (error) {
      console.error('Error al cargar roles', error);
    }
  };

  useEffect(() => {
    if (!token) return;
    cargarRoles();
  }, [token, page, pageSize]);

  const handleOpenDialog = (rol?: Rol) => {
    setEditingRol(rol || null);
    setNombre(rol?.nombre || '');
    setDescripcion(rol?.descripcion || '');
    setDialogOpen(true);
  };

  const handleGuardar = async () => {
    if (!nombre) return;

    try {
      if (editingRol) {
        await fetch(`${API_BASE_URL}/roles/${editingRol.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ nombre, descripcion }),
        });
      } else {
        await fetch(`${API_BASE_URL}/roles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ nombre, descripcion }),
        });
      }

      setDialogOpen(false);
      await cargarRoles();
    } catch (error) {
      console.error('Error al guardar rol', error);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este rol?')) return;
    try {
      await fetch(`${API_BASE_URL}/roles/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await cargarRoles();
    } catch (error) {
      console.error('Error al eliminar rol', error);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Gestión de Roles</h1>
          <p className="text-muted-foreground mt-1">
            Administración de roles del sistema
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Rol
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingRol ? 'Editar Rol' : 'Nuevo Rol'}</DialogTitle>
              <DialogDescription>
                {editingRol ? 'Modifica la información del rol' : 'Crea un nuevo rol para el sistema'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="nombre-rol">Nombre</Label>
                <Input
                  id="nombre-rol"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="admin, solicitante, jefe_produccion, bodeguero"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descripcion-rol">Descripción</Label>
                <Input
                  id="descripcion-rol"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Descripción del rol"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGuardar}>
                {editingRol ? 'Guardar Cambios' : 'Crear Rol'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Roles ({total})
          </CardTitle>
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
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      No se encontraron roles
                    </TableCell>
                  </TableRow>
                ) : (
                  roles
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((rol) => (
                      <TableRow key={rol.id}>
                        <TableCell className="font-medium">{rol.nombre}</TableCell>
                        <TableCell>{rol.descripcion || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(rol)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEliminar(rol.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
