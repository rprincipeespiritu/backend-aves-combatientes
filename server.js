// server.js
require("dotenv").config();
const cds = require("@sap/cds");
const cors = require("cors");

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

cds.on("bootstrap", (app) => {
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions)); // preflight

  app.get("/activar-cuenta", async (req, res) => {
    try {
      const token = req.query.token;

      if (!token) {
        return res.status(400).send("Token no proporcionado");
      }

      const db = await cds.connect.to("db");
      const { Usuario } = cds.entities("ave.combatiente");

      const usuario = await db.run(
        SELECT.one.from(Usuario).where({ tokenActivacion: token }),
      );

      if (!usuario) {
        return res.status(400).send("Token inválido");
      }

      if (
        !usuario.tokenExpiracion ||
        new Date(usuario.tokenExpiracion) < new Date()
      ) {
        return res.status(400).send("El token ha expirado");
      }

      await db.run(
        UPDATE(Usuario)
          .set({
            estado: "ACTIVO",
            tokenActivacion: null,
            tokenExpiracion: null,
          })
          .where({ ID: usuario.ID }),
      );

      return res
        .status(200)
        .send("Cuenta activada correctamente. Ya puedes iniciar sesión.");
    } catch (error) {
      console.error("Error al activar cuenta:", error);
      return res.status(500).send("Error interno al activar la cuenta");
    }
  });
});

module.exports = cds.server;
