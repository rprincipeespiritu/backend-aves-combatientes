const cds = require("@sap/cds");
const { secret, authenticate } = require("./identity");

module.exports = function authFactory() {
  secret(); // Fail at startup, including local development; never use a default key.
  return async function authenticateRequest(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return next(); // Public actions are explicitly allowed by the service.
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) return res.status(401).json({ error: { code: "401", message: "Token Bearer invalido." } });
    try {
      cds.context.user = await authenticate(match[1]);
      return next();
    } catch {
      return res.status(401).json({ error: { code: "401", message: "Sesion invalida o vencida. Inicia sesion nuevamente." } });
    }
  };
};
