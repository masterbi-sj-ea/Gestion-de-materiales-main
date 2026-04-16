const assert = require('node:assert/strict');

const {
  ESTADOS_COMPROMETEN_PRESUPUESTO,
  seleccionarPresupuestoAreaVigente,
  agruparCostoSolicitudPorArea,
  calcularDisponiblePresupuestario,
  validarCostoSolicitudPorArea,
} = require('../dist/modules/presupuestos/presupuestoValidation');

function run() {
  assert.equal(
    ESTADOS_COMPROMETEN_PRESUPUESTO.has('COMPLETADA'),
    false,
    'COMPLETADA no debe seguir reservando presupuesto pendiente; solo debe conservar ejecutado real',
  );
  assert.equal(
    ESTADOS_COMPROMETEN_PRESUPUESTO.has('CERRADA_PARCIAL'),
    false,
    'CERRADA_PARCIAL no debe comprometer saldo pendiente del presupuesto',
  );
  assert.equal(
    ESTADOS_COMPROMETEN_PRESUPUESTO.has('DESPACHADA'),
    false,
    'DESPACHADA ya no debe ser el estado final oficial del flujo presupuestario',
  );

  const referenceDate = new Date('2026-03-20T00:00:00.000Z');

  const presupuestos = [
    {
      IdPresupuesto: 1,
      IdArea: 10,
      Anio: 2026,
      Mes: 3,
      Presupuesto: 1000,
      Comprometido: 700,
    },
    {
      IdPresupuesto: 2,
      IdArea: 10,
      Anio: 2026,
      Mes: null,
      Presupuesto: 4000,
      Comprometido: 1000,
    },
    {
      IdPresupuesto: 3,
      IdArea: 20,
      Anio: 2026,
      Mes: 3,
      Presupuesto: 800,
      Comprometido: 100,
    },
  ];

  const presupuestoVigente = seleccionarPresupuestoAreaVigente(presupuestos, 10, referenceDate);
  assert.equal(presupuestoVigente?.IdPresupuesto, 1, 'Debe priorizar presupuesto mensual vigente sobre anual');

  const preciosPorMaterial = new Map([
    [100, 50],
    [200, 10],
  ]);

  const costosPorArea = agruparCostoSolicitudPorArea([
    { idMaterial: 100, cantidadSolicitada: 2, idArea: 10 },
    { idMaterial: 200, cantidadSolicitada: 5, idArea: 20 },
    { idMaterial: 200, cantidadSolicitada: 3, idArea: 20 },
  ], preciosPorMaterial);

  assert.equal(costosPorArea.get(10), 100, 'Debe acumular costo correcto para el área 10');
  assert.equal(costosPorArea.get(20), 80, 'Debe acumular costo correcto para el área 20');

  const disponible = calcularDisponiblePresupuestario(presupuestos[0]);
  assert.equal(disponible, 300, 'Disponible debe descontar comprometido');

  const disponibleEditando = calcularDisponiblePresupuestario(presupuestos[0], 200);
  assert.equal(disponibleEditando, 500, 'Al editar una solicitud debe recuperar su reserva actual');

  const errorExceso = validarCostoSolicitudPorArea({
    presupuestos,
    costosPorArea: new Map([[10, 350]]),
    referenceDate,
  });
  assert.equal(errorExceso.length, 1, 'Debe detectar exceso presupuestario');
  assert.equal(errorExceso[0].reason, 'exceeded-budget');
  assert.equal(Math.round(errorExceso[0].disponible), 300);

  const sinErrorEditando = validarCostoSolicitudPorArea({
    presupuestos,
    costosPorArea: new Map([[10, 350]]),
    costosActualesPorArea: new Map([[10, 200]]),
    referenceDate,
  });
  assert.equal(sinErrorEditando.length, 0, 'No debe bloquear una edición si el delta cabe en el presupuesto');

  const errorSinPresupuesto = validarCostoSolicitudPorArea({
    presupuestos,
    costosPorArea: new Map([[99, 50]]),
    referenceDate,
  });
  assert.equal(errorSinPresupuesto.length, 1, 'Debe detectar área sin presupuesto');
  assert.equal(errorSinPresupuesto[0].reason, 'missing-budget');

  console.log('OK presupuestoValidation.test');
}

run();