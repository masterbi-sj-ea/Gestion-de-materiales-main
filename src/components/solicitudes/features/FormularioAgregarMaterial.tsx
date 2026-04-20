import { useEffect, useRef, useState, type CSSProperties, memo } from "react";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { AlertTriangle, ImageIcon, Plus } from "lucide-react";
import { cn } from "../../ui/utils";
import { VisorImagenMaterial } from './VisorImagenMaterial';
import { MaterialDisponible, RecursoListado } from "../../../hooks/useCatalogosSolicitud";

interface FormularioAgregarMaterialProps {
  areaSeleccionada: boolean;
  recursosMaterial: RecursoListado[];
  selectedRecursoMaterialId: string;
  setSelectedRecursoMaterialId: (id: string) => void;
  codigoCuentaMaterial: string;
  isResolviendoRecurso: boolean;
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
  areaSeleccionada,
  recursosMaterial,
  selectedRecursoMaterialId,
  setSelectedRecursoMaterialId,
  codigoCuentaMaterial,
  isResolviendoRecurso,
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

  return (
    <Card className="border-slate-200/80 shadow-[0_18px_45px_-42px_rgba(15,23,42,0.45)]">
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {!materialSeleccionado && (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-700">Aún no has seleccionado un material</p>
              <p className="mt-1 text-sm text-slate-500">
                Usa los campos de Grupo de artículos y Material en la tarjeta superior para continuar.
              </p>
            </div>
          )}

          {/* Previsualización de Material */}
          {materialSeleccionado && (
            <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_20px_45px_-38px_rgba(15,23,42,0.42)] transition-all duration-300 animate-in fade-in slide-in-from-top-1">
              <div className="grid grid-cols-1 gap-0">
                
                {/* Columna Izquierda: Detalles */}
                <div className="flex flex-col">
                  {/* Cabecera y Título */}
                  <div className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.42),_rgba(255,255,255,0.98)_48%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.92))] px-4 py-4 sm:px-5 sm:py-5 flex-1">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                            <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
                            Detalle del Artículo
                          </span>
                          <span className={cn(
                            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                            imagenMaterialUrl 
                              ? "border-emerald-200/70 bg-emerald-50 text-emerald-700" 
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          )}>
                            {imagenEstadoLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold leading-none text-slate-700 shadow-sm">
                            <span>Unidad:</span>
                            <span className="text-[11px] font-semibold text-slate-900">{materialSeleccionado.unidadMedida}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold leading-none text-slate-700 shadow-sm">
                            <span>Stock actual:</span>
                            <span className="text-[11px] font-semibold text-slate-900">{stockFisico}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm">
                            {materialSeleccionado.grupoArticulos ?? 'General'}
                          </span>
                        </div>
                      </div>

                      {areaSeleccionada && !isResolviendoRecurso && recursosMaterial.length === 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white/85 px-3 py-2.5 shadow-sm">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                            {recursosMaterial[0].nombre}
                          </span>
                          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold text-slate-700 shadow-sm">
                            {codigoCuentaMaterial || 'N/A'}
                          </span>
                        </div>
                      )}

                      <div className="mt-1 space-y-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-slate-950 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                              {materialSeleccionado.numeroArticulo}
                            </span>
                          </div>
                        </div>

                        {stockRestante != null && cantidad && Number(cantidad) > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <span className="inline-flex items-center rounded-xl border border-blue-200/80 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 shadow-sm">
                              Restante: <span className="ml-1.5 font-bold text-blue-950">{stockRestante}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sección de Recurso */}
                  {areaSeleccionada && materialSeleccionado && (isResolviendoRecurso || recursosMaterial.length !== 1) && (
                    <div className="bg-white px-4 py-3.5 sm:px-5 border-t border-slate-100 flex-shrink-0">
                      {isResolviendoRecurso ? (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2 text-sm text-blue-700 animate-pulse">
                          Resolviendo configuración contable...
                        </div>
                      ) : recursosMaterial.length === 0 ? (
                        <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 text-sm text-red-700">
                          Sin configuración de recurso para el área. Imposible solicitar.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recurso</Label>
                            <Select value={selectedRecursoMaterialId} onValueChange={setSelectedRecursoMaterialId}>
                              <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm">
                                <SelectValue placeholder="Elegir recurso" />
                              </SelectTrigger>
                              <SelectContent>
                                {recursosMaterial.map((recurso) => (
                                  <SelectItem key={recurso.id} value={String(recurso.id)}>
                                    {recurso.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuenta</Label>
                            <Input value={codigoCuentaMaterial || 'Sin cuenta'} readOnly className="h-9 bg-slate-50 border-slate-200 text-sm opacity-80" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Columna Derecha: Imagen Compacta */}
              </div>

              {/* Fila Inferior: Visor de Imagen */}
              <div className="bg-slate-50/80 p-3 sm:p-4 border-t border-slate-200/80">
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
                        <ImageIcon className="mt-2 h-6 w-6 opacity-60" />
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

                  {/* Botón para ver la imagen en tamaño completo (modal) */}
                  {materialSeleccionado && (
                    <div className="mt-3 flex justify-center">
                      <VisorImagenMaterial
                        tieneImagen={materialSeleccionado.tieneImagen ?? null}
                        rutaImagenFinal={materialSeleccionado.rutaImagenFinal ?? null}
                        descripcionArticulo={materialSeleccionado.descripcionArticulo ?? ''}
                        numeroArticulo={materialSeleccionado.numeroArticulo ?? ''}
                        showThumbnail={false}
                      />
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Cantidad y Acción */}
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
                disabled={!materialSeleccionado || !cantidad || Number(cantidad) <= 0 || isResolviendoRecurso || recursosMaterial.length === 0 || (recursosMaterial.length > 1 && !selectedRecursoMaterialId)}
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
