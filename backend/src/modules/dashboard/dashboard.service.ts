import mssql from 'mssql';
import { getPool } from '../../config/db';
import { hasGlobalOperationalScope } from '../../infra/roleScope';
import { listarAreasPermitidasPorUsuario } from '../areas/areas.service';
import { listarPresupuestos } from '../presupuestos/presupuestos.service';
import { listarMovimientosInventario } from '../kardex/kardex.service';

type DashboardParams = {
  anio: number;
  mes: number | null;
  idArea: number | null;
};

type DashboardViewerContext = {
  userId: number;
  userRoles?: string[] | null;
};

type EstadoChartRow = {
  estado: string;
  valor: number;
  color: string;
};

type DashboardAreaOption = {
  id: number;
  nombre: string;
};

type DashboardScope = {
  tipo: 'global' | 'personal';
  puedeVerTodo: boolean;
  idsAreasPermitidas: number[] | null;
  areasPermitidas: DashboardAreaOption[];
};

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function toInt(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeEstadoSolicitud(raw: unknown): string {
  const value = String(raw ?? '').trim().toUpperCase();

  if (value === 'PENDIENTE') return 'Pendiente';
  if (value === 'APROBADA') return 'Aprobada';
  if (value === 'EN_DESPACHO' || value === 'PARCIALMENTE_DESPACHADA') return 'En Despacho';
  if (value === 'COMPLETADA' || value === 'DESPACHADA') return 'Despachada';
  if (value === 'RECHAZADA') return 'Rechazada';

  return value || 'Sin estado';
}

function getEstadoColor(estado: string): string {
  switch (estado) {
    case 'Pendiente':
      return '#fbbf24';
    case 'Aprobada':
      return '#22c55e';
    case 'En Despacho':
      return '#3b82f6';
    case 'Despachada':
      return '#10b981';
    case 'Rechazada':
      return '#ef4444';
    default:
      return '#94a3b8';
  }
}

function isSolicitudActiva(raw: unknown): boolean {
  const value = String(raw ?? '').trim().toUpperCase();
  return ['PENDIENTE', 'APROBADA', 'EN_DESPACHO', 'PARCIALMENTE_DESPACHADA'].includes(value);
}

function dedupeAreaOptions(rows: DashboardAreaOption[]): DashboardAreaOption[] {
  const map = new Map<number, string>();

  for (const row of rows) {
    const id = toInt(row.id);
    const nombre = String(row.nombre ?? '').trim();
    if (!id || !nombre) continue;
    map.set(id, nombre);
  }

  return Array.from(map.entries())
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function resolveDashboardScope(viewer: DashboardViewerContext): Promise<DashboardScope> {
  if (hasGlobalOperationalScope(viewer.userRoles)) {
    return {
      tipo: 'global',
      puedeVerTodo: true,
      idsAreasPermitidas: null,
      areasPermitidas: [],
    };
  }

  const areasPermitidasRaw = await listarAreasPermitidasPorUsuario(viewer.userId);
  const areasPermitidas = dedupeAreaOptions(
    (areasPermitidasRaw ?? []).map((area) => ({
      id: Number(area?.IdArea ?? 0),
      nombre: String(area?.Nombre ?? ''),
    })),
  );

  return {
    tipo: 'personal',
    puedeVerTodo: false,
    idsAreasPermitidas: areasPermitidas.map((area) => area.id),
    areasPermitidas,
  };
}

export async function obtenerDashboardData(params: DashboardParams, viewer: DashboardViewerContext) {
  const { anio, mes, idArea } = params;
  const scope = await resolveDashboardScope(viewer);

  if (
    !scope.puedeVerTodo
    && idArea !== null
    && !(scope.idsAreasPermitidas ?? []).includes(idArea)
  ) {
    const error = new Error('No tienes acceso al área seleccionada.');
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }

  const effectiveAreaIds = idArea !== null ? [idArea] : scope.idsAreasPermitidas;
  const effectiveAreaIdSet = effectiveAreaIds === null ? null : new Set(effectiveAreaIds);
  const userScopedRequestId = scope.puedeVerTodo ? null : viewer.userId;

  const matchesBudgetAreaScope = (rawAreaId: unknown): boolean => {
    if (effectiveAreaIdSet === null) return true;
    const areaIdValue = toInt(rawAreaId);
    return areaIdValue !== null && effectiveAreaIdSet.has(areaIdValue);
  };

  const matchesRequestScope = (rawAreaId: unknown, rawSolicitanteId: unknown): boolean => {
    if (userScopedRequestId === null) {
      return matchesBudgetAreaScope(rawAreaId);
    }

    if (toInt(rawSolicitanteId) !== userScopedRequestId) {
      return false;
    }

    if (effectiveAreaIdSet === null || effectiveAreaIdSet.size === 0) {
      return true;
    }

    return matchesBudgetAreaScope(rawAreaId);
  };

  const presupuestos = await listarPresupuestos();

  const presupuestosFiltrados = presupuestos.filter((item) => {
    const matchesYear = Number(item.Anio) === anio;
    const matchesMonth = mes == null ? true : Number(item.Mes) === mes;
    const matchesArea = matchesBudgetAreaScope(item.IdArea);
    return matchesYear && matchesMonth && matchesArea;
  });

  const presupuestoTotal = presupuestosFiltrados.reduce((acc, item) => acc + toNumber(item.Presupuesto), 0);
  const consumoAcumulado = presupuestosFiltrados.reduce((acc, item) => acc + toNumber(item.Ejecutado), 0);
  const disponible = presupuestoTotal - consumoAcumulado;
  const porcentajeEjecucion = presupuestoTotal > 0 ? (consumoAcumulado / presupuestoTotal) * 100 : 0;

  const consumoPorAreaMap = new Map<string, { area: string; presupuesto: number; consumo: number }>();
  for (const item of presupuestosFiltrados) {
    const area = String(item.AreaNombre ?? 'Sin área');
    const current = consumoPorAreaMap.get(area) ?? { area, presupuesto: 0, consumo: 0 };
    current.presupuesto += toNumber(item.Presupuesto);
    current.consumo += toNumber(item.Ejecutado);
    consumoPorAreaMap.set(area, current);
  }

  const consumoPorArea = Array.from(consumoPorAreaMap.values()).sort((a, b) => a.area.localeCompare(b.area));

  const alertas = consumoPorArea
    .map((item) => {
      const porcentaje = item.presupuesto > 0 ? (item.consumo / item.presupuesto) * 100 : 0;
      if (porcentaje >= 90) {
        return {
          area: item.area,
          tipo: 'danger' as const,
          mensaje: `Ejecución presupuestaria al ${porcentaje.toFixed(0)}%`,
        };
      }
      if (porcentaje >= 80) {
        return {
          area: item.area,
          tipo: 'warning' as const,
          mensaje: `Ejecución presupuestaria al ${porcentaje.toFixed(0)}%`,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const evolucionMensualBase = MONTH_NAMES.map((mesNombre, index) => ({
    mes: mesNombre,
    presupuesto: 0,
    consumo: 0,
    mesNumero: index + 1,
  }));

  for (const item of presupuestos) {
    if (Number(item.Anio) !== anio) continue;
    if (!matchesBudgetAreaScope(item.IdArea)) continue;

    const mesItem = toInt(item.Mes);
    if (!mesItem || mesItem < 1 || mesItem > 12) continue;

    evolucionMensualBase[mesItem - 1].presupuesto += toNumber(item.Presupuesto);
    evolucionMensualBase[mesItem - 1].consumo += toNumber(item.Ejecutado);
  }

  const pool = await getPool();

  const requestEstados = pool.request();
  requestEstados.input('Anio', mssql.Int, anio);
  requestEstados.input('Mes', mssql.Int, mes);

  const estadosResult = await requestEstados.query(`
    SELECT
      UPPER(LTRIM(RTRIM(ISNULL(s.Estado, '')))) AS Estado,
      s.IdArea,
      s.IdSolicitante
    FROM dbo.SolicitudesMaterial s
    WHERE YEAR(s.FechaSolicitud) = @Anio
      AND (@Mes IS NULL OR MONTH(s.FechaSolicitud) = @Mes);
  `);

  const estadoMap = new Map<string, number>();
  let solicitudesActivas = 0;
  let pendientesAprobacion = 0;

  for (const row of estadosResult.recordset ?? []) {
    if (!matchesRequestScope(row.IdArea, row.IdSolicitante)) continue;

    const estadoRaw = String(row.Estado ?? '').trim().toUpperCase();
    const total = 1;

    const normalized = normalizeEstadoSolicitud(estadoRaw);
    estadoMap.set(normalized, (estadoMap.get(normalized) ?? 0) + total);

    if (isSolicitudActiva(estadoRaw)) solicitudesActivas += total;
    if (estadoRaw === 'PENDIENTE') pendientesAprobacion += total;
  }

  const orderedEstados = ['Pendiente', 'Aprobada', 'En Despacho', 'Despachada', 'Rechazada'];
  const estadosSolicitudes: EstadoChartRow[] = orderedEstados
    .map((estado) => ({
      estado,
      valor: estadoMap.get(estado) ?? 0,
      color: getEstadoColor(estado),
    }))
    .filter((item) => item.valor > 0);

  const requestTop = pool.request();
  requestTop.input('Anio', mssql.Int, anio);
  requestTop.input('Mes', mssql.Int, mes);

  const topResult = await requestTop.query(`
    SELECT
      COALESCE(m.DescripcionArticulo, CONCAT('Material #', dd.IdMaterial)) AS Material,
      SUM(ISNULL(dd.CantidadDespachada, 0)) AS Cantidad,
      dd.IdMaterial,
      s.IdArea,
      s.IdSolicitante
    FROM dbo.DetalleDespachos dd
    INNER JOIN dbo.Despachos d
      ON d.IdDespacho = dd.IdDespacho
    INNER JOIN dbo.SolicitudesMaterial s
      ON s.IdSolicitud = d.IdSolicitud
    LEFT JOIN dbo.Materiales m
      ON m.IdMaterial = dd.IdMaterial
    WHERE YEAR(d.FechaDespacho) = @Anio
      AND (@Mes IS NULL OR MONTH(d.FechaDespacho) = @Mes)
    GROUP BY m.DescripcionArticulo, dd.IdMaterial, s.IdArea, s.IdSolicitante;
  `);

  const topMaterialesMap = new Map<string, { material: string; cantidad: number; valor: number | null }>();
  for (const row of topResult.recordset ?? []) {
    if (!matchesRequestScope(row.IdArea, row.IdSolicitante)) continue;

    const material = String(row.Material ?? 'Sin descripción');
    const current = topMaterialesMap.get(material) ?? {
      material,
      cantidad: 0,
      valor: null as number | null,
    };
    current.cantidad += toNumber(row.Cantidad);
    topMaterialesMap.set(material, current);
  }

  const topMateriales = Array.from(topMaterialesMap.values())
    .sort((a, b) => b.cantidad - a.cantidad || a.material.localeCompare(b.material))
    .slice(0, 5);

  let ultimoCorte: {
    idCorte: number;
    descripcion: string;
    fechaCorte: unknown;
    estado: string;
    ambito: string;
  } | null = null;

  let ultimosMovimientos: Array<{
    fechaMovimiento: unknown;
    material: string;
    tipoMovimiento: string;
    cantidad: number;
    referencia: unknown;
  }> = [];

  if (scope.puedeVerTodo) {
    const requestCorte = pool.request();
    const ultimoCorteResult = await requestCorte.query(`
      SELECT TOP 1
        c.IdCorte,
        c.Descripcion,
        c.FechaCorte,
        c.Estado,
        c.Ambito
      FROM dbo.CortesStock c
      WHERE UPPER(LTRIM(RTRIM(ISNULL(c.Ambito, '')))) = 'STOCK'
      ORDER BY
        ISNULL(c.EsMaximo, 0) DESC,
        c.FechaCorte DESC,
        c.IdCorte DESC;
    `);

    const ultimoCorteRow = ultimoCorteResult.recordset?.[0] ?? null;
    ultimoCorte = ultimoCorteRow
      ? {
          idCorte: toNumber(ultimoCorteRow.IdCorte),
          descripcion: String(ultimoCorteRow.Descripcion ?? ''),
          fechaCorte: ultimoCorteRow.FechaCorte,
          estado: String(ultimoCorteRow.Estado ?? ''),
          ambito: String(ultimoCorteRow.Ambito ?? ''),
        }
      : null;

    const ultimosMovimientosRaw = await listarMovimientosInventario({
      Page: 1,
      Limit: 5,
    });

    ultimosMovimientos = (Array.isArray(ultimosMovimientosRaw) ? ultimosMovimientosRaw : []).map((row: any) => ({
      fechaMovimiento: row?.FechaMovimiento ?? row?.fechaMovimiento ?? null,
      material: row?.DescripcionArticulo
        ? `${row.DescripcionArticulo}${row?.NumeroArticulo ? ` (${row.NumeroArticulo})` : ''}`
        : (row?.NumeroArticulo ?? 'Sin material'),
      tipoMovimiento: String(row?.TipoMovimiento ?? ''),
      cantidad: toNumber(row?.Cantidad),
      referencia: row?.Referencia ?? null,
    }));
  }

  const areasMap = new Map<number, string>();
  for (const item of presupuestos) {
    const areaId = toInt(item.IdArea);
    const areaNombre = String(item.AreaNombre ?? '').trim();
    if (areaId && areaNombre) {
      areasMap.set(areaId, areaNombre);
    }
  }

  const areas = scope.puedeVerTodo
    ? Array.from(areasMap.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    : scope.areasPermitidas;

  return {
    alcance: {
      tipo: scope.tipo,
      puedeVerTodo: scope.puedeVerTodo,
      puedeSeleccionarTodasLasAreas: scope.puedeVerTodo,
      idsAreasPermitidas: scope.idsAreasPermitidas ?? [],
      descripcion: scope.puedeVerTodo
        ? 'Vista global del negocio.'
        : 'Vista personal: tus áreas permitidas y tus solicitudes.',
    },
    areas,
    resumen: {
      presupuestoTotal,
      consumoAcumulado,
      disponible,
      porcentajeEjecucion,
      solicitudesActivas,
      pendientesAprobacion,
    },
    consumoPorArea,
    estadosSolicitudes,
    evolucionMensual: evolucionMensualBase.map(({ mes: mesNombre, presupuesto, consumo }) => ({
      mes: mesNombre,
      presupuesto,
      consumo,
    })),
    topMateriales,
    alertas,
    ultimoCorte,
    ultimosMovimientos,
  };
}

export type { DashboardParams, DashboardViewerContext, EstadoChartRow };
