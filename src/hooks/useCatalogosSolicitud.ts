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

export interface RecursoListado {
  id: number;
  nombre: string;
  catalogoId?: number | null;
}

interface RecursosVisiblesResponse {
  recursos: RecursoListado[];
  applied: boolean;
}

function mapRecurso(raw: any): RecursoListado {
  return {
    id: Number(raw?.IdRecurso ?? raw?.id ?? 0),
    nombre: String(raw?.Nombre ?? raw?.nombre ?? ''),
    catalogoId: raw?.IdCatalogoSolicitud ?? raw?.IdCatalogo ?? raw?.catalogoId ?? null,
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
  idRecurso: string
) {
  // 1. Cargar materiales y áreas inicialmente (se hace en paralelo y se cachea)
  const { 
    data: datosBase, 
    error: errorBase,
    isLoading: isLoadingBase
  } = useQuery({
    queryKey: ['catalogosBase', token],
    queryFn: async () => {
      const [matResp, areasResp] = await Promise.all([
        apiFetch('/materiales/con-stock'),
        apiFetch('/areas/mis-areas-permitidas'),
      ]);

      if (!matResp.ok) throw new Error('No se pudieron cargar los materiales');
      if (!areasResp.ok) throw new Error('No se pudieron cargar las áreas');

      const materialesJson = await matResp.json();
      const areasJson = await areasResp.json();

      const materiales: MaterialDisponible[] = (materialesJson || []).map((m: any) => ({
        idMaterial: m.IdMaterial,
        numeroArticulo: m.NumeroArticulo,
        descripcionArticulo: m.DescripcionArticulo,
        unidadMedida: m.UnidadMedida,
        grupoArticulos: m.GrupoArticulos ?? null,
        enStock: m.EnStock ?? null,
        ultimoPrecioCompra: m.UltimoPrecioCompra ?? null,
        ultimaMonedaCompra: m.UltimaMonedaCompra ?? null,
        rutaImagenFinal: m.RutaImagenFinal ?? null,
        tieneImagen: m.TieneImagen ?? null,
      }));

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

      return { materiales, areas: uniqueAreas };
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutos de caché (evita recargas innecesarias)
  });

  // 2. Cargar recursos visibles para el usuario cuando cambia el área.
  const { data: recursosData, error: errorRecursos, isLoading: isLoadingRecursos } = useQuery({
    queryKey: ['recursosVisiblesPorArea', token, idAreaDestino],
    queryFn: async () => {
      if (!idAreaDestino) {
        return { recursos: [], applied: false } as RecursosVisiblesResponse;
      }

      const resp = await apiFetch(`/area-recursos/permitidos?areaId=${idAreaDestino}`);
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, 'No se pudieron cargar los recursos permitidos'));
      }

      const json = await resp.json();
      if (Array.isArray(json)) {
        return {
          recursos: json.map(mapRecurso),
          applied: true,
        } as RecursosVisiblesResponse;
      }

      return {
        recursos: Array.isArray(json?.recursos) ? json.recursos.map(mapRecurso) : [],
        applied: Boolean(json?.applied),
      } as RecursosVisiblesResponse;
    },
    enabled: !!token && !!idAreaDestino, // Sólo dispara si hay token y área seleccionada
    staleTime: 10 * 60 * 1000, // 10 minutos
  });

  // 3. Cargar Código de Cuenta cuando tengamos Área Y Recurso
  const { data: dataCuenta, error: errorCuenta, isLoading: isLoadingCuenta } = useQuery({
    queryKey: ['codigoCuenta', idAreaDestino, idRecurso],
    queryFn: async () => {
      const resp = await apiFetch(`/area-recursos/codigo-cuenta?idArea=${idAreaDestino}&idRecurso=${idRecurso}`);
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, 'No se pudo obtener el código de cuenta'));
      }

      const data = await resp.json();
      return {
        codigoCuenta: data?.codigoCuenta ?? '',
        idCentroCosto: data?.idCentroCosto ?? null,
      };
    },
    enabled: !!token && !!idAreaDestino && !!idRecurso,
    staleTime: 30 * 60 * 1000, // 30 minutos (los códigos de cuenta cambian raramente en el día)
  });

  // Derivamos los errores combinados si alguno falla
  const errorCatalogos = errorBase || errorRecursos || errorCuenta 
    ? (errorBase?.message || errorRecursos?.message || errorCuenta?.message || 'Error al cargar los catálogos o recursos requeridos') 
    : null;

  return {
    materiales: datosBase?.materiales || [],
    areas: datosBase?.areas || [],
    // Si no hay área seleccionada, garantizamos enviar arreglo vacío
    recursos: idAreaDestino ? (recursosData?.recursos || []) : [],
    // Si falta alguno de los 2 no deberíamos tener un código de cuenta devuelto
    codigoCuenta: (idAreaDestino && idRecurso) ? (dataCuenta?.codigoCuenta || '') : '',
    idCentroCostoCalculado: (idAreaDestino && idRecurso) ? (dataCuenta?.idCentroCosto || null) : null,
    errorCatalogos,
    isLoadingBase,
    isLoadingRecursos,
    isLoadingCuenta
  };
}