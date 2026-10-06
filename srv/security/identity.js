const cds = require("@sap/cds");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const issuer = "linajegallo";
const audience = "linajegallo-api";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error("Configura JWT_SECRET con un secreto aleatorio de al menos 32 bytes.");
  }
  return value;
}

function effectiveRole(user, role) {
  if (!role?.activo) return null;
  const code = String(role.codigo || "").toUpperCase();
  if (!["ADMIN", "CRIADOR", "VETERINARIO", "VIEWER"].includes(code)) return null;
  const administrators = new Set((process.env.PLATFORM_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean));
  // Legacy registrations assigned ADMIN to everyone. Only explicitly designated
  // accounts may retain platform administration privileges.
  return code === "ADMIN" && !administrators.has(user.ID) ? "CRIADOR" : code;
}

function sessionStamp(user, role) {
  return crypto.createHmac("sha256", secret())
    .update(JSON.stringify([user.ID, user.password, user.estado, user.rol_ID, role, user.sessionVersion || 0]))
    .digest("hex");
}

function issueToken(user, role) {
  return jwt.sign({ id: user.ID, rol: role, session: sessionStamp(user, role) }, secret(), {
    algorithm: "HS256", issuer, audience, subject: user.ID,
    expiresIn: process.env.JWT_EXPIRES || "1h",
  });
}

async function authenticate(token) {
  const payload = jwt.verify(token, secret(), { algorithms: ["HS256"], issuer, audience });
  if (typeof payload.sub !== "string" || payload.id !== payload.sub || !Number.isFinite(payload.exp)) {
    throw new Error("Invalid token");
  }
  const { SELECT } = cds.ql;
  const db = await cds.connect.to("db");
  const user = await db.run(SELECT.one.from("ave.combatiente.Usuario")
    .columns("ID", "password", "estado", "rol_ID", "sessionVersion").where({ ID: payload.sub }));
  if (!user || user.estado !== "ACTIVO") throw new Error("Inactive account");
  const storedRole = await db.run(SELECT.one.from("ave.combatiente.Rol").where({ ID: user.rol_ID }));
  const role = effectiveRole(user, storedRole);
  if (!role || payload.session !== sessionStamp(user, role)) throw new Error("Revoked session");
  return new cds.User({ id: user.ID, roles: [role], attr: { role } });
}

module.exports = { secret, effectiveRole, issueToken, authenticate };
