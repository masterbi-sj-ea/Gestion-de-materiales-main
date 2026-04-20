import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { sileo } from 'sileo';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Shield, Save, RotateCcw, CheckCircle, XCircle, Info } from 'lucide-react';
import { usePermisos } from '../contexts/PermisosContext';
import { UserRole } from '../types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

const rolesInfo: Partial<Record<UserRole, { nombre: string; descripcion: string; color: string }>> = {
  admin: {
    nombre: 'Administrador',
    descripcion: 'Acceso completo al sistema, gestión de usuarios y configuración',
    color: 'bg-purple-100 text-purple-700'
  },
  jefe_produccion: {
    nombre: 'Jefe de Producción',
    descripcion: 'Aprobación de solicitudes, control presupuestario y supervisión',
    color: 'bg-green-100 text-green-700'
  },
  solicitante: {
    nombre: 'Solicitante',
    descripcion: 'Creación de solicitudes de materiales para su área',
    color: 'bg-blue-100 text-blue-700'
  },
  bodeguero: {
    nombre: 'Encargado de Bodega',
    descripcion: 'Gestión de inventario y despacho de materiales',
    color: 'bg-orange-100 text-orange-700'
  }
};

function normalizeRoleKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isProductionChiefRole(value: string | null | undefined): boolean {
  return normalizeRoleKey(value) === 'jefe de produccion';
}

function isProtectedApprovalModule(rol: UserRole, moduloId: string): boolean {
  return isProductionChiefRole(rol) && String(moduloId || '').trim().toLowerCase() === 'aprobaciones';
}

export default function PermisosPage() {
  const { permisos, actualizarPermisos, modulos } = usePermisos();

  const availableRoles = useMemo(() => permisos.map((p) => p.rol), [permisos]);

  const [selectedRol, setSelectedRol] = useState<UserRole>('admin');
  const [editedPermisos, setEditedPermisos] = useState<Record<UserRole, string[]>>({} as Record<UserRole, string[]>);
  const [hasChanges, setHasChanges] = useState(false);

  // Sincronizar estado local cuando cambian los permisos desde el backend
  const ensureLocalFromBackend = () => {
    if (!permisos || permisos.length === 0) return;

    const inicial = permisos.reduce((acc, p) => ({ ...acc, [p.rol]: [...p.modulosPermitidos] }), {} as Record<UserRole, string[]>);
    if (Object.keys(editedPermisos).length === 0) {
      setEditedPermisos(inicial);
    }
  };
  ensureLocalFromBackend();

  const handleToggleModulo = (rol: UserRole, moduloId: string) => {
    setEditedPermisos(prev => {
      const modulosActuales = prev[rol] || [];
      if (isProtectedApprovalModule(rol, moduloId) && modulosActuales.includes(moduloId)) {
        sileo.show({
          title: 'Permiso obligatorio',
          description: 'Jefe de Producción debe conservar acceso y aprobación en el módulo Aprobaciones.',
        });
        return prev;
      }

      const nuevosModulos = modulosActuales.includes(moduloId)
        ? modulosActuales.filter(m => m !== moduloId)
        : [...modulosActuales, moduloId];
      
      setHasChanges(true);
      return { ...prev, [rol]: nuevosModulos };
    });
  };

  const handleGuardar = () => {
    Object.entries(editedPermisos).forEach(([rol, modulos]) => {
      actualizarPermisos(rol as UserRole, modulos);
    });
    setHasChanges(false);
    sileo.success({
      title: 'Permisos actualizados exitosamente',
      description: 'Los cambios de permisos se han guardado correctamente.',
    });
  };

  const handleRestaurar = () => {
    setEditedPermisos(
      permisos.reduce((acc, p) => ({ ...acc, [p.rol]: [...p.modulosPermitidos] }), {} as Record<UserRole, string[]>)
    );
    setHasChanges(false);
  };

  const handleSeleccionarTodo = (rol: UserRole) => {
    setEditedPermisos(prev => ({
      ...prev,
      [rol]: modulos.map(m => m.id)
    }));
    setHasChanges(true);
  };

  const handleDeseleccionarTodo = (rol: UserRole) => {
    setEditedPermisos(prev => ({
      ...prev,
      [rol]: []
    }));
    setHasChanges(true);
  };

  const modulosActivosPorRol = (rol: UserRole) => editedPermisos[rol]?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Gestión de Permisos por Rol</h1>
          <p className="text-muted-foreground mt-1">
            Configura qué módulos puede acceder cada rol del sistema
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleRestaurar}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Descartar
            </Button>
          )}
          <Button onClick={handleGuardar} disabled={!hasChanges}>
            <Save className="w-4 h-4 mr-2" />
            Guardar Cambios
          </Button>
        </div>
      </div>

      {/* Alerta de cambios pendientes */}
      {hasChanges && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            Tienes cambios sin guardar. Los cambios se aplicarán cuando hagas clic en "Guardar Cambios".
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        {availableRoles.map((rol) => {
          const info = rolesInfo[rol];
          const nombre = info?.nombre ?? rol;
          return (
            <Card key={rol}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">{nombre}</CardTitle>
                <Shield className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl">
                  {modulosActivosPorRol(rol)}/{modulos.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Módulos activos
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs por Rol */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración de Permisos</CardTitle>
          <CardDescription>
            Selecciona un rol para configurar sus permisos de acceso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={selectedRol}
            onValueChange={(value: UserRole) => setSelectedRol(value)}
          >
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${Math.max(availableRoles.length, 1)}, minmax(0, 1fr))` }}
            >
              {availableRoles.map((rol) => {
                const info = rolesInfo[rol];
                const nombre = info?.nombre ?? rol;
                return (
                  <TabsTrigger key={rol} value={rol}>
                    {nombre}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {availableRoles.map((rol) => {
              const info = rolesInfo[rol];
              const nombre = info?.nombre ?? rol;
              const descripcion = info?.descripcion ?? '';
              return (
                <TabsContent key={rol} value={rol} className="space-y-4">
                  {/* Info del Rol */}
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-1">{nombre}</div>
                      {descripcion && <div className="text-sm">{descripcion}</div>}
                    </AlertDescription>
                  </Alert>

                  {/* Acciones rápidas */}
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {modulosActivosPorRol(rol as UserRole)} de {modulos.length} módulos activos
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSeleccionarTodo(rol as UserRole)}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Seleccionar Todo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeseleccionarTodo(rol as UserRole)}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Deseleccionar Todo
                      </Button>
                    </div>
                  </div>

                  {/* Tabla de Módulos */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">Estado</TableHead>
                          <TableHead>Módulo</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead className="text-center">Ruta</TableHead>
                          <TableHead className="text-right">Acceso</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modulos.map((modulo) => {
                          const tieneAcceso = editedPermisos[rol as UserRole]?.includes(modulo.id);
                          const bloqueadoPorRol = isProtectedApprovalModule(rol as UserRole, modulo.id);

                          return (
                            <TableRow key={modulo.id}>
                              <TableCell>
                                {tieneAcceso ? (
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-gray-300" />
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{modulo.nombre}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {modulo.descripcion}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-mono text-xs">
                                  {modulo.path}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Switch
                                  checked={tieneAcceso}
                                  disabled={bloqueadoPorRol}
                                  onCheckedChange={() => handleToggleModulo(rol as UserRole, modulo.id)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* Vista Comparativa */}
      <Card>
        <CardHeader>
          <CardTitle>Matriz de Permisos</CardTitle>
          <CardDescription>
            Vista comparativa de accesos por rol
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Módulo</TableHead>
                  {availableRoles.map((rol) => {
                    const info = rolesInfo[rol];
                    const nombre = info?.nombre ?? rol;
                    return (
                      <TableHead key={rol} className="text-center min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>{nombre}</span>
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {modulos.map((modulo) => (
                  <TableRow key={modulo.id}>
                    <TableCell>
                      <div className="font-medium">{modulo.nombre}</div>
                      <div className="text-xs text-muted-foreground">{modulo.descripcion}</div>
                    </TableCell>
                    {availableRoles.map((rol) => {
                      const tieneAcceso = editedPermisos[rol as UserRole]?.includes(modulo.id);
                      return (
                        <TableCell key={rol} className="text-center">
                          {tieneAcceso ? (
                            <div className="flex justify-center">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <XCircle className="w-5 h-5 text-gray-300" />
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Información adicional */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="w-5 h-5 text-blue-600" />
            Información Importante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Los cambios en los permisos se aplican inmediatamente después de guardar</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Los usuarios deben cerrar sesión y volver a ingresar para ver los cambios</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>El rol Administrador siempre debe tener acceso a la gestión de usuarios y permisos</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-600 mt-2" />
            <p>Se recomienda probar los cambios con un usuario de prueba antes de aplicarlos a producción</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
