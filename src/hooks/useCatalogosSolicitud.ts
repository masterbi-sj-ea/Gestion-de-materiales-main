import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../services/apiClient';

export interface MaterialDisponible {
  idMaterial: number;
  numeroArticulo: string;
  descripcionArticulo: string;
  unidadMedida: string;
  grupoArticulos: string | null;
  enStock: number | null;
  ultimoPrecioCompra: number | null;
  ultimaMonedaCompra: string | null;
  rutaImagenFinal?: string | null;
  tieneImagen?: number | boolean | null;
}

export interface AreaListado {
  id: number;
  codigo: string;
  nombre: string;
  idCentroCosto: number | null;
  centroCostoNombre: string | null;
}

export interface CatalogoListado {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface RecursoListado {
  id: number;
  nombre: string;
  catalogoId?: number | null;
  codigoCuenta?: string | null;
  nombreCuenta?: string | null;
}

interface MaterialesPermitidosResponse {
  materiales: MaterialDisponible[];
  applied: boolean;
}

interface CatalogosPermitidosResponse {
  catalogos: CatalogoListado[];
  applied: boolean;
}

function mapMaterial(raw: any): MaterialDisponible {
  return {
    idMaterial: raw.IdMaterial,
    numeroArticulo: raw.NumeroArticulo,
    descripcionArticulo: raw.DescripcionArticulo,
    unidadMedida: raw.UnidadMedida,
    grupoArticulos: raw.GrupoArticulos ?? null,
    enStock: raw.EnStock ?? null,
    ultimoPrecioCompra: raw.UltimoPrecioCompra ?? null,
    ultimaMonedaCompra: raw.UltimaMonedaCompra ?? null,
    rutaImagenFinal: raw.RutaImagenFinal ?? null,
    tieneImagen: raw.TieneImagen ?? null,
  };
}

function mapCatalogo(raw: any): CatalogoListado {
  return {
    id: Number(raw?.IdCatalogoSolicitud ?? raw?.idCatalogoSolicitud ?? raw?.IdCatalogo ?? raw?.id ?? 0),
    nombre: String(raw?.NombreCatalogo ?? raw?.nombre ?? raw?.Nombre ?? ''),
    descripcion: raw?.Descripcion ?? raw?.descripcion ?? null,
  };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || fallback;
  } catch {
    return fallback;
  }
}

export function useCatalogosSolicitud(
  token: string | null,
  idAreaDestino: string,
  idCatalogoSolicitud: string,
) {
  // 1. Cargar áreas inicialmente
  const { 
    data: datosBase, 
    error: errorBase,
    isLoading: isLoadingBase
  } = useQuery({
    queryKey: ['catalogosBase', token],
    queryFn: async () => {
      const areasResp = await apiFetch('/areas/mis-areas-permitidas');
      if (!areasResp.ok) throw new Error('No se pudieron cargar las áreas');

      const areasJson = await areasResp.json();

      const mappedAreas: AreaListado[] = (areasJson || [])
        .filter((a: any) => (a.Activo ?? a.activo) !== false)
        .map((a: any) => ({
          id: a.IdArea ?? a.id,
          codigo: a.Codigo ?? a.codigo,
          nombre: a.Nombre ?? a.nombre,
          idCentroCosto: a.IdCentroCosto ?? a.idCentroCosto ?? null,
          centroCostoNombre: a.CentroCostoNombre ?? a.centroCostoNombre ?? null,
        }));

      const uniqueAreas = Array.from(
        new Map<number, AreaListado>(mappedAreas.map((a) => [a.id, a])).values()
      );

      return { areas: uniqueAreas };
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutos de caché (evita recargas innecesarias)
  });

  const {
    data: catalogosData,
    error: errorCatalogosPermitidos,
    isLoading: isLoadingCatalogosPermitidos,
  } = useQuery({
    queryKey: ['catalogosPermitidosPorArea', token, idAreaDestino],
    queryFn: async () => {
      if (!idAreaDestino) {
        return { catalogos: [], applied: false } as CatalogosPermitidosResponse;
      }

      const resp = await apiFetch(`/coberturas-acceso/permitidos?areaId=${idAreaDestino}`);
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, 'No se pudieron cargar los catálogos permitidos'));
      }

      const json = await resp.json();
      if (Array.isArray(json)) {
        return {
          catalogos: json.map(mapCatalogo),
          applied: false,
        } as CatalogosPermitidosResponse;
      }

      return {
        catalogos: Array.isArray(json?.catalogos) ? json.catalogos.map(mapCatalogo) : [],
        applied: Boolean(json?.applied),
      } as CatalogosPermitidosResponse;
    },
    enabled: !!token && !!idAreaDestino,
    staleTime: 10 * 60 * 1000,
  });

  const catalogosIdsKey = (catalogosData?.catalogos || [])
    .map((catalogo) => String(catalogo.id))
    .sort()
    .join(',');

  // 2. Cargar materiales visibles para el usuario cuando cambia el área.
  const {
    data: materialesData,
    error: errorMateriales,
    isLoading: isLoadingMateriales,
  } = useQuery({
    queryKey: ['materialesPermitidosPorArea', token, idAreaDestino, idCatalogoSolicitud, Boolean(catalogosData?.applied), catalogosIdsKey],
    queryFn: async () => {
      if (!idAreaDestino) {
        return { materiales: [], applied: false } as MaterialesPermitidosResponse;
      }

      const catalogosPermitidos = catalogosData?.catalogos || [];
      const requiereSeleccionCatalogo = Boolean(catalogosData?.applied) && catalogosPermitidos.length > 1 && !idCatalogoSolicitud;
      if (requiereSeleccionCatalogo) {
        return { materiales: [], applied: true } as MaterialesPermitidosResponse;
      }

      const query = new URLSearchParams({ areaId: idAreaDestino });
      if (idCatalogoSolicitud) {
        query.set('catalogoId', idCatalogoSolicitud);
      }

      const resp = await apiFetch(`/materiales/permitidos?${query.toString()}`);
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, 'No se pudieron cargar los materiales permitidos'));
      }

      const json = await resp.json();
      if (Array.isArray(json)) {
        return {
          materiales: json.map(mapMaterial),
          applied: false,
        } as MaterialesPermitidosResponse;
      }

      return {
        materiales: Array.isArray(json?.materiales) ? json.materiales.map(mapMaterial) : [],
        applied: Boolean(json?.applied),
      } as MaterialesPermitidosResponse;
    },
    enabled: !!token && !!idAreaDestino && !isLoadingCatalogosPermitidos,
    staleTime: 10 * 60 * 1000, // 10 minutos
  });

  // Derivamos los errores combinados si alguno falla
  const errorCatalogos = errorBase || errorCatalogosPermitidos || errorMateriales 
    ? (errorBase?.message || errorCatalogosPermitidos?.message || errorMateriales?.message || 'Error al cargar los catálogos o recursos requeridos') 
    : null;

  return {
    materiales: idAreaDestino ? (materialesData?.materiales || []) : [],
    areas: datosBase?.areas || [],
    catalogos: idAreaDestino ? (catalogosData?.catalogos || []) : [],
    catalogosApplied: Boolean(catalogosData?.applied),
    materialesApplied: Boolean(materialesData?.applied),
    errorCatalogos,
    isLoadingBase,
    isLoadingCatalogosPermitidos,
    isLoadingMateriales,
  };
}