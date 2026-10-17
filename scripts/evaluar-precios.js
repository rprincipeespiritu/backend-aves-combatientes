// Solo calcula: no accede a credenciales, bases de datos, cuentas ni APIs.
const fs = require("node:fs");
const path = require("node:path");
const { PLANES_SUSCRIPCION } = require("../srv/subscription-config");

function evaluar(a) {
  const planNames = ["BASICO", "PRO", "PREMIUM"];
  for (const key of Object.keys(require("../docs/pricing-assumptions.json"))) {
    if (key === "fecha" || key === "plans") continue;
    const value = a[key];
    if (!Number.isFinite(value) || value < 0) throw new Error(`Supuesto invalido: ${key}`);
  }
  if (!(a.usdToPen > 0)) throw new Error("usdToPen debe ser positivo");
  for (const plan of planNames) {
    for (const key of ["share", "storedGB", "egressGB", "puts", "gets", "appMonthlyPEN"]) {
      if (!Number.isFinite(a.plans?.[plan]?.[key]) || a.plans[plan][key] < 0) throw new Error(`Supuesto invalido: ${plan}.${key}`);
    }
  }
  if (Math.abs(planNames.reduce((n, p) => n + a.plans[p].share, 0) - 1) > 0.000001) throw new Error("La mezcla de planes debe sumar 1");
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const factor = a.usdToPen * (1 + a.supplierTaxReserve) * (1 + a.infrastructureContingency);
  const squarespaceMonthlyUSD = a.squarespaceDomainAnnualUSD / 12 + a.squarespaceWebsiteMonthlyUSD;
  const fixed = (a.railwayMonthlyUSD + a.sendgridMonthlyUSD + squarespaceMonthlyUSD + a.backupMonthlyUSD) * factor
    + a.trialUsers * a.trialMonthlyCostPEN;
  const units = planNames.map((plan) => {
    const p = a.plans[plan];
    const price = PLANES_SUSCRIPCION[plan].precioMensual;
    const netSales = price / (1 + a.salesTax);
    const fee = (price * a.paymentPercent + a.paymentFixedPEN) * (1 + a.paymentTax);
    const variable = (p.storedGB * a.s3StorageUSDPerGB + p.egressGB * a.s3EgressUSDPerGB
      + p.puts / 1000 * a.s3PutUSDPer1000 + p.gets / 1000 * a.s3GetUSDPer1000) * factor + p.appMonthlyPEN;
    const contribution = netSales - fee - price * a.refundReserve - variable;
    return { plan, price, netSales, fee, variable, contribution, share: p.share };
  });
  const average = units.reduce((sum, u) => sum + u.share * u.contribution, 0);
  const breakEven = (cost, contribution) => contribution > 0 ? Math.ceil(cost / contribution) : null;
  return {
    squarespaceMonthlyUSD: round(squarespaceMonthlyUSD),
    fixedMonthlyPEN: round(fixed),
    ownerMonthlyPEN: a.ownerMonthlyPEN,
    averageContributionPEN: round(average),
    breakEvenSubscribers: breakEven(fixed, average),
    breakEvenIncludingOwner: breakEven(fixed + a.ownerMonthlyPEN, average),
    units: units.map(({ share, ...u }) => ({ ...Object.fromEntries(Object.entries(u).map(([k, v]) => [k, typeof v === "number" ? round(v) : v])), breakEvenSubscribers: breakEven(fixed, u.contribution) })),
    // Expected-value mix; actual customers are whole people and may have another mix.
    scenarios: [5, 10, 20, 30, 50, 100].map((n) => ({
      subscribers: n,
      operatingSurplusPEN: round(n * average - fixed),
      afterOwnerPEN: round(n * average - fixed - a.ownerMonthlyPEN),
    })),
  };
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, "../docs/pricing-assumptions.json");
  const assumptions = JSON.parse(fs.readFileSync(file, "utf8"));
  const stress = structuredClone(assumptions);
  stress.railwayMonthlyUSD = 44;
  stress.usdToPen = 4.2;
  stress.trialUsers = 200;
  stress.trialMonthlyCostPEN = 2;
  stress.plans.PREMIUM.storedGB = 50;
  stress.plans.PREMIUM.egressGB = 100;
  console.log(JSON.stringify({ base: evaluar(assumptions), stress: evaluar(stress) }, null, 2));
}

module.exports = { evaluar };
