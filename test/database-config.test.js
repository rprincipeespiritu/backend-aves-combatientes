const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { configurePostgres } = require("../srv/database-config");

const railwayEnv = {
  NODE_ENV: "production", PGHOST: "postgres.railway.internal", PGPORT: "5432",
  PGDATABASE: "railway", PGUSER: "postgres", PGPASSWORD: "00123456789",
};

test("Railway PG variables completan las credenciales CAP sin perder ceros en password", () => {
  const db = { kind: "postgres" };
  configurePostgres(db, railwayEnv);
  assert.deepEqual(db.credentials, {
    host: railwayEnv.PGHOST, port: "5432", database: "railway", user: "postgres", password: "00123456789",
  });
});

test("credenciales CAP explicitas y opciones TLS tienen prioridad sobre PG", () => {
  const credentials = { host: "cap.example", port: 5433, database: "cap", user: "cap-user", password: "cap-password", ssl: { rejectUnauthorized: true } };
  const db = { kind: "postgres", credentials: structuredClone(credentials) };
  configurePostgres(db, railwayEnv);
  assert.deepEqual(db.credentials, credentials);
});

test("perfil pg resuelve placeholders conservando TLS", () => {
  const db = { kind: "postgres", credentials: {
    host: "{env:PGHOST}", port: "{env:PGPORT}", database: "{env:PGDATABASE}",
    user: "{env:PGUSER}", password: "{env:PGPASSWORD}", ssl: true,
  } };
  configurePostgres(db, railwayEnv);
  assert.equal(db.credentials.host, railwayEnv.PGHOST);
  assert.equal(db.credentials.password, "00123456789");
  assert.equal(db.credentials.ssl, true);
});

test("configuracion incompleta falla sin revelar secretos y no modifica SQLite", () => {
  assert.throws(() => configurePostgres({ kind: "postgres" }, { NODE_ENV: "production", PGPASSWORD: "hidden-secret" }), (error) => {
    assert.match(error.message, /PGHOST, PGDATABASE, PGUSER/);
    assert.ok(!error.message.includes("hidden-secret"));
    return true;
  });
  const db = { kind: "sqlite", credentials: { url: ":memory:" } };
  configurePostgres(db, railwayEnv);
  assert.deepEqual(db.credentials, { url: ":memory:" });
});

test("CAP conserva contrasenas numericas y ceros iniciales mediante JSON", () => {
  const env = { ...process.env, CDS_REQUIRES_DB_CREDENTIALS: JSON.stringify({ password: "00123456789" }) };
  delete env.CDS_REQUIRES_DB_CREDENTIALS_PASSWORD;
  const output = execFileSync(process.execPath, ["-e", `
    const cds = require('@sap/cds');
    const password = cds.env.requires.db.credentials.password;
    process.stdout.write(JSON.stringify({ type: typeof password, value: password }));
  `], { cwd: require("node:path").resolve(__dirname, ".."), env, encoding: "utf8" });
  assert.deepEqual(JSON.parse(output), { type: "string", value: "00123456789" });
});
