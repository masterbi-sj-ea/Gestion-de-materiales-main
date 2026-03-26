import { useEffect, useMemo, useRef, useState, type CSSProperties, memo } from "react";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { AlertTriangle, ImageIcon, Plus } from "lucide-react";
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

async function getImageAspectRatio(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        resolve(null);
        return;
      }

      resolve(image.naturalWidth / image.naturalHeight);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function getImageViewportStyle(aspectRatio: number | null): CSSProperties {
  const safeRatio = aspectRatio && Number.isFinite(aspectRatio)
    ? Math.min(1.65, Math.max(0.72, aspectRatio))
    : 1;

  const profile =
    safeRatio < 0.9 ? 'portrait' :
    safeRatio > 1.15 ? 'landscape' :
    'square';

  const widthMap = {
    portrait: 380,
    square: 470,
    landscape: 620,
  } as const;

  return {
    width: `min(100%, ${widthMap[profile]}px)`,
    aspectRatio: safeRatio,
    maxHeight: '460px',
  };
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
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const stockFisico = stockActualSeleccionado ?? 0;
  const imagenEstadoLabel = imagenMaterialLoading
    ? 'Preparando imagen'
    : imagenMaterialUrl
      ? 'Imagen disponible'
      : imagenMaterialError
        ? 'Archivo no disponible'
        : 'Sin imagen disponible';
  const materialImageViewportStyle = getImageViewportStyle(imageAspectRatio);

  useEffect(() => {
    let cancelled = false;

    if (!imagenMaterialUrl) {
      setImageAspectRatio(null);
      return;
    }

    getImageAspectRatio(imagenMaterialUrl).then((ratio) => {
      if (!cancelled) {
        setImageAspectRatio(ratio);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imagenMaterialUrl]);

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
            <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_20px_45px_-38px_rgba(15,23,42,0.42)] transition-all duration-300 animate-in fade-in slide-in-from-top-1">
              <div className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.42),_rgba(255,255,255,0.98)_48%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.92))] px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                        <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
                        Vista previa
                      </span>
                      <span className="rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        {imagenEstadoLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-sm">
                        {materialSeleccionado.numeroArticulo}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm">
                        {materialSeleccionado.grupoArticulos ?? 'General'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Material seleccionado
                      </p>
                      <h4 className="mt-1 text-lg font-bold leading-tight text-slate-950 sm:text-[1.35rem]">
                        {materialSeleccionado.descripcionArticulo}
                      </h4>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                        Unidad: <span className="ml-1 font-semibold text-slate-900">{materialSeleccionado.unidadMedida}</span>
                      </span>
                      <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                        Stock actual: <span className="ml-1 font-semibold text-slate-900">{stockFisico}</span>
                      </span>
                      {stockRestante != null && cantidad && Number(cantidad) > 0 && (
                        <span className="inline-flex items-center rounded-2xl border border-blue-200/80 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 shadow-sm">
                          Restante tras solicitud:
                          <span className="ml-1 font-semibold text-blue-900">{stockRestante}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/80 p-3 sm:p-4">
                <div className="flex min-h-[240px] items-center justify-center overflow-auto rounded-[18px] border border-slate-200 bg-white p-3 shadow-inner sm:min-h-[300px] sm:p-5">
                  <div
                    className="mx-auto flex w-full items-center justify-center overflow-hidden rounded-[16px] bg-slate-50"
                    style={materialImageViewportStyle}
                  >
                    {imagenMaterialLoading ? (
                      <div className="h-full w-full animate-pulse rounded-[14px] bg-slate-100" />
                    ) : imagenMaterialUrl ? (
                      <img
                        src={imagenMaterialUrl}
                        alt={materialSeleccionado.descripcionArticulo}
                        className="h-full w-full rounded-[14px] object-contain mix-blend-multiply drop-shadow-sm"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center text-slate-300">
                        <span className="text-3xl font-black opacity-20">
                          {materialSeleccionado.numeroArticulo.charAt(0)}
                        </span>
                        <ImageIcon className="mt-2 h-6 w-6" />
                      </div>
                    )}
                  </div>
                </div>

                {imagenMaterialError && (
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{imagenMaterialError}</span>
                  </div>
                )}
              </div>
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
