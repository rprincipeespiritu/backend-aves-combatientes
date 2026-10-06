const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.SENDGRID_API_KEY = "";
process.env.APP_OWNER_EMAIL = "";
process.env.AWS_S3_BUCKET = "security-test-bucket";
process.env.AWS_S3_ENV_PREFIX = "test";
process.env.CDS_REQUIRES_DB_KIND = "sqlite";
process.env.CDS_REQUIRES_DB_IMPL = "@cap-js/sqlite";
const cds = require("@sap/cds");
cds.env.log.levels = { ...cds.env.log.levels, error: "silent", odata: "silent" };
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { issueToken } = require("../srv/security/identity");
const ids = Object.fromEntries(["a", "b", "admin", "legacy", "aveA", "aveB", "childB", "lineA"].map((key) => [key, crypto.randomUUID()]));
process.env.PLATFORM_ADMIN_IDS = ids.admin;
let server, base, tokens, accounts;

async function request(path, token, method = "GET", body) {
  const response = await fetch(base + path, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

before(async () => {
  await cds.plugins;
  // Isolated database: no connection or writes to local/production PostgreSQL.
  cds.env.requires.db = { kind: "sqlite", impl: "@cap-js/sqlite", credentials: { url: ":memory:" } };
  server = await require("../server")({ port: 0, in_memory: true });
  base = `http://127.0.0.1:${server.address().port}/api/avecombatiente/`;
  const roles = ["ADMIN", "CRIADOR", "VETERINARIO", "VIEWER"].map((codigo) => ({ ID: crypto.randomUUID(), codigo, nombre: codigo, activo: true }));
  await cds.db.run(cds.ql.INSERT.into("ave.combatiente.Rol").entries(roles));
  const password = await bcrypt.hash("Test-password-unique", 4);
  accounts = ["a", "b", "admin", "legacy"].map((key) => ({
    ID: ids[key], username: key, email: `${key}@example.test`, nombre: key, apellido: "Test", password,
    estado: "ACTIVO", sessionVersion: 0, rol_ID: roles.find((r) => r.codigo === (["admin", "legacy"].includes(key) ? "ADMIN" : "CRIADOR")).ID,
  }));
  await cds.db.run(cds.ql.INSERT.into("ave.combatiente.Usuario").entries(accounts));
  tokens = Object.fromEntries(accounts.map((user) => [user.username, issueToken(user, user.username === "admin" ? "ADMIN" : "CRIADOR")]));
  await cds.db.run(cds.ql.INSERT.into("ave.combatiente.Ave").entries([
    { ID: ids.aveA, placa: "A", nombre: "Propia", usuario_ID: ids.a, estado: "ACTIVO" },
    { ID: ids.aveB, placa: "B", nombre: "Ajena", usuario_ID: ids.b, estado: "ACTIVO" },
  ]));
  await cds.db.run(cds.ql.INSERT.into("ave.combatiente.Pesaje").entries({ ID: ids.childB, ave_ID: ids.aveB, fecha: new Date().toISOString(), peso: 2 }));
  await cds.db.run(cds.ql.INSERT.into("ave.combatiente.Suscripcion").entries(accounts.map((user) => ({
    ID: crypto.randomUUID(), usuario_ID: user.ID, plan: "PREMIUM", estado: "ACTIVA",
    fechaInicio: "2020-01-01", fechaFin: "2099-01-01", maxAves: 100,
  }))));
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await cds.db?.disconnect();
});

test("rutas de usuarios y roles retiradas, incluso para el administrador", async () => {
  for (const token of [tokens.a, tokens.admin]) {
    for (const path of ["Usuarios", `Usuarios(${ids.b})`, "Roles"]) {
      assert.equal((await request(path, token)).status, 404, path);
    }
  }
  const metadata = await request("$metadata", tokens.a);
  assert.equal(metadata.status, 200);
  for (const field of ["tokenActivacion", "tokenRecuperacion", 'EntitySet Name="Usuarios"', 'EntitySet Name="Roles"']) {
    assert.ok(!metadata.data.includes(field), field);
  }
});

test("autenticacion obligatoria y rechazo de tokens antiguos o manipulados", async () => {
  assert.equal((await request("obtenerPerfil", null, "POST", {})).status, 401);
  assert.equal((await request("Aves", tokens.a + "broken")).status, 401);
  const old = jwt.sign({ id: ids.a, rol: "ADMIN" }, process.env.JWT_SECRET);
  assert.equal((await request("Aves", old)).status, 401);
  const wrongAudience = jwt.sign({ id: ids.a }, process.env.JWT_SECRET, { issuer: "linajegallo", audience: "other", subject: ids.a, expiresIn: "1h" });
  assert.equal((await request("Aves", wrongAudience)).status, 401);
});

test("perfil propio y administracion exclusivamente para cuentas designadas", async () => {
  const own = await request("obtenerPerfil", tokens.a, "POST", {});
  assert.equal(own.status, 200);
  assert.equal(own.data.userId, ids.a);
  for (const key of ["a", "legacy"]) {
    assert.equal((await request("adminListarUsuarios", tokens[key], "POST", {})).status, 403);
    assert.equal((await request("registrarRoles", tokens[key], "POST", { codigo: "ADMIN", nombre: "Admin", activo: true })).status, 403);
  }
  const admin = await request("adminListarUsuarios", tokens.admin, "POST", {});
  assert.equal(admin.status, 200);
  assert.ok(admin.data.usuarios.length >= 4);
  assert.ok(!JSON.stringify(admin.data).includes("password"));
});

test("lecturas por propietario, filtros OR y entidades hijas", async () => {
  const own = await request("Aves?$filter=placa%20eq%20'B'%20or%20placa%20eq%20'A'", tokens.a);
  assert.equal(own.status, 200);
  assert.deepEqual(own.data.value.map((row) => row.ID), [ids.aveA]);
  assert.equal((await request(`Aves(${ids.aveB})`, tokens.a)).status, 404);
  const children = await request("Pesajes?$expand=ave", tokens.a);
  assert.equal(children.status, 200);
  assert.deepEqual(children.data.value, []);
  assert.ok([400, 403, 404].includes((await request("Aves?$expand=usuario", tokens.a)).status));
  assert.ok([400, 403, 404].includes((await request(`Aves(${ids.aveA})/usuario`, tokens.a)).status));
});

test("escrituras y acciones no pueden usar registros o propietarios ajenos", async () => {
  assert.equal((await request(`Aves(${ids.aveB})`, tokens.a, "PATCH", { nombre: "Hack" })).status, 404);
  assert.equal((await request(`Aves(${ids.aveB})`, tokens.a, "DELETE")).status, 404);
  assert.equal((await request("eliminarAve", tokens.a, "POST", { aveId: ids.aveB })).status, 404);
  assert.equal((await request("Aves", tokens.a, "POST", { placa: "FOREIGN", usuario_ID: ids.b })).status, 403);
  assert.equal((await request(`Aves(${ids.aveA})`, tokens.a, "PATCH", { padre_ID: ids.aveB })).status, 404);
  const row = await cds.db.run(cds.ql.SELECT.one.from("ave.combatiente.Ave").where({ ID: ids.aveB }));
  assert.equal(row.nombre, "Ajena");
});

test("no se pueden activar planes de pago o escribir suscripciones directamente", async () => {
  assert.equal((await request("activarSuscripcion", tokens.a, "POST", { plan: "PREMIUM" })).status, 403);
  assert.ok([403, 405].includes((await request("Suscripciones", tokens.a, "POST", { usuario_ID: ids.a, plan: "PREMIUM" })).status));
});

test("login y registro conservan el flujo publico con rol limitado", async () => {
  const login = await request("login", null, "POST", { email: "legacy@example.test", password: "Test-password-unique" });
  assert.equal(login.status, 200);
  assert.equal(login.data.rol, "Criador");
  assert.equal((await request("obtenerPerfil", login.data.token, "POST", {})).status, 200);
  assert.equal((await request("adminListarUsuarios", login.data.token, "POST", {})).status, 403);
  const signup = await request("registrarUsuario", null, "POST", {
    username: "new-account", email: "new@example.test", password: "New-user-password",
    nombre: "New", apellido: "Account",
  });
  assert.equal(signup.status, 200);
  const user = await cds.db.run(cds.ql.SELECT.one.from("ave.combatiente.Usuario").where({ email: "new@example.test" }));
  const role = await cds.db.run(cds.ql.SELECT.one.from("ave.combatiente.Rol").where({ ID: user.rol_ID }));
  assert.equal(role.codigo, "CRIADOR");
  assert.equal(user.estado, "PENDIENTE");
  assert.equal((await request("login", null, "POST", { email: user.email, password: "New-user-password" })).status, 403);
});

test("crear y editar registros propios sigue funcionando y asigna el propietario en servidor", async () => {
  const created = await request("Aves", tokens.a, "POST", { placa: "NEW", nombre: "New", sexo: "M", estado: "ACTIVO" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.ID;
  const stored = await cds.db.run(cds.ql.SELECT.one.from("ave.combatiente.Ave").where({ ID: id }));
  assert.equal(stored.usuario_ID, ids.a);
  assert.equal(stored.createdBy, ids.a);
  assert.ok([200, 204].includes((await request(`Aves(${id})`, tokens.a, "PATCH", { nombre: "Updated" })).status));
  const expanded = await request("Aves?$expand=padre,madre,fotos", tokens.a);
  assert.equal(expanded.status, 200);
  assert.ok(expanded.data.value.every((row) => row.usuario_ID === ids.a));
});

test("expansiones y genealogia no revelan relaciones ajenas preexistentes", async () => {
  await cds.db.run(cds.ql.UPDATE("ave.combatiente.Ave").set({ padre_ID: ids.aveB }).where({ ID: ids.aveA }));
  const expanded = await request(`Aves(${ids.aveA})?$expand=padre`, tokens.a);
  assert.equal(expanded.status, 200);
  assert.equal(expanded.data.padre, null);
  const tree = await request(`obtenerGenealogiaCompleta(aveId='${ids.aveA}')`, tokens.a);
  assert.equal(tree.status, 200);
  assert.ok(!JSON.stringify(tree.data).includes("Ajena"));
  await cds.db.run(cds.ql.UPDATE("ave.combatiente.Ave").set({ padre_ID: null }).where({ ID: ids.aveA }));
});

test("no firma URLs S3 de otro propietario", async () => {
  const result = await request("obtenerUrlLecturaS3", tokens.a, "POST", {
    fileUrl: `https://security-test-bucket.s3.us-east-1.amazonaws.com/test/aves/${ids.b}/file.jpg`,
  });
  assert.equal(result.status, 403);
});

test("batch no evita los controles de autorizacion", async () => {
  const batch = await request("$batch", tokens.a, "POST", { requests: [
    { id: "1", method: "GET", url: "Usuarios" },
    { id: "2", method: "POST", url: "adminListarUsuarios", headers: { "content-type": "application/json" }, body: {} },
  ] });
  assert.equal(batch.status, 200);
  assert.deepEqual(batch.data.responses.map((r) => r.status), [404, 403]);
});

test("suspender y reactivar una cuenta no restaura sus tokens anteriores", async () => {
  const change = (estado) => request("adminActualizarEstadoUsuario", tokens.admin, "POST", { usuarioId: ids.legacy, estado });
  assert.equal((await change("ELIMINADO")).status, 200);
  assert.equal((await request("obtenerPerfil", tokens.legacy, "POST", {})).status, 401);
  assert.equal((await change("ACTIVO")).status, 200);
  assert.equal((await request("obtenerPerfil", tokens.legacy, "POST", {})).status, 401);
  const login = await request("login", null, "POST", { email: "legacy@example.test", password: "Test-password-unique" });
  assert.equal(login.status, 200);
  assert.equal((await request("obtenerPerfil", login.data.token, "POST", {})).status, 200);
});

test("cambios de estado, password y rol invalidan sesiones sin esperar su expiracion", async () => {
  const update = (values) => cds.db.run(cds.ql.UPDATE("ave.combatiente.Usuario").set(values).where({ ID: ids.b }));
  await update({ estado: "ELIMINADO" });
  assert.equal((await request("Aves", tokens.b)).status, 401);
  await update({ estado: "ACTIVO", password: "changed-hash" });
  assert.equal((await request("Aves", tokens.b)).status, 401);
  await update({ password: accounts[1].password, rol_ID: accounts[2].rol_ID });
  assert.equal((await request("Aves", tokens.b)).status, 401);
});

test("logout revoca las sesiones persistidas", async () => {
  assert.equal((await request("logout", tokens.a, "POST", {})).status, 200);
  assert.equal((await request("obtenerPerfil", tokens.a, "POST", {})).status, 401);
});
