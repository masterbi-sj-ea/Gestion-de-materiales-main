import { useRef } from "react";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Plus } from "lucide-react";
import { BuscarMaterial } from "../../BuscarMaterial";
import { MaterialDisponible } from "../../../hooks/useCatalogosSolicitud";

interface FormularioAgregarMaterialProps {
  gruposUnicos: string[];
  selectedGrupo: string;
  setSelectedGrupo: (grupo: string) => void;
  materialesFiltrados: MaterialDisponible[];
  selectedMaterialId: string;
  setSelectedMaterialId: (id: string) => void;
  cantidad: string;
  setCantidad: (cantidad: string) => void;
  onAgregarItem: () => void;
  materialSeleccionado: MaterialDisponible | null;
  stockActualSeleccionado: number | null;
  stockRestante: number | null;
}

export function FormularioAgregarMaterial({
  gruposUnicos,
  selectedGrupo,
  setSelectedGrupo,
  materialesFiltrados,
  selectedMaterialId,
  setSelectedMaterialId,
  cantidad,
  setCantidad,
  onAgregarItem,
  materialSeleccionado,
  stockActualSeleccionado,
  stockRestante,
}: FormularioAgregarMaterialProps) {
  const buscadorMaterialRef = useRef<HTMLInputElement>(null);
  const buscadorGrupoRef = useRef<HTMLInputElement>(null);
  const inputCantidadRef = useRef<HTMLInputElement>(null);

  const handleKeyDownCantidad = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAgregarItem();
      // Devolver foco al material después de un pequeño retraso
      // para permitir que el state se resetee y la tabla parpadee
      setTimeout(() => {
        buscadorMaterialRef.current?.focus();
      }, 100);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agregar Materiales</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_140px_120px]">
            <div className="space-y-2">
              <Label>Grupo de artículos</Label>
              <BuscarMaterial
                ref={buscadorGrupoRef}
                materiales={gruposUnicos.map((g, idx) => ({
                  idMaterial: idx,
                  numeroArticulo: "",
                  descripcionArticulo: g,
                  enStock: null,
                }))}
                value={selectedGrupo}
                onChange={(_id) => {
                  const idx = Number(_id);
                  if (!isNaN(idx) && gruposUnicos[idx]) {
                    setSelectedGrupo(gruposUnicos[idx]);
                    // Pasar foco al material cuando seleccionen grupo
                    setTimeout(() => {
                      buscadorMaterialRef.current?.focus();
                    }, 100);
                  }
                }}
                disabled={gruposUnicos.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label>Material</Label>
              <BuscarMaterial
                ref={buscadorMaterialRef}
                materiales={materialesFiltrados}
                value={selectedMaterialId}
                onChange={(id) => {
                  setSelectedMaterialId(id);
                  // Pasar foco a cantidad cuando seleccionen material
                  setTimeout(() => {
                    inputCantidadRef.current?.focus();
                  }, 100);
                }}
                disabled={materialesFiltrados.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                ref={inputCantidadRef}
                type="number"
                placeholder="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onKeyDown={handleKeyDownCantidad}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label className="opacity-0">Acción</Label>
              <Button onClick={onAgregarItem} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Agregar
              </Button>
            </div>
          </div>

          {materialSeleccionado && (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  N° artículo
                </Label>
                <Input
                  readOnly
                  value={materialSeleccionado.numeroArticulo}
                  className="bg-slate-50 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Unidad de medida
                </Label>
                <Input
                  readOnly
                  value={materialSeleccionado.unidadMedida}
                  className="bg-slate-50 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Stock actual
                </Label>
                <Input
                  readOnly
                  value={stockActualSeleccionado != null ? stockActualSeleccionado : ""}
                  className="bg-slate-50 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Stock después de solicitar
                </Label>
                <Input
                  readOnly
                  value={
                    stockRestante != null && !Number.isNaN(stockRestante)
                      ? stockRestante
                      : ""
                  }
                  className="bg-slate-50 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
