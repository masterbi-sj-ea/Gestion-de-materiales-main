import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Input } from '../../ui/input';
import { AreaListado, RecursoListado } from '../../../hooks/useCatalogosSolicitud';

interface FormularioDestinoProps {
  areas: AreaListado[];
  recursos: RecursoListado[];
  idAreaDestino: string;
  setIdAreaDestino: (id: string) => void;
  idRecurso: string;
  setIdRecurso: (id: string) => void;
  codigoCuenta: string;
}

export const FormularioDestino: React.FC<FormularioDestinoProps> = ({
  areas,
  recursos,
  idAreaDestino,
  setIdAreaDestino,
  idRecurso,
  setIdRecurso,
  codigoCuenta,
}) => {
  return (
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
  );
};