const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

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
