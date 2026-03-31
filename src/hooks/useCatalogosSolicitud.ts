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

  // 2. Cargar recursos cuando cambia el Área (cachea por idArea)
  const { data: recursos = [], error: errorRecursos, isLoading: isLoadingRecursos } = useQuery({
    queryKey: ['recursosParaArea', idAreaDestino],
    queryFn: async () => {
      const resp = await apiFetch(`/area-recursos/recursos?idArea=${idAreaDestino}`);
      if (!resp.ok) return [];
      const recursosJson = await resp.json();
      return (recursosJson || []).map((r: any) => ({
        id: r.IdRecurso ?? r.id,
        nombre: r.Nombre ?? r.nombre,
        catalogoId: r.IdCatalogoSolicitud ?? r.IdCatalogo ?? null,
      }));
    },
    enabled: !!token && !!idAreaDestino, // Sólo dispara si hay token y área seleccionada
    staleTime: 10 * 60 * 1000, // 10 minutos
  });

  // 2.b Cargar catálogos permitidos por usuario/área (para filtrar recursos por catálogo cuando aplique)
  const { data: permitidosData } = useQuery({
    queryKey: ['catalogosPermitidos', token, idAreaDestino],
    queryFn: async () => {
      if (!idAreaDestino) return { recursos: [], applied: false };
      const resp = await apiFetch(`/area-recursos/permitidos?areaId=${idAreaDestino}`);
      if (!resp.ok) return { catalogos: [], applied: false };
        try {
          const json = await resp.json();

          // El endpoint devuelve un array de recursos o un objeto { recursos: [], applied: boolean }
          if (Array.isArray(json)) {
            return { recursos: json, applied: json.length > 0 } as any;
          }

          const recursos = json.recursos ?? json.catalogos ?? [];
          const applied = !!json.applied || (Array.isArray(recursos) && recursos.length > 0);
          return { recursos, applied } as any;
        } catch (err) {
          console.error('[useCatalogosSolicitud] error parsing /area-recursos/permitidos response', err);
          return { recursos: [], applied: false } as any;
        }
    },
    enabled: !!token && !!idAreaDestino,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Cargar Código de Cuenta cuando tengamos Área Y Recurso
  const { data: dataCuenta, error: errorCuenta, isLoading: isLoadingCuenta } = useQuery({
    queryKey: ['codigoCuenta', idAreaDestino, idRecurso],
    queryFn: async () => {
      const resp = await apiFetch(`/area-recursos/codigo-cuenta?idArea=${idAreaDestino}&idRecurso=${idRecurso}`);
      if (!resp.ok) return { codigoCuenta: '', idCentroCosto: null };
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
    ? (errorBase?.message || 'Error al cargar los catálogos o recursos requeridos') 
    : null;

  // Si el endpoint de permitidos devolvió aplicación de filtro, usamos sólo recursos cuyo catalogoId esté en la lista permitida
  const recursosFiltrados = (() => {
    if (!idAreaDestino) return [] as RecursoListado[];
    const permitidos = permitidosData ?? { recursos: [], applied: false } as any;
    if (!permitidos.applied) return recursos;
    // El endpoint `/area-recursos/permitidos` puede devolver dos formatos dependiendo
    // de la implementación en la BD: una lista de *recursos* ({ IdRecurso, Nombre, ... })
    // o una lista de *catálogos* ({ IdCatalogoSolicitud, NombreCatalogo, ... }).
    // Detectamos el formato y aplicamos el filtro adecuado.
    const allowedRaw = permitidos.recursos || [];
    if (!Array.isArray(allowedRaw) || allowedRaw.length === 0) {
      // Se aplicó el filtro pero la lista está vacía: no hay recursos permitidos
      return [];
    }

    const sample = allowedRaw[0] ?? {};

    // Caso 1: la lista contiene recursos (IdRecurso / id)
    if (sample.IdRecurso !== undefined || sample.id !== undefined || sample.Id !== undefined) {
      const allowed = new Set<number>(
        allowedRaw.map((c: any) => Number(c.IdRecurso ?? c.id ?? c.Id ?? 0)),
      );
      return recursos.filter((r: RecursoListado) => allowed.has(Number(r.id ?? 0)));
    }

    // Caso 2: la lista contiene catálogos (IdCatalogoSolicitud / idCatalogo)
    if (
      sample.IdCatalogoSolicitud !== undefined ||
      sample.idCatalogoSolicitud !== undefined ||
      sample.IdCatalogo !== undefined ||
      sample.id !== undefined
    ) {
      const allowed = new Set<number>(
        allowedRaw.map((c: any) =>
          Number(c.IdCatalogoSolicitud ?? c.idCatalogoSolicitud ?? c.IdCatalogo ?? c.id ?? c.Id ?? 0),
        ),
      );
      return recursos.filter((r: RecursoListado) => allowed.has(Number(r.catalogoId ?? 0)));
    }

    // Fallback: intentar comparar por `id` o `catalogoId` si no podemos identificar el formato
    const fallbackSet = new Set<number>(allowedRaw.map((c: any) => Number(c.id ?? c.Id ?? 0)));
    return recursos.filter((r: RecursoListado) => fallbackSet.has(Number(r.id ?? 0)) || fallbackSet.has(Number(r.catalogoId ?? 0)));
  })();

  return {
    materiales: datosBase?.materiales || [],
    areas: datosBase?.areas || [],
    // Si no hay área seleccionada, garantizamos enviar arreglo vacío
    recursos: idAreaDestino ? recursosFiltrados : [],
    // Si falta alguno de los 2 no deberíamos tener un código de cuenta devuelto
    codigoCuenta: (idAreaDestino && idRecurso) ? (dataCuenta?.codigoCuenta || '') : '',
    idCentroCostoCalculado: (idAreaDestino && idRecurso) ? (dataCuenta?.idCentroCosto || null) : null,
    errorCatalogos,
    isLoadingBase,
    isLoadingRecursos,
    isLoadingCuenta
  };
}