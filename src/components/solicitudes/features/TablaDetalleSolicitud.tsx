import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Package, Trash2, Check, X, Pencil, DollarSign } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';

interface ItemSolicitud {
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
}

interface TablaDetalleSolicitudProps {
  items: ItemSolicitud[];
  total: number;
  editingIndex: number | null;
  editingCantidad: string;
  setEditingCantidad: (val: string) => void;
  onEditarItem: (index: number) => void;
  onGuardarEdicionItem: () => void;
  onCancelarEdicionItem: () => void;
  onEliminarItem: (index: number) => void;
}

export const TablaDetalleSolicitud: React.FC<TablaDetalleSolicitudProps> = ({
  items,
  total,
  editingIndex,
  editingCantidad,
  setEditingCantidad,
  onEditarItem,
  onGuardarEdicionItem,
  onCancelarEdicionItem,
  onEliminarItem,
}) => {
  return (
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
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px]">Grupo</TableHead>
                    <TableHead className="min-w-[100px]">N° Artículo</TableHead>
                    <TableHead className="min-w-[200px]">Descripción</TableHead>
                    <TableHead className="min-w-[150px]">Área Destino</TableHead>
                    <TableHead className="min-w-[80px]">Unidad</TableHead>
                    <TableHead className="text-right min-w-[80px]">Stock</TableHead>
                    <TableHead className="text-right min-w-[120px]">Cantidad</TableHead>
                    <TableHead className="text-right min-w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.grupoArticulos || '-'}</TableCell>
                      <TableCell>{item.numeroArticulo}</TableCell>
                      <TableCell>{item.descripcionArticulo}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold">
                          {item.areaNombre || '-'}
                        </Badge>
                        <div className="text-[9px] text-muted-foreground mt-1">
                          {item.codigoCuenta || ''}
                        </div>
                      </TableCell>
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
                          onClick={() => onEliminarItem(index)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                        {editingIndex === index ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={onGuardarEdicionItem}
                            >
                              <Check className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={onCancelarEdicionItem}
                            >
                              <X className="w-4 h-4 text-slate-500" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditarItem(index)}
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
  );
};