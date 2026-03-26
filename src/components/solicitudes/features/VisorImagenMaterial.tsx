import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
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

export const VisorImagenMaterial: React.FC<VisorImagenMaterialProps> = ({
  tieneImagen,
  rutaImagenFinal,
  descripcionArticulo,
  numeroArticulo,
  showThumbnail = true,
}) => {
  const [open, setOpen] = useState(false);

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);

  const [loadingThumb, setLoadingThumb] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const thumbUrlRef = useRef<string | null>(null);
  const fullUrlRef = useRef<string | null>(null);
  const canOpen = !!numeroArticulo;

  const buildEndpoint = (mode: 'thumb' | 'full') => {
    const query =
      mode === 'thumb'
        ? 'w=96&h=96&format=webp&q=60'
        : 'w=800&format=webp&q=75';

    return `/materiales/archivo/por-numero/${encodeURIComponent(String(numeroArticulo))}?${query}`;
  };

  const replaceThumbUrl = (nextUrl: string | null) => {
    if (thumbUrlRef.current && thumbUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(thumbUrlRef.current);
    }

    thumbUrlRef.current = nextUrl;
    setThumbUrl(nextUrl);
  };

  const replaceFullUrl = (nextUrl: string | null) => {
    if (fullUrlRef.current && fullUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(fullUrlRef.current);
    }

    fullUrlRef.current = nextUrl;
    setFullUrl(nextUrl);
  };

  useEffect(() => {
    replaceThumbUrl(null);
    replaceFullUrl(null);
    setLoadError(null);
    setImageAspectRatio(null);
  }, [numeroArticulo, rutaImagenFinal, tieneImagen]);

  useEffect(() => {
    return () => {
      if (thumbUrlRef.current) {
        URL.revokeObjectURL(thumbUrlRef.current);
      }

      if (fullUrlRef.current) {
        URL.revokeObjectURL(fullUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showThumbnail || !numeroArticulo) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      setLoadingThumb(true);

      try {
        const resp = await apiFetch(buildEndpoint('thumb'));

        if (resp.status === 204 || resp.status === 404) {
          if (!cancelled) replaceThumbUrl(null);
          return;
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          replaceThumbUrl(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          replaceThumbUrl(null);
        }
      } finally {
        if (!cancelled) setLoadingThumb(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [showThumbnail, numeroArticulo]);

  useEffect(() => {
    if (!open || !numeroArticulo) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      setLoadingFull(true);
      setLoadError(null);

      try {
        const resp = await apiFetch(buildEndpoint('full'));

        if (resp.status === 204 || resp.status === 404) {
          if (!cancelled) {
            replaceFullUrl(null);
            setLoadError('No hay imagen disponible para este material');
          }
          return;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(text || `HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        const ratio = await getImageAspectRatio(objectUrl);

        if (!cancelled) {
          replaceFullUrl(objectUrl);
          setImageAspectRatio(ratio);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (e: any) {
        if (!cancelled) {
          replaceFullUrl(null);
          setImageAspectRatio(null);
          setLoadError(e?.message || 'No se pudo cargar la imagen');
        }
      } finally {
        if (!cancelled) setLoadingFull(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [open, numeroArticulo]);

  const imageViewportStyle = getImageViewportStyle(imageAspectRatio);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          replaceFullUrl(null);
          setLoadError(null);
          setImageAspectRatio(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 overflow-hidden rounded-lg border border-transparent p-0 hover:border-border hover:bg-accent"
          title={canOpen ? 'Ver imagen del artículo' : 'Artículo sin número para consultar imagen'}
          disabled={!canOpen}
        >
          {showThumbnail && thumbUrl ? (
            <img src={thumbUrl} alt={descripcionArticulo} className="h-full w-full object-cover" />
          ) : loadingThumb ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          ) : (
            <ImageIcon className={canOpen ? 'h-4 w-4 text-muted-foreground' : 'h-4 w-4 text-slate-300'} />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[92vw] max-w-[880px] overflow-hidden border-slate-200 p-0">
        <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle>Imagen del artículo</DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-relaxed" title={descripcionArticulo}>
              {numeroArticulo ? `${numeroArticulo} · ${descripcionArticulo}` : descripcionArticulo}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="bg-slate-100/80 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex max-h-[72vh] min-h-[240px] items-center justify-center overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-inner sm:min-h-[300px] sm:p-5">
            <div
              className="mx-auto flex w-full items-center justify-center overflow-hidden rounded-xl bg-slate-50"
              style={imageViewportStyle}
            >
              {loadingFull ? (
                <span className="px-3 text-center text-slate-500">Cargando imagen...</span>
              ) : loadError ? (
                <span className="px-3 text-center text-red-500">{loadError}</span>
              ) : fullUrl ? (
                <img
                  src={fullUrl}
                  alt={descripcionArticulo}
                  className="h-full w-full rounded-lg object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="px-3 text-center text-slate-500">Sin imagen</span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t bg-slate-50/60 px-4 py-3 sm:px-6">
          <Button
            onClick={() => setOpen(false)}
            variant="ghost"
            size="sm"
            className="h-9 w-full rounded-xl text-sm hover:bg-slate-200"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
