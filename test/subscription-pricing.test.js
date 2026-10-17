const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obtenerPlanesSuscripcion, construirDatosSuscripcion, construirDatosRenovacion } = require("../srv/subscription-config");
const { evaluar } = require("../scripts/evaluar-precios");
const assumptions = require("../docs/pricing-assumptions.json");

test("nuevas suscripciones usan el catalogo y la renovacion conserva el precio contratado", () => {
  for (const plan of obtenerPlanesSuscripcion()) {
    const nueva = construirDatosSuscripcion(plan.plan);
    assert.equal(nueva.precioMensual, plan.precioMensual);
    assert.equal(nueva.moneda, plan.moneda);
  }
  const renewal = construirDatosRenovacion({ plan: "PREMIUM", precioMensual: 99, moneda: "PEN" }, "ACTIVA");
  assert.equal(renewal.precioMensual, 99);
  assert.equal(renewal.moneda, "PEN");
  assert.equal(construirDatosSuscripcion("PRUEBA").precioMensual, 0);
  const changed = construirDatosRenovacion({ plan: "PRO", precioMensual: 99, moneda: "PEN" }, "ACTIVA", new Date(), { transaction_amount: 34.9, currency_id: "PEN" });
  assert.equal(changed.precioMensual, 34.9);
  assert.throws(() => construirDatosRenovacion({ plan: "PRO" }, "ACTIVA", new Date(), { transaction_amount: 34.9, currency_id: "USD" }), /invalido/);
});

test("rentabilidad resta IGV, comision con IGV, consumo y reserva; detecta contribucion negativa", () => {
  const a = structuredClone(assumptions);
  Object.assign(a, { railwayMonthlyUSD: 0, sendgridMonthlyUSD: 0, squarespaceDomainAnnualUSD: 0, squarespaceWebsiteMonthlyUSD: 0, backupMonthlyUSD: 0, trialUsers: 0 });
  for (const p of Object.values(a.plans)) Object.assign(p, { storedGB: 0, egressGB: 0, puts: 0, gets: 0, appMonthlyPEN: 0 });
  const basic = evaluar(a).units[0];
  const expected = 19.9 / 1.18 - (19.9 * 0.0349 + 1) * 1.18 - 19.9 * 0.03;
  assert.ok(Math.abs(basic.contribution - expected) < 0.005);
  a.plans.BASICO.share = 0;
  a.plans.PRO.share = 0;
  a.plans.PREMIUM.share = 1;
  a.plans.PREMIUM.egressGB = 1000;
  assert.equal(evaluar(a).breakEvenSubscribers, null);
  assert.ok(evaluar(a).averageContributionPEN < 0);
});

test("Squarespace prorratea dominio anual y suma sitio mensual una sola vez", () => {
  const a = { ...assumptions, squarespaceDomainAnnualUSD: 24, squarespaceWebsiteMonthlyUSD: 20 };
  const result = evaluar(a);
  const withoutSquarespace = evaluar({ ...a, squarespaceDomainAnnualUSD: 0, squarespaceWebsiteMonthlyUSD: 0 });
  assert.equal(result.squarespaceMonthlyUSD, 22);
  const expected = 22 * a.usdToPen * (1 + a.supplierTaxReserve) * (1 + a.infrastructureContingency);
  assert.ok(Math.abs(result.fixedMonthlyPEN - withoutSquarespace.fixedMonthlyPEN - expected) < 0.01);
  const missing = { ...a };
  delete missing.squarespaceDomainAnnualUSD;
  assert.throws(() => evaluar(missing), /squarespaceDomainAnnualUSD/);
});
