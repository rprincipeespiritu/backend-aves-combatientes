const cds = require("@sap/cds");

const PUBLIC_ACTIONS = new Set([
  "login", "registrarUsuario", "reenviarActivacion",
  "solicitarRecuperacionPassword", "restablecerPassword",
]);
const ACCOUNT_ACTIONS = new Set([
  "logout", "obtenerPerfil", "actualizarPerfil", "cambiarPassword",
  "prepararCargaFotoUsuario", "actualizarFotoPerfil", "eliminarFotoPerfil",
  "obtenerSuscripcionActual", "activarSuscripcion", "crearCheckoutMercadoPago",
  "cancelarSuscripcion", "obtenerDatosContacto", "enviarQuejaSugerencia",
  "obtenerUrlLecturaS3", "obtenerUrlsLecturaS3",
]);
const ADMIN_ACTIONS = new Set([
  "registrarRoles", "adminListarUsuarios", "adminActualizarEstadoUsuario",
  "adminAsignarSuscripcion", "adminCancelarSuscripcionUsuario",
]);
const ACTIONS = {
  eliminarAve: ["Aves", "DELETE"], eliminarCria: ["Crias", "DELETE"],
  registrarCriaComoAve: ["Crias", "UPDATE"],
  eliminarLineaAve: ["LineasAves", "DELETE"], eliminarIncubacion: ["Incubaciones", "DELETE"],
  registrarCombate: ["Peleas", "CREATE"], crearIncubacion: ["Incubaciones", "CREATE"],
  prepararCargaVideoCombate: ["Peleas", "UPDATE"], prepararCargaArchivoAve: ["FotosAve", "CREATE"],
  obtenerDashboard: ["Aves", "READ"], obtenerGenealogiaCompleta: ["Aves", "READ"],
  calcularEstadisticasAve: ["Aves", "READ"], calcularRentabilidad: ["Transacciones", "READ"],
  analizarCrucePorParentesco: ["PlanesCruces", "READ"], analizarCruceAutomatico: ["PlanesCruces", "READ"],
  obtenerLineaCruceAbierto: ["LineasAves", "CREATE"],
  marcarComoVendido: ["Aves", "UPDATE"], marcarComoFallecido: ["Aves", "UPDATE"],
  generarArbolGenealogico: ["Aves", "READ"], recalcularComposicionLineas: ["Aves", "UPDATE"],
  iniciar: ["Incubaciones", "UPDATE"], finalizar: ["Incubaciones", "UPDATE"],
  cancelar: ["Incubaciones", "UPDATE"], reprogramar: ["Incubaciones", "UPDATE"],
};
const MODULES = { AvesActivas: "Aves", IncubacionesActivas: "Incubaciones", LineasAvesActivas: "LineasAves", IncubacionDetalles: "Incubaciones" };
const MASTERS = new Set(["Razas", "Colores", "TiposAve"]);
const CRUD = new Set(["READ", "CREATE", "UPDATE", "DELETE"]);
const OWNED = new Set([
  "Aves", "AvesActivas", "Crias", "LineasAves", "LineasAvesActivas", "ComposicionesLineaAve",
  "PlanesCruces", "EvaluacionesAves", "EvaluacionesPleito", "Peleas", "Incubaciones",
  "IncubacionesActivas", "IncubacionDetalles", "Suscripciones", "Historial",
]);
const AVE_CHILDREN = new Set(["Pesajes", "Tratamientos", "Alimentaciones", "FotosAve", "VideosAve", "DocumentosAve"]);
const PRIVATE = new Set(["ave.combatiente.Usuario", "ave.combatiente.Rol"]);
const PARAM_ENTITIES = {
  aveId: "Aves", ave_ID: "Aves", combatienteB_ID: "Aves", padreId: "Aves", madreId: "Aves",
  padre_ID: "Aves", madre_ID: "Aves", macho_ID: "Aves", hembra_ID: "Aves",
  criaId: "Crias", peleaId: "Peleas", linea_ID: "LineasAves", lineaAveId: "LineasAves",
  incubacionId: "Incubaciones", planCruce_ID: "PlanesCruces", planCruceId: "PlanesCruces",
};

const shortName = (entity) => entity?.name?.split(".").pop();
const eq = (path, id) => [{ ref: path.split(".") }, "=", { val: id }];

function ownerWhere(entity, id) {
  const name = shortName(entity);
  if (OWNED.has(name)) return eq("usuario_ID", id);
  if (AVE_CHILDREN.has(name)) return eq("ave.usuario_ID", id);
  if (name === "FotosPelea") return eq("pelea.usuario_ID", id);
  if (name === "Transacciones") return [{ xpr: eq("ave.usuario_ID", id) }, "or", { xpr: eq("pelea.usuario_ID", id) }, "or", { xpr: eq("createdBy", id) }];
  if (MASTERS.has(name)) return null;
  // No owner can be determined for the old aggregate views: do not expose totals
  // across accounts. Scoped reports are provided by the explicit service actions.
  return false;
}

async function assertOwned(entity, id, req) {
  if (!id) return req.reject(400, "Falta el identificador del registro.");
  const where = ownerWhere(entity, req.user.id);
  if (where === false) return req.reject(403, "Entidad sin politica de acceso.");
  const query = cds.ql.SELECT.one.from(entity).columns("ID").where({ ID: id });
  if (where) query.and(where);
  if (!await cds.db.run(query)) return req.reject(404, "Registro no encontrado o sin acceso.");
}

function restrictExpands(columns, entity, service, req) {
  for (const column of columns || []) {
    if (!column?.expand) continue;
    if (!column.ref || column.ref.length !== 1 || column.ref[0] === "*") {
      req.reject(400, "Especifica las asociaciones que deseas expandir.");
    }
    const element = entity.elements[column.ref[0]];
    const target = service.model.definitions[element?.target];
    if (!target || PRIVATE.has(target.name)) req.reject(403, "Asociacion privada.");
    const where = ownerWhere(target, req.user.id);
    if (where === false) req.reject(403, "Asociacion sin politica de acceso.");
    if (where) column.where = column.where?.length ? [{ xpr: column.where }, "and", { xpr: where }] : where;
    restrictExpands(column.expand, target, service, req);
  }
}

async function validateData(data, entity, service, req, depth = 0) {
  if (depth > 8) return req.reject(400, "Demasiados niveles de datos anidados.");
  for (const row of Array.isArray(data) ? data : [data]) {
    if (!row || typeof row !== "object") continue;
    for (const [name, element] of Object.entries(entity.elements || {})) {
      if (!element.target) continue;
      if (PRIVATE.has(element.target)) {
        // Only the authenticated account may be referenced as owner/responsible.
        if (row[name] !== undefined) req.reject(400, "No se admiten datos anidados de usuarios o roles.");
        const key = `${name}_ID`;
        if (row[key] && row[key] !== req.user.id) req.reject(403, "No puedes asignar otro usuario.");
        if (name === "usuario" || row[key] !== undefined) row[key] = req.user.id;
        continue;
      }
      const target = service.model.definitions[element.target];
      if (row[`${name}_ID`]) await assertOwned(target, row[`${name}_ID`], req);
      if (row[name] !== undefined && row[name] !== null) {
        if (!element.isComposition) req.reject(400, "Usa el identificador de la asociacion.");
        for (const child of Array.isArray(row[name]) ? row[name] : [row[name]]) {
          if (child.ID) {
            const existing = await cds.db.run(cds.ql.SELECT.one.from(target).columns("ID").where({ ID: child.ID }));
            if (existing) await assertOwned(target, child.ID, req);
          }
        }
        await validateData(row[name], target, service, req, depth + 1);
      }
    }
    // Audit identity is server-controlled, never taken from a JSON payload.
    for (const field of ["createdBy", "createdAt", "modifiedBy", "modifiedAt"]) delete row[field];
  }
}

async function validateActionReferences(data, service, req) {
  for (const [key, value] of Object.entries(data || {})) {
    if (value && PARAM_ENTITIES[key]) await assertOwned(service.entities[PARAM_ENTITIES[key]], value, req);
    if (key === "usuario_ID" && value && value !== req.user.id) req.reject(403, "No puedes asignar otro usuario.");
    if (Array.isArray(value)) for (const item of value) if (item && typeof item === "object") await validateActionReferences(item, service, req);
  }
}

async function authorize(req, service, permissions) {
  if (ADMIN_ACTIONS.has(req.event)) {
    if (!req.user.is("ADMIN")) req.reject(403, "Solo un administrador de plataforma puede realizar esta operacion.");
    return null;
  }
  if (ACCOUNT_ACTIONS.has(req.event)) return null;
  const name = shortName(req.target);
  const isCrud = CRUD.has(req.event);
  const rule = isCrud ? [MODULES[name] || name, req.event] : ACTIONS[req.event];
  if (!rule) req.reject(403, "Operacion no autorizada.");
  const [module, operation] = rule;
  // Subscription state is only changed by controlled actions/webhooks.
  if (name === "Suscripciones" && req.event !== "READ") req.reject(403, "Usa las operaciones de suscripcion.");
  const role = req.user.attr.role;
  const allowed = permissions[role]?.[module] || [];
  const ownerDelete = role === "CRIADOR" && operation === "DELETE" && OWNED.has(name || module) && !["Suscripciones", "Historial"].includes(module);
  if (!allowed.includes(operation) && !ownerDelete) req.reject(403, "Tu rol no permite esta operacion.");
  if (isCrud) {
    const where = ownerWhere(req.target, req.user.id);
    if (where === false) req.reject(403, "Entidad sin politica de acceso.");
    if (req.event === "READ") {
      if (where) req.query.where(where);
      restrictExpands(req.query.SELECT?.columns, req.target, service, req);
    } else {
      if (req.event !== "CREATE") {
        // Do not allow collection-wide mutation requests or unchecked path keys.
        await assertOwned(req.target, req.data?.ID || req.params?.at(-1)?.ID, req);
        if (where) req.query.where(where);
      }
      if (req.event !== "DELETE") await validateData(req.data, req.target, service, req);
    }
  } else {
    if (req.target) await assertOwned(req.target, req.params?.at(-1)?.ID, req);
    await validateActionReferences(req.data, service, req);
  }
  return module;
}

module.exports = { authorize, PUBLIC_ACTIONS };
