const PLANES_SUSCRIPCION = {
  PRUEBA: {
    dias: 60,
    maxAves: 999999,
    maxPollitos: 999999,
    maxIncubaciones: 999999,
    precioMensual: 0,
  },
  BASICO: {
    dias: 30,
    maxAves: 100,
    maxPollitos: 200,
    maxIncubaciones: 50,
    precioMensual: 19.90,
  },
  PRO: {
    dias: 30,
    maxAves: 500,
    maxPollitos: 1000,
    maxIncubaciones: 250,
    precioMensual: 34.90,
  },
  PREMIUM: {
    dias: 30,
    maxAves: 999999,
    maxPollitos: 999999,
    maxIncubaciones: 999999,
    precioMensual: 59.90,
  },
};

const MODULOS_POR_PLAN = {
  PRUEBA: [
    "*",
  ],
  BASICO: [
    "Aves",
    // "ComposicionesLineaAve",
    "Crias",
    "Incubaciones",
    "IncubacionDetalles",
    "Suscripciones",
  ],
  PRO: [
    "Aves",
    "ComposicionesLineaAve",
    "Crias",
    "Incubaciones",
    "IncubacionDetalles",
    "LineasAves",
    "PlanesCruces",
    "EvaluacionesAves",
    "EvaluacionesPleito",
    "Suscripciones",
    "Historial",
  ],
  PREMIUM: [
    "*",
  ],
};

function fechaISO(date) {
  return date.toISOString().slice(0, 10);
}

function sumarDias(date, dias) {
  const result = new Date(date);
  result.setDate(result.getDate() + dias);
  return result;
}

function getPlanConfig(plan) {
  const planKey = String(plan || "").trim().toUpperCase();
  return PLANES_SUSCRIPCION[planKey] ? { plan: planKey, config: PLANES_SUSCRIPCION[planKey] } : null;
}

// El checkout y la pantalla consultan el mismo catalogo; no contiene datos privados.
function obtenerPlanesSuscripcion() {
  return Object.entries(PLANES_SUSCRIPCION)
    .filter(([plan]) => plan !== "PRUEBA")
    .map(([plan, config]) => ({
      plan,
      precioMensual: config.precioMensual,
      moneda: "PEN",
      maxAves: config.maxAves,
      maxPollitos: config.maxPollitos,
      maxIncubaciones: config.maxIncubaciones,
    }));
}

function construirDatosRenovacion(actual, estado, fechaBase = new Date()) {
  return {
    ...construirDatosSuscripcion(actual.plan, estado, fechaBase),
    // Cambiar el catalogo no cambia el contrato recurrente ya creado en Mercado Pago.
    precioMensual: actual.precioMensual,
    moneda: actual.moneda,
  };
}

function construirDatosSuscripcion(plan, estado = "ACTIVA", fechaBase = new Date()) {
  const planData = getPlanConfig(plan);
  if (!planData) return null;

  const { plan: planKey, config } = planData;
  const fin = sumarDias(fechaBase, config.dias);

  return {
    plan: planKey,
    estado,
    fechaInicio: fechaISO(fechaBase),
    fechaFin: fechaISO(fin),
    maxAves: config.maxAves,
    maxPollitos: config.maxPollitos,
    maxIncubaciones: config.maxIncubaciones,
    precioMensual: config.precioMensual,
    moneda: "PEN",
  };
}

module.exports = {
  MODULOS_POR_PLAN,
  PLANES_SUSCRIPCION,
  construirDatosSuscripcion,
  construirDatosRenovacion,
  obtenerPlanesSuscripcion,
  fechaISO,
  getPlanConfig,
  sumarDias,
};
