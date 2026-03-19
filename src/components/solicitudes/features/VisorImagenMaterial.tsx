import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { ImageIcon } from 'lucide-react';
import { apiFetch } from '../../../services/apiClient';

interface VisorImagenMaterialProps {
  tieneImagen: boolean | number | null;
  rutaImagenFinal: string | null;
  descripcionArticulo: string;
  numeroArticulo: string;
  showThumbnail?: boolean;
}

export const VisorImagenMaterial: React.FC<VisorImagenMaterialProps> = ({
  tieneImagen,
  rutaImagenFinal,
  descripcionArticulo,
  numeroArticulo,
  showThumbnail = true,
}) => {
  const [open, setOpen] = useState(false);
  const [imgObjectUrl, setImgObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Para UX pro: permitimos abrir el visor aunque `tieneImagen` venga null/0.
  // Si no hay imagen, el endpoint responderá 404 y mostraremos el estado “Sin imagen”.
  const canOpen = !!numeroArticulo || !!rutaImagenFinal;

  // En el navegador no podemos pasar Authorization en <img src>. Por eso descargamos con apiFetch (Bearer)
  // y mostramos la imagen como blob (Object URL).
  const filename = useMemo(() => {
    if (!rutaImagenFinal) return null;
    const parts = String(rutaImagenFinal).split(/[/\\]+/).filter(Boolean);
    return parts[parts.length - 1] || null;
  }, [rutaImagenFinal]);

  useEffect(() => {
    if (!open) return;
    if (!canOpen) return;

    let revokedUrl: string | null = null;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        // Preferimos el endpoint por numeroArticulo (mismo que usa el preview en Crear Solicitud)
        // y dejamos fallback por filename/ruta.
        const endpoint = numeroArticulo
          ? `/materiales/imagen-archivo/${encodeURIComponent(String(numeroArticulo))}`
          : filename
            ? `/materiales/archivo/${encodeURIComponent(filename)}`
            : `/materiales/imagen?ruta=${encodeURIComponent(String(rutaImagenFinal))}`;

        const resp = await apiFetch(endpoint);
        if (resp.status === 404) {
          if (!cancelled) {
            setImgObjectUrl(null);
            setLoadError('No hay imagen disponible para este material');
          }
          return;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(text || `HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        revokedUrl = url;
        if (!cancelled) {
          setImgObjectUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e?.message || 'No se pudo cargar la imagen');
          setImgObjectUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
      setLoading(false);
    };
  }, [open, filename, rutaImagenFinal, showThumbnail, numeroArticulo, canOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 overflow-hidden rounded-lg border border-transparent p-0 hover:border-border hover:bg-accent"
          title="Ver imagen del artículo"
          disabled={!canOpen}
        >
          {showThumbnail && imgObjectUrl ? (
            <img src={imgObjectUrl} alt={descripcionArticulo} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className={canOpen ? 'h-4 w-4 text-muted-foreground' : 'h-4 w-4 text-slate-300'} />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-auto min-w-[200px] max-w-[250px] h-auto p-0 overflow-hidden flex flex-col hide-scrollbar border-slate-200">
        <div className="p-4 pb-2 pb-0 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{numeroArticulo}</DialogTitle>
            <DialogDescription className="text-xs line-clamp-2" title={descripcionArticulo}>
              {descripcionArticulo}
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <div className="flex-1 overflow-visible p-4 pt-2 flex flex-col justify-center items-center">
          <div className="relative flex w-[200px] h-[200px] items-center justify-center overflow-hidden rounded-lg bg-slate-50 border border-slate-100">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              </div>
            ) : loadError ? (
              <p className="px-2 text-center text-[10px] text-slate-500 font-medium">{loadError}</p>
            ) : imgObjectUrl ? (
              <img
                src={imgObjectUrl}
                alt={descripcionArticulo}
                className="max-h-[200px] max-w-[200px] object-cover h-full w-full"
              />
            ) : (
              <p className="px-2 text-center text-[10px] text-slate-500 font-medium">No hay imagen</p>
            )}
          </div>
        </div>
        
        <div className="p-2 pt-1 flex justify-center flex-shrink-0 bg-slate-50/50 mt-auto border-t">
          <Button onClick={() => setOpen(false)} variant="ghost" size="sm" className="h-7 text-xs hover:bg-slate-200 w-full rounded-none">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
