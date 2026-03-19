import { useRef, useMemo, memo } from "react";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Plus } from "lucide-react";
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
  imagenMaterialUrl: string | null;
  imagenMaterialLoading: boolean;
  imagenMaterialError: string | null;
  stockActualSeleccionado: number | null;
  stockRestante: number | null;
}

export const FormularioAgregarMaterial = memo(function FormularioAgregarMaterial({
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
  imagenMaterialUrl,
  imagenMaterialLoading,
  imagenMaterialError,
  stockActualSeleccionado,
  stockRestante,
}: FormularioAgregarMaterialProps) {
  const inputCantidadRef = useRef<HTMLInputElement>(null);

  const handleKeyDownCantidad = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAgregarItem();
    }
  };

  // Optimización de rendimiento: Memoizar listas grandes para evitar recalcular
  // un montón de elementos SelectItem en cada re-render (ej. al escribir la cantidad)
  const memoizedGrupos = useMemo(() => {
    return gruposUnicos.map((g) => (
      <SelectItem key={g} value={g}>
        {g}
      </SelectItem>
    ));
  }, [gruposUnicos]);

  const memoizedMateriales = useMemo(() => {
    // Si la lista de materiales es exageradamente grande, limitemos lo que se renderiza
    // en el DOM para evitar que el navegador se congele al intentar abrir el selector.
    const MUST_TRUNCATE = materialesFiltrados.length > 500;
    const itemsToRender = MUST_TRUNCATE ? materialesFiltrados.slice(0, 500) : materialesFiltrados;
    
    return itemsToRender.map((m) => (
      <SelectItem key={m.idMaterial} value={String(m.idMaterial)}>
        {m.numeroArticulo} - {m.descripcionArticulo}
      </SelectItem>
    ));
  }, [materialesFiltrados]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agregar Materiales</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {/* Fila 1: Selección de Grupo y Material */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Grupo de artículos</Label>
              <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Seleccionar grupo..." />
                </SelectTrigger>
                <SelectContent>
                  {memoizedGrupos}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Material {materialesFiltrados.length > 500 && "(Mostrando 500)"}
              </Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Seleccionar material..." />
                </SelectTrigger>
                <SelectContent>
                  {memoizedMateriales}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fila 2: Previsualización de Material (Aparece al seleccionar uno) */}
          {materialSeleccionado && (
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col sm:flex-row transition-all duration-300 animate-in fade-in slide-in-from-top-1">
              
              {/* Bloque Izquierdo: Imagen */}
              <div className="w-full sm:w-28 h-28 sm:h-auto bg-slate-50 flex-shrink-0 flex items-center justify-center p-3 relative group">
                {imagenMaterialLoading ? (
                  <div className="absolute inset-0 animate-pulse bg-slate-100" />
                ) : imagenMaterialUrl ? (
                  <img
                    src={imagenMaterialUrl}
                    alt={materialSeleccionado.descripcionArticulo}
                    className="max-w-full max-h-full object-contain mix-blend-multiply drop-shadow-sm transition-transform group-hover:scale-110"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <span className="text-2xl font-black opacity-20">
                      {materialSeleccionado.numeroArticulo.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Bloque Central: Info Principal */}
              <div className="flex-grow p-4 sm:py-3 sm:px-5 flex flex-col justify-center border-b sm:border-b-0 sm:border-r border-slate-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-blue-600 tracking-tighter uppercase px-1.5 py-0.5 bg-blue-50 rounded">
                    {materialSeleccionado.numeroArticulo}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                    {materialSeleccionado.grupoArticulos ?? 'General'}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-800 leading-tight">
                  {materialSeleccionado.descripcionArticulo}
                </h4>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Disponible: {stockActualSeleccionado ?? 0} {materialSeleccionado.unidadMedida}
                </div>
              </div>

              {/* Bloque Derecho: Métricas Pro */}
              <div className="bg-slate-50/30 sm:w-44 p-4 sm:p-3 flex sm:flex-col justify-around sm:justify-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Stock Físico</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-slate-700">{stockActualSeleccionado ?? '-'}</span>
                    <span className="text-[9px] font-medium text-slate-400 uppercase">{materialSeleccionado.unidadMedida}</span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disponibilidad</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-lg font-black ${ (stockRestante ?? 0) < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                      {stockRestante ?? '-'}
                    </span>
                    <div className={`px-1 rounded text-[8px] font-bold uppercase ${ (stockRestante ?? 0) < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                      {(stockRestante ?? 0) < 0 ? 'Insuficiente' : 'OK'}
                    </div>
                  </div>
                </div>
              </div>

              {imagenMaterialError && (
                <div className="absolute top-2 right-2 group-hover:opacity-100 transition-opacity">
                   <div className="h-2 w-2 rounded-full bg-yellow-400" title={imagenMaterialError}></div>
                </div>
              )}
            </div>
          )}

          {/* Fila 3: Cantidad y Botón Agregar (Solo visible si hay material seleccionado) */}
          <div className={`grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4 items-end pt-2 transition-all duration-500 ${!materialSeleccionado ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cantidad a solicitar</Label>
              <Input
                ref={inputCantidadRef}
                type="number"
                placeholder="Ingresa la cantidad..."
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onKeyDown={handleKeyDownCantidad}
                disabled={!materialSeleccionado}
                min="1"
                className="h-12 bg-slate-50 border-slate-200 text-xl font-bold text-blue-700 focus:bg-white"
              />
            </div>
            <div className="w-full">
              <Button 
                onClick={onAgregarItem} 
                disabled={!materialSeleccionado || !cantidad || Number(cantidad) <= 0}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-100 uppercase tracking-wider active:scale-[0.97] transition-all disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none"
              >
                <Plus className="w-5 h-5 mr-2 stroke-[3]" />
                Agregar Ítem al Detalle
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
