export const ESTADOS_COMPROMETEN_PRESUPUESTO = new Set([
  'PENDIENTE',
  'APROBADA',
  'EN_DESPACHO',
  'PARCIALMENTE_DESPACHADA',
]);

export interface PresupuestoValidable {
  IdPresupuesto?: number;
  IdArea: number;
  Anio: number;
  Mes: number | null;
  Presupuesto: number;
  Comprometido: number;
}

export interface DetalleSolicitudCosteable {
  idMaterial: number;
  cantidadSolicitada: number;
  idArea?: number | null;
}

export interface PresupuestoValidationError {
  idArea: number;
  costoSolicitado: number;
  disponible: number;
  reason: 'missing-budget' | 'exceeded-budget';
  presupuesto?: PresupuestoValidable | null;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeAreaId(value: unknown): number | null {
  const normalized = Math.trunc(toFiniteNumber(value, 0));
  return normalized > 0 ? normalized : null;
}

export function seleccionarPresupuestoAreaVigente<T extends PresupuestoValidable>(
  presupuestos: T[],
  idArea: number | null,
  referenceDate: Date = new Date(),
): T | null {
  if (!idArea) {
    return null;
  }

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;

  const candidatos = presupuestos.filter((presupuesto) => presupuesto.IdArea === idArea);
  if (candidatos.length === 0) {
    return null;
  }

  const rankPresupuesto = (presupuesto: T) => {
    const isCurrentMonth = presupuesto.Anio === year && presupuesto.Mes === month;
    const isCurrentAnnual = presupuesto.Anio === year && presupuesto.Mes == null;
    const isCurrentYear = presupuesto.Anio === year;

    return [
      isCurrentMonth ? 1 : 0,
      isCurrentAnnual ? 1 : 0,
      isCurrentYear ? 1 : 0,
      presupuesto.Anio,
      presupuesto.Mes ?? 0,
      presupuesto.IdPresupuesto ?? 0,
    ];
  };

  return candidatos.sort((left, right) => {
    const rankLeft = rankPresupuesto(left);
    const rankRight = rankPresupuesto(right);

    for (let index = 0; index < rankLeft.length; index += 1) {
      if (rankLeft[index] !== rankRight[index]) {
        return rankRight[index] - rankLeft[index];
      }
    }

    return 0;
  })[0];
}

export function agruparCostoSolicitudPorArea(
  detalle: DetalleSolicitudCosteable[],
  preciosPorMaterial: Map<number, number>,
  idAreaCabecera?: number | null,
): Map<number, number> {
  const costosPorArea = new Map<number, number>();

  for (const linea of detalle) {
    const idArea = normalizeAreaId(linea.idArea ?? idAreaCabecera ?? null);
    if (!idArea) {
      continue;
    }

    const cantidad = toFiniteNumber(linea.cantidadSolicitada, 0);
    const precio = toFiniteNumber(preciosPorMaterial.get(linea.idMaterial), 0);
    const costoLinea = cantidad * precio;
    if (costoLinea <= 0) {
      continue;
    }

    costosPorArea.set(idArea, toFiniteNumber(costosPorArea.get(idArea), 0) + costoLinea);
  }

  return costosPorArea;
}

export function calcularDisponiblePresupuestario(
  presupuesto: PresupuestoValidable,
  costoActualSolicitud = 0,
): number {
  const comprometidoAjustado = Math.max(toFiniteNumber(presupuesto.Comprometido, 0) - toFiniteNumber(costoActualSolicitud, 0), 0);
  return toFiniteNumber(presupuesto.Presupuesto, 0) - comprometidoAjustado;
}

export function validarCostoSolicitudPorArea<T extends PresupuestoValidable>(args: {
  presupuestos: T[];
  costosPorArea: Map<number, number>;
  costosActualesPorArea?: Map<number, number>;
  referenceDate?: Date;
}): PresupuestoValidationError[] {
  const {
    presupuestos,
    costosPorArea,
    costosActualesPorArea = new Map<number, number>(),
    referenceDate = new Date(),
  } = args;

  const errors: PresupuestoValidationError[] = [];

  for (const [idArea, costoSolicitado] of costosPorArea.entries()) {
    const presupuesto = seleccionarPresupuestoAreaVigente(presupuestos, idArea, referenceDate);
    if (!presupuesto) {
      errors.push({
        idArea,
        costoSolicitado,
        disponible: 0,
        reason: 'missing-budget',
        presupuesto: null,
      });
      continue;
    }

    const disponible = calcularDisponiblePresupuestario(
      presupuesto,
      costosActualesPorArea.get(idArea) ?? 0,
    );

    if (costoSolicitado > disponible + 0.005) {
      errors.push({
        idArea,
        costoSolicitado,
        disponible,
        reason: 'exceeded-budget',
        presupuesto,
      });
    }
  }

  return errors;
}