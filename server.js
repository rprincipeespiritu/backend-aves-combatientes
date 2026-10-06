// server.js
const cds = require("@sap/cds");
const cors = require("cors");
const crypto = require("crypto");
const express = require("express");
const { construirDatosSuscripcion, fechaISO, sumarDias, PLANES_SUSCRIPCION } = require("./srv/subscription-config");
const { invalidarCacheSuscripcion } = require("./srv/suscripcion-cache");

require("./srv/security/identity").secret();
require("./srv/database-config").configurePostgres(cds.env.requires.db);
if (process.env.NODE_ENV === "production") {
  if (!process.env.CORS_ORIGIN) throw new Error("Configura CORS_ORIGIN con el origen HTTPS del frontend.");
}

function construirOpcionesCors() {
  const rawOrigins = String(process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const allowAll = rawOrigins.includes("*");
  // Con credentials:true el navegador no acepta Access-Control-Allow-Origin: *
  const useCredentials = !allowAll;

  return {
    origin(origin, callback) {
      // Requests sin Origin (healthchecks, curl, webhooks server-to-server)
      if (!origin) return callback(null, true);
      if (allowAll) return callback(null, true);

      const normalized = String(origin).replace(/\/$/, "");
      if (rawOrigins.includes(normalized)) {
        return callback(null, true);
      }

      console.warn(`CORS bloqueado para origin: ${origin}. Permitidos: ${rawOrigins.join(", ")}`);
      return callback(new Error(`Origin no permitido por CORS: ${origin}`), false);
    },
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: useCredentials,
    optionsSuccessStatus: 204,
  };
}

const corsOptions = construirOpcionesCors();

cds.on("bootstrap", (app) => {
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  // Healthcheck simple para Railway
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  app.post("/api/mercadopago/webhook", express.json({ type: "*/*" }), async (req, res) => {
    try {
      const signature = req.headers["x-signature"];
      const requestId = req.headers["x-request-id"];
      const dataId = req.query["data.id"] || req.body?.data?.id || req.query.id;
      const requireSignature =
        !!process.env.MERCADOPAGO_WEBHOOK_SECRET ||
        String(process.env.MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE || "").toLowerCase() === "true" ||
        String(process.env.NODE_ENV || "").toLowerCase() === "production";

      if (requireSignature && !process.env.MERCADOPAGO_WEBHOOK_SECRET) {
        console.error("Webhook Mercado Pago: falta MERCADOPAGO_WEBHOOK_SECRET en produccion.");
        return res.status(500).json({ error: "Webhook no configurado" });
      }

      if (process.env.MERCADOPAGO_WEBHOOK_SECRET && (!signature || !requestId || !dataId)) {
        return res.status(401).json({ error: "Faltan cabeceras de firma de Mercado Pago" });
      }

      if (process.env.MERCADOPAGO_WEBHOOK_SECRET) {
        const parts = Object.fromEntries(
          String(signature)
            .split(",")
            .map((part) => part.split("=").map((value) => value.trim())),
        );
        const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
        const expected = crypto
          .createHmac("sha256", process.env.MERCADOPAGO_WEBHOOK_SECRET)
          .update(manifest)
          .digest("hex");

        if (parts.v1 !== expected) {
          return res.status(401).json({ error: "Firma de Mercado Pago invalida" });
        }
      }

      const topic = req.query.topic || req.query.type || req.body?.type || req.body?.topic;
      const topicStr = String(topic || "");

      // Renovaciones/pagos: reconsultar preapproval asociado si llega un payment.
      if (["payment", "subscription_authorized_payment"].includes(topicStr)) {
        return res.status(200).json({ received: true, ignored: "payment-topic" });
      }

      if (!dataId || !["subscription_preapproval", "preapproval", "subscription"].includes(topicStr)) {
        return res.status(200).json({ received: true, ignored: true });
      }

      if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
        throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
      }

      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
      });
      const preapproval = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error("Mercado Pago webhook fetch error:", preapproval);
        return res.status(202).json({ received: true, pending: true });
      }

      const db = await cds.connect.to("db");
      const { Suscripcion } = cds.entities("ave.combatiente");
      let actual = await db.run(
        SELECT.one
          .from(Suscripcion)
          .where({ mercadoPagoPreapprovalId: preapproval.id }),
      );

      if (!actual && preapproval.external_reference) {
        actual = await db.run(
          SELECT.one
            .from(Suscripcion)
            .where({ mercadoPagoExternalReference: preapproval.external_reference }),
        );
      }

      if (!actual) {
        return res.status(200).json({ received: true, ignored: "subscription-not-found" });
      }

      const statusMap = {
        authorized: "ACTIVA",
        pending: "PENDIENTE",
        paused: "VENCIDA",
        cancelled: "CANCELADA",
        canceled: "CANCELADA",
      };
      const estadoMp = statusMap[preapproval.status] || "PENDIENTE";
      const planDesdeRef = String(preapproval.external_reference || "").split(":")[2]?.toUpperCase();
      const planFinal = PLANES_SUSCRIPCION[planDesdeRef] ? planDesdeRef : actual.plan;

      const diasRestantesActual = actual.fechaFin
        ? Math.ceil((new Date(actual.fechaFin) - new Date()) / (1000 * 60 * 60 * 24))
        : -1;
      const accesoVigente = ["ACTIVA", "CANCELADA"].includes(actual.estado) && diasRestantesActual >= 0;

      // Si el pago sigue pendiente y el usuario ya tiene acceso, no degradar el plan.
      if (estadoMp === "PENDIENTE" && accesoVigente) {
        await db.run(
          UPDATE(Suscripcion)
            .set({
              proveedorPago: "MERCADO_PAGO",
              mercadoPagoPreapprovalId: preapproval.id,
              mercadoPagoExternalReference: preapproval.external_reference || actual.mercadoPagoExternalReference,
              mercadoPagoStatus: preapproval.status,
              mercadoPagoInitPoint: preapproval.init_point || actual.mercadoPagoInitPoint,
              mercadoPagoSandboxInitPoint: preapproval.sandbox_init_point || actual.mercadoPagoSandboxInitPoint,
              observaciones: `Checkout Mercado Pago pendiente para plan ${planFinal}. Acceso actual preservado.`,
            })
            .where({ ID: actual.ID }),
        );
        invalidarCacheSuscripcion(actual.usuario_ID);
        return res.status(200).json({ received: true, preserved: true });
      }

      const datosPlan = construirDatosSuscripcion(planFinal, estadoMp) || {};
      const fechaInicio = preapproval.date_created ? new Date(preapproval.date_created) : new Date();
      const fechaFin = preapproval.next_payment_date
        ? new Date(preapproval.next_payment_date)
        : sumarDias(fechaInicio, Number(PLANES_SUSCRIPCION[planFinal]?.dias || 30));

      await db.run(
        UPDATE(Suscripcion)
          .set({
            ...datosPlan,
            plan: planFinal,
            estado: estadoMp,
            fechaInicio: fechaISO(fechaInicio),
            fechaFin: fechaISO(fechaFin),
            proveedorPago: "MERCADO_PAGO",
            mercadoPagoPreapprovalId: preapproval.id,
            mercadoPagoExternalReference: preapproval.external_reference || actual.mercadoPagoExternalReference,
            mercadoPagoStatus: preapproval.status,
            mercadoPagoInitPoint: preapproval.init_point || actual.mercadoPagoInitPoint,
            mercadoPagoSandboxInitPoint: preapproval.sandbox_init_point || actual.mercadoPagoSandboxInitPoint,
            fechaUltimoPago: estadoMp === "ACTIVA" ? new Date() : actual.fechaUltimoPago,
            observaciones: `Mercado Pago webhook: ${preapproval.status}`,
          })
          .where({ ID: actual.ID }),
      );

      invalidarCacheSuscripcion(actual.usuario_ID);
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Error procesando webhook Mercado Pago:", error);
      return res.status(500).json({ error: "Error procesando webhook" });
    }
  });

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
