const cds = require("@sap/cds");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  MODULOS_POR_PLAN,
  PLANES_SUSCRIPCION,
  construirDatosSuscripcion,
  fechaISO,
  getPlanConfig,
  sumarDias,
} = require("./subscription-config");
const {
  invalidarCacheSuscripcion,
  leerCacheSuscripcion,
  guardarCacheSuscripcion,
} = require("./suscripcion-cache");

const JWT_SECRET =
  process.env.JWT_SECRET || "ave-combatiente-secret-2024-xK9#mP";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1h";
const VIDEO_COMBATE_MAX_BYTES = Number(process.env.COMBATE_VIDEO_MAX_BYTES || 524288000);
const VIDEO_STORAGE_PROVIDER = process.env.COMBATE_VIDEO_PROVIDER || "AWS_S3";
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const AWS_S3_COMBATES_BUCKET = process.env.AWS_S3_COMBATES_BUCKET || AWS_S3_BUCKET;
const AWS_S3_AVES_BUCKET = process.env.AWS_S3_AVES_BUCKET || AWS_S3_BUCKET;
const AWS_S3_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const AWS_S3_PRESIGN_EXPIRES_SECONDS = Number(
  process.env.AWS_S3_PRESIGN_EXPIRES_SECONDS || 900,
);
const ARCHIVO_AVE_MAX_BYTES = Number(process.env.ARCHIVO_AVE_MAX_BYTES || 104857600);
const FOTO_USUARIO_MAX_BYTES = Number(process.env.FOTO_USUARIO_MAX_BYTES || 5242880);
const MAX_REGISTROS_COMBATES_POR_USUARIO = Number(
  process.env.MAX_REGISTROS_COMBATES_POR_USUARIO || 10,
);
const AWS_S3_ENV_PREFIX = String(process.env.AWS_S3_ENV_PREFIX || "dev")
  .trim()
  .replace(/^\/+|\/+$/g, "");
const LINEA_CRUCE_ABIERTO_NOMBRE = "Cruce abierto";
const PORCENTAJE_MINIMO_CONTINUIDAD_LINEA = 25;
const s3Client = new S3Client({ region: AWS_S3_REGION });

const nodemailer = require("nodemailer");

//============================================
// PERMISOS POR ROL
//============================================
const PERMISOS_ROL = {
  ADMIN: {
    Aves: ["READ", "CREATE", "UPDATE", "DELETE", "recalcularComposicionLineas"],
    Crias: ["READ", "CREATE", "UPDATE", "DELETE"],
    Pesajes: ["READ", "CREATE", "UPDATE", "DELETE"],
    Peleas: ["READ", "CREATE", "UPDATE", "DELETE"],
    Incubaciones: ["READ", "CREATE", "UPDATE", "DELETE", "iniciar", "finalizar", "cancelar", "reprogramar"],
    EvaluacionesAves: ["READ", "CREATE", "UPDATE", "DELETE"],
    EvaluacionesPleito: ["READ", "CREATE", "UPDATE", "DELETE"],
    LineasAves: ["READ", "CREATE", "UPDATE", "DELETE"],
    ComposicionesLineaAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    PlanesCruces: ["READ", "CREATE", "UPDATE", "DELETE"],
    Pesajes: ["READ", "CREATE", "UPDATE", "DELETE"],
    Tratamientos: ["READ", "CREATE", "UPDATE", "DELETE"],
    Alimentaciones: ["READ", "CREATE", "UPDATE", "DELETE"],
    Transacciones: ["READ", "CREATE", "UPDATE", "DELETE"],
    Razas: ["READ", "CREATE", "UPDATE", "DELETE"],
    Colores: ["READ", "CREATE", "UPDATE", "DELETE"],
    TiposAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    FotosAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    VideosAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    DocumentosAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    FotosPelea: ["READ", "CREATE", "UPDATE", "DELETE"],
    Usuarios: ["READ", "CREATE", "UPDATE", "DELETE"],
    Suscripciones: ["READ", "CREATE", "UPDATE", "DELETE"],
    Roles: ["READ", "CREATE", "UPDATE", "DELETE"],
    Historial: ["READ"],
  },
  CRIADOR: {
    Aves: ["READ", "CREATE", "UPDATE", "recalcularComposicionLineas"],
    Crias: ["READ", "CREATE", "UPDATE"],
    Pesajes: ["READ", "CREATE", "UPDATE"],
    Peleas: ["READ", "CREATE", "UPDATE", "DELETE"],
    Incubaciones: ["READ", "CREATE", "UPDATE", "reprogramar"],
    EvaluacionesAves: ["READ", "CREATE", "UPDATE"],
    EvaluacionesPleito: ["READ", "CREATE", "UPDATE", "DELETE"],
    LineasAves: ["READ", "CREATE", "UPDATE"],
    ComposicionesLineaAve: ["READ", "CREATE", "UPDATE"],
    PlanesCruces: ["READ", "CREATE", "UPDATE"],
    Tratamientos: ["READ"],
    Alimentaciones: ["READ", "CREATE", "UPDATE"],
    Transacciones: ["READ", "CREATE"],
    Razas: ["READ"],
    Colores: ["READ"],
    TiposAve: ["READ"],
    FotosAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    VideosAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    DocumentosAve: ["READ", "CREATE", "UPDATE", "DELETE"],
    FotosPelea: ["READ", "CREATE"],
    Usuarios: [],
    Suscripciones: ["READ", "UPDATE"],
    Roles: [],
    Historial: [],
  },
  VETERINARIO: {
    Aves: ["READ"],
    Crias: ["READ"],
    Pesajes: ["READ", "CREATE", "UPDATE"],
    Peleas: ["READ"],
    Incubaciones: ["READ"],
    EvaluacionesAves: ["READ", "CREATE", "UPDATE"],
    EvaluacionesPleito: ["READ", "CREATE", "UPDATE"],
    LineasAves: ["READ"],
    ComposicionesLineaAve: ["READ"],
    PlanesCruces: ["READ"],
    Tratamientos: ["READ", "CREATE", "UPDATE"],
    Alimentaciones: ["READ", "CREATE"],
    Transacciones: [],
    Razas: ["READ"],
    Colores: ["READ"],
    TiposAve: ["READ"],
    FotosAve: ["READ"],
    VideosAve: ["READ"],
    DocumentosAve: ["READ"],
    FotosPelea: [],
    Usuarios: [],
    Suscripciones: ["READ"],
    Roles: [],
    Historial: [],
  },
  VIEWER: {
    Aves: ["READ"],
    Crias: ["READ"],
    Pesajes: ["READ"],
    Peleas: ["READ"],
    Incubaciones: ["READ"],
    EvaluacionesAves: ["READ"],
    EvaluacionesPleito: ["READ"],
    LineasAves: ["READ"],
    ComposicionesLineaAve: ["READ"],
    PlanesCruces: ["READ"],
    Tratamientos: ["READ"],
    Alimentaciones: ["READ"],
    Transacciones: [],
    Razas: ["READ"],
    Colores: ["READ"],
    TiposAve: ["READ"],
    FotosAve: ["READ"],
    VideosAve: ["READ"],
    DocumentosAve: ["READ"],
    FotosPelea: ["READ"],
    Usuarios: [],
    Suscripciones: ["READ"],
    Roles: [],
    Historial: [],
  },
};

const METODO_A_OPERACION = {
  GET: "READ",
  POST: "CREATE",
  PATCH: "UPDATE",
  PUT: "UPDATE",
  DELETE: "DELETE",
};

function extraerEntidad(path) {
  const match = path.match(/\/api\/avecombatiente\/([A-Za-z]+)/);
  return match ? match[1] : null;
}

function normalizarNombreArchivo(nombreArchivo = "combate.mp4") {
  return String(nombreArchivo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function esMismoId(idA, idB) {
  return !!idA && !!idB && String(idA) === String(idB);
}

function normalizarDateTimeCAP(valor) {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  return texto.replace(/\.\d{3}Z$/, "").replace(/Z$/, "").slice(0, 19);
}

function construirUrlS3(bucket, storageKey) {
  return `https://${bucket}.s3.${AWS_S3_REGION}.amazonaws.com/${storageKey}`;
}

function construirStorageKeyS3(...parts) {
  return [AWS_S3_ENV_PREFIX, ...parts]
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== "")
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .join("/");
}

function normalizarUrlBase(rawUrl, fallback = "http://localhost:4004") {
  let value = String(rawUrl || fallback).trim();

  // Railway/env values sometimes arrive without protocol or copied with brackets.
  value = value.replace(/^\[+|\]+$/g, "").trim();

  if (!/^https?:\/\//i.test(value)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
    value = `${isLocal ? "http" : "https"}://${value}`;
  }

  return value.replace(/\/+$/g, "");
}

function construirLinkActivacion(tokenActivacion) {
  const appUrl = normalizarUrlBase(process.env.APP_URL);
  const url = new URL("/activar-cuenta", appUrl);
  url.searchParams.set("token", tokenActivacion);
  return url.toString();
}

async function crearUploadUrlS3({ bucket, storageKey, mimeType }) {
  if (!bucket) return null;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: AWS_S3_PRESIGN_EXPIRES_SECONDS,
  });
}

async function crearDownloadUrlS3({ bucket, storageKey }) {
  if (!bucket) return null;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: AWS_S3_PRESIGN_EXPIRES_SECONDS,
  });
}

function obtenerObjetoDesdeUrlS3(fileUrl) {
  const value = String(fileUrl || "");
  const allowedBuckets = new Set(
    [AWS_S3_BUCKET, AWS_S3_AVES_BUCKET, AWS_S3_COMBATES_BUCKET].filter(Boolean),
  );

  for (const bucket of allowedBuckets) {
    const prefix = `https://${bucket}.s3.${AWS_S3_REGION}.amazonaws.com/`;
    if (value.startsWith(prefix)) {
      return {
        bucket,
        storageKey: decodeURIComponent(value.slice(prefix.length)),
      };
    }
  }

  return null;
}

function construirMetadataVideoCombate({ peleaId, usuarioId, nombreArchivo, mimeType }) {
  const safeName = normalizarNombreArchivo(nombreArchivo);
  const storageKey = construirStorageKeyS3(
    "combates",
    usuarioId || "sin-usuario",
    peleaId,
    `${Date.now()}-${crypto.randomUUID()}-${safeName}`,
  );
  const bucket = AWS_S3_COMBATES_BUCKET || "pendiente-configurar-bucket-s3";
  const videoUrl = AWS_S3_COMBATES_BUCKET
    ? construirUrlS3(bucket, storageKey)
    : `s3://${bucket}/${storageKey}`;

  return {
    storageProvider: VIDEO_STORAGE_PROVIDER,
    storageBucket: bucket,
    storageKey,
    videoUrl,
    uploadUrl: null,
    estadoCarga: AWS_S3_COMBATES_BUCKET ? "PENDIENTE_SUBIDA" : "PENDIENTE_CONFIGURACION",
    mimeType,
    nombreArchivo: safeName,
  };
}

function construirMetadataArchivoAve({ aveId, usuarioId, nombreArchivo, mimeType, tipo }) {
  const safeName = normalizarNombreArchivo(nombreArchivo || "archivo");
  const tipoCarpeta = tipo === "VIDEO" ? "videos" : "fotos";
  const storageKey = construirStorageKeyS3(
    "aves",
    usuarioId || "sin-usuario",
    aveId,
    tipoCarpeta,
    `${Date.now()}-${crypto.randomUUID()}-${safeName}`,
  );
  const bucket = AWS_S3_AVES_BUCKET || "pendiente-configurar-bucket-s3";
  const fileUrl = AWS_S3_AVES_BUCKET
    ? construirUrlS3(bucket, storageKey)
    : `s3://${bucket}/${storageKey}`;

  return {
    storageProvider: "AWS_S3",
    storageBucket: bucket,
    storageKey,
    fileUrl,
    uploadUrl: null,
    mimeType,
    nombreArchivo: safeName,
    tipo,
  };
}

function construirMetadataFotoUsuario({ usuarioId, nombreArchivo, mimeType }) {
  const safeName = normalizarNombreArchivo(nombreArchivo || "foto.jpg");
  const storageKey = construirStorageKeyS3(
    "usuarios",
    usuarioId || "sin-usuario",
    "foto",
    `${Date.now()}-${crypto.randomUUID()}-${safeName}`,
  );
  const bucket = AWS_S3_AVES_BUCKET || AWS_S3_BUCKET || "pendiente-configurar-bucket-s3";
  const fileUrl = AWS_S3_AVES_BUCKET || AWS_S3_BUCKET
    ? construirUrlS3(bucket, storageKey)
    : `s3://${bucket}/${storageKey}`;

  return {
    storageProvider: "AWS_S3",
    storageBucket: bucket,
    storageKey,
    fileUrl,
    uploadUrl: null,
    mimeType,
    nombreArchivo: safeName,
  };
}

//============================================
// MIDDLEWARE JWT - Solo /login es público
//============================================
function middlewareJWT(req, res, next) {
  if (req.path === "/api/avecombatiente/login") return next();

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "No autorizado",
      message: "Token requerido. Encabezado: Authorization: Bearer <token>",
    });
  }

  try {
    req.jwtUser = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError" ? "Token expirado" : "Token inválido";
    return res.status(403).json({ error: msg });
  }
}

//============================================
// MIDDLEWARE PERMISOS - Verifica rol vs entidad
//============================================
function middlewarePermisos(req, res, next) {
  if (req.path === "/api/avecombatiente/login") return next();
  if (!req.jwtUser) return next();

  const rol = req.jwtUser.rol;
  const entidad = extraerEntidad(req.path);
  const operacion = METODO_A_OPERACION[req.method];

  if (!entidad || !operacion) return next();

  const permisosRol = PERMISOS_ROL[rol];
  if (!permisosRol) {
    return res.status(403).json({ error: `Rol desconocido: ${rol}` });
  }

  const permisosEntidad = permisosRol[entidad] || [];
  if (!permisosEntidad.includes(operacion)) {
    return res.status(403).json({
      error: "Sin permisos",
      message: `El rol "${rol}" no puede realizar ${operacion} en ${entidad}`,
    });
  }

  next();
}

//============================================
// REGISTRAR MIDDLEWARES GLOBALMENTE
//============================================
// cds.on('bootstrap', (app) => {
//     app.use(middlewareJWT);
//     app.use(middlewarePermisos);
// });

module.exports = cds.service.impl(async function () {
  const {
    Aves,
    Crias,
    Pesajes,
    Peleas,
    Incubaciones,
    IncubacionDetalles,
    HistorialCambios,
    FotosAve,
    VideosAve,
    Transacciones,
    Usuario,
    Rol,
    Suscripciones,
    LineasAves,
    ComposicionesLineaAve,
    PlanesCruces,
    EvaluacionesAves,
    EvaluacionesPleito,
    IncubacionesActivas,
    AvesActivas,
    LineasAvesActivas,
  } = this.entities;

  function agregarFiltroUsuario(req, campoUsuario = "usuario_ID") {
    const userId = req.jwtUser && req.jwtUser.id;
    if (!userId || !req.query?.SELECT) return;

    if (!req.query.SELECT.where) {
      req.query.SELECT.where = [];
    } else if (req.query.SELECT.where.length > 0) {
      req.query.SELECT.where.push("and");
    }

    req.query.SELECT.where.push({ ref: [campoUsuario] }, "=", { val: userId });
  }

  function agregarFiltroEstadoNoEliminado(req, campoEstado = "estado") {
    if (!req.query?.SELECT) return;

    if (!req.query.SELECT.where) {
      req.query.SELECT.where = [];
    } else if (req.query.SELECT.where.length > 0) {
      req.query.SELECT.where.push("and");
    }

    req.query.SELECT.where.push({ ref: [campoEstado] }, "!=", { val: "ELIMINADO" });
  }

  function calcularDiasRestantes(fechaFin) {
    if (!fechaFin) return 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fin = new Date(fechaFin);
    fin.setHours(0, 0, 0, 0);
    return Math.ceil((fin.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
  }

  function moduloPermitidoPorPlan(plan, entidadServicio) {
    const modulos = MODULOS_POR_PLAN[String(plan || "").toUpperCase()] || [];
    return modulos.includes("*") || modulos.includes(entidadServicio);
  }

  async function validarPlanPremiumMultimedia(req) {
    const usuarioId = req.jwtUser?.id;
    if (!usuarioId) {
      return req.reject(401, "No se pudo identificar el usuario actual.");
    }

    const suscripcion = await obtenerSuscripcionUsuario(usuarioId, req);
    const diasRestantes = suscripcion ? calcularDiasRestantes(suscripcion.fechaFin) : 0;
    const tienePremium =
      suscripcion &&
      moduloPermitidoPorPlan(suscripcion.plan, "FotosAve") &&
      moduloPermitidoPorPlan(suscripcion.plan, "VideosAve") &&
      ["ACTIVA", "CANCELADA"].includes(suscripcion.estado) &&
      diasRestantes >= 0;

    if (!tienePremium) {
      return req.reject(403, "Las fotos y videos solo estan disponibles para el plan Premium o prueba vigente.");
    }
  }

  async function obtenerSuscripcionUsuario(usuarioId, req) {
    if (!usuarioId) return null;

    if (req && Object.prototype.hasOwnProperty.call(req, "_suscripcionCache")) {
      return req._suscripcionCache;
    }

    const cachedValue = leerCacheSuscripcion(usuarioId);
    if (cachedValue !== undefined) {
      if (req) req._suscripcionCache = cachedValue;
      return cachedValue;
    }

    const suscripciones = await SELECT
      .from(Suscripciones)
      .where({ usuario_ID: usuarioId })
      .orderBy("createdAt desc");

    if (!suscripciones.length) {
      if (req) req._suscripcionCache = null;
      guardarCacheSuscripcion(usuarioId, null);
      return null;
    }

    const suscripcion = suscripciones[0];
    const diasRestantes = calcularDiasRestantes(suscripcion.fechaFin);

    if (suscripciones.length > 1) {
      await DELETE.from(Suscripciones)
        .where({ usuario_ID: usuarioId })
        .and({ ID: { "!=": suscripcion.ID } });
    }

    if (["ACTIVA", "CANCELADA", "PENDIENTE"].includes(suscripcion.estado) && diasRestantes < 0) {
      await UPDATE(Suscripciones)
        .set({ estado: "VENCIDA" })
        .where({ ID: suscripcion.ID });
      suscripcion.estado = "VENCIDA";
    }

    if (req) req._suscripcionCache = suscripcion;
    guardarCacheSuscripcion(usuarioId, suscripcion);

    return suscripcion;
  }

  async function validarSuscripcion(req, entidadServicio) {
    const usuarioId = req.jwtUser?.id;
    if (!usuarioId) return;

    const accionesSuscripcion = [
      "obtenerSuscripcionActual",
      "activarSuscripcion",
      "crearCheckoutMercadoPago",
      "cancelarSuscripcion",
      "logout",
      "adminListarUsuarios",
      "adminActualizarEstadoUsuario",
      "adminAsignarSuscripcion",
      "adminCancelarSuscripcionUsuario",
      "obtenerDatosContacto",
      "enviarQuejaSugerencia",
    ];

    if (accionesSuscripcion.includes(req.event)) return;

    const esLectura = req.event === "READ" || req.event === "obtenerDashboard";
    const suscripcion = await obtenerSuscripcionUsuario(usuarioId, req);

    if (!suscripcion) {
      if (!esLectura) {
        return req.reject(402, "Debes activar tu plan de prueba para continuar.");
      }
      return;
    }

    const diasRestantes = calcularDiasRestantes(suscripcion.fechaFin);

    const tieneAccesoVigente = ["ACTIVA", "CANCELADA"].includes(suscripcion.estado) && diasRestantes >= 0;

    if (!tieneAccesoVigente && !esLectura) {
      return req.reject(402, "Tu suscripcion esta vencida. Renueva tu plan para registrar o modificar informacion.");
    }

    if (!moduloPermitidoPorPlan(suscripcion.plan, entidadServicio)) {
      return req.reject(403, `Tu plan ${suscripcion.plan} no incluye acceso al modulo ${entidadServicio}.`);
    }

    if (req.event !== "CREATE") return;

    if (entidadServicio === "Aves") {
      const [res] = await SELECT.from(Aves)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
          etapaVida: { "!=": "POLLITO" },
        })
        .columns("count(*) as total");

      if (Number(res?.total || 0) >= Number(suscripcion.maxAves || 0)) {
        return req.reject(402, "Alcanzaste el limite de aves adultas de tu plan.");
      }
    }

    if (entidadServicio === "Crias") {
      const [res] = await SELECT.from(Crias)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("count(*) as total");

      if (Number(res?.total || 0) >= Number(suscripcion.maxPollitos || 0)) {
        return req.reject(402, "Alcanzaste el limite de aves jovenes de tu plan.");
      }
    }

    if (entidadServicio === "Incubaciones") {
      const [res] = await SELECT.from(Incubaciones)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("count(*) as total");

      if (Number(res?.total || 0) >= Number(suscripcion.maxIncubaciones || 0)) {
        return req.reject(402, "Alcanzaste el limite de incubaciones de tu plan.");
      }
    }
  }

  // Intercepta TODAS las operaciones del servicio
  this.before("*", async (req) => {
    // El action login no requiere token
    const accionesPublicas = [
      "login",
      "logout",
      "registrarUsuario",
      "reenviarActivacion",
      "solicitarRecuperacionPassword",
      "restablecerPassword",
    ];
    if (accionesPublicas.includes(req.event)) return;

    // Obtener token del header
    const authHeader =
      req.headers?.authorization || req._.req?.headers?.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token)
      return req.reject(
        401,
        "Token requerido. Encabezado: Authorization: Bearer <token>",
      );

    try {
      req.jwtUser = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const msg =
        err.name === "TokenExpiredError" ? "Token expirado" : "Token inválido";
      return req.reject(403, msg);
    }

    if (req.event === "recalcularComposicionLineas") return;

    // Verificar permisos por rol
    const rol = req.jwtUser.rol;
    let operacion = req.event; // READ, CREATE, UPDATE, DELETE
    const entidadRaw = req.target?.name || req.entity || "";
    const entidad = req.entity?.split(".").pop(); // "ave.combatiente.Ave" -> "Ave"

    if (!entidad || !operacion) return;

    // Mapear nombre de entidad CDS al nombre del servicio
    const ENTIDAD_MAP = {
      Ave: "Aves",
      Aves: "Aves",
      Cria: "Crias",
      Crias: "Crias",
      Pesaje: "Pesajes",
      Pesajes: "Pesajes",
      Pelea: "Peleas",
      Peleas: "Peleas",
      Incubacion: "Incubaciones",
      Incubaciones: "Incubaciones",
      Tratamiento: "Tratamientos",
      Tratamientos: "Tratamientos",
      Alimentacion: "Alimentaciones",
      Alimentaciones: "Alimentaciones",
      Transaccion: "Transacciones",
      Transacciones: "Transacciones",
      Raza: "Razas",
      Razas: "Razas",
      Color: "Colores",
      Colores: "Colores",
      TipoAve: "TiposAve",
      TiposAve: "TiposAve",
      FotoAve: "FotosAve",
      FotosAve: "FotosAve",
      VideoAve: "VideosAve",
      VideosAve: "VideosAve",
      DocumentoAve: "DocumentosAve",
      DocumentosAve: "DocumentosAve",
      FotoPelea: "FotosPelea",
      FotosPelea: "FotosPelea",
      Usuario: "Usuarios",
      Usuarios: "Usuarios",
      Suscripcion: "Suscripciones",
      Suscripciones: "Suscripciones",
      Rol: "Roles",
      Roles: "Roles",
      HistorialCambios: "Historial",
      Historial: "Historial",
      LineaAve: "LineasAves",
      LineasAves: "LineasAves",
      LineasAvesActivas: "LineasAves",
    PlanCruce: "PlanesCruces",
    PlanesCruces: "PlanesCruces",
    ComposicionLineaAve: "ComposicionesLineaAve",
    ComposicionesLineaAve: "ComposicionesLineaAve",
    EvaluacionAve: "EvaluacionesAves",
      EvaluacionesAves: "EvaluacionesAves",
      EvaluacionPleito: "EvaluacionesPleito",
      EvaluacionesPleito: "EvaluacionesPleito",
      IncubacionDetalle: "IncubacionDetalles",
      IncubacionDetalles: "IncubacionDetalles",
    };

    let entidadServicio = ENTIDAD_MAP[entidad];
    if (req.event === "registrarCombate") {
      operacion = "CREATE";
      entidadServicio = "Peleas";
    }
    const permisosRol = PERMISOS_ROL[rol];

    if (!permisosRol) return req.reject(403, `Rol desconocido: ${rol}`);
    if (!entidadServicio) return;

    const permisosEntidad = permisosRol[entidadServicio] || [];
    if (!permisosEntidad.includes(operacion)) {
      return req.reject(
        403,
        `El rol "${rol}" no puede realizar ${operacion} en ${entidadServicio}`,
      );
    }

    await validarSuscripcion(req, entidadServicio);
  });

  this.on("registrarRoles", async (req) => {
    const { codigo, nombre, descripcion, permisos, activo } = req.data;

    if (!codigo || !nombre || !activo) {
      return req.error(400, "codigo, nombre y activo son requeridos");
    }

    const db = await cds.connect.to("db");
    const { Usuario, Rol } = cds.entities("ave.combatiente");

    const rolValidate = await SELECT.one
      .from(Rol)
      .columns("ID", "codigo", "nombre", "descripcion", "permisos", "activo")
      .where({ codigo });

    if (rolValidate) {
      return req.error(409, "El Rol ya está registrado");
    }

    // Crear usuario
    const obj = {
      ID: require("crypto").randomUUID(),
      codigo: codigo,
      nombre: nombre,
      descripcion: descripcion,
      permisos: permisos,
      activo: activo,
    };

    await db.run(INSERT.into(Rol).entries(obj));

    const rolCreated = await SELECT.one
      .from(Rol)
      .columns("ID", "codigo", "nombre", "descripcion", "permisos", "activo")
      .where({ codigo });

    return {
      success: true,
      codigo: rolCreated.codigo,
      nombre: rolCreated.username,
      descripcion: rolCreated.descripcion,
      activo: rolCreated.activo,
    };
  });

  this.on("registrarUsuario", async (req) => {
    const { username, email, password, nombre, apellido, telefono, direccion } =
      req.data;

    if (!username || !email || !password || !nombre || !apellido) {
      return req.error(
        400,
        "username, email, password, nombre y apellido son requeridos",
      );
    }

    const db = await cds.connect.to("db");
    const { Usuario } = cds.entities("ave.combatiente");
    const emailNormalizado = email.trim().toLowerCase();
    const usernameNormalizado = username.trim();

    // Buscar usuario con su rol
    const user = await SELECT.one
      .from(Usuario)
      .columns(
        "ID",
        "username",
        "email",
        "password",
        "nombre",
        "apellido",
        "rol_ID",
      )
      .where({ email: emailNormalizado });

    if (user) {
      return req.error(409, "El email ya está registrado");
    }

    // Hashear password
    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    let rolCodigo = "ADMIN",
      rolNombre = "",
      rol_id = "";
    // Obtener nombre del rol

    const rol = await SELECT.one
      .from("ave.combatiente.Rol")
      .columns("codigo", "nombre", "ID")
      .where({ codigo: rolCodigo });

    if (rol) {
      rolCodigo = rol.codigo;
      rolNombre = rol.nombre;
      rol_id = rol.ID;
    } else {
      return req.error(
        400,
        "El Rol por defecto no se encuentra registrado en la tabla maestra",
      );
    }

    // Generar token de activación
    const tokenActivacion = crypto.randomBytes(32).toString("hex");
    const tokenExpiracion = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Crear usuario
    const nuevoUsuario = {
      ID: require("crypto").randomUUID(),
      username: usernameNormalizado,
      nombre: nombre,
      apellido: apellido,
      email: emailNormalizado,
      password: passwordHash,
      telefono: telefono,
      direccion: direccion,
      estado: "PENDIENTE",
      tokenActivacion,
      tokenExpiracion,
      rol_ID: rol_id,
    };

    await db.run(INSERT.into(Usuario).entries(nuevoUsuario));
    // Enviar correo de activación
    let correoActivacionEnviado = true;
    let mensajeCorreoActivacion = "";
    try {
      await enviarCorreoActivacion(emailNormalizado, tokenActivacion);
    } catch (mailError) {
      correoActivacionEnviado = false;
      mensajeCorreoActivacion = obtenerMensajeErrorCorreo(mailError);
      console.error("Error enviando correo de activacion:", mailError);
    }

    // Aviso al dueño de la app (no bloquea el registro)
    try {
      await enviarCorreoDuenoNuevoUsuario({ usuario: nuevoUsuario });
    } catch (ownerMailError) {
      console.error("Error enviando aviso de nuevo usuario al dueno:", ownerMailError);
    }

    return {
      success: true,
      message: correoActivacionEnviado
        ? "Usuario registrado correctamente. Revisa tu correo para activar tu cuenta."
        : "Usuario registrado correctamente, pero no se pudo enviar el correo de activacion. Intenta reenviar la activacion cuando el servicio de correo este disponible.",
      correoActivacionEnviado,
      mensajeCorreoActivacion,
      userId: nuevoUsuario.ID,
      username: nuevoUsuario.username,
      nombre: nuevoUsuario.nombre,
      apellido: nuevoUsuario.apellido,
      email: nuevoUsuario.email,
      rol: rolNombre,
      estado: nuevoUsuario.estado,
      telefono: nuevoUsuario.telefono,
      direccion: nuevoUsuario.direccion,
    };
  });

  this.on("reenviarActivacion", async (req) => {
    const { email } = req.data;

    if (!email) {
      return req.error(400, "El email es requerido");
    }

    const db = await cds.connect.to("db");
    const { Usuario } = cds.entities("ave.combatiente");

    const emailNormalizado = email.trim().toLowerCase();

    const user = await db.run(
      SELECT.one
        .from(Usuario)
        .columns("ID", "email", "estado", "nombre", "apellido")
        .where({ email: emailNormalizado }),
    );

    if (!user) {
      return req.error(404, "No existe un usuario con ese email");
    }

    if (user.estado === "ACTIVO") {
      return req.error(400, "La cuenta ya está activada");
    }

    const nuevoTokenActivacion = crypto.randomBytes(32).toString("hex");
    const nuevaExpiracion = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.run(
      UPDATE(Usuario)
        .set({
          tokenActivacion: nuevoTokenActivacion,
          tokenExpiracion: nuevaExpiracion,
        })
        .where({ ID: user.ID }),
    );

    await enviarCorreoActivacion(emailNormalizado, nuevoTokenActivacion);

    return {
      success: true,
      message: "Se ha reenviado el correo de activación",
    };
  });

  //==========================================
  // ACTION: LOGIN
  //==========================================
  this.on("login", async (req) => {
    const { email, password } = req.data;

    if (!email || !password) {
      return req.error(400, "email y password son requeridos");
    }

    // Buscar usuario con su rol
    const user = await SELECT.one
      .from("ave.combatiente.Usuario")
      .columns(
        "ID",
        "username",
        "email",
        "password",
        "estado",
        "nombre",
        "apellido",
        "fotoUrl",
        "rol_ID",
      )
      .where({ email: email.trim().toLowerCase() });

    if (!user) {
      return req.error(401, "Usuario no registrado");
    }

    if (user.estado !== "ACTIVO") {
      return req.error(
        403,
        "Tu cuenta aún no ha sido activada. Revisa tu correo.",
      );
    }

    // Verificar password
    const passwordValido = await bcrypt.compare(password, user.password);
    if (!passwordValido) {
      return req.error(401, "Password inválido");
    }

    // Obtener nombre del rol
    let rolCodigo = "VIEWER",
      rolNombre = "Viewer";
    if (user.rol_ID) {
      const rol = await SELECT.one
        .from("ave.combatiente.Rol")
        .columns("codigo", "nombre")
        .where({ ID: user.rol_ID });
      if (rol) {
        rolCodigo = rol.codigo;
        rolNombre = rol.nombre;
      }
    }

    // Actualizar último acceso
    await UPDATE("ave.combatiente.Usuario")
      .set({ ultimoAcceso: new Date().toISOString() })
      .where({ ID: user.ID });

    // Generar token
    const token = jwt.sign(
      {
        id: user.ID,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: rolCodigo,
        activo: user.activo,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES },
    );

    return {
      success: true,
      token,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      rol: rolNombre,
      userId: user.ID,
      fotoUrl: user.fotoUrl || "",
    };
  });

  this.on("logout", async (req) => {
    // JWT es stateless, solo confirmamos al cliente
    return {
      success: true,
      message: "Sesión cerrada exitosamente",
    };
  });
  async function obtenerUsuarioPerfil(usuarioId) {
    const user = await SELECT.one
      .from("ave.combatiente.Usuario")
      .columns(
        "ID",
        "username",
        "email",
        "nombre",
        "apellido",
        "telefono",
        "direccion",
        "fotoUrl",
        "estado",
        "rol_ID",
      )
      .where({ ID: usuarioId });

    if (!user) return null;

    let rolNombre = "";
    if (user.rol_ID) {
      const rol = await SELECT.one
        .from("ave.combatiente.Rol")
        .columns("nombre")
        .where({ ID: user.rol_ID });
      rolNombre = rol?.nombre || "";
    }

    return {
      success: true,
      userId: user.ID,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono,
      direccion: user.direccion,
      fotoUrl: user.fotoUrl || "",
      rol: rolNombre,
      estado: user.estado,
    };
  }

  this.on("obtenerPerfil", async (req) => {
    const perfil = await obtenerUsuarioPerfil(req.jwtUser?.id);
    if (!perfil) return req.reject(404, "Usuario no encontrado");
    return perfil;
  });

  this.on("actualizarPerfil", async (req) => {
    const usuarioId = req.jwtUser?.id;
    const { username, email, nombre, apellido, telefono, direccion } = req.data;

    if (!email || !nombre || !apellido) {
      return req.reject(400, "Email, nombre y apellido son requeridos");
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const usuarioDuplicado = await SELECT.one
      .from("ave.combatiente.Usuario")
      .columns("ID")
      .where({ email: emailNormalizado, ID: { "!=": usuarioId } });

    if (usuarioDuplicado) {
      return req.reject(409, "El email ya esta registrado por otro usuario");
    }

    await UPDATE("ave.combatiente.Usuario")
      .set({
        username: String(username || "").trim() || emailNormalizado,
        email: emailNormalizado,
        nombre: String(nombre || "").trim(),
        apellido: String(apellido || "").trim(),
        telefono: telefono ? String(telefono).trim() : null,
        direccion: direccion ? String(direccion).trim() : null,
      })
      .where({ ID: usuarioId });

    const perfil = await obtenerUsuarioPerfil(usuarioId);
    return {
      ...perfil,
      message: "Perfil actualizado correctamente",
    };
  });

  this.on("prepararCargaFotoUsuario", async (req) => {
    const { nombreArchivo, mimeType, tamanioBytes } = req.data;
    const userId = req.jwtUser?.id;

    if (!nombreArchivo || !mimeType) {
      return req.reject(400, "Debe seleccionar una imagen valida.");
    }

    if (!String(mimeType).startsWith("image/")) {
      return req.reject(400, "El archivo seleccionado no es una imagen valida.");
    }

    if (Number(tamanioBytes || 0) <= 0) {
      return req.reject(400, "El archivo seleccionado no tiene contenido.");
    }

    if (Number(tamanioBytes) > FOTO_USUARIO_MAX_BYTES) {
      return req.reject(400, "La imagen supera el tamano maximo permitido (5 MB).");
    }

    const metadata = construirMetadataFotoUsuario({
      usuarioId: userId,
      nombreArchivo,
      mimeType,
    });
    metadata.uploadUrl = await crearUploadUrlS3({
      bucket: metadata.storageBucket,
      storageKey: metadata.storageKey,
      mimeType: metadata.mimeType,
    });

    return {
      success: true,
      message: metadata.storageBucket && metadata.storageBucket !== "pendiente-configurar-bucket-s3"
        ? "Foto preparada para carga en AWS S3."
        : "Foto registrada en modo preparacion. Configura AWS_S3_AVES_BUCKET o AWS_S3_BUCKET para activar S3.",
      uploadUrl: metadata.uploadUrl,
      fileUrl: metadata.fileUrl,
      storageProvider: metadata.storageProvider,
      storageBucket: metadata.storageBucket,
      storageKey: metadata.storageKey,
      nombreArchivo: metadata.nombreArchivo,
      mimeType: metadata.mimeType,
    };
  });

  this.on("actualizarFotoPerfil", async (req) => {
    const usuarioId = req.jwtUser?.id;
    const { fotoUrl } = req.data;

    if (!fotoUrl) {
      return req.reject(400, "Debe indicar la URL de la foto de perfil.");
    }

    await UPDATE("ave.combatiente.Usuario")
      .set({ fotoUrl: String(fotoUrl).trim() })
      .where({ ID: usuarioId });

    const perfil = await obtenerUsuarioPerfil(usuarioId);
    return {
      ...perfil,
      message: "Foto de perfil actualizada correctamente",
    };
  });

  this.on("eliminarFotoPerfil", async (req) => {
    const usuarioId = req.jwtUser?.id;

    await UPDATE("ave.combatiente.Usuario")
      .set({ fotoUrl: null })
      .where({ ID: usuarioId });

    const perfil = await obtenerUsuarioPerfil(usuarioId);
    return {
      ...perfil,
      message: "Foto de perfil eliminada correctamente",
    };
  });

  this.on("cambiarPassword", async (req) => {
    const usuarioId = req.jwtUser?.id;
    const { passwordActual, passwordNuevo } = req.data;

    if (!passwordActual || !passwordNuevo) {
      return req.reject(400, "La contrasena actual y nueva son requeridas");
    }

    if (String(passwordNuevo).length < 6) {
      return req.reject(400, "La nueva contrasena debe tener al menos 6 caracteres");
    }

    const user = await SELECT.one
      .from("ave.combatiente.Usuario")
      .columns("ID", "password")
      .where({ ID: usuarioId });

    if (!user) return req.reject(404, "Usuario no encontrado");

    const passwordValido = await bcrypt.compare(passwordActual, user.password);
    if (!passwordValido) {
      return req.reject(400, "La contrasena actual no es correcta");
    }

    const passwordHash = await bcrypt.hash(passwordNuevo, 10);
    await UPDATE("ave.combatiente.Usuario")
      .set({ password: passwordHash })
      .where({ ID: usuarioId });

    return {
      success: true,
      message: "Contrasena actualizada correctamente",
    };
  });

  async function construirResumenSuscripcion(usuarioId) {
    const suscripcion = await obtenerSuscripcionUsuario(usuarioId);

    if (!suscripcion) {
      return {
        tieneSuscripcion: false,
        ID: null,
        plan: "",
        estado: "",
        fechaInicio: null,
        fechaFin: null,
        diasRestantes: 0,
        maxAves: 0,
        maxPollitos: 0,
        maxIncubaciones: 0,
        precioMensual: 0,
        moneda: "PEN",
        totalAves: 0,
        totalPollitos: 0,
        totalIncubaciones: 0,
        porcentajeUsoAves: 0,
        mensaje: "Aun no tienes una suscripcion activa.",
      };
    }

    const diasRestantes = Math.max(calcularDiasRestantes(suscripcion.fechaFin), 0);
    const [totalAvesRes] = await SELECT.from(Aves)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" },
        etapaVida: { "!=": "POLLITO" },
      })
      .columns("count(*) as total");
    const [totalPollitosRes] = await SELECT.from(Crias)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" },
      })
      .columns("count(*) as total");
    const [totalIncubacionesRes] = await SELECT.from(Incubaciones)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" },
      })
      .columns("count(*) as total");

    const totalAves = Number(totalAvesRes?.total || 0);
    const maxAves = Number(suscripcion.maxAves || 0);
    const porcentajeUsoAves = maxAves > 0
      ? Number(((totalAves / maxAves) * 100).toFixed(2))
      : 0;

    return {
      tieneSuscripcion: true,
      ID: suscripcion.ID,
      plan: suscripcion.plan,
      estado: suscripcion.estado,
      fechaInicio: suscripcion.fechaInicio,
      fechaFin: suscripcion.fechaFin,
      diasRestantes,
      maxAves: suscripcion.maxAves,
      maxPollitos: suscripcion.maxPollitos,
      maxIncubaciones: suscripcion.maxIncubaciones,
      precioMensual: suscripcion.precioMensual,
      moneda: suscripcion.moneda,
      totalAves,
      totalPollitos: Number(totalPollitosRes?.total || 0),
      totalIncubaciones: Number(totalIncubacionesRes?.total || 0),
      porcentajeUsoAves,
      mensaje: diasRestantes > 0 && suscripcion.estado === "CANCELADA"
        ? `Tu suscripcion fue cancelada, pero puedes usarla hasta el ${suscripcion.fechaFin}.`
        : String(suscripcion.mercadoPagoStatus || "").toLowerCase() === "pending" && diasRestantes > 0
          ? `Tu plan ${suscripcion.plan} sigue vigente. Hay un pago pendiente en Mercado Pago; al autorizarlo se actualizara el plan.`
          : diasRestantes > 0
            ? `Tu plan ${suscripcion.plan} vence en ${diasRestantes} dias.`
            : "Tu suscripcion esta vencida.",
    };
  }

  this.on("obtenerSuscripcionActual", async (req) => {
    const usuarioId = req.jwtUser?.id;
    if (!usuarioId) return req.reject(401, "No se pudo identificar el usuario logueado.");
    return construirResumenSuscripcion(usuarioId);
  });

  this.on("activarSuscripcion", async (req) => {
    const usuarioId = req.jwtUser?.id;
    if (!usuarioId) return req.reject(401, "No se pudo identificar el usuario logueado.");

    const plan = String(req.data.plan || "").trim().toUpperCase();

    if (!PLANES_SUSCRIPCION[plan]) {
      return req.reject(400, "Debe seleccionar un plan valido: PRUEBA, BASICO, PRO o PREMIUM.");
    }

    // En produccion solo se permite activar gratis el plan de prueba.
    // Para pruebas locales: ALLOW_MANUAL_PAID_PLANS=true
    const allowManualPaid = String(process.env.ALLOW_MANUAL_PAID_PLANS || "").toLowerCase() === "true";
    if (plan !== "PRUEBA" && !allowManualPaid) {
      return req.reject(
        400,
        "Los planes de pago se activan solo mediante Mercado Pago. Usa Suscribirse en la pantalla de suscripcion.",
      );
    }

    const actual = await obtenerSuscripcionUsuario(usuarioId);
    if (plan === "PRUEBA" && actual) {
      return req.reject(400, "El plan de prueba solo se activa automaticamente para usuarios nuevos.");
    }

    const inicio = new Date();
    const config = PLANES_SUSCRIPCION[plan];
    const fin = sumarDias(inicio, plan === "PRUEBA" ? config.dias : 30);
    const datosSuscripcion = {
      ...construirDatosSuscripcion(plan, "ACTIVA", inicio),
      fechaFin: fechaISO(fin),
      proveedorPago: plan === "PRUEBA" ? null : "MANUAL",
      observaciones: plan === "PRUEBA" ? "Plan de prueba premium activado por 60 dias" : `Plan ${plan} activado por 30 dias`,
    };

    if (actual) {
      await UPDATE(Suscripciones)
        .set(datosSuscripcion)
        .where({ ID: actual.ID });
    } else {
      await INSERT.into(Suscripciones).entries({
        ID: crypto.randomUUID(),
        usuario_ID: usuarioId,
        ...datosSuscripcion,
      });
    }

    invalidarCacheSuscripcion(usuarioId);

    if (plan === "PRUEBA") {
      try {
        const usuario = await SELECT.one
          .from(Usuario)
          .columns("ID", "username", "email", "nombre", "apellido", "telefono")
          .where({ ID: usuarioId });
        await enviarCorreoDuenoNuevaPrueba({
          usuario,
          fechaInicio: fechaISO(inicio),
          fechaFin: fechaISO(fin),
        });
      } catch (mailError) {
        console.error("No se pudo notificar al dueno sobre la nueva cuenta de prueba:", mailError);
      }
    }

    return {
      success: true,
      message: `Suscripcion ${plan} activada correctamente.`,
    };
  });

  function usarSandboxMercadoPago(accessToken) {
    const env = String(process.env.MERCADOPAGO_ENV || "").toLowerCase();
    if (env === "sandbox") return true;
    if (env === "production" || env === "prod") return false;
    return String(accessToken || "").startsWith("TEST-");
  }

  function obtenerUrlPublicaBackend() {
    if (process.env.BACKEND_PUBLIC_URL) {
      return String(process.env.BACKEND_PUBLIC_URL).replace(/\/$/, "");
    }
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      return `https://${String(process.env.RAILWAY_PUBLIC_DOMAIN).replace(/^https?:\/\//, "")}`;
    }
    return null;
  }

  function parsePlanDesdeExternalReference(externalReference) {
    const parts = String(externalReference || "").split(":");
    const plan = String(parts[2] || "").toUpperCase();
    return PLANES_SUSCRIPCION[plan] ? plan : null;
  }

  this.on("crearCheckoutMercadoPago", async (req) => {
    try {
      const usuarioId = req.jwtUser?.id;
      if (!usuarioId) return req.reject(401, "No se pudo identificar el usuario logueado.");

      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!accessToken) {
        return req.reject(500, "Falta configurar MERCADOPAGO_ACCESS_TOKEN en el backend.");
      }

      const planData = getPlanConfig(req.data?.plan);
      if (!planData || planData.plan === "PRUEBA") {
        return req.reject(400, "Debe seleccionar un plan pagado valido: BASICO, PRO o PREMIUM.");
      }

      const { Usuario: UsuarioDb } = cds.entities("ave.combatiente");
      const usuario = await SELECT.one
        .from(UsuarioDb)
        .columns("ID", "email", "nombre", "apellido")
        .where({ ID: usuarioId });

      if (!usuario?.email) {
        return req.reject(400, "Tu usuario debe tener un correo registrado para crear la suscripcion.");
      }

      const payerEmail = String(usuario.email || "").trim().toLowerCase();
      if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
        return req.reject(400, "Tu usuario debe tener un correo valido para crear la suscripcion.");
      }

      const { plan, config } = planData;
      const actual = await obtenerSuscripcionUsuario(usuarioId);
      const diasRestantes = actual ? calcularDiasRestantes(actual.fechaFin) : -1;
      const accesoVigente = actual && ["ACTIVA", "CANCELADA"].includes(actual.estado) && diasRestantes >= 0;
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080/index.html";        
      const backendPublicUrl = obtenerUrlPublicaBackend();
      const externalReference = `aves:${usuarioId}:${plan}:${crypto.randomUUID()}`;
      const payload = {
        reason: `LinajeGallo - Plan ${plan}`,
        external_reference: externalReference,
        // Mercado Pago exige el mismo e-mail al pagar (cuenta o solo tarjeta).
        payer_email: payerEmail,
        back_url: `${frontendUrl}#/suscripcion`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: Number(config.precioMensual),
          currency_id: "PEN",
        },
        status: "pending",
      };

      if (backendPublicUrl) {
        payload.notification_url = `${backendPublicUrl}/api/mercadopago/webhook`;
      }

      const response = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let data = {};
      try {
        data = await response.json();
      } catch (parseError) {
        console.error("Mercado Pago response no JSON:", parseError);
        return req.reject(502, "Mercado Pago devolvio una respuesta invalida.");
      }

      if (!response.ok) {
        console.error("Mercado Pago create preapproval error:", data);
        const mpMessage =
          (typeof data?.message === "string" && data.message) ||
          (typeof data?.error === "string" && data.error) ||
          "Mercado Pago no pudo crear el checkout.";
        return req.reject(400, mpMessage);
      }

      const mpFields = {
        proveedorPago: "MERCADO_PAGO",
        mercadoPagoPreapprovalId: data.id || null,
        mercadoPagoExternalReference: externalReference,
        mercadoPagoStatus: data.status || "pending",
        mercadoPagoInitPoint: data.init_point || null,
        mercadoPagoSandboxInitPoint: data.sandbox_init_point || null,
        observaciones: accesoVigente
          ? `Checkout Mercado Pago pendiente para plan ${plan}. Acceso actual preservado hasta autorizar el pago.`
          : `Checkout Mercado Pago creado para plan ${plan}`,
      };

      if (accesoVigente) {
        await UPDATE(Suscripciones)
          .set(mpFields)
          .where({ ID: actual.ID });
      } else if (actual) {
        await UPDATE(Suscripciones)
          .set({
            ...construirDatosSuscripcion(plan, "PENDIENTE"),
            ...mpFields,
          })
          .where({ ID: actual.ID });
      } else {
        await INSERT.into(Suscripciones).entries({
          ID: crypto.randomUUID(),
          usuario_ID: usuarioId,
          ...construirDatosSuscripcion(plan, "PENDIENTE"),
          ...mpFields,
        });
      }

      invalidarCacheSuscripcion(usuarioId);

      const sandbox = usarSandboxMercadoPago(accessToken);
      const checkoutUrl = sandbox
        ? (data.sandbox_init_point || data.init_point)
        : (data.init_point || data.sandbox_init_point);

      if (!checkoutUrl) {
        return req.reject(502, "Mercado Pago no devolvio una URL de checkout.");
      }

      return {
        success: true,
        message: accesoVigente
          ? "Te redirigiremos a Mercado Pago. Tu acceso actual se mantiene hasta confirmar el pago."
          : "Checkout de Mercado Pago creado correctamente.",
        checkoutUrl,
        initPoint: data.init_point || null,
        sandboxInitPoint: data.sandbox_init_point || null,
        preapprovalId: data.id || null,
        accesoPreservado: !!accesoVigente,
      };
    } catch (error) {
      console.error("Error en crearCheckoutMercadoPago:", error);
      if (error?.status || error?.code) throw error;
      return req.reject(500, error?.message || "No se pudo crear el checkout de Mercado Pago.");
    }
  });

  this.on("cancelarSuscripcion", async (req) => {
    const usuarioId = req.jwtUser?.id;
    if (!usuarioId) return req.reject(401, "No se pudo identificar el usuario logueado.");

    const actual = await obtenerSuscripcionUsuario(usuarioId);
    if (!actual) return req.reject(404, "No hay una suscripcion para cancelar.");

    if (actual.proveedorPago === "MERCADO_PAGO" && actual.mercadoPagoPreapprovalId && process.env.MERCADOPAGO_ACCESS_TOKEN) {
      try {
        const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${actual.mercadoPagoPreapprovalId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "cancelled" }),
        });
        if (!mpResponse.ok) {
          const data = await mpResponse.json().catch(() => ({}));
          console.error("No se pudo cancelar en Mercado Pago:", data);
          return req.reject(502, data?.message || "Mercado Pago no pudo cancelar la suscripcion.");
        }
      } catch (error) {
        console.error("No se pudo cancelar en Mercado Pago:", error);
        return req.reject(502, "No se pudo cancelar la suscripcion en Mercado Pago.");
      }
    }

    await UPDATE(Suscripciones)
      .set({
        estado: "CANCELADA",
        mercadoPagoStatus: actual.proveedorPago === "MERCADO_PAGO" ? "cancelled" : actual.mercadoPagoStatus,
        observaciones: "Suscripcion cancelada por el usuario",
      })
      .where({ ID: actual.ID });

    invalidarCacheSuscripcion(usuarioId);

    return {
      success: true,
      message: "Suscripcion cancelada correctamente.",
    };
  });

  function requireAdmin(req) {
    const rol = String(req.jwtUser?.rol || "").toUpperCase();
    if (rol !== "ADMIN") {
      return req.reject(403, "Solo un administrador puede realizar esta operacion.");
    }
    return null;
  }

  this.on("adminListarUsuarios", async (req) => {
    if (requireAdmin(req)) return;

    // Entidades DB (this.entities expone Usuarios/Roles, no Usuario/Rol)
    const { Usuario: UsuarioDb, Rol: RolDb } = cds.entities("ave.combatiente");

    const usuarios = await SELECT.from(UsuarioDb)
      .columns(
        "ID",
        "username",
        "email",
        "nombre",
        "apellido",
        "telefono",
        "estado",
        "rol_ID",
        "ultimoAcceso",
      )
      .orderBy("createdAt desc");

    const roles = await SELECT.from(RolDb).columns("ID", "codigo", "nombre");
    const rolesById = new Map(roles.map((r) => [r.ID, r]));

    const suscripciones = await SELECT.from(Suscripciones).orderBy("fechaFin desc");
    const suscripcionByUsuario = new Map();
    for (const s of suscripciones) {
      const uid = s.usuario_ID;
      if (!uid || suscripcionByUsuario.has(uid)) continue;
      suscripcionByUsuario.set(uid, s);
    }

    const lista = usuarios.map((u) => {
      const rol = rolesById.get(u.rol_ID);
      const sus = suscripcionByUsuario.get(u.ID);
      return {
        ID: u.ID,
        username: u.username || "",
        email: u.email || "",
        nombre: u.nombre || "",
        apellido: u.apellido || "",
        telefono: u.telefono || "",
        estado: u.estado || "",
        rolCodigo: rol?.codigo || "",
        rolNombre: rol?.nombre || "",
        ultimoAcceso: u.ultimoAcceso || null,
        suscripcionId: sus?.ID || "",
        plan: sus?.plan || "",
        estadoSuscripcion: sus?.estado || "",
        fechaInicio: sus?.fechaInicio || null,
        fechaFin: sus?.fechaFin || null,
        diasRestantes: sus?.fechaFin ? calcularDiasRestantes(sus.fechaFin) : 0,
        mercadoPagoStatus: sus?.mercadoPagoStatus || "",
      };
    });

    return { usuarios: lista };
  });

  this.on("adminActualizarEstadoUsuario", async (req) => {
    if (requireAdmin(req)) return;

    const { Usuario: UsuarioDb } = cds.entities("ave.combatiente");
    const usuarioId = String(req.data?.usuarioId || "").trim();
    const estado = String(req.data?.estado || "").trim().toUpperCase();
    const estadosOk = ["ACTIVO", "PENDIENTE", "ELIMINADO"];

    if (!usuarioId) return req.reject(400, "usuarioId es requerido.");
    if (!estadosOk.includes(estado)) {
      return req.reject(400, "Estado invalido. Use ACTIVO, PENDIENTE o ELIMINADO.");
    }

    const usuario = await SELECT.one.from(UsuarioDb).columns("ID").where({ ID: usuarioId });
    if (!usuario) return req.reject(404, "Usuario no encontrado.");

    await UPDATE(UsuarioDb).set({ estado }).where({ ID: usuarioId });

    return {
      success: true,
      message: `Estado del usuario actualizado a ${estado}.`,
    };
  });

  this.on("adminAsignarSuscripcion", async (req) => {
    if (requireAdmin(req)) return;

    const { Usuario: UsuarioDb } = cds.entities("ave.combatiente");
    const usuarioId = String(req.data?.usuarioId || "").trim();
    const plan = String(req.data?.plan || "").trim().toUpperCase();
    const estado = String(req.data?.estado || "ACTIVA").trim().toUpperCase() || "ACTIVA";
    const fechaInicio = req.data?.fechaInicio;
    const fechaFin = req.data?.fechaFin;

    if (!usuarioId) return req.reject(400, "usuarioId es requerido.");
    if (!PLANES_SUSCRIPCION[plan]) {
      return req.reject(400, "Plan invalido. Use PRUEBA, BASICO, PRO o PREMIUM.");
    }
    if (!["PENDIENTE", "ACTIVA", "VENCIDA", "CANCELADA"].includes(estado)) {
      return req.reject(400, "Estado de suscripcion invalido.");
    }

    const usuario = await SELECT.one.from(UsuarioDb).columns("ID").where({ ID: usuarioId });
    if (!usuario) return req.reject(404, "Usuario no encontrado.");

    const base = construirDatosSuscripcion(plan, estado, fechaInicio ? new Date(fechaInicio) : new Date());
    if (!base) return req.reject(400, "No se pudo construir la suscripcion.");

    const datos = {
      ...base,
      estado,
      fechaInicio: fechaInicio || base.fechaInicio,
      fechaFin: fechaFin || base.fechaFin,
      observaciones: "Suscripcion asignada por administrador",
    };

    const actual = await obtenerSuscripcionUsuario(usuarioId);
    let suscripcionId = actual?.ID;

    if (actual) {
      await UPDATE(Suscripciones).set(datos).where({ ID: actual.ID });
    } else {
      suscripcionId = require("crypto").randomUUID();
      await INSERT.into(Suscripciones).entries({
        ID: suscripcionId,
        usuario_ID: usuarioId,
        ...datos,
      });
    }

    invalidarCacheSuscripcion(usuarioId);

    return {
      success: true,
      message: `Suscripcion ${plan} asignada correctamente.`,
      suscripcionId: suscripcionId || "",
    };
  });

  this.on("adminCancelarSuscripcionUsuario", async (req) => {
    if (requireAdmin(req)) return;

    const usuarioId = String(req.data?.usuarioId || "").trim();
    if (!usuarioId) return req.reject(400, "usuarioId es requerido.");

    const actual = await obtenerSuscripcionUsuario(usuarioId);
    if (!actual) return req.reject(404, "No hay una suscripcion para cancelar.");

    await UPDATE(Suscripciones)
      .set({
        estado: "CANCELADA",
        observaciones: "Suscripcion cancelada por administrador",
      })
      .where({ ID: actual.ID });

    invalidarCacheSuscripcion(usuarioId);

    return {
      success: true,
      message: "Suscripcion cancelada correctamente.",
    };
  });

  //==========================================
  // USUARIOS - Hash password
  //==========================================
  this.before("CREATE", "Usuarios", async (req) => {
    if (!req.data.password) return req.error(400, "Password es requerido");
    req.data.password = await bcrypt.hash(req.data.password, 10);
  });

  this.before("UPDATE", "Usuarios", async (req) => {
    if (req.data.password)
      req.data.password = await bcrypt.hash(req.data.password, 10);
  });

  this.after("READ", "Usuarios", (result) => {
    const lista = Array.isArray(result) ? result : [result];
    lista.forEach((u) => {
      if (u) delete u.password;
    });
  });

  this.before("READ", Aves, (req) => agregarFiltroUsuario(req));
  this.before("READ", Crias, (req) => agregarFiltroUsuario(req));
  this.before("READ", Suscripciones, (req) => {
    if (String(req.jwtUser?.rol || "").toUpperCase() === "ADMIN") return;
    agregarFiltroUsuario(req);
  });
  this.before("READ", ComposicionesLineaAve, (req) => agregarFiltroUsuario(req));
  this.before("READ", IncubacionesActivas, (req) => agregarFiltroUsuario(req));
  this.before("READ", AvesActivas, (req) => agregarFiltroUsuario(req));
  this.before("READ", LineasAvesActivas, (req) => agregarFiltroUsuario(req));

  function normalizarCria(data) {
    data.cintillo = String(data.cintillo || "").trim().toUpperCase();
    data.colorCintillo = String(data.colorCintillo || "").trim().toUpperCase();
    data.temporada = Number(data.temporada || new Date().getFullYear());
    data.estado = data.estado || "ACTIVA";
  }

  async function validarCria(req, data, criaIdExcluir) {
    normalizarCria(data);

    if (!data.cintillo) return req.reject(400, "El cintillo es requerido");
    if (!data.colorCintillo) return req.reject(400, "El color de cintillo es requerido");
    if (!data.temporada || data.temporada < 2000 || data.temporada > 2100) {
      return req.reject(400, "La temporada debe ser un anio valido");
    }

    const errorPadres = await validarRelacionPadres(data, null, null);
    if (errorPadres) return req.reject(400, errorPadres);

    const usuarioId = data.usuario_ID || req.jwtUser?.id;
    const existentes = await SELECT.from(Crias)
      .columns("ID")
      .where({
        usuario_ID: usuarioId,
        cintillo: data.cintillo,
        colorCintillo: data.colorCintillo,
        temporada: data.temporada,
        estado: { "!=": "ELIMINADO" },
      });

    const duplicado = existentes.find((cria) => !criaIdExcluir || cria.ID !== criaIdExcluir);
    if (duplicado) {
      return req.reject(409, `Ya existe una cria con cintillo ${data.cintillo}, color ${data.colorCintillo} y temporada ${data.temporada}`);
    }
  }

  async function validarRelacionPadres(data, aveId, placaAve) {
    const padreId = data.padre_ID || data.padre?.ID || null;
    const madreId = data.madre_ID || data.madre?.ID || null;

    if (padreId && madreId && padreId === madreId) {
      return "El padre y la madre no pueden ser la misma ave";
    }

    if (aveId) {
      if (padreId && padreId === aveId) {
        return "Un ave no puede ser su propio padre";
      }
      if (madreId && madreId === aveId) {
        return "Un ave no puede ser su propia madre";
      }
    }

    if (placaAve) {
      if (padreId) {
        const padre = await SELECT.one.from(Aves).columns("placa").where({ ID: padreId });
        if (padre?.placa === placaAve) {
          return "Un ave no puede ser su propio padre";
        }
      }
      if (madreId) {
        const madre = await SELECT.one.from(Aves).columns("placa").where({ ID: madreId });
        if (madre?.placa === placaAve) {
          return "Un ave no puede ser su propia madre";
        }
      }
    }

    return null;
  }

  async function obtenerComposicionBaseAve(aveId) {
    if (!aveId) return [];

    const composicion = await SELECT
      .from(ComposicionesLineaAve)
      .columns("linea_ID", "porcentaje")
      .where({ ave_ID: aveId });

    if (composicion.length) {
      return composicion
        .filter((item) => item.linea_ID && Number(item.porcentaje) > 0)
        .map((item) => ({
          linea_ID: item.linea_ID,
          porcentaje: Number(item.porcentaje),
        }));
    }

    const ave = await SELECT.one
      .from(Aves)
      .columns("ID", "linea_ID")
      .where({ ID: aveId });

    return ave?.linea_ID
      ? [{ linea_ID: ave.linea_ID, porcentaje: 100 }]
      : [];
  }

  function acumularComposicionLinea(mapa, composicion, factor) {
    for (const item of composicion) {
      const lineaId = item.linea_ID;
      const porcentaje = Number(item.porcentaje || 0) * factor;
      if (!lineaId || porcentaje <= 0) continue;

      mapa.set(lineaId, Number((Number(mapa.get(lineaId) || 0) + porcentaje).toFixed(6)));
    }
  }

  function normalizarComposicionLinea(mapa) {
    const items = Array.from(mapa.entries())
      .map(([linea_ID, porcentaje]) => ({
        linea_ID,
        porcentaje: Number(porcentaje),
      }))
      .filter((item) => item.linea_ID && item.porcentaje > 0);

    const total = items.reduce((sum, item) => sum + item.porcentaje, 0);
    if (total <= 0) return [];

    const normalizados = items.map((item) => ({
      linea_ID: item.linea_ID,
      porcentaje: Number(item.porcentaje.toFixed(2)),
    }));

    const suma = normalizados.reduce((sum, item) => sum + item.porcentaje, 0);
    const diferencia = Number((100 - suma).toFixed(2));
    if (normalizados.length && suma > 99.9 && suma < 100.1 && diferencia !== 0) {
      normalizados.sort((a, b) => b.porcentaje - a.porcentaje);
      normalizados[0].porcentaje = Number((normalizados[0].porcentaje + diferencia).toFixed(2));
    }

    return normalizados.sort((a, b) => b.porcentaje - a.porcentaje);
  }

  async function obtenerLineasFundadasPorAve(aveId) {
    if (!aveId) return [];

    const [comoFundador, comoFundadora] = await Promise.all([
      SELECT.from(LineasAves).columns("ID").where({
        aveFundador_ID: aveId,
        estado: { "!=": "ELIMINADO" },
      }),
      SELECT.from(LineasAves).columns("ID").where({
        aveFundadora_ID: aveId,
        estado: { "!=": "ELIMINADO" },
      }),
    ]);

    return Array.from(
      new Set(
        [...comoFundador, ...comoFundadora]
          .map((linea) => linea.ID)
          .filter(Boolean),
      ),
    );
  }

  async function obtenerDetalleLineasFundadasPorAve(aveId) {
    if (!aveId) return [];

    const [comoFundador, comoFundadora] = await Promise.all([
      SELECT.from(LineasAves).columns("ID", "nombre").where({
        aveFundador_ID: aveId,
        estado: { "!=": "ELIMINADO" },
      }),
      SELECT.from(LineasAves).columns("ID", "nombre").where({
        aveFundadora_ID: aveId,
        estado: { "!=": "ELIMINADO" },
      }),
    ]);

    const mapa = new Map();
    for (const linea of [...comoFundador, ...comoFundadora]) {
      if (linea?.ID) mapa.set(linea.ID, linea);
    }
    return Array.from(mapa.values());
  }

  function resolverIdAsociacion(valor, nested) {
    if (valor !== undefined) return valor;
    if (nested !== undefined) return nested?.ID ?? nested ?? null;
    return undefined;
  }

  async function validarExclusividadFundadoresLinea(req, fundadorId, fundadoraId, lineaIdActual) {
    const ids = Array.from(new Set([fundadorId, fundadoraId].filter(Boolean)));
    if (!ids.length) return;

    for (const aveId of ids) {
      const lineas = await obtenerDetalleLineasFundadasPorAve(aveId);
      const conflicto = lineas.find((linea) => linea.ID !== lineaIdActual);
      if (!conflicto) continue;

      const ave = await SELECT.one
        .from(Aves)
        .columns("placa", "nombre")
        .where({ ID: aveId });
      const etiqueta = ave?.placa || ave?.nombre || aveId;

      return req.reject(
        400,
        `El ave ${etiqueta} ya es padre/madre fundador(a) de la línea "${conflicto.nombre}". Un mismo ejemplar no puede fundar más de una línea; sí puede usarse como refresco de sangre o en cruces abiertos.`,
      );
    }
  }

  async function obtenerIdsLineasCruceAbierto() {
    const lineas = await SELECT.from(LineasAves)
      .columns("ID")
      .where({
        nombre: LINEA_CRUCE_ABIERTO_NOMBRE,
        estado: { "!=": "ELIMINADO" },
      });
    return new Set((lineas || []).map((linea) => linea.ID).filter(Boolean));
  }

  /**
   * Una línea nueva debe ser limpia: el fundador/fundadora y su ascendencia
   * no pueden pertenecer (linea_ID, composición o fundación) a otras líneas.
   */
  async function validarFundadoresLineaLimpia(req, fundadorId, fundadoraId, lineaIdActual) {
    const ids = Array.from(new Set([fundadorId, fundadoraId].filter(Boolean)));
    if (!ids.length) return;

    const MAX_GENERACIONES = 10;
    const cruceAbiertoIds = await obtenerIdsLineasCruceAbierto();

    for (const aveId of ids) {
      const mapaAncestros = await construirMapaAncestros(aveId, MAX_GENERACIONES);
      const ancestroIds = Array.from(mapaAncestros.keys());
      if (!ancestroIds.length) continue;

      const fundador = await SELECT.one
        .from(Aves)
        .columns("placa", "nombre")
        .where({ ID: aveId });
      const etiquetaFundador = fundador?.placa || fundador?.nombre || aveId;

      const aves = await SELECT.from(Aves)
        .columns("ID", "placa", "nombre", "linea_ID")
        .where({ ID: { in: ancestroIds } });

      for (const ancestro of aves || []) {
        const lineaId = ancestro.linea_ID;
        if (!lineaId) continue;
        if (lineaIdActual && lineaId === lineaIdActual) continue;
        if (cruceAbiertoIds.has(lineaId)) continue;

        const linea = await SELECT.one
          .from(LineasAves)
          .columns("nombre", "estado")
          .where({ ID: lineaId });
        if (!linea || linea.estado === "ELIMINADO") continue;
        if (linea.nombre === LINEA_CRUCE_ABIERTO_NOMBRE) continue;

        const etiquetaAncestro = ancestro.placa || ancestro.nombre || ancestro.ID;
        const esMismo = ancestro.ID === aveId;
        return req.reject(
          400,
          esMismo
            ? `La nueva línea debe ser limpia. El ave ${etiquetaFundador} ya pertenece a la línea "${linea.nombre}".`
            : `La nueva línea debe ser limpia. El ave ${etiquetaFundador} tiene en su ascendencia a ${etiquetaAncestro}, que pertenece a la línea "${linea.nombre}".`,
        );
      }

      const composiciones = await SELECT.from(ComposicionesLineaAve)
        .columns("ave_ID", "linea_ID", "porcentaje")
        .where({ ave_ID: { in: ancestroIds } });

      for (const comp of composiciones || []) {
        if (Number(comp.porcentaje || 0) <= 0) continue;
        if (lineaIdActual && comp.linea_ID === lineaIdActual) continue;
        if (cruceAbiertoIds.has(comp.linea_ID)) continue;

        const linea = await SELECT.one
          .from(LineasAves)
          .columns("nombre", "estado")
          .where({ ID: comp.linea_ID });
        if (!linea || linea.estado === "ELIMINADO") continue;
        if (linea.nombre === LINEA_CRUCE_ABIERTO_NOMBRE) continue;

        const ancestro = mapaAncestros.get(comp.ave_ID) || {};
        const etiquetaAncestro = ancestro.placa || ancestro.nombre || comp.ave_ID;
        const esMismo = comp.ave_ID === aveId;
        return req.reject(
          400,
          esMismo
            ? `La nueva línea debe ser limpia. El ave ${etiquetaFundador} ya tiene composición de la línea "${linea.nombre}".`
            : `La nueva línea debe ser limpia. El ave ${etiquetaFundador} tiene en su ascendencia a ${etiquetaAncestro}, con composición de la línea "${linea.nombre}".`,
        );
      }

      for (const ancestroId of ancestroIds) {
        if (ancestroId === aveId) continue;
        const lineasFundadas = await obtenerDetalleLineasFundadasPorAve(ancestroId);
        const conflicto = lineasFundadas.find((linea) => linea.ID !== lineaIdActual);
        if (!conflicto) continue;

        const ancestro = mapaAncestros.get(ancestroId) || {};
        const etiquetaAncestro = ancestro.placa || ancestro.nombre || ancestroId;
        return req.reject(
          400,
          `La nueva línea debe ser limpia. El ave ${etiquetaFundador} tiene en su ascendencia a ${etiquetaAncestro}, fundador(a) de la línea "${conflicto.nombre}".`,
        );
      }
    }
  }

  async function asignarComposicionFundadorPura(aveId, lineaId) {
    if (!aveId || !lineaId) return;

    const ave = await SELECT.one
      .from(Aves)
      .columns("ID", "usuario_ID")
      .where({ ID: aveId });
    if (!ave) return;

    await DELETE.from(ComposicionesLineaAve).where({ ave_ID: aveId });
    await INSERT.into(ComposicionesLineaAve).entries({
      ID: crypto.randomUUID(),
      ave_ID: aveId,
      linea_ID: lineaId,
      porcentaje: 100,
      usuario_ID: ave.usuario_ID,
    });
    await UPDATE(Aves).set({ linea_ID: lineaId }).where({ ID: aveId });
  }

  async function recalcularComposicionLineaAve(aveId) {
    if (!aveId) return;

    const ave = await SELECT.one
      .from(Aves)
      .columns("ID", "linea_ID", "padre_ID", "madre_ID", "usuario_ID")
      .where({ ID: aveId });

    if (!ave) return;

    const mapa = new Map();
    const lineasFundadas = await obtenerLineasFundadasPorAve(aveId);

    // Los fundadores definen la línea: siempre 100% de la línea que fundan.
    if (lineasFundadas.length) {
      if (lineasFundadas.length === 1) {
        mapa.set(lineasFundadas[0], 100);
        if (ave.linea_ID !== lineasFundadas[0]) {
          await UPDATE(Aves).set({ linea_ID: lineasFundadas[0] }).where({ ID: aveId });
        }
      } else {
        const pct = Number((100 / lineasFundadas.length).toFixed(2));
        for (const lineaId of lineasFundadas) {
          mapa.set(lineaId, pct);
        }
      }
    } else {
      const composicionPadre = await obtenerComposicionBaseAve(ave.padre_ID);
      const composicionMadre = await obtenerComposicionBaseAve(ave.madre_ID);

      if (composicionPadre.length || composicionMadre.length) {
        if (composicionPadre.length) acumularComposicionLinea(mapa, composicionPadre, 0.5);
        if (composicionMadre.length) acumularComposicionLinea(mapa, composicionMadre, 0.5);
      } else if (ave.linea_ID) {
        mapa.set(ave.linea_ID, 100);
      }
    }

    const composicion = normalizarComposicionLinea(mapa);

    await DELETE.from(ComposicionesLineaAve).where({ ave_ID: aveId });

    if (!composicion.length) return;

    await INSERT.into(ComposicionesLineaAve).entries(
      composicion.map((item) => ({
        ID: crypto.randomUUID(),
        ave_ID: aveId,
        linea_ID: item.linea_ID,
        porcentaje: item.porcentaje,
        usuario_ID: ave.usuario_ID,
      })),
    );
  }

  async function obtenerPorcentajeAveEnLinea(aveId, lineaId) {
    if (!aveId || !lineaId) return 0;

    await recalcularComposicionLineaAve(aveId);

    const composicion = await SELECT.one
      .from(ComposicionesLineaAve)
      .columns("porcentaje")
      .where({ ave_ID: aveId, linea_ID: lineaId });

    if (composicion) {
      return Number(composicion.porcentaje || 0);
    }

    const ave = await SELECT.one
      .from(Aves)
      .columns("linea_ID")
      .where({ ID: aveId });

    return ave?.linea_ID === lineaId ? 100 : 0;
  }

  async function obtenerLineaCruceAbierto(usuarioId) {
    if (!usuarioId) return null;

    const existente = await SELECT.one
      .from(LineasAves)
      .columns("ID", "nombre")
      .where({
        usuario_ID: usuarioId,
        nombre: LINEA_CRUCE_ABIERTO_NOMBRE,
        estado: { "!=": "ELIMINADO" },
      });

    if (existente) return existente;

    const lineaId = crypto.randomUUID();
    await INSERT.into(LineasAves).entries({
      ID: lineaId,
      nombre: LINEA_CRUCE_ABIERTO_NOMBRE,
      descripcion: "Linea tecnica para registrar cruces sin linaje asociado.",
      objetivo: "Registrar cruces abiertos.",
      generacionActual: 0,
      estadoMejora: "OBSERVACION",
      estado: "ACTIVA",
      usuario_ID: usuarioId,
    });

    return { ID: lineaId, nombre: LINEA_CRUCE_ABIERTO_NOMBRE };
  }

  async function esLineaCruceAbierto(lineaId, usuarioId) {
    if (!lineaId) return false;

    const linea = await SELECT.one
      .from(LineasAves)
      .columns("ID", "nombre")
      .where({
        ID: lineaId,
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" },
      });

    return linea?.nombre === LINEA_CRUCE_ABIERTO_NOMBRE;
  }

  async function obtenerLineaPorId(lineaId, usuarioId) {
    if (!lineaId) return null;

    return SELECT.one
      .from(LineasAves)
      .columns("ID", "nombre")
      .where({
        ID: lineaId,
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" },
      });
  }

  async function obtenerCandidatasLineaPorPadres(machoId, hembraId, usuarioId) {
    await Promise.all([
      recalcularComposicionLineaAve(machoId),
      recalcularComposicionLineaAve(hembraId),
    ]);

    const [composicionMacho, composicionHembra] = await Promise.all([
      SELECT.from(ComposicionesLineaAve)
        .columns("linea_ID", "porcentaje")
        .where({ ave_ID: machoId }),
      SELECT.from(ComposicionesLineaAve)
        .columns("linea_ID", "porcentaje")
        .where({ ave_ID: hembraId }),
    ]);

    const lineas = new Map();
    const acumular = (items) => {
      for (const item of items || []) {
        const lineaId = item.linea_ID;
        const porcentaje = Number(item.porcentaje || 0);
        if (!lineaId || porcentaje <= 0) continue;

        lineas.set(lineaId, Number((Number(lineas.get(lineaId) || 0) + porcentaje).toFixed(2)));
      }
    };

    acumular(composicionMacho);
    acumular(composicionHembra);

    const candidatas = [];
    for (const [lineaId, porcentajeTotal] of lineas.entries()) {
      const linea = await obtenerLineaPorId(lineaId, usuarioId);
      if (!linea || linea.nombre === LINEA_CRUCE_ABIERTO_NOMBRE) continue;
      candidatas.push({ ...linea, porcentajeTotal });
    }

    return candidatas.sort((a, b) => {
      if (b.porcentajeTotal !== a.porcentajeTotal) {
        return b.porcentajeTotal - a.porcentajeTotal;
      }

      return String(a.nombre || "").localeCompare(String(b.nombre || ""));
    });
  }

  async function determinarLineaPlanCruce(req, data, usuarioId) {
    const lineaSolicitada = await obtenerLineaPorId(data.linea_ID, usuarioId);
    if (!lineaSolicitada) {
      return req.reject(400, "La linea seleccionada no existe o no pertenece al usuario.");
    }

    if (lineaSolicitada.nombre === LINEA_CRUCE_ABIERTO_NOMBRE) {
      return { linea: lineaSolicitada, cruceAbierto: true };
    }

    const candidatas = await obtenerCandidatasLineaPorPadres(data.macho_ID, data.hembra_ID, usuarioId);
    const candidataSolicitada = candidatas.find((linea) => linea.ID === lineaSolicitada.ID);

    if (candidataSolicitada) {
      const porcentajeProyectado = Number((candidataSolicitada.porcentajeTotal / 2).toFixed(2));
      if (porcentajeProyectado < PORCENTAJE_MINIMO_CONTINUIDAD_LINEA) {
        return req.reject(
          400,
          `La descendencia proyectada tendria ${porcentajeProyectado}% de ${lineaSolicitada.nombre}. Se requiere al menos ${PORCENTAJE_MINIMO_CONTINUIDAD_LINEA}% para continuar trabajando este linaje.`,
        );
      }

      return {
        linea: candidataSolicitada,
        cruceAbierto: false,
        porcentajeProyectado,
      };
    }

    return req.reject(
      400,
      `Al menos uno de los reproductores debe tener algun porcentaje de sangre de ${lineaSolicitada.nombre} para crear este plan de cruce.`,
    );
  }

  function asegurarPrefijoCodigoPlan(codigo, cruceAbierto) {
    const prefijo = cruceAbierto ? "PCA" : "PC";
    if (!codigo) {
      const fecha = new Date();
      const yyyyMMdd = fecha.toISOString().slice(0, 10).replace(/-/g, "");
      const hhmmss = fecha.toTimeString().slice(0, 8).replace(/:/g, "");
      return `${prefijo}-${yyyyMMdd}-${hhmmss}`;
    }

    return String(codigo).replace(/^(PCA|PC)([_-])/, `${prefijo}$2`);
  }

  async function validarPlanCruce(req, data, planIdExcluir = null) {
    const usuarioId = data.usuario_ID || req.jwtUser?.id;

    if (!data.linea_ID || !data.macho_ID || !data.hembra_ID) {
      return req.reject(400, "Debe seleccionar linea, macho y hembra para crear el plan de cruce.");
    }

    if (data.macho_ID === data.hembra_ID) {
      return req.reject(400, "El macho y la hembra no pueden ser el mismo ejemplar.");
    }

    const { linea, cruceAbierto } = await determinarLineaPlanCruce(req, data, usuarioId);
    data.linea_ID = linea.ID;

    const duplicados = await SELECT
      .from(PlanesCruces)
      .columns("ID", "codigo")
      .where({
        usuario_ID: usuarioId,
        macho_ID: data.macho_ID,
        hembra_ID: data.hembra_ID,
        estado: { "!=": "ELIMINADO" },
      });
    const planDuplicado = duplicados.find((plan) => !planIdExcluir || plan.ID !== planIdExcluir);

    if (planDuplicado) {
      return req.reject(
        409,
        `Ya existe un plan de cruce activo con los mismos padres: ${planDuplicado.codigo || planDuplicado.ID}.`,
      );
    }

    return { cruceAbierto, usuarioId, linea };
  }

  this.before("CREATE", Crias, async (req) => {
    await validarCria(req, req.data);
  });

  this.before("UPDATE", Crias, async (req) => {
    const criaId = req.params?.[0]?.ID;
    const actual = criaId ? await SELECT.one.from(Crias).where({ ID: criaId }) : null;
    const dataCompleta = { ...(actual || {}), ...req.data };

    await validarCria(req, dataCompleta, criaId);

    req.data.cintillo = dataCompleta.cintillo;
    req.data.colorCintillo = dataCompleta.colorCintillo;
    req.data.temporada = dataCompleta.temporada;
  });

  this.on("eliminarCria", async (req) => {
    const criaId = req.data.criaId;
    if (!criaId) return req.reject(400, "El ID de la cria es obligatorio");

    const cria = await SELECT.one.from(Crias).where({ ID: criaId });
    if (!cria) return req.reject(404, "Cria no encontrada");

    if (req.jwtUser?.id && cria.usuario_ID && cria.usuario_ID !== req.jwtUser.id) {
      return req.reject(403, "No tienes permiso para eliminar esta cria.");
    }

    if (cria.estado === "ELIMINADO") {
      return req.reject(400, "Esta cria ya está eliminada.");
    }

    if (cria.estado === "REGISTRADA_ADULTA" || cria.aveGenerada_ID) {
      return req.reject(
        409,
        "No se puede eliminar el pollito porque ya fue registrado como ave adulta. Elimina o gestiona el ave generada primero.",
      );
    }

    await UPDATE(Crias).set({ estado: "ELIMINADO" }).where({ ID: criaId });
    return { success: true, message: "Cria eliminada correctamente" };
  });

  this.on("registrarCriaComoAve", async (req) => {
    const criaId = req.data.criaId;
    const placa = String(req.data.placa || "").trim().toUpperCase();
    const genero = String(req.data.genero || "").trim().toUpperCase();
    if (!criaId) return req.reject(400, "El ID de la cria es obligatorio");
    if (!placa) return req.reject(400, "La placa del ave adulta es obligatoria");
    if (!genero) return req.reject(400, "El género del ave adulta es obligatorio");

    const cria = await SELECT.one.from(Crias).where({ ID: criaId });
    if (!cria) return req.reject(404, "Cria no encontrada");
    if (cria.estado === "REGISTRADA_ADULTA" && cria.aveGenerada_ID) {
      return req.reject(409, "Esta cria ya fue registrada como ave adulta");
    }

    const existePlaca = await SELECT.one.from(Aves).where({ placa });
    if (existePlaca) {
      return req.reject(409, `Ya existe un ave con la placa ${placa}`);
    }

    const aveId = crypto.randomUUID();
    const ave = {
      ID: aveId,
      placa,
      nombre: cria.nombre || null,
      sexo: genero,
      fechaNacimiento: cria.fechaNacimiento,
      color: cria.color || null,
      ubicacion: cria.ubicacion || null,
      observaciones: cria.observaciones || null,
      estado: "ACTIVO",
      categoria: "BUENO",
      etapaVida: "ADULTO",
      cria: true,
      padrote: false,
      aptoReproduccion: true,
      usuario_ID: cria.usuario_ID,
      padre_ID: cria.padre_ID || null,
      madre_ID: cria.madre_ID || null,
    };

    await INSERT.into(Aves).entries(ave);
    await recalcularComposicionLineaAve(aveId);
    const aveCreada = await SELECT.one.from(Aves).where({ ID: aveId });

    await UPDATE(Crias)
      .set({
        estado: "REGISTRADA_ADULTA",
        aveGenerada_ID: aveCreada.ID,
      })
      .where({ ID: criaId });

    return aveCreada;
  });

  function generarPlacaPollito(data) {
    const base = `${data.temporada}-${data.colorCintillo}-${data.cintillo}`.toUpperCase();
    return base.length <= 16
      ? `CIN-${base}`
      : `CIN-${crypto.createHash("sha1").update(base).digest("hex").slice(0, 16)}`;
  }

  async function validarIdentificacionPollito(req, data, aveIdExcluir) {
    const esPollito = data.etapaVida === "POLLITO" || !!data.cintillo || !!data.colorCintillo || !!data.temporada;
    if (!esPollito) return;

    const usuarioId = data.usuario_ID || req.jwtUser?.id;
    const cintillo = String(data.cintillo || "").trim().toUpperCase();
    const colorCintillo = String(data.colorCintillo || "").trim().toUpperCase();
    const temporada = Number(data.temporada || new Date().getFullYear());

    if (!cintillo) return req.reject(400, "El cintillo es requerido para registrar un pollito");
    if (!colorCintillo) return req.reject(400, "El color de cintillo es requerido para registrar un pollito");
    if (!temporada || temporada < 2000 || temporada > 2100) {
      return req.reject(400, "La temporada debe ser un anio valido");
    }

    const existentes = await SELECT.from(Aves)
      .columns("ID")
      .where({
        usuario_ID: usuarioId,
        cintillo,
        colorCintillo,
        temporada,
        estado: { "!=": "ELIMINADO" },
      });

    const duplicado = existentes.find((ave) => !aveIdExcluir || ave.ID !== aveIdExcluir);
    if (duplicado) {
      return req.reject(409, `Ya existe un pollito con cintillo ${cintillo}, color ${colorCintillo} y temporada ${temporada}`);
    }

    data.cintillo = cintillo;
    data.colorCintillo = colorCintillo;
    data.temporada = temporada;
    data.etapaVida = "POLLITO";
    data.cria = true;
    data.padrote = false;
    data.aptoReproduccion = false;
    data.estado = data.estado || "ACTIVO";
    data.categoria = data.categoria || "BUENO";
    data.tipoAve = data.tipoAve || "Pollito";
    data.placa = data.placa || generarPlacaPollito(data);
  }

  // Validar datos de ave antes de crear
  function validarFechaFallecimiento(req, data) {
    if (data.estado !== "FALLECIDO") {
      req.data.fechaFallecimiento = null;
      return;
    }

    if (!data.fechaFallecimiento) {
      return req.error(400, "La fecha de fallecimiento es requerida");
    }

    if (new Date(data.fechaFallecimiento) > new Date()) {
      return req.error(400, "La fecha de fallecimiento no puede ser futura");
    }
  }

  this.before("CREATE", "Aves", async (req) => {
    const { fechaNacimiento, padre, madre } = req.data;

    await validarIdentificacionPollito(req, req.data);
    validarFechaFallecimiento(req, req.data);
    const { placa } = req.data;

    if (!placa) {
      return req.error(400, "La placa es requerida");
    }

    // Validar placa única
    const existePlaca = await SELECT.one.from(Aves).where({ placa });
    if (existePlaca) {
      req.error(400, `La placa ${placa} ya existe`);
    }

    // Validar fecha de nacimiento
    if (fechaNacimiento && new Date(fechaNacimiento) > new Date()) {
      req.error(400, "La fecha de nacimiento no puede ser futura");
    }

    // Validar relación de padres
    const errorPadres = await validarRelacionPadres(req.data, null, placa);
    if (errorPadres) {
      return req.error(400, errorPadres);
    }

    // Calcular edad si hay fecha de nacimiento
    if (fechaNacimiento) {
      const hoy = new Date();
      const nacimiento = new Date(fechaNacimiento);
      req.data.edad = Math.floor(
        (hoy - nacimiento) / (365.25 * 24 * 60 * 60 * 1000),
      );
    }
  });

  this.before("UPDATE", "Aves", async (req) => {
    const aveId = req.params?.[0]?.ID;
    const actual = aveId ? await SELECT.one.from(Aves).where({ ID: aveId }) : null;
    const dataCompleta = { ...(actual || {}), ...req.data };

    await validarIdentificacionPollito(req, dataCompleta, aveId);
    validarFechaFallecimiento(req, dataCompleta);

    const errorPadres = await validarRelacionPadres(
      {
        padre_ID: req.data.padre_ID !== undefined ? req.data.padre_ID : actual?.padre_ID,
        madre_ID: req.data.madre_ID !== undefined ? req.data.madre_ID : actual?.madre_ID,
      },
      aveId,
      dataCompleta.placa,
    );
    if (errorPadres) {
      return req.reject(400, errorPadres);
    }

    if (dataCompleta.etapaVida === "POLLITO") {
      req.data.cintillo = dataCompleta.cintillo;
      req.data.colorCintillo = dataCompleta.colorCintillo;
      req.data.temporada = dataCompleta.temporada;
      req.data.etapaVida = "POLLITO";
      req.data.cria = true;
      req.data.padrote = false;
      req.data.aptoReproduccion = false;
      req.data.placa = dataCompleta.placa || generarPlacaPollito(dataCompleta);
    }
  });

  this.after("UPDATE", "Aves", async (data, req) => {
    const aveId = req.params?.[0]?.ID || data?.ID;
    await recalcularComposicionLineaAve(aveId);
  });

  function validarNumeros(data) {
    const totalHuevos = Number(data.totalHuevos || 0);
    const fertiles = Number(data.huevosFertiles || 0);
    const nacidos = Number(data.huevosEclosionados || 0);
    const noEclosionados = Number(data.huevosNoEclosionados || 0);

    if (totalHuevos < 0 || fertiles < 0 || nacidos < 0 || noEclosionados < 0) {
      req.reject(400, 'Los valores numéricos no pueden ser negativos');
    }

    if (fertiles > totalHuevos) {
      throw new Error('La cantidad de fértiles no puede ser mayor al total de huevos');
    }

    if (nacidos > fertiles) {
      throw new Error('La cantidad de nacidos no puede ser mayor a los fértiles');
    }

    if ((nacidos + noEclosionados) > fertiles) {
      throw new Error('Nacidos + No eclosionados no puede ser mayor a fértiles');
    }
  }

  async function completarDetalleDesdePlanCruce(data) {
    if (!data.planCruce_ID) return;

    const plan = await SELECT.one.from(PlanesCruces).where({ ID: data.planCruce_ID });
    if (!plan) {
      throw new Error("El plan de cruce seleccionado no existe");
    }

    data.padre_ID = data.padre_ID || plan.macho_ID;
    data.madre_ID = data.madre_ID || plan.hembra_ID;
    data.tipoParentesco = data.tipoParentesco || plan.tipoParentesco;
    data.nivelRiesgo = data.nivelRiesgo || plan.nivelRiesgo;
    data.porcentaje = data.porcentaje ?? plan.porcentaje;
  }

  async function validarDetallesUnicosEnPayload(req, detalles = []) {
    const parejas = new Set();

    for (const detalle of detalles) {
      try {
        await completarDetalleDesdePlanCruce(detalle);
      } catch (error) {
        return req.reject(400, error.message);
      }

      if (!detalle.padre_ID || !detalle.madre_ID) continue;

      if (detalle.padre_ID === detalle.madre_ID) {
        return req.reject(400, "El padre y la madre no pueden ser la misma ave");
      }

      const clave = `${detalle.padre_ID}|${detalle.madre_ID}`;
      if (parejas.has(clave)) {
        return req.reject(409, "No se puede registrar dos filas con los mismos padres en una misma incubacion.");
      }

      parejas.add(clave);
    }
  }

  async function validarDetalleUnicoEnIncubacion(req, data) {
    if (!data.incubacion_ID || !data.padre_ID || !data.madre_ID) return;

    const detalleId = data.ID || req.params?.[0]?.ID;
    const usuarioId = data.usuario_ID || req.jwtUser?.id;
    const where = {
      incubacion_ID: data.incubacion_ID,
      padre_ID: data.padre_ID,
      madre_ID: data.madre_ID,
    };

    if (usuarioId) {
      where.usuario_ID = usuarioId;
    }

    const detallesExistentes = await SELECT
      .from(IncubacionDetalles)
      .columns("ID")
      .where(where);

    const duplicado = detallesExistentes.some((detalle) => detalle.ID !== detalleId);
    if (duplicado) {
      return req.reject(409, "No se puede registrar dos filas con los mismos padres en una misma incubacion.");
    }
  }

  this.before(['CREATE', 'UPDATE'], IncubacionDetalles, async (req) => {
    const data = req.data;

    const totalHuevos = Number(data.totalHuevos || 0);
    const fertiles = Number(data.huevosFertiles || 0);
    const nacidos = Number(data.huevosEclosionados || 0);
    const noEclosionados = Number(data.huevosNoEclosionados || 0);

    if (totalHuevos < 0 || fertiles < 0 || nacidos < 0 || noEclosionados < 0) {
      return req.reject(400, 'Los valores numéricos no pueden ser negativos');
    }

    if (fertiles > totalHuevos) {
      return req.reject(400, 'La cantidad de fértiles no puede ser mayor al total de huevos');
    }

    if (nacidos > fertiles) {
      return req.reject(400, 'La cantidad de nacidos no puede ser mayor a los fértiles');
    }

    if ((nacidos + noEclosionados) > fertiles) {
      return req.reject(400, 'Nacidos + No eclosionados no puede ser mayor a fértiles');
    }

    try {
      await completarDetalleDesdePlanCruce(data);
    } catch (error) {
      return req.reject(400, error.message);
    }

    if (data.padre_ID && data.madre_ID && data.padre_ID === data.madre_ID) {
      return req.reject(400, 'El padre y la madre no pueden ser la misma ave');
    }

    await validarDetalleUnicoEnIncubacion(req, data);

    if (data.padre_ID && data.madre_ID) {
      try {
        const analisis = await analizarParentescoAutomatico(data.padre_ID, data.madre_ID, 5);
        data.tipoParentesco = analisis.tipoParentesco;
        data.nivelRiesgo = analisis.nivelRiesgo;
        data.porcentaje = analisis.porcentaje;
      } catch (error) {
        return req.reject(400, error.message);
      }
    }
  });

  this.before("CREATE", PlanesCruces, async (req) => {
    const data = req.data;
    const { cruceAbierto, linea } = await validarPlanCruce(req, data);
    const analisis = await analizarParentescoAutomatico(data.macho_ID, data.hembra_ID, data.generacionesAnalizadas || 5, linea.ID);

    req.data.linea_ID = linea.ID;
    req.data.tipoCruce = analisis.tipoCruce;
    req.data.tipoParentesco = req.data.tipoParentesco || analisis.tipoParentesco;
    req.data.nivelRiesgo = req.data.nivelRiesgo || analisis.nivelRiesgo;
    req.data.porcentaje = req.data.porcentaje ?? analisis.porcentaje;
    req.data.ancestrosComunes = req.data.ancestrosComunes || analisis.ancestrosComunes;
    req.data.decision = req.data.decision || analisis.decision;
    req.data.recomendacion = req.data.recomendacion || analisis.recomendacion;
    req.data.codigo = asegurarPrefijoCodigoPlan(req.data.codigo, cruceAbierto);
  });

  this.before("DELETE", PlanesCruces, async (req) => {
    const planId = req.params?.[0]?.ID || req.data?.ID;
    if (!planId) return req.reject(400, "No se pudo identificar el plan de cruce.");
    await validarDependenciasEliminacionPlanCruce(req, planId);
  });

  this.before("UPDATE", PlanesCruces, async (req) => {
    const planId = req.params?.[0]?.ID || req.data?.ID;
    if (!planId) return req.reject(400, "No se pudo identificar el plan de cruce.");

    const actual = await SELECT.one.from(PlanesCruces).where({ ID: planId, usuario_ID: req.jwtUser?.id });
    if (!actual || actual.estado === "ELIMINADO") {
      return req.reject(404, "Plan de cruce no encontrado.");
    }

    const dataCompleta = { ...actual, ...req.data };
    if (dataCompleta.estado === "ELIMINADO") {
      await validarDependenciasEliminacionPlanCruce(req, planId);
      return;
    }

    const { cruceAbierto, linea } = await validarPlanCruce(req, dataCompleta, planId);
    const analisis = await analizarParentescoAutomatico(
      dataCompleta.macho_ID,
      dataCompleta.hembra_ID,
      dataCompleta.generacionesAnalizadas || 5,
      linea.ID,
    );

    req.data.linea_ID = linea.ID;
    req.data.macho_ID = dataCompleta.macho_ID;
    req.data.hembra_ID = dataCompleta.hembra_ID;
    req.data.tipoCruce = analisis.tipoCruce;
    req.data.tipoParentesco = req.data.tipoParentesco || dataCompleta.tipoParentesco || analisis.tipoParentesco;
    req.data.nivelRiesgo = req.data.nivelRiesgo || dataCompleta.nivelRiesgo || analisis.nivelRiesgo;
    req.data.porcentaje = req.data.porcentaje ?? dataCompleta.porcentaje ?? analisis.porcentaje;
    req.data.ancestrosComunes = req.data.ancestrosComunes || dataCompleta.ancestrosComunes || analisis.ancestrosComunes;
    req.data.decision = req.data.decision || dataCompleta.decision || analisis.decision;
    req.data.recomendacion = req.data.recomendacion || dataCompleta.recomendacion || analisis.recomendacion;
    req.data.codigo = asegurarPrefijoCodigoPlan(dataCompleta.codigo, cruceAbierto);
  });

  this.before(["CREATE", "UPDATE"], EvaluacionesAves, async (req) => {
    const campos = ["vigor", "saludGeneral", "fertilidad"];
    for (const campo of campos) {
      if (req.data[campo] === undefined || req.data[campo] === null) continue;
      const valor = Number(req.data[campo]);
      if (valor < 1 || valor > 10) {
        return req.reject(400, `${campo} debe estar entre 1 y 10`);
      }
    }

    if (req.data.ave_ID && req.data.aptoReproduccion !== undefined) {
      await UPDATE(Aves)
        .set({ aptoReproduccion: req.data.aptoReproduccion })
        .where({ ID: req.data.ave_ID });
    }
  });

  async function obtenerAveIdEvaluacionPleito(req) {
    if (req.data?.ave_ID) return req.data.ave_ID;
    const evaluacionId = req.params?.[0]?.ID || req.data?.ID;
    if (!evaluacionId) return null;

    const actual = await SELECT.one
      .from(EvaluacionesPleito)
      .columns("ave_ID")
      .where({ ID: evaluacionId });

    return actual?.ave_ID || null;
  }

  async function sincronizarCalificacionPleito(aveId) {
    if (!aveId) return;

    const [ultima] = await SELECT.from(EvaluacionesPleito)
      .where({ ave_ID: aveId })
      .orderBy("fecha desc", "modifiedAt desc", "createdAt desc")
      .limit(1);

    await UPDATE(Aves)
      .set({ categoria: ultima?.calificacion || null })
      .where({ ID: aveId });
  }

  this.before(["CREATE", "UPDATE", "DELETE"], EvaluacionesPleito, async (req) => {
    req._evaluacionPleitoAveId = await obtenerAveIdEvaluacionPleito(req);

    if (req.event === "DELETE") return;

    const calificaciones = ["PESIMO", "REGULAR", "BUENO", "EXCELENTE", "EXTRAORDINARIO"];
    if (req.data.calificacion && !calificaciones.includes(req.data.calificacion)) {
      return req.reject(400, "La calificacion de pleito no es valida.");
    }

    const campos = ["bravura", "tecnica", "resistencia", "condicionFisica"];
    for (const campo of campos) {
      if (req.data[campo] === undefined || req.data[campo] === null) continue;
      const valor = Number(req.data[campo]);
      if (valor < 1 || valor > 10) {
        return req.reject(400, `${campo} debe estar entre 1 y 10`);
      }
    }

    if (req.event === "CREATE" && req.jwtUser?.id && !req.data.usuario_ID) {
      req.data.usuario_ID = req.jwtUser.id;
    }
  });

  this.after(["CREATE", "UPDATE", "DELETE"], EvaluacionesPleito, async (data, req) => {
    const aveId = data?.ave_ID || req.data?.ave_ID || req._evaluacionPleitoAveId;
    await sincronizarCalificacionPleito(aveId);
  });

  async function validarLimiteArchivosAve(req, tipoArchivo) {
    const aveId = req.data?.ave_ID;
    if (!aveId) {
      return req.reject(400, "Debe indicar el ave para asociar el archivo.");
    }

    const [fotos, videos] = await Promise.all([
      SELECT.from(FotosAve).where({ ave_ID: aveId }),
      SELECT.from(VideosAve).where({ ave_ID: aveId })
    ]);

    const totalActual = (fotos?.length || 0) + (videos?.length || 0);
    if (totalActual >= 3) {
      return req.reject(400, "Solo se permiten 3 archivos como maximo por ave.");
    }

    const url = req.data.urlSharepoint || req.data.thumbnailUrl;
    if (!url) {
      return req.reject(400, "Debe indicar la referencia del archivo.");
    }

    const nombreArchivo = normalizarNombreArchivoAve(req.data.titulo || url);
    const existeArchivo = [...(fotos || []), ...(videos || [])]
      .some((archivo) => normalizarNombreArchivoAve(archivo.titulo || archivo.urlSharepoint) === nombreArchivo);

    if (existeArchivo) {
      return req.reject(400, "Este archivo ya fue registrado para el ave.");
    }

    if (tipoArchivo === "imagen") {
      req.data.titulo = req.data.titulo || "Imagen del ave";
      req.data.fechaFoto = req.data.fechaFoto || new Date().toISOString().slice(0, 10);
    } else {
      req.data.titulo = req.data.titulo || "Video del ave";
      req.data.fechaVideo = req.data.fechaVideo || new Date().toISOString().slice(0, 10);
    }
  }

  function normalizarNombreArchivoAve(nombre) {
    return String(nombre || "")
      .trim()
      .toLowerCase()
      .replace(/^pending-upload:\/\/aves\/[^/]+\//, "")
      .replace(/\?.*$/, "");
  }

  this.before("CREATE", FotosAve, async (req) => validarLimiteArchivosAve(req, "imagen"));
  this.before("CREATE", VideosAve, async (req) => validarLimiteArchivosAve(req, "video"));

  this.before(['CREATE', 'UPDATE'], Incubaciones, async (req) => {
    const data = req.data;

    if (Array.isArray(data.detalles)) {
      await validarDetallesUnicosEnPayload(req, data.detalles);
    }

    if (data.fechaIncubacion) {
      const fechaIncubacion = new Date(data.fechaIncubacion);

      if (!data.fechaPreNacimiento) {
        const pre = new Date(fechaIncubacion);
        pre.setDate(pre.getDate() + 18);
        data.fechaPreNacimiento = pre.toISOString();
      }

      if (!data.fechaEclosion) {
        const eco = new Date(fechaIncubacion);
        eco.setDate(eco.getDate() + 21);
        data.fechaEclosion = eco.toISOString();
      }
    }

    if (req.event === "UPDATE" && data.estado === "PROGRAMADA") {
      const incubacionId = req.params?.[0]?.ID;
      if (incubacionId) {
        const actual = await SELECT.one
          .from(Incubaciones)
          .where({ ID: incubacionId });

        if (actual?.estado === "CANCELADA") {
          data.motivoCancelacion = data.motivoCancelacion ?? null;
          data.fechaFinIncubacion = data.fechaFinIncubacion ?? null;
        }
      }
    }
  });

  this.on("iniciar", "Incubaciones", async (req) => {
    const db = await cds.connect.to("db");
    const { Incubacion } = cds.entities("ave.combatiente");

    const id = req.params[0]?.ID;

    const incubacion = await db.run(
      SELECT.one.from(Incubacion).where({ ID: id }),
    );

    if (!incubacion) {
      return req.error(404, "Incubación no encontrada");
    }

    if (incubacion.estado !== "PROGRAMADA") {
      return req.error(
        400,
        "Solo se puede iniciar una incubación en estado PROGRAMADA",
      );
    }

    // VALIDACIÓN CLAVE
    const ahora = new Date();
    const fechaIncubacion = new Date(incubacion.fechaIncubacion);

    if (fechaIncubacion > ahora) {
      return req.error(
        400,
        "No se puede iniciar la incubación porque la fecha de incubación es mayor a la fecha actual"
      );
    }

    await db.run(
      UPDATE(Incubacion).set({ estado: "EN_PROCESO" }).where({ ID: id }),
    );

    return "Incubación iniciada correctamente";
  });

  this.on("finalizar", "Incubaciones", async (req) => {
    const db = await cds.connect.to("db");
    const { Incubacion, IncubacionDetalle } = cds.entities("ave.combatiente");

    const id = req.params[0]?.ID;
    const { observacion } = req.data;

    if (!id) {
      return req.error(400, "ID de incubación requerido");
    }

    const incubacion = await db.run(
      SELECT.one.from(Incubacion).where({ ID: id })
    );

    if (!incubacion) {
      return req.error(404, "Incubación no encontrada");
    }

    if (incubacion.estado !== "EN_PROCESO") {
      return req.error(
        400,
        "Solo se puede finalizar una incubación en estado EN_PROCESO"
      );
    }

    // VALIDACIÓN CLAVE
    const ahora = new Date();
    const fechaEclosion = new Date(incubacion.fechaEclosion);

    if (fechaEclosion > ahora) {
      return req.error(
        400,
        "No se puede finalizar la incubación porque la fecha de eclosión es mayor a la fecha actual"
      );
    }

    const detalles = await db.run(
      SELECT.from(IncubacionDetalle).where({ incubacion_ID: id })
    );

    if (!detalles || detalles.length === 0) {
      return req.error(400, "La incubación no tiene detalles");
    }

    await db.run(
      UPDATE(Incubacion)
        .set({
          observaciones: observacion,
          estado: "COMPLETADA",
          fechaFinIncubacion: new Date().toISOString()
        })
        .where({ ID: id })
    );

    return "Incubación finalizada correctamente";
  });

  this.on("cancelar", "Incubaciones", async (req) => {
    const db = await cds.connect.to("db");
    const { Incubacion } = cds.entities("ave.combatiente");

    const id = req.params[0]?.ID;
    const { observacion } = req.data;

    const incubacion = await db.run(
      SELECT.one.from(Incubacion).where({ ID: id }),
    );

    if (!incubacion) {
      return req.error(404, "Incubación no encontrada");
    }

    if (incubacion.estado === "COMPLETADA") {
      return req.error(400, "No se puede cancelar una incubación finalizada");
    }

    await db.run(
      UPDATE(Incubacion)
        .set({
          estado: "CANCELADA",
          motivoCancelacion: observacion,
        })
        .where({ ID: id }),
    );

    return "Incubación cancelada correctamente";
  });

  async function aplicarDetallesReprogramacion(req, db, incubacionId, detalles = []) {
    const { IncubacionDetalle } = cds.entities("ave.combatiente");
    const usuarioId = req.jwtUser?.id;

    if (!Array.isArray(detalles) || detalles.length === 0) {
      return req.error(400, "Debe incluir al menos un detalle de incubación");
    }

    await validarDetallesUnicosEnPayload(req, detalles);

    const existentes = await db.run(
      SELECT.from(IncubacionDetalle).where({ incubacion_ID: incubacionId }),
    );
    const idsMantener = new Set();

    for (const detalle of detalles) {
      if (!detalle.padre_ID || !detalle.madre_ID) {
        return req.error(400, "Cada detalle debe tener padre y madre");
      }

      const totalHuevos = Number(detalle.totalHuevos || 0);
      if (totalHuevos < 0) {
        return req.error(400, "El total de huevos no puede ser negativo");
      }

      const detalleData = {
        incubacion_ID: incubacionId,
        padre_ID: detalle.padre_ID,
        madre_ID: detalle.madre_ID,
        planCruce_ID: detalle.planCruce_ID || null,
        tipoParentesco: detalle.tipoParentesco || null,
        nivelRiesgo: detalle.nivelRiesgo || null,
        porcentaje:
          detalle.porcentaje === undefined || detalle.porcentaje === null
            ? null
            : Number(detalle.porcentaje),
        totalHuevos,
        huevosFertiles: 0,
        huevosEclosionados: 0,
        huevosNoEclosionados: 0,
        usuario_ID: detalle.usuario_ID || usuarioId,
      };

      if (detalle.padre_ID && detalle.madre_ID && !detalle.tipoParentesco) {
        try {
          const analisis = await analizarParentescoAutomatico(
            detalle.padre_ID,
            detalle.madre_ID,
            5,
          );
          detalleData.tipoParentesco = analisis.tipoParentesco;
          detalleData.nivelRiesgo = analisis.nivelRiesgo;
          detalleData.porcentaje = analisis.porcentaje;
        } catch (error) {
          return req.error(400, error.message);
        }
      }

      if (detalle.ID && existentes.some((item) => item.ID === detalle.ID)) {
        await db.run(
          UPDATE(IncubacionDetalle)
            .set(detalleData)
            .where({ ID: detalle.ID }),
        );
        idsMantener.add(detalle.ID);
      } else {
        const insertado = await db.run(
          INSERT.into(IncubacionDetalle).entries(detalleData),
        );
        const nuevoId = insertado?.ID || insertado?.[0]?.ID;
        if (nuevoId) {
          idsMantener.add(nuevoId);
        }
      }
    }

    for (const existente of existentes) {
      if (!idsMantener.has(existente.ID)) {
        await db.run(
          DELETE.from(IncubacionDetalle).where({ ID: existente.ID }),
        );
      }
    }
  }

  this.on("reprogramar", "Incubaciones", async (req) => {
    const db = await cds.connect.to("db");
    const { Incubacion } = cds.entities("ave.combatiente");

    const id = req.params[0]?.ID;
    const {
      fechaIncubacion,
      fechaPreNacimiento,
      fechaEclosion,
      observaciones,
      detalles,
    } = req.data;

    const incubacion = await db.run(
      SELECT.one.from(Incubacion).where({ ID: id }),
    );

    if (!incubacion) {
      return req.error(404, "Incubación no encontrada");
    }

    if (incubacion.estado !== "CANCELADA") {
      return req.error(
        400,
        "Solo se puede reprogramar una incubación cancelada",
      );
    }

    if (!fechaIncubacion) {
      return req.error(400, "Debe indicar la nueva fecha de incubación");
    }

    const fInc = new Date(fechaIncubacion);
    if (isNaN(fInc.getTime())) {
      return req.error(400, "La fecha de incubación no es válida");
    }

    const fPre = fechaPreNacimiento
      ? new Date(fechaPreNacimiento)
      : new Date(fInc);
    if (!fechaPreNacimiento) {
      fPre.setDate(fPre.getDate() + 18);
    }

    const fEco = fechaEclosion ? new Date(fechaEclosion) : new Date(fInc);
    if (!fechaEclosion) {
      fEco.setDate(fEco.getDate() + 21);
    }

    await aplicarDetallesReprogramacion(req, db, id, detalles);

    await db.run(
      UPDATE(Incubacion)
        .set({
          estado: "PROGRAMADA",
          motivoCancelacion: null,
          fechaIncubacion: fInc.toISOString(),
          fechaPreNacimiento: fPre.toISOString(),
          fechaEclosion: fEco.toISOString(),
          fechaFinIncubacion: null,
          observaciones:
            observaciones === undefined
              ? incubacion.observaciones
              : observaciones,
        })
        .where({ ID: id }),
    );

    return "Incubación reprogramada correctamente";
  });

  // Validar pesaje
  this.before("CREATE", "Pesajes", async (req) => {
    const { peso, ave } = req.data;

    if (peso <= 0) {
      req.error(400, "El peso debe ser mayor a 0");
    }

    if (peso > 10) {
      req.error(400, "El peso parece excesivo, por favor verifique");
    }

    // Obtener último pesaje
    const ultimoPesaje = await SELECT.one
      .from(Pesajes)
      .where({ ave_ID: ave.ID })
      .orderBy({ fecha: "desc" });

    if (ultimoPesaje) {
      const diferencia = Math.abs(peso - ultimoPesaje.peso);
      if (diferencia > 2) {
        req.warn(
          `La diferencia de peso es significativa: ${diferencia.toFixed(2)} kg`,
        );
      }
    }
  });

  // Validar pelea
  this.before("CREATE", "Peleas", async (req) => {
    const aveId = req.data.ave_ID || req.data.ave?.ID;
    const combatienteBId = req.data.combatienteB_ID || req.data.combatienteB?.ID;
    const ambosPropios = req.data.ambosPropios !== false;
    const textoCombatienteA = String(req.data.combatienteATexto || "").trim();
    const textoCombatienteB = String(req.data.combatienteBTexto || "").trim();

    if (req.jwtUser?.id) {
      req.data.usuario_ID = req.jwtUser.id;
    }

    if (req.jwtUser?.id && MAX_REGISTROS_COMBATES_POR_USUARIO > 0) {
      const totalPeleas = await SELECT.one
        .from(Peleas)
        .where({ usuario_ID: req.jwtUser.id })
        .columns("count(1) as total");
      const totalActual = Number(totalPeleas?.total || 0);

      if (totalActual >= MAX_REGISTROS_COMBATES_POR_USUARIO) {
        return req.error(
          403,
          `Por ahora solo puedes registrar hasta ${MAX_REGISTROS_COMBATES_POR_USUARIO} combates. En produccion se habilitara sin limite.`,
        );
      }
    }

    if (!aveId && !textoCombatienteA) {
      return req.error(400, "Debe seleccionar o ingresar el Combatiente A.");
    }

    if (ambosPropios && !combatienteBId && !textoCombatienteB) {
      return req.error(400, "Debe seleccionar o ingresar el Combatiente B cuando ambas aves son propias.");
    }

    // if (!ambosPropios && !req.data.nombreOponente) {
    //   return req.error(400, "Debe indicar el nombre del gallo rival.");
    // }

    // if (!ambosPropios && !req.data.propietarioOponente) {
    //   return req.error(400, "Debe indicar el propietario del gallo rival.");
    // }

    // Verificar que el ave esté activa
    if (aveId) {
      const aveData = await SELECT.one.from(Aves).where({
        ID: aveId,
        usuario_ID: req.jwtUser?.id,
      });

      if (!aveData) {
        req.error(404, "Ave no encontrada");
      }
    }

    // if (aveData.estado !== "ACTIVO") {
    //   req.error(400, "El ave no está activa");
    // }

    // Verificar que no haya peleas muy recientes (menos de 30 días)
    if (ambosPropios && combatienteBId) {
      if (esMismoId(combatienteBId, aveId)) {
        req.error(400, "El Combatiente A y B no pueden ser el mismo ave.");
      }

      const combatienteB = await SELECT.one.from(Aves).where({
        ID: combatienteBId,
        usuario_ID: req.jwtUser?.id,
      });

      if (!combatienteB) {
        req.error(404, "Combatiente B no encontrado para el usuario actual.");
      }

      // if (combatienteB.estado !== "ACTIVO") {
      //   req.error(400, "El Combatiente B no esta activo");
      // }

      req.data.nombreOponente = `${combatienteB.placa || "Sin placa"} - ${combatienteB.nombre || "Sin nombre"}`;
      req.data.propietarioOponente = null;
      req.data.procedenciaOponente = null;
    } else if (ambosPropios) {
      req.data.nombreOponente = textoCombatienteB;
      req.data.propietarioOponente = null;
      req.data.procedenciaOponente = null;
    } else {
      req.data.combatienteB_ID = null;
    }

    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const peleasRecientes = aveId
      ? await SELECT.from(Peleas)
        .where({ ave_ID: aveId })
        .and({ fecha: { ">": hace30Dias.toISOString() } })
      : [];

    if (peleasRecientes.length > 0) {
      req.warn("El ave tuvo una pelea en los últimos 30 días");
    }
  });

  this.on("registrarCombate", async (req) => {
    const {
      ave_ID,
      combatienteATexto,
      combatienteB_ID,
      combatienteBTexto,
      ambosPropios,
      fecha,
      tipoCombate,
      lugar,
      evento,
      nombreOponente,
      propietarioOponente,
      procedenciaOponente,
      resultado,
      metodoVictoria,
      premioDinero,
      lesiones,
      observaciones,
    } = req.data;
    const userId = req.jwtUser?.id;
    const esAmbosPropios = ambosPropios !== false;
    const db = await cds.connect.to("db");
    const textoCombatienteA = String(combatienteATexto || "").trim();
    const textoCombatienteB = String(combatienteBTexto || "").trim();

    if (userId && MAX_REGISTROS_COMBATES_POR_USUARIO > 0) {
      const totalPeleas = await SELECT.one
        .from(Peleas)
        .where({ usuario_ID: userId })
        .columns("count(1) as total");
      const totalActual = Number(totalPeleas?.total || 0);

      if (totalActual >= MAX_REGISTROS_COMBATES_POR_USUARIO) {
        return req.error(
          403,
          `Por ahora solo puedes registrar hasta ${MAX_REGISTROS_COMBATES_POR_USUARIO} combates. En produccion se habilitara sin limite.`,
        );
      }
    }

    if (!ave_ID && !textoCombatienteA) {
      return req.error(400, "Debe seleccionar o ingresar el Combatiente A.");
    }

    if (!fecha || !tipoCombate) {
      return req.error(400, "Debe indicar fecha y tipo de combate.");
    }

    if (esAmbosPropios && !combatienteB_ID && !textoCombatienteB) {
      return req.error(400, "Debe seleccionar o ingresar el Combatiente B cuando ambas aves son propias.");
    }

    if (!esAmbosPropios && !nombreOponente) {
      return req.error(400, "Debe indicar el nombre del gallo rival.");
    }

    if (!esAmbosPropios && !propietarioOponente) {
      return req.error(400, "Debe indicar el propietario del gallo rival.");
    }

    let aveData = null;
    if (ave_ID) {
      aveData = await SELECT.one.from(Aves).where({
        ID: ave_ID,
        usuario_ID: userId,
      });

      if (!aveData) {
        return req.error(404, "Ave no encontrada");
      }
    }

    // if (aveData.estado !== "ACTIVO") {
    //   return req.error(400, "El ave no estÃ¡ activa");
    // }

    let nombreRival = nombreOponente || null;
    let propietarioRival = propietarioOponente || null;
    let procedenciaRival = procedenciaOponente || null;
    let combatienteBId = null;
    let textoRivalPropio = textoCombatienteB || null;

    if (esAmbosPropios && combatienteB_ID) {
      if (esMismoId(combatienteB_ID, ave_ID)) {
        return req.error(400, "El Combatiente A y B no pueden ser el mismo ave.");
      }

      const combatienteB = await SELECT.one.from(Aves).where({
        ID: combatienteB_ID,
        usuario_ID: userId,
      });

      if (!combatienteB) {
        return req.error(404, "Combatiente B no encontrado para el usuario actual.");
      }

      // if (combatienteB.estado !== "ACTIVO") {
      //   return req.error(400, "El Combatiente B no esta activo");
      // }

      combatienteBId = combatienteB_ID;
      textoRivalPropio = null;
      nombreRival = `${combatienteB.placa || "Sin placa"} - ${combatienteB.nombre || "Sin nombre"}`;
      propietarioRival = null;
      procedenciaRival = null;
    } else if (esAmbosPropios) {
      nombreRival = textoRivalPropio;
      propietarioRival = null;
      procedenciaRival = null;
    }

    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const peleasRecientes = ave_ID
      ? await SELECT.from(Peleas)
        .where({ ave_ID })
        .and({ fecha: { ">": hace30Dias.toISOString() } })
      : [];

    if (peleasRecientes.length > 0) {
      req.warn("El ave tuvo una pelea en los Ãºltimos 30 dÃ­as");
    }

    const nuevaPelea = {
      ID: crypto.randomUUID(),
      ave_ID: ave_ID || null,
      combatienteATexto: ave_ID ? null : textoCombatienteA,
      combatienteB_ID: combatienteBId,
      combatienteBTexto: combatienteBId ? null : textoRivalPropio,
      usuario_ID: userId,
      ambosPropios: esAmbosPropios,
      fecha: normalizarDateTimeCAP(fecha),
      tipoCombate,
      lugar: lugar || null,
      evento: evento || null,
      nombreOponente: nombreRival,
      propietarioOponente: propietarioRival,
      procedenciaOponente: procedenciaRival,
      resultado: resultado || null,
      metodoVictoria: metodoVictoria || null,
      premioDinero: premioDinero === null || premioDinero === undefined || premioDinero === "" ? null : Number(premioDinero),
      lesiones: lesiones || null,
      observaciones: observaciones || null,
    };

    await db.run(INSERT.into(Peleas).entries(nuevaPelea));

    return SELECT.one.from(Peleas).where({
      ID: nuevaPelea.ID,
      usuario_ID: userId,
    });
  });

  this.before(["UPDATE", "DELETE"], "Peleas", async (req) => {
    const peleaId = req.params?.[0]?.ID || req.data?.ID;
    const userId = req.jwtUser?.id;

    if (!peleaId || !userId) return;

    const pelea = await SELECT.one.from(Peleas).where({
      ID: peleaId,
      usuario_ID: userId,
    });

    if (!pelea) {
      req.error(404, "Combate no encontrado para el usuario actual.");
    }

    if (req.event === "DELETE") {
      await validarDependenciasEliminacionPelea(req, peleaId);
      return;
    }

    if (req.event !== "UPDATE") return;

    const camposActualizados = Object.keys(req.data || {}).filter((campo) => campo !== "ID");
    const soloActualizaVideo = camposActualizados.length > 0 && camposActualizados.every((campo) =>
      [
        "videoUrl",
        "videoStorageProvider",
        "videoStorageBucket",
        "videoStorageKey",
        "videoNombreArchivo",
        "videoMimeType",
        "videoSizeBytes",
        "videoEstadoCarga",
      ].includes(campo),
    );

    if (soloActualizaVideo) return;

    const data = { ...pelea, ...req.data };
    const aveId = data.ave_ID || data.ave?.ID;
    const combatienteBId = data.combatienteB_ID || data.combatienteB?.ID;
    const ambosPropios = data.ambosPropios !== false;
    const textoCombatienteA = String(data.combatienteATexto || "").trim();
    const textoCombatienteB = String(data.combatienteBTexto || "").trim();

    if (!aveId && !textoCombatienteA) {
      req.error(400, "Debe seleccionar o ingresar el Combatiente A.");
    }

    if (ambosPropios && !combatienteBId && !textoCombatienteB) {
      req.error(400, "Debe seleccionar o ingresar el Combatiente B cuando ambas aves son propias.");
    }

    if (!ambosPropios && !data.nombreOponente) {
      req.error(400, "Debe indicar el nombre del gallo rival.");
    }

    if (!ambosPropios && !data.propietarioOponente) {
      req.error(400, "Debe indicar el propietario del gallo rival.");
    }

    if (ambosPropios && combatienteBId) {
      if (esMismoId(combatienteBId, aveId)) {
        req.error(400, "El Combatiente A y B no pueden ser el mismo ave.");
      }

      const combatienteB = await SELECT.one.from(Aves).where({
        ID: combatienteBId,
        usuario_ID: userId,
      });

      if (!combatienteB || combatienteB.estado !== "ACTIVO") {
        req.error(400, "Combatiente B no encontrado o inactivo.");
      }

      req.data.nombreOponente = `${combatienteB.placa || "Sin placa"} - ${combatienteB.nombre || "Sin nombre"}`;
      req.data.propietarioOponente = null;
      req.data.procedenciaOponente = null;
    } else if (ambosPropios) {
      req.data.nombreOponente = textoCombatienteB;
      req.data.propietarioOponente = null;
      req.data.procedenciaOponente = null;
    } else {
      req.data.combatienteB_ID = null;
    }
  });

  this.on("prepararCargaVideoCombate", async (req) => {
    const { peleaId, nombreArchivo, mimeType, tamanioBytes } = req.data;
    const userId = req.jwtUser?.id;

    await validarPlanPremiumMultimedia(req);

    if (!peleaId) {
      req.error(400, "Debe indicar el combate para asociar el video.");
    }

    if (!nombreArchivo || !mimeType) {
      req.error(400, "Debe seleccionar un archivo de video valido.");
    }

    if (!String(mimeType).startsWith("video/")) {
      req.error(400, "Solo se permiten archivos de video.");
    }

    if (Number(tamanioBytes || 0) <= 0) {
      req.error(400, "El video seleccionado no tiene contenido.");
    }

    if (Number(tamanioBytes) > VIDEO_COMBATE_MAX_BYTES) {
      req.error(400, "El video supera el tamano maximo permitido.");
    }

    const where = userId ? { ID: peleaId, usuario_ID: userId } : { ID: peleaId };
    const pelea = await SELECT.one.from(Peleas).where(where);

    if (!pelea) {
      req.error(404, "Combate no encontrado para el usuario actual.");
    }

    const metadata = construirMetadataVideoCombate({
      peleaId,
      usuarioId: userId,
      nombreArchivo,
      mimeType,
    });
    metadata.uploadUrl = await crearUploadUrlS3({
      bucket: AWS_S3_COMBATES_BUCKET,
      storageKey: metadata.storageKey,
      mimeType: metadata.mimeType,
    });

    await UPDATE(Peleas)
      .set({
        videoUrl: metadata.videoUrl,
        videoStorageProvider: metadata.storageProvider,
        videoStorageBucket: metadata.storageBucket,
        videoStorageKey: metadata.storageKey,
        videoNombreArchivo: metadata.nombreArchivo,
        videoMimeType: metadata.mimeType,
        videoSizeBytes: Number(tamanioBytes),
        videoEstadoCarga: metadata.estadoCarga,
      })
      .where({ ID: peleaId });

    return {
      success: true,
      message: AWS_S3_COMBATES_BUCKET
        ? "Video preparado para carga en AWS S3."
        : "Video registrado en modo preparacion. Configura AWS_S3_COMBATES_BUCKET para activar S3.",
      uploadUrl: metadata.uploadUrl,
      videoUrl: metadata.videoUrl,
      storageProvider: metadata.storageProvider,
      storageBucket: metadata.storageBucket,
      storageKey: metadata.storageKey,
      estadoCarga: metadata.estadoCarga,
    };
  });

  this.on("prepararCargaArchivoAve", async (req) => {
    const { aveId, nombreArchivo, mimeType, tamanioBytes, tipo } = req.data;
    const userId = req.jwtUser?.id;
    const tipoArchivo = String(tipo || "").toUpperCase();

    await validarPlanPremiumMultimedia(req);

    if (!aveId) {
      req.error(400, "Debe indicar el ave para asociar el archivo.");
    }

    if (!nombreArchivo || !mimeType) {
      req.error(400, "Debe seleccionar un archivo valido.");
    }

    if (!["IMAGEN", "VIDEO"].includes(tipoArchivo)) {
      req.error(400, "El tipo debe ser IMAGEN o VIDEO.");
    }

    if (tipoArchivo === "IMAGEN" && !String(mimeType).startsWith("image/")) {
      req.error(400, "El archivo seleccionado no es una imagen valida.");
    }

    if (tipoArchivo === "VIDEO" && !String(mimeType).startsWith("video/")) {
      req.error(400, "El archivo seleccionado no es un video valido.");
    }

    if (Number(tamanioBytes || 0) <= 0) {
      req.error(400, "El archivo seleccionado no tiene contenido.");
    }

    if (Number(tamanioBytes) > ARCHIVO_AVE_MAX_BYTES) {
      req.error(400, "El archivo supera el tamano maximo permitido.");
    }

    const where = userId ? { ID: aveId, usuario_ID: userId } : { ID: aveId };
    const ave = await SELECT.one.from(Aves).where(where);

    if (!ave) {
      req.error(404, "Ave no encontrada para el usuario actual.");
    }

    const metadata = construirMetadataArchivoAve({
      aveId,
      usuarioId: userId,
      nombreArchivo,
      mimeType,
      tipo: tipoArchivo,
    });
    metadata.uploadUrl = await crearUploadUrlS3({
      bucket: AWS_S3_AVES_BUCKET,
      storageKey: metadata.storageKey,
      mimeType: metadata.mimeType,
    });

    return {
      success: true,
      message: AWS_S3_AVES_BUCKET
        ? "Archivo preparado para carga en AWS S3."
        : "Archivo registrado en modo preparacion. Configura AWS_S3_AVES_BUCKET o AWS_S3_BUCKET para activar S3.",
      uploadUrl: metadata.uploadUrl,
      fileUrl: metadata.fileUrl,
      storageProvider: metadata.storageProvider,
      storageBucket: metadata.storageBucket,
      storageKey: metadata.storageKey,
      nombreArchivo: metadata.nombreArchivo,
      mimeType: metadata.mimeType,
      tipo: metadata.tipo,
    };
  });

  this.on("obtenerUrlLecturaS3", async (req) => {
    await validarPlanPremiumMultimedia(req);

    const objeto = obtenerObjetoDesdeUrlS3(req.data.fileUrl);

    if (!objeto) {
      req.error(400, "La URL no pertenece a un bucket S3 configurado.");
    }

    const downloadUrl = await crearDownloadUrlS3(objeto);

    return {
      success: true,
      downloadUrl,
    };
  });

  this.on("obtenerUrlsLecturaS3", async (req) => {
    await validarPlanPremiumMultimedia(req);

    const MAX_URLS = 100;
    const raw = req.data?.fileUrls;
    const fileUrls = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map((url) => String(url || "").trim())
      .filter(Boolean);

    if (!fileUrls.length) {
      return {
        success: true,
        expiresIn: AWS_S3_PRESIGN_EXPIRES_SECONDS,
        items: [],
      };
    }

    if (fileUrls.length > MAX_URLS) {
      return req.reject(400, `Maximo ${MAX_URLS} URLs por solicitud.`);
    }

    const unicas = [...new Set(fileUrls)];
    const firmadas = await Promise.all(
      unicas.map(async (fileUrl) => {
        try {
          const objeto = obtenerObjetoDesdeUrlS3(fileUrl);
          if (!objeto) {
            return {
              fileUrl,
              downloadUrl: "",
              error: "La URL no pertenece a un bucket S3 configurado.",
            };
          }

          const downloadUrl = await crearDownloadUrlS3(objeto);
          return {
            fileUrl,
            downloadUrl: downloadUrl || "",
            error: downloadUrl ? "" : "No se pudo firmar la URL.",
          };
        } catch (error) {
          return {
            fileUrl,
            downloadUrl: "",
            error: error?.message || "Error al firmar la URL.",
          };
        }
      }),
    );

    return {
      success: true,
      expiresIn: AWS_S3_PRESIGN_EXPIRES_SECONDS,
      items: firmadas,
    };
  });

  //========================================
  // AFTER - PROCESAMIENTO POST-OPERACIÓN
  //========================================

  // Después de crear un ave, crear carpeta en SharePoint
  this.after("CREATE", "Aves", async (data, req) => {
    try {
      // Aquí iría la lógica de SharePoint
      // await crearCarpetaSharePoint(data.ID, data.placa);
      await recalcularComposicionLineaAve(data.ID);
      console.log(`Ave creada: ${data.placa}`);
    } catch (error) {
      console.error("Error creando carpeta SharePoint:", error);
    }
  });

  // Un ave solo puede ser fundador/fundadora de una linea.
  // Si puede usarse como refresco (outcross) o en cruces abiertos de otras lineas.
  this.before(["CREATE", "UPDATE"], "LineasAves", async (req) => {
    if (req.data?.estado === "ELIMINADO") return;

    const lineaId = req.data?.ID || req.params?.[0]?.ID;
    let fundadorId = resolverIdAsociacion(req.data?.aveFundador_ID, req.data?.aveFundador);
    let fundadoraId = resolverIdAsociacion(req.data?.aveFundadora_ID, req.data?.aveFundadora);

    if (req.event === "UPDATE" && lineaId) {
      const actual = await SELECT.one
        .from(LineasAves)
        .columns("aveFundador_ID", "aveFundadora_ID", "estado")
        .where({ ID: lineaId });

      if (!actual || actual.estado === "ELIMINADO") return;

      if (fundadorId === undefined) fundadorId = actual.aveFundador_ID;
      if (fundadoraId === undefined) fundadoraId = actual.aveFundadora_ID;
    }

    await validarExclusividadFundadoresLinea(req, fundadorId, fundadoraId, lineaId);
    await validarFundadoresLineaLimpia(req, fundadorId, fundadoraId, lineaId);
  });

  // Fundadores = 100% de la línea creada/actualizada (línea limpia).
  this.after(["CREATE", "UPDATE"], "LineasAves", async (data, req) => {
    try {
      const lineaId = data?.ID || req.params?.[0]?.ID;
      if (!lineaId) return;

      const linea = await SELECT.one
        .from(LineasAves)
        .columns("aveFundador_ID", "aveFundadora_ID", "estado")
        .where({ ID: lineaId });

      if (!linea || linea.estado === "ELIMINADO") return;

      const fundadores = [linea.aveFundador_ID, linea.aveFundadora_ID].filter(Boolean);
      await Promise.all(
        fundadores.map((aveId) => asignarComposicionFundadorPura(aveId, lineaId)),
      );
    } catch (error) {
      console.error("Error asignando composicion 100% a fundadores:", error);
    }
  });

  function columnasSolicitadasAve(req) {
    const cols = req?.query?.SELECT?.columns;
    if (!Array.isArray(cols) || cols.length === 0) return null;

    const names = new Set();
    for (const col of cols) {
      if (col === "*" || col?.ref?.[0] === "*") return null;
      if (typeof col === "string") {
        names.add(col);
        continue;
      }
      if (Array.isArray(col?.ref) && col.ref.length) {
        names.add(col.ref[col.ref.length - 1]);
      }
      if (col?.as) names.add(col.as);
    }
    return names;
  }

  function necesitaEnriquecimientoAve(req) {
    const names = columnasSolicitadasAve(req);
    if (!names) return true;
    const campos = [
      "edad",
      "pesoActual",
      "ultimaActualizacionPeso",
      "totalPeleas",
      "peleasGanadas",
      "porcentajeVictorias",
    ];
    return campos.some((campo) => names.has(campo));
  }

  // Calcular estadísticas después de leer aves (batch, sin N+1)
  this.after("READ", "Aves", async (aves, req) => {
    if (!aves) return;
    if (!necesitaEnriquecimientoAve(req)) return;

    const avesArray = Array.isArray(aves) ? aves : [aves];
    if (!avesArray.length) return;

    const names = columnasSolicitadasAve(req);
    const necesitaEdad = !names || names.has("edad");
    const necesitaPeso =
      !names || names.has("pesoActual") || names.has("ultimaActualizacionPeso");
    const necesitaPeleas =
      !names ||
      names.has("totalPeleas") ||
      names.has("peleasGanadas") ||
      names.has("porcentajeVictorias");

    if (necesitaEdad) {
      for (const ave of avesArray) {
        if (ave.fechaNacimiento && !ave.fechaFallecimiento) {
          const hoy = new Date();
          const nacimiento = new Date(ave.fechaNacimiento);
          ave.edad = Math.floor(
            (hoy - nacimiento) / (365.25 * 24 * 60 * 60 * 1000),
          );
        }
      }
    }

    const ids = avesArray.map((ave) => ave.ID).filter(Boolean);
    if (!ids.length || (!necesitaPeso && !necesitaPeleas)) return;

    const [pesajes, peleas] = await Promise.all([
      necesitaPeso
        ? SELECT.from(Pesajes)
            .columns("ave_ID", "peso", "fecha")
            .where({ ave_ID: { in: ids } })
            .orderBy({ fecha: "desc" })
        : Promise.resolve([]),
      necesitaPeleas
        ? SELECT.from(Peleas)
            .columns("ave_ID", "resultado")
            .where({ ave_ID: { in: ids } })
        : Promise.resolve([]),
    ]);

    if (necesitaPeso) {
      const ultimoPorAve = new Map();
      for (const pesaje of pesajes || []) {
        if (!ultimoPorAve.has(pesaje.ave_ID)) {
          ultimoPorAve.set(pesaje.ave_ID, pesaje);
        }
      }
      for (const ave of avesArray) {
        const ultimoPesaje = ultimoPorAve.get(ave.ID);
        if (ultimoPesaje) {
          ave.pesoActual = ultimoPesaje.peso;
          ave.ultimaActualizacionPeso = ultimoPesaje.fecha;
        }
      }
    }

    if (necesitaPeleas) {
      const statsPorAve = new Map();
      for (const pelea of peleas || []) {
        let stats = statsPorAve.get(pelea.ave_ID);
        if (!stats) {
          stats = { total: 0, ganadas: 0 };
          statsPorAve.set(pelea.ave_ID, stats);
        }
        stats.total += 1;
        if (pelea.resultado === "VICTORIA") stats.ganadas += 1;
      }

      for (const ave of avesArray) {
        const stats = statsPorAve.get(ave.ID) || { total: 0, ganadas: 0 };
        ave.totalPeleas = stats.total;
        ave.peleasGanadas = stats.ganadas;
        if (ave.totalPeleas > 0) {
          ave.porcentajeVictorias = (
            (ave.peleasGanadas / ave.totalPeleas) *
            100
          ).toFixed(2);
        }
      }
    }
  });

  //========================================
  // ACCIONES PERSONALIZADAS
  //========================================

  // Marcar como vendido
  this.on("marcarComoVendido", "Aves", async (req) => {
    const { ID } = req.params[0];
    const { precio, comprador } = req.data;

    await UPDATE(Aves)
      .set({
        estado: "VENDIDO",
        observaciones: `Vendido a ${comprador} por ${precio}`,
      })
      .where({ ID });

    // Registrar transacción
    await INSERT.into(Transacciones).entries({
      tipo: "INGRESO",
      categoria: "VENTA",
      ave_ID: ID,
      concepto: `Venta de ave a ${comprador}`,
      monto: precio,
      fecha: new Date().toISOString(),
    });

    return SELECT.one.from(Aves).where({ ID });
  });

  // Marcar como fallecido
  this.on("marcarComoFallecido", "Aves", async (req) => {
    const { ID } = req.params[0];
    const { fecha, causa } = req.data;

    await UPDATE(Aves)
      .set({
        estado: "FALLECIDO",
        fechaFallecimiento: fecha,
        observaciones: `Causa de fallecimiento: ${causa}`,
      })
      .where({ ID });

    return SELECT.one.from(Aves).where({ ID });
  });

  // Generar árbol genealógico
  this.on("generarArbolGenealogico", "Aves", async (req) => {
    const { ID } = req.params[0];

    const arbol = await construirArbolGenealogico(ID, 3); // 3 generaciones

    return JSON.stringify(arbol);
  });

  this.on("recalcularComposicionLineas", "Aves", async (req) => {
    const { ID } = req.params[0];
    const usuarioId = req.jwtUser?.id;

    const ave = await SELECT.one.from(Aves).where({ ID, usuario_ID: usuarioId });
    if (!ave) {
      return req.reject(404, "Ave no encontrada");
    }

    await recalcularComposicionLineaAve(ID);

    return {
      success: true,
      message: "Composicion de lineas recalculada",
    };
  });

  //========================================
  // FUNCIONES PERSONALIZADAS
  //========================================

  // Obtener genealogía completa
  this.on("obtenerGenealogiaCompleta", async (req) => {
    const { aveId } = req.data;

    const arbol = await construirArbolGenealogico(aveId, 5);

    return JSON.stringify(arbol);
  });

  // Calcular estadísticas
  this.on("calcularEstadisticasAve", async (req) => {
    const { aveId } = req.data;

    const peleas = await SELECT.from(Peleas).where({ ave_ID: aveId });
    const pesajes = await SELECT.from(Pesajes).where({ ave_ID: aveId });
    const ave = await SELECT.one.from(Aves).where({ ID: aveId });

    const victorias = peleas.filter((p) => p.resultado === "VICTORIA").length;
    const derrotas = peleas.filter((p) => p.resultado === "DERROTA").length;
    const empates = peleas.filter((p) => p.resultado === "EMPATE").length;

    const pesoPromedio =
      pesajes.length > 0
        ? pesajes.reduce((sum, p) => sum + p.peso, 0) / pesajes.length
        : 0;

    const pesoActual =
      pesajes.length > 0
        ? pesajes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0].peso
        : 0;

    const edadMeses = ave.fechaNacimiento
      ? Math.floor(
        (new Date() - new Date(ave.fechaNacimiento)) /
        (30 * 24 * 60 * 60 * 1000),
      )
      : 0;

    return {
      totalPeleas: peleas.length,
      victorias,
      derrotas,
      empates,
      porcentajeVictorias:
        peleas.length > 0 ? ((victorias / peleas.length) * 100).toFixed(2) : 0,
      pesoPromedio: pesoPromedio.toFixed(2),
      pesoActual: pesoActual.toFixed(2),
      edadMeses,
    };
  });

  // Calcular rentabilidad
  this.on("calcularRentabilidad", async (req) => {
    const { aveId } = req.data;

    const ave = await SELECT.one.from(Aves).where({ ID: aveId });

    const transacciones = await SELECT.from(Transacciones).where({
      ave_ID: aveId,
    });

    const ingresos = transacciones
      .filter((t) => t.tipo === "INGRESO")
      .reduce((sum, t) => sum + t.monto, 0);

    const egresos = transacciones
      .filter((t) => t.tipo === "EGRESO")
      .reduce((sum, t) => sum + t.monto, 0);

    const inversionTotal = (ave.valorCompra || 0) + egresos;
    const ganancia = ingresos - inversionTotal;
    const roi =
      inversionTotal > 0 ? ((ganancia / inversionTotal) * 100).toFixed(2) : 0;

    return {
      inversionTotal: inversionTotal.toFixed(2),
      ingresosTotal: ingresos.toFixed(2),
      ganancia: ganancia.toFixed(2),
      roi,
    };
  });

  // Crear incubación
  this.on("crearIncubacion", async (req) => {
    const { padreId, madreId, totalHuevos, fechaIncubacion } = req.data;

    // Validar padres
    const padre = await SELECT.one.from(Aves).where({ ID: padreId });
    const madre = await SELECT.one.from(Aves).where({ ID: madreId });

    if (!padre || !madre) {
      req.error(404, "Padre o madre no encontrados");
    }

    if (padre.sexo !== "M" || madre.sexo !== "H") {
      req.error(400, "Verificar el sexo de los padres");
    }

    // Generar código
    const codigo = `INC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

    const incubacion = await INSERT.into(Incubaciones).entries({
      codigo,
      padre_ID: padreId,
      madre_ID: madreId,
      totalHuevos,
      fechaIncubacion,
      estado: "ACTIVA",
    });

    return SELECT.one.from(Incubaciones).wh | ere({ codigo });
  });

  //========================================
  // FUNCIONES AUXILIARES
  //========================================  

  function obtenerRemitenteCorreo() {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const fromName = process.env.SENDGRID_FROM_NAME || "LinajeGallo";
    if (!fromEmail) {
      throw new Error("Falta SENDGRID_FROM_EMAIL");
    }
    return { email: fromEmail, name: fromName };
  }

  async function enviarCorreoActivacion(email, tokenActivacion) {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("Falta SENDGRID_API_KEY");
    }

    const from = obtenerRemitenteCorreo();
    sgMail.setApiKey(apiKey);

    const linkActivacion = construirLinkActivacion(tokenActivacion);

    const msg = {
      to: email,
      from,
      subject: "Activa tu cuenta en LinajeGallo",
      html: `
      <h2>Bienvenido a LinajeGallo</h2>
      <p>Tu cuenta fue creada correctamente.</p>
      <p>Haz clic en el siguiente enlace para activarla:</p>
      <p><a href="${linkActivacion}">${linkActivacion}</a></p>
      <p>Este enlace vence en 24 horas.</p>
      <p>Equipo LinajeGallo</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid status:", response.statusCode);
  }

  function obtenerMensajeErrorCorreo(error) {
    const mensajeSendGrid = error?.response?.body?.errors?.[0]?.message;
    if (mensajeSendGrid) return mensajeSendGrid;
    return error?.message || "No se pudo enviar el correo";
  }

  async function construirArbolGenealogico(aveId, generaciones, memo = new Map()) {
    if (!aveId || generaciones <= 0) return null;

    const memoKey = `${aveId}:${generaciones}`;
    if (memo.has(memoKey)) return memo.get(memoKey);

    const ave = await SELECT.one.from(Aves).where({ ID: aveId });
    if (!ave) {
      memo.set(memoKey, null);
      return null;
    }

    const nodo = {
      id: ave.ID,
      placa: ave.placa,
      nombre: ave.nombre,
      sexo: ave.sexo,
      fechaNacimiento: ave.fechaNacimiento,
      padre: null,
      madre: null,
    };

    const [padre, madre] = await Promise.all([
      ave.padre_ID
        ? construirArbolGenealogico(ave.padre_ID, generaciones - 1, memo)
        : Promise.resolve(null),
      ave.madre_ID
        ? construirArbolGenealogico(ave.madre_ID, generaciones - 1, memo)
        : Promise.resolve(null),
    ]);

    nodo.padre = padre;
    nodo.madre = madre;
    memo.set(memoKey, nodo);
    return nodo;
  }

  async function obtenerAveBasica(aveId) {
    if (!aveId) return null;
    return SELECT.one
      .from(Aves)
      .columns("ID", "placa", "nombre", "sexo", "padre_ID", "madre_ID", "aptoReproduccion", "estado")
      .where({ ID: aveId });
  }

  async function construirMapaAncestros(aveId, generaciones, distancia = 0, mapa = new Map()) {
    if (!aveId || distancia > generaciones) return mapa;

    const ave = await obtenerAveBasica(aveId);
    if (!ave) return mapa;

    const existente = mapa.get(ave.ID);
    if (!existente || distancia < existente.distancia) {
      mapa.set(ave.ID, {
        ID: ave.ID,
        placa: ave.placa,
        nombre: ave.nombre,
        sexo: ave.sexo,
        distancia,
        padre_ID: ave.padre_ID,
        madre_ID: ave.madre_ID,
      });
    }

    if (distancia < generaciones) {
      await construirMapaAncestros(ave.padre_ID, generaciones, distancia + 1, mapa);
      await construirMapaAncestros(ave.madre_ID, generaciones, distancia + 1, mapa);
    }

    return mapa;
  }

  function clasificarCruce(porcentaje) {
    if (porcentaje >= 25) {
      return {
        nivelRiesgo: "ALTO",
        decision: "NO_RECOMENDADO",
        state: "Error",
        messageType: "Error",
        recomendacion: "Riesgo alto. No repetir ni aprobar salvo una justificación técnica excepcional y seguimiento estricto de salud, fertilidad y vigor.",
      };
    }

    if (porcentaje >= 12.5) {
      return {
        nivelRiesgo: "MODERADO",
        decision: "OBSERVAR",
        state: "Warning",
        messageType: "Warning",
        recomendacion: "Cruce cerrado. Puede usarse solo con aves sanas, fértiles y evaluadas. Medir nacimientos, supervivencia y defectos antes de repetir.",
      };
    }

    if (porcentaje > 0) {
      return {
        nivelRiesgo: "BAJO_MODERADO",
        decision: "APROBADO",
        state: "Success",
        messageType: "Success",
        recomendacion: "Riesgo manejable para conservar familia. Mantener registros y evitar cerrar varias generaciones consecutivas.",
      };
    }

    return {
      nivelRiesgo: "BAJO",
      decision: "APROBADO",
      state: "Success",
      messageType: "Success",
      recomendacion: "No se detectó parentesco dentro de las generaciones revisadas. Útil para refrescar sangre o crear una base familiar.",
    };
  }

  function describirParentesco(tipoParentesco) {
    const descripciones = {
      PADRE_HIJA: "Cruce directo padre x hija.",
      MADRE_HIJO: "Cruce directo madre x hijo.",
      ABUELO_NIETA: "Cruce abuelo x nieta.",
      ABUELA_NIETO: "Cruce abuela x nieto.",
      HERMANOS_COMPLETOS: "Cruce entre hermanos completos.",
      MEDIO_HERMANOS: "Cruce entre medio hermanos.",
      TIO_SOBRINA: "Cruce tío x sobrina.",
      TIA_SOBRINO: "Cruce tía x sobrino.",
      PRIMOS: "Cruce entre primos.",
      PARENTESCO_LEJANO: "Se detectaron ancestros comunes lejanos.",
      SIN_PARENTESCO: "No se detecta parentesco directo.",
    };

    return descripciones[tipoParentesco] || "Parentesco detectado.";
  }

  async function obtenerResumenComposicionCruce(machoId, hembraId, lineaId) {
    await Promise.all([
      recalcularComposicionLineaAve(machoId),
      recalcularComposicionLineaAve(hembraId),
    ]);

    const [composicionMacho, composicionHembra] = await Promise.all([
      obtenerComposicionBaseAve(machoId),
      obtenerComposicionBaseAve(hembraId),
    ]);

    const machoMap = new Map((composicionMacho || []).map((item) => [item.linea_ID, Number(item.porcentaje || 0)]));
    const hembraMap = new Map((composicionHembra || []).map((item) => [item.linea_ID, Number(item.porcentaje || 0)]));
    const lineasMacho = Array.from(machoMap.keys()).filter(Boolean);
    const lineasHembra = Array.from(hembraMap.keys()).filter(Boolean);
    const lineasComunes = lineasMacho.filter((id) => hembraMap.has(id));
    const porcentajeMachoLinea = lineaId ? Number(machoMap.get(lineaId) || 0) : 0;
    const porcentajeHembraLinea = lineaId ? Number(hembraMap.get(lineaId) || 0) : 0;

    return {
      composicionMacho,
      composicionHembra,
      lineasMacho,
      lineasHembra,
      lineasComunes,
      porcentajeMachoLinea,
      porcentajeHembraLinea,
      tieneLineaSolicitada: porcentajeMachoLinea > 0 || porcentajeHembraLinea > 0,
      ambosTienenLineaSolicitada: porcentajeMachoLinea > 0 && porcentajeHembraLinea > 0,
      ambosSinLinea: lineasMacho.length === 0 && lineasHembra.length === 0,
    };
  }

  async function clasificarTipoCruceTecnico({ machoId, hembraId, lineaId, tipoParentesco, porcentajeConsanguinidad }) {
    const parentesco = String(tipoParentesco || "").toUpperCase();
    const porcentaje = Number(porcentajeConsanguinidad || 0);

    if (["PADRE_HIJA", "MADRE_HIJO", "HERMANOS_COMPLETOS"].includes(parentesco) || porcentaje >= 25) {
      return "INBREEDING";
    }

    if (
      ["ABUELO_NIETA", "ABUELA_NIETO", "TIO_SOBRINA", "TIA_SOBRINO", "MEDIO_HERMANOS", "PRIMOS", "PARENTESCO_LEJANO"].includes(parentesco) ||
      porcentaje > 0
    ) {
      return "LINEBREEDING";
    }

    const resumen = await obtenerResumenComposicionCruce(machoId, hembraId, lineaId);

    if (resumen.ambosSinLinea) {
      return "CRUCE_ABIERTO";
    }

    if (lineaId && resumen.tieneLineaSolicitada) {
      if (resumen.ambosTienenLineaSolicitada) {
        return "CRUCE_POR_LINAJE";
      }
      return "BACKCROSS";
    }

    if (resumen.lineasMacho.length && resumen.lineasHembra.length && !resumen.lineasComunes.length) {
      return "OUTCROSS";
    }

    if (resumen.lineasComunes.length) {
      return "CRUCE_POR_LINAJE";
    }

    return "CRUCE_ABIERTO";
  }

  async function analizarParentescoAutomatico(machoId, hembraId, generaciones = 5, lineaId = null) {
    const maxGeneraciones = Math.min(Math.max(Number(generaciones) || 5, 1), 8);
    const macho = await obtenerAveBasica(machoId);
    const hembra = await obtenerAveBasica(hembraId);

    if (!macho || !hembra) throw new Error("Macho o hembra no encontrados.");
    if (macho.ID === hembra.ID) throw new Error("El macho y la hembra no pueden ser el mismo ejemplar.");
    if (macho.sexo !== "M" || hembra.sexo !== "H") throw new Error("Verifica que el macho sea M y la hembra sea H.");
    if (macho.aptoReproduccion === false || hembra.aptoReproduccion === false) {
      throw new Error("Uno de los reproductores no está apto para reproducción.");
    }

    const mapaMacho = await construirMapaAncestros(macho.ID, maxGeneraciones);
    const mapaHembra = await construirMapaAncestros(hembra.ID, maxGeneraciones);
    let tipoParentesco = "SIN_PARENTESCO";

    if (hembra.padre_ID === macho.ID) tipoParentesco = "PADRE_HIJA";
    else if (macho.madre_ID === hembra.ID) tipoParentesco = "MADRE_HIJO";
    else if (mapaHembra.get(macho.ID)?.distancia === 2) tipoParentesco = "ABUELO_NIETA";
    else if (mapaMacho.get(hembra.ID)?.distancia === 2) tipoParentesco = "ABUELA_NIETO";

    const ancestrosComunes = [];
    let porcentaje = 0;

    const agregarContribucionConsanguinidad = (id, placa, nombre, distanciaMacho, distanciaHembra) => {
      const contribucion = Math.pow(0.5, distanciaMacho + distanciaHembra + 1) * 100;
      porcentaje += contribucion;
      ancestrosComunes.push({
        ID: id,
        placa,
        nombre,
        distanciaMacho,
        distanciaHembra,
        contribucion: Number(contribucion.toFixed(2)),
      });
    };

    // Si uno es ancestro directo del otro (padre/madre, abuelo/abuela, etc.).
    const hembraEnLineaMacho = mapaMacho.get(hembra.ID);
    if (hembraEnLineaMacho?.distancia > 0) {
      agregarContribucionConsanguinidad(
        hembra.ID,
        hembra.placa,
        hembra.nombre,
        hembraEnLineaMacho.distancia,
        0,
      );
    }
    const machoEnLineaHembra = mapaHembra.get(macho.ID);
    if (machoEnLineaHembra?.distancia > 0) {
      agregarContribucionConsanguinidad(
        macho.ID,
        macho.placa,
        macho.nombre,
        0,
        machoEnLineaHembra.distancia,
      );
    }

    for (const [id, ancestroMacho] of mapaMacho.entries()) {
      if (id === macho.ID || id === hembra.ID) continue;
      const ancestroHembra = mapaHembra.get(id);
      if (!ancestroHembra) continue;

      agregarContribucionConsanguinidad(
        id,
        ancestroMacho.placa,
        ancestroMacho.nombre,
        ancestroMacho.distancia,
        ancestroHembra.distancia,
      );
    }

    if (tipoParentesco === "SIN_PARENTESCO" && ancestrosComunes.length) {
      const padresCompartidos = ancestrosComunes.filter((a) => a.distanciaMacho === 1 && a.distanciaHembra === 1);
      const relacionTio = ancestrosComunes.some((a) =>
        (a.distanciaMacho === 1 && a.distanciaHembra === 2) ||
        (a.distanciaMacho === 2 && a.distanciaHembra === 1)
      );
      const relacionPrimos = ancestrosComunes.some((a) => a.distanciaMacho === 2 && a.distanciaHembra === 2);

      if (padresCompartidos.length) tipoParentesco = padresCompartidos.length >= 2 ? "HERMANOS_COMPLETOS" : "MEDIO_HERMANOS";
      else if (relacionTio) tipoParentesco = "TIO_SOBRINA";
      else if (relacionPrimos) tipoParentesco = "PRIMOS";
      else tipoParentesco = "PARENTESCO_LEJANO";
    }

    porcentaje = Number(Math.min(porcentaje, 100).toFixed(2));
    const clasificacion = clasificarCruce(porcentaje);
    const tipoCruce = await clasificarTipoCruceTecnico({
      machoId,
      hembraId,
      lineaId,
      tipoParentesco,
      porcentajeConsanguinidad: porcentaje,
    });
    const resumenComposicion = await obtenerResumenComposicionCruce(machoId, hembraId, lineaId);
    const porcentajeLinajeProyectado = Number((
      (resumenComposicion.porcentajeMachoLinea + resumenComposicion.porcentajeHembraLinea) / 2
    ).toFixed(2));

    return {
      tipoCruce,
      tipoParentesco,
      nivelRiesgo: clasificacion.nivelRiesgo,
      porcentaje,
      porcentajeMachoLinaje: resumenComposicion.porcentajeMachoLinea,
      porcentajeHembraLinaje: resumenComposicion.porcentajeHembraLinea,
      porcentajeLinajeProyectado,
      porcentajeMinimoLinaje: PORCENTAJE_MINIMO_CONTINUIDAD_LINEA,
      cumplePorcentajeLinaje: !lineaId || porcentajeLinajeProyectado >= PORCENTAJE_MINIMO_CONTINUIDAD_LINEA,
      descripcion: describirParentesco(tipoParentesco),
      recomendacion: clasificacion.recomendacion,
      decision: clasificacion.decision,
      state: clasificacion.state,
      messageType: clasificacion.messageType,
      ancestrosComunes: JSON.stringify(ancestrosComunes),
    };
  }

  function formatearListaEtiquetas(items, max = 3) {
    const etiquetas = (items || [])
      .map((item) => item.placa || item.nombre || item.codigo || item.cintillo || item.ID)
      .filter(Boolean);
    if (!etiquetas.length) return "";
    const visibles = etiquetas.slice(0, max);
    return etiquetas.length > max
      ? `${visibles.join(", ")} y ${etiquetas.length - max} más`
      : visibles.join(", ");
  }

  async function validarDependenciasEliminacionPlanCruce(req, planId) {
    if (!planId) return;

    const detalles = await SELECT.from(IncubacionDetalles)
      .columns("ID", "incubacion_ID")
      .where({ planCruce_ID: planId });

    if (!(detalles || []).length) return;

    const incubacionIds = [
      ...new Set((detalles || []).map((d) => d.incubacion_ID).filter(Boolean)),
    ];

    const incubacionesActivas = incubacionIds.length
      ? await SELECT.from(Incubaciones)
          .columns("ID", "codigo", "estado")
          .where({
            ID: { in: incubacionIds },
            estado: { "not in": ["ELIMINADO", "CANCELADA"] },
          })
      : [];

    if ((incubacionesActivas || []).length) {
      return req.reject(
        409,
        `No se puede eliminar el plan de cruce porque está usado en incubación(es): ${formatearListaEtiquetas(incubacionesActivas)}. Cancela o elimina esas incubaciones primero.`,
      );
    }
  }

  async function validarDependenciasEliminacionPelea(req, peleaId) {
    if (!peleaId) return;

    const transacciones = await SELECT.from(Transacciones)
      .columns("ID")
      .where({ pelea_ID: peleaId });

    if ((transacciones || []).length) {
      return req.reject(
        409,
        `No se puede eliminar el combate porque tiene ${transacciones.length} transacción(es) asociada(s). Elimina esas transacciones primero.`,
      );
    }
  }

  async function validarDependenciasEliminacionIncubacion(req, incubacion) {
    if (!incubacion?.ID) return;

    if (incubacion.estado === "ELIMINADO") {
      return req.reject(400, "La incubación ya está eliminada.");
    }

    if (incubacion.estado !== "CANCELADA") {
      return req.reject(
        409,
        "Solo se puede eliminar una incubación en estado Cancelada. Cancélala primero desde el detalle.",
      );
    }

    const avesAsociadas = await SELECT.from(Aves)
      .columns("ID", "placa", "nombre")
      .where({
        incubacion_ID: incubacion.ID,
        estado: { "!=": "ELIMINADO" },
      });

    if ((avesAsociadas || []).length) {
      return req.reject(
        409,
        `No se puede eliminar la incubación porque hay aves asociadas: ${formatearListaEtiquetas(avesAsociadas)}. Reasigna esas aves primero.`,
      );
    }
  }

  async function validarDependenciasEliminacionAve(req, aveId) {
    const [
      hijosComoPadre,
      hijosComoMadre,
      criasComoPadre,
      criasComoMadre,
      lineasComoFundador,
      lineasComoFundadora,
      planesComoMacho,
      planesComoHembra,
    ] = await Promise.all([
      SELECT.from(Aves)
        .columns("ID", "placa", "nombre")
        .where({ padre_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(Aves)
        .columns("ID", "placa", "nombre")
        .where({ madre_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(Crias)
        .columns("ID", "cintillo", "nombre")
        .where({ padre_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(Crias)
        .columns("ID", "cintillo", "nombre")
        .where({ madre_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(LineasAves)
        .columns("ID", "nombre")
        .where({ aveFundador_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(LineasAves)
        .columns("ID", "nombre")
        .where({ aveFundadora_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(PlanesCruces)
        .columns("ID", "codigo")
        .where({ macho_ID: aveId, estado: { "!=": "ELIMINADO" } }),
      SELECT.from(PlanesCruces)
        .columns("ID", "codigo")
        .where({ hembra_ID: aveId, estado: { "!=": "ELIMINADO" } }),
    ]);

    const hijos = [...(hijosComoPadre || []), ...(hijosComoMadre || [])];
    if (hijos.length) {
      return req.reject(
        409,
        `No se puede eliminar el ave porque es padre/madre de: ${formatearListaEtiquetas(hijos)}. Reasigna o elimina esos registros primero.`,
      );
    }

    const crias = [...(criasComoPadre || []), ...(criasComoMadre || [])].map((c) => ({
      ...c,
      placa: c.cintillo || c.nombre,
    }));
    if (crias.length) {
      return req.reject(
        409,
        `No se puede eliminar el ave porque tiene pollitos asociados: ${formatearListaEtiquetas(crias)}. Elimina o reasigna esos pollitos primero.`,
      );
    }

    const lineas = [...(lineasComoFundador || []), ...(lineasComoFundadora || [])];
    if (lineas.length) {
      return req.reject(
        409,
        `No se puede eliminar el ave porque es fundador(a) de la(s) línea(s): ${formatearListaEtiquetas(lineas)}. Elimina o cambia los fundadores de esas líneas primero.`,
      );
    }

    const planes = [...(planesComoMacho || []), ...(planesComoHembra || [])];
    if (planes.length) {
      return req.reject(
        409,
        `No se puede eliminar el ave porque participa en plan(es) de cruce: ${formatearListaEtiquetas(planes)}. Elimina esos planes primero.`,
      );
    }
  }

  async function validarDependenciasEliminacionLinea(req, linea) {
    const lineaId = linea.ID;
    const fundadores = new Set(
      [linea.aveFundador_ID, linea.aveFundadora_ID].filter(Boolean),
    );

    const planes = await SELECT.from(PlanesCruces)
      .columns("ID", "codigo")
      .where({
        linea_ID: lineaId,
        estado: { "!=": "ELIMINADO" },
      });

    if ((planes || []).length) {
      return req.reject(
        409,
        `No se puede eliminar la línea porque tiene plan(es) de cruce asociado(s): ${formatearListaEtiquetas(planes)}. Elimina esos planes primero.`,
      );
    }

    const avesAsociadas = await SELECT.from(Aves)
      .columns("ID", "placa", "nombre")
      .where({
        linea_ID: lineaId,
        estado: { "!=": "ELIMINADO" },
      });

    const avesExternas = (avesAsociadas || []).filter((ave) => !fundadores.has(ave.ID));
    if (avesExternas.length) {
      return req.reject(
        409,
        `No se puede eliminar la línea porque hay aves asociadas: ${formatearListaEtiquetas(avesExternas)}. Reasigna esas aves a otra línea o elimínalas primero.`,
      );
    }

    const composiciones = await SELECT.from(ComposicionesLineaAve)
      .columns("ave_ID", "porcentaje")
      .where({ linea_ID: lineaId });

    const aveIdsExternos = [
      ...new Set(
        (composiciones || [])
          .filter((c) => Number(c.porcentaje || 0) > 0 && !fundadores.has(c.ave_ID))
          .map((c) => c.ave_ID)
          .filter(Boolean),
      ),
    ];

    if (aveIdsExternos.length) {
      const avesConComposicion = await SELECT.from(Aves)
        .columns("ID", "placa", "nombre")
        .where({
          ID: { in: aveIdsExternos },
          estado: { "!=": "ELIMINADO" },
        });

      if ((avesConComposicion || []).length) {
        return req.reject(
          409,
          `No se puede eliminar la línea porque hay aves con composición de esta línea: ${formatearListaEtiquetas(avesConComposicion)}. Actualiza la composición de esas aves primero.`,
        );
      }
    }
  }

  async function limpiarReferenciasPropiasLinea(lineaId) {
    await DELETE.from(ComposicionesLineaAve).where({ linea_ID: lineaId });
    await UPDATE(Aves)
      .set({ linea_ID: null })
      .where({ linea_ID: lineaId });
  }

  this.on("eliminarAve", async (req) => {
    try {
      console.log("BODY:", req.data);

      const aveId = req.data.aveId;

      if (!aveId) {
        return req.reject(400, "El ID es obligatorio");
      }

      const ave = await SELECT.one.from(Aves).where({ ID: aveId });

      if (!ave) {
        return req.reject(404, "Ave no encontrada");
      }

      if (ave.estado === "ELIMINADO") {
        return req.reject(400, "El ave ya está eliminada.");
      }

      await validarDependenciasEliminacionAve(req, aveId);

      await UPDATE(Aves)
        .set({
          estado: "ELIMINADO",
        })
        .where({ ID: aveId });

      return {
        success: true,
        message: "Ave eliminada correctamente",
      };
    } catch (error) {
      console.error("ERROR BACKEND:", error);
      if (error?.status || error?.code) throw error;
      return req.reject(500, error.message);
    }
  });

  this.on("eliminarLineaAve", async (req) => {
    try {
      console.log("BODY:", req.data);

      const lineaAveId = req.data.lineaAveId;

      if (!lineaAveId) {
        return req.reject(400, "El ID es obligatorio");
      }

      const linea = await SELECT.one.from(LineasAves).where({ ID: lineaAveId });

      if (!linea) {
        return req.reject(404, "Línea de ave no encontrada");
      }

      if (linea.estado === "ELIMINADO") {
        return req.reject(400, "La línea ya está eliminada.");
      }

      await validarDependenciasEliminacionLinea(req, linea);

      // Limpia solo referencias propias de la línea (fundadores / composición fundacional).
      await limpiarReferenciasPropiasLinea(lineaAveId);

      await UPDATE(LineasAves)
        .set({
          estado: "ELIMINADO",
        })
        .where({ ID: lineaAveId });

      return {
        success: true,
        message: "Línea de ave eliminada correctamente",
      };
    } catch (error) {
      console.error("ERROR BACKEND:", error);
      if (error?.status || error?.code) throw error;
      return req.reject(500, error.message);
    }
  });

  this.on("eliminarIncubacion", async (req) => {
    try {
      console.log("BODY:", req.data);

      const incubacionId = req.data.incubacionId;

      if (!incubacionId) {
        return req.reject(400, "El ID es obligatorio");
      }

      const incubacion = await SELECT.one.from(Incubaciones).where({ ID: incubacionId });

      if (!incubacion) {
        return req.reject(404, "Incubación no encontrada");
      }

      if (req.jwtUser?.id && incubacion.usuario_ID && incubacion.usuario_ID !== req.jwtUser.id) {
        return req.reject(403, "No tienes permiso para eliminar esta incubación.");
      }

      await validarDependenciasEliminacionIncubacion(req, incubacion);

      await UPDATE(Incubaciones)
        .set({
          estado: "ELIMINADO",
        })
        .where({ ID: incubacionId });

      return {
        success: true,
        message: "Incubación eliminada correctamente",
      };
    } catch (error) {
      console.error("ERROR BACKEND:", error);
      if (error?.status || error?.code) throw error;
      return req.reject(500, error.message);
    }
  });

  this.on("solicitarRecuperacionPassword", async (req) => {
    try {
      const { email } = req.data;

      if (!email) {
        return req.error(400, "El email es requerido");
      }

      const db = await cds.connect.to("db");
      const { Usuario } = cds.entities("ave.combatiente");

      const emailNormalizado = email.trim().toLowerCase();

      const user = await db.run(
        SELECT.one
          .from(Usuario)
          .columns("ID", "email", "nombre", "apellido", "estado")
          .where({ email: emailNormalizado }),
      );

      // Por seguridad no reveles si existe o no
      if (!user) {
        return {
          success: true,
          message:
            "Si el correo existe, se enviará un enlace para restablecer la contraseña.",
        };
      }

      const tokenRecuperacion = crypto.randomBytes(32).toString("hex");
      const tokenRecuperacionExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await db.run(
        UPDATE(Usuario)
          .set({
            tokenRecuperacion,
            tokenRecuperacionExp,
          })
          .where({ ID: user.ID }),
      );

      try {
        await enviarCorreoRecuperacion(emailNormalizado, tokenRecuperacion);
      } catch (mailError) {
        console.error("Error enviando correo de recuperación:", mailError);
      }

      return {
        success: true,
        message:
          "Si el correo existe, se enviará un enlace para restablecer la contraseña.",
      };
    } catch (error) {
      console.error("Error en solicitarRecuperacionPassword:", error);
      return req.error(500, "Error interno al procesar la solicitud");
    }
  });

  this.on("restablecerPassword", async (req) => {
    try {
      const { token, newPassword } = req.data;

      if (!token || !newPassword) {
        return req.error(400, "Token y nueva contraseña son requeridos");
      }

      if (newPassword.length < 6) {
        return req.error(
          400,
          "La nueva contraseña debe tener al menos 6 caracteres",
        );
      }

      const db = await cds.connect.to("db");
      const { Usuario } = cds.entities("ave.combatiente");

      const user = await db.run(
        SELECT.one
          .from(Usuario)
          .columns("ID", "tokenRecuperacionExp")
          .where({ tokenRecuperacion: token }),
      );

      if (!user) {
        return req.error(400, "El enlace no es válido");
      }

      if (
        !user.tokenRecuperacionExp ||
        new Date(user.tokenRecuperacionExp) < new Date()
      ) {
        return req.error(400, "El enlace ha expirado");
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await db.run(
        UPDATE(Usuario)
          .set({
            password: passwordHash,
            tokenRecuperacion: null,
            tokenRecuperacionExp: null,
          })
          .where({ ID: user.ID }),
      );

      return {
        success: true,
        message: "La contraseña se actualizó correctamente",
      };
    } catch (error) {
      console.error("Error en restablecerPassword:", error);
      return req.error(500, "Error interno al restablecer la contraseña");
    }
  });

  async function enviarCorreoRecuperacion(email, tokenRecuperacion) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:8080/index.html";

    if (!apiKey) throw new Error("Falta SENDGRID_API_KEY");

    const from = obtenerRemitenteCorreo();
    sgMail.setApiKey(apiKey);

    const link = `${frontendUrl}#/reset-password/${tokenRecuperacion}`;

    const msg = {
      to: email,
      from,
      subject: "Recupera tu contraseña - LinajeGallo",
      html: `
      <h2>Recuperación de contraseña - LinajeGallo</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>Haz clic en el siguiente enlace:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Este enlace vence en 1 hora.</p>
      <p>Si no solicitaste este cambio, ignora este correo.</p>
      <p>Equipo LinajeGallo</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid reset status:", response.statusCode);
  }

  function obtenerEmailsDuenoApp() {
    const raw = String(process.env.APP_OWNER_EMAIL || process.env.OWNER_EMAIL || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  }

  async function enviarCorreoDuenoNuevaPrueba({ usuario, fechaInicio, fechaFin }) {
    const destinatarios = obtenerEmailsDuenoApp();
    if (!destinatarios.length) {
      console.warn("APP_OWNER_EMAIL no configurado: se omite aviso de nueva cuenta de prueba.");
      return;
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("Falta SENDGRID_API_KEY");
    }

    const from = obtenerRemitenteCorreo();
    sgMail.setApiKey(apiKey);

    const nombreCompleto = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ") || "Sin nombre";
    const msg = {
      to: destinatarios,
      from,
      subject: `Nueva cuenta de prueba en LinajeGallo: ${nombreCompleto}`,
      html: `
      <h2>Nueva cuenta de prueba activada</h2>
      <p>Un usuario activo el plan de prueba Premium por 60 dias.</p>
      <ul>
        <li><strong>Nombre:</strong> ${nombreCompleto}</li>
        <li><strong>Usuario:</strong> ${usuario?.username || "-"}</li>
        <li><strong>Email:</strong> ${usuario?.email || "-"}</li>
        <li><strong>Telefono:</strong> ${usuario?.telefono || "-"}</li>
        <li><strong>Inicio:</strong> ${fechaInicio || "-"}</li>
        <li><strong>Fin:</strong> ${fechaFin || "-"}</li>
      </ul>
      <p>LinajeGallo</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid owner trial notify status:", response.statusCode);
  }

  async function enviarCorreoDuenoNuevoUsuario({ usuario }) {
    const destinatarios = obtenerEmailsDuenoApp();
    if (!destinatarios.length) {
      console.warn("APP_OWNER_EMAIL no configurado: se omite aviso de nuevo usuario.");
      return;
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("Falta SENDGRID_API_KEY");
    }

    const from = obtenerRemitenteCorreo();
    sgMail.setApiKey(apiKey);

    const nombreCompleto = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ") || "Sin nombre";
    const msg = {
      to: destinatarios,
      from,
      ...(usuario?.email ? { replyTo: usuario.email } : {}),
      subject: `Nuevo usuario registrado en LinajeGallo: ${nombreCompleto}`,
      html: `
      <h2>Nuevo usuario registrado</h2>
      <p>Se creo una cuenta nueva en LinajeGallo (pendiente de activacion por correo).</p>
      <ul>
        <li><strong>Nombre:</strong> ${escaparHtml(nombreCompleto)}</li>
        <li><strong>Usuario:</strong> ${escaparHtml(usuario?.username || "-")}</li>
        <li><strong>Email:</strong> ${escaparHtml(usuario?.email || "-")}</li>
        <li><strong>Telefono:</strong> ${escaparHtml(usuario?.telefono || "-")}</li>
        <li><strong>Direccion:</strong> ${escaparHtml(usuario?.direccion || "-")}</li>
        <li><strong>Estado:</strong> ${escaparHtml(usuario?.estado || "PENDIENTE")}</li>
      </ul>
      <p>LinajeGallo</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid owner new-user notify status:", response.statusCode);
  }

  function obtenerDatosContactoEnv() {
    const telefono = String(process.env.APP_CONTACT_PHONE || "").trim();
    const whatsappRaw = String(process.env.APP_CONTACT_WHATSAPP || process.env.APP_CONTACT_PHONE || "").trim();
    const whatsappDigits = whatsappRaw.replace(/[^\d]/g, "");
    return {
      telefono,
      whatsapp: whatsappRaw,
      whatsappUrl: whatsappDigits ? `https://wa.me/${whatsappDigits}` : "",
    };
  }

  function escaparHtml(texto) {
    return String(texto || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function enviarCorreoQuejaSugerencia({ tipo, mensaje, telefonoContacto, usuario }) {
    const destinatarios = obtenerEmailsDuenoApp();
    if (!destinatarios.length) {
      throw new Error("APP_OWNER_EMAIL no configurado");
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("Falta SENDGRID_API_KEY");
    }

    const from = obtenerRemitenteCorreo();
    sgMail.setApiKey(apiKey);

    const tipoNorm = String(tipo || "").toUpperCase() === "QUEJA" ? "Queja" : "Sugerencia";
    const nombreCompleto = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ") || "Sin nombre";
    const replyTo = usuario?.email || undefined;

    const msg = {
      to: destinatarios,
      from,
      ...(replyTo ? { replyTo } : {}),
      subject: `[LinajeGallo] ${tipoNorm} de ${nombreCompleto}`,
      html: `
      <h2>${escaparHtml(tipoNorm)} recibida desde LinajeGallo</h2>
      <ul>
        <li><strong>Tipo:</strong> ${escaparHtml(tipoNorm)}</li>
        <li><strong>Nombre:</strong> ${escaparHtml(nombreCompleto)}</li>
        <li><strong>Usuario:</strong> ${escaparHtml(usuario?.username || "-")}</li>
        <li><strong>Email:</strong> ${escaparHtml(usuario?.email || "-")}</li>
        <li><strong>Telefono del usuario:</strong> ${escaparHtml(usuario?.telefono || "-")}</li>
        <li><strong>Telefono de contacto indicado:</strong> ${escaparHtml(telefonoContacto || "-")}</li>
      </ul>
      <h3>Mensaje</h3>
      <p style="white-space:pre-wrap">${escaparHtml(mensaje)}</p>
      <p>LinajeGallo</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid queja/sugerencia status:", response.statusCode);
  }

  this.on("obtenerDatosContacto", async () => {
    return obtenerDatosContactoEnv();
  });

  this.on("enviarQuejaSugerencia", async (req) => {
    const usuarioId =
      req.jwtUser?.ID ||
      req.jwtUser?.id ||
      req.user?.id;

    if (!usuarioId) {
      return req.reject(401, "Debes iniciar sesion para enviar una queja o sugerencia.");
    }

    const tipoRaw = String(req.data?.tipo || "").trim().toUpperCase();
    const mensaje = String(req.data?.mensaje || "").trim();
    const telefonoContacto = String(req.data?.telefonoContacto || "").trim();

    if (!["QUEJA", "SUGERENCIA"].includes(tipoRaw)) {
      return req.reject(400, "Selecciona si es una queja o una sugerencia.");
    }

    if (!mensaje || mensaje.length < 10) {
      return req.reject(400, "El mensaje debe tener al menos 10 caracteres.");
    }

    if (mensaje.length > 2000) {
      return req.reject(400, "El mensaje no puede superar 2000 caracteres.");
    }

    const { Usuario } = cds.entities("ave.combatiente");
    const usuario = await SELECT.one
      .from(Usuario)
      .columns("ID", "username", "email", "nombre", "apellido", "telefono")
      .where({ ID: usuarioId });

    if (!usuario) {
      return req.reject(404, "No se encontro el usuario de la sesion.");
    }

    try {
      await enviarCorreoQuejaSugerencia({
        tipo: tipoRaw,
        mensaje,
        telefonoContacto,
        usuario,
      });
    } catch (error) {
      console.error("Error enviando queja/sugerencia:", error);
      return req.reject(
        500,
        error?.message?.includes("APP_OWNER_EMAIL")
          ? "El canal de contacto no esta configurado. Intenta por WhatsApp o telefono."
          : "No se pudo enviar el mensaje. Intenta nuevamente en unos minutos.",
      );
    }

    return {
      success: true,
      message: "Tu mensaje fue enviado. Gracias por ayudarnos a mejorar LinajeGallo.",
    };
  });

  this.on("obtenerDashboard", async (req) => {
    const { Ave, Incubacion, IncubacionDetalle, LineaAve, Pelea } =
      cds.entities("ave.combatiente");

    const usuarioId =
      req.jwtUser?.ID ||
      req.jwtUser?.id ||
      req.user?.id;

    if (!usuarioId) {
      return req.reject(401, "No se pudo identificar el usuario logueado.");
    }

    const [
      totalAves,
      totalIncubaciones,
      incubacionesActivas,
      incubacionesProgramadas,
      totalAvesActivas,
      totalLineas,
      planesActivos,
      totalPollitos,
      totalCombates,
      totalNacidosRes,
      recientes,
    ] = await Promise.all([
      SELECT.from(Ave)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("count(*) as total"),
      SELECT.from(Incubacion)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("count(*) as total"),
      SELECT.from(Incubacion)
        .where({
          usuario_ID: usuarioId,
          estado: "EN_PROCESO",
        })
        .columns("count(*) as total"),
      SELECT.from(Incubacion)
        .where({
          usuario_ID: usuarioId,
          estado: "PROGRAMADA",
        })
        .columns("count(*) as total"),
      SELECT.from(Ave)
        .where({
          usuario_ID: usuarioId,
          estado: "ACTIVO",
        })
        .columns("count(*) as total"),
      SELECT.from(LineaAve)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
          nombre: { "!=": "Cruce abierto" },
        })
        .columns("count(*) as total"),
      SELECT.from(PlanesCruces)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("macho_ID", "hembra_ID"),
      SELECT.from(Crias)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("count(*) as total"),
      SELECT.from(Pelea)
        .where({
          usuario_ID: usuarioId,
        })
        .columns("count(*) as total"),
      SELECT.from(IncubacionDetalle)
        .where({
          usuario_ID: usuarioId,
        })
        .columns("sum(huevosEclosionados) as total"),
      SELECT.from(Incubacion)
        .where({
          usuario_ID: usuarioId,
          estado: { "!=": "ELIMINADO" },
        })
        .columns("ID", "codigo", "estado", "fechaIncubacion")
        .orderBy("createdAt desc")
        .limit(5),
    ]);

    const totalPlanes = new Set(
      (planesActivos || [])
        .filter((plan) => plan.macho_ID && plan.hembra_ID)
        .map((plan) => `${plan.macho_ID}|${plan.hembra_ID}`),
    ).size;

    const iActivas = incubacionesActivas?.[0]?.total || 0;
    const iProgramadas = incubacionesProgramadas?.[0]?.total || 0;

    return {
      totalAves: totalAves?.[0]?.total || 0,
      totalIncubaciones: totalIncubaciones?.[0]?.total || 0,
      incubacionesActivas: iActivas,
      incubacionesProgramadas: iProgramadas,
      totalAvesActivas: totalAvesActivas?.[0]?.total || 0,
      totalNacidos: totalNacidosRes?.[0]?.total || 0,
      alertaIncubaciones: iProgramadas > 0 ? `Tienes ${iProgramadas} incubaciones programadas.` : "",
      alertaEclosion: iActivas > 0 ? `Tienes ${iActivas} incubaciones en proceso.` : "",
      incubacionesRecientes: recientes || [],
      totalLineas: totalLineas?.[0]?.total || 0,
      totalPlanes,
      totalPollitos: totalPollitos?.[0]?.total || 0,
      totalCombates: totalCombates?.[0]?.total || 0
    };
  });

  this.on('analizarCrucePorParentesco', async (req) => {
    const { macho_ID, hembra_ID, tipoParentesco } = req.data;

    if (!macho_ID || !hembra_ID || !tipoParentesco) {
      return req.reject(400, 'Debe seleccionar macho, hembra y tipo de parentesco.');
    }

    if (macho_ID === hembra_ID) {
      return req.reject(400, 'El macho y la hembra no pueden ser el mismo ejemplar.');
    }

    const reglas = {
      PADRE_HIJA: {
        porcentaje: 25,
        nivelRiesgo: 'ALTO',
        state: 'Error',
        messageType: 'Error',
        descripcion: 'Cruce directo padre × hija.',
        recomendacion: 'Usar solo si el ave padre es excepcional y se busca fijar una característica muy específica. Requiere selección fuerte de crías.'
      },
      MADRE_HIJO: {
        porcentaje: 25,
        nivelRiesgo: 'ALTO',
        state: 'Error',
        messageType: 'Error',
        descripcion: 'Cruce directo madre × hijo.',
        recomendacion: 'Riesgo alto. Recomendado únicamente bajo control estricto y con descarte de crías débiles.'
      },
      ABUELO_NIETA: {
        porcentaje: 12.5,
        nivelRiesgo: 'MODERADO',
        state: 'Warning',
        messageType: 'Warning',
        descripcion: 'Cruce abuelo × nieta.',
        recomendacion: 'Útil para reforzar características del fundador sin llegar al riesgo máximo.'
      },
      ABUELA_NIETO: {
        porcentaje: 12.5,
        nivelRiesgo: 'MODERADO',
        state: 'Warning',
        messageType: 'Warning',
        descripcion: 'Cruce abuela × nieto.',
        recomendacion: 'Puede ayudar a consolidar línea materna. Evaluar salud, fertilidad y desempeño.'
      },
      TIO_SOBRINA: {
        porcentaje: 12.5,
        nivelRiesgo: 'MODERADO',
        state: 'Warning',
        messageType: 'Warning',
        descripcion: 'Cruce tío × sobrina.',
        recomendacion: 'Buen cruce de línea si ambos provienen de aves sobresalientes.'
      },
      TIA_SOBRINO: {
        porcentaje: 12.5,
        nivelRiesgo: 'MODERADO',
        state: 'Warning',
        messageType: 'Warning',
        descripcion: 'Cruce tía × sobrino.',
        recomendacion: 'Permite conservar sangre familiar con riesgo manejable.'
      },
      MEDIO_HERMANOS: {
        porcentaje: 12.5,
        nivelRiesgo: 'MODERADO',
        state: 'Warning',
        messageType: 'Warning',
        descripcion: 'Cruce entre medio hermanos.',
        recomendacion: 'Puede fijar cualidades, pero vigilar vigor, tamaño, fertilidad y salud.'
      },
      PRIMOS: {
        porcentaje: 6.25,
        nivelRiesgo: 'BAJO_MODERADO',
        state: 'Success',
        messageType: 'Success',
        descripcion: 'Cruce entre primos.',
        recomendacion: 'Opción más segura para mantener familia sin exceso de consanguinidad.'
      },
      SIN_PARENTESCO: {
        porcentaje: 0,
        nivelRiesgo: 'BAJO',
        state: 'Success',
        messageType: 'Success',
        descripcion: 'No se detecta parentesco directo.',
        recomendacion: 'Útil para refrescar sangre o crear una nueva base familiar.'
      }
    };

    const resultado = reglas[tipoParentesco];

    if (!resultado) {
      return req.reject(400, 'Tipo de parentesco no válido.');
    }

    return resultado;
  });

  this.on("analizarCruceAutomatico", async (req) => {
    const { macho_ID, hembra_ID, generaciones, linea_ID } = req.data;

    if (!macho_ID || !hembra_ID) {
      return req.reject(400, "Debe seleccionar macho y hembra.");
    }

    try {
      const resultado = await analizarParentescoAutomatico(macho_ID, hembra_ID, generaciones || 5, linea_ID || null);
      if (linea_ID && await esLineaCruceAbierto(linea_ID, req.jwtUser?.id)) {
        resultado.cumplePorcentajeLinaje = true;
      }
      return resultado;
    } catch (error) {
      return req.reject(400, error.message);
    }
  });

  this.on("obtenerLineaCruceAbierto", async (req) => {
    const linea = await obtenerLineaCruceAbierto(req.jwtUser?.id);
    if (!linea) {
      return req.reject(400, "No se pudo preparar la linea de cruce abierto.");
    }

    return { lineaId: linea.ID };
  });

  this.before("READ", Incubaciones, (req) => agregarFiltroUsuario(req));
  this.before("READ", Peleas, (req) => agregarFiltroUsuario(req));
  this.before("READ", IncubacionDetalles, (req) => agregarFiltroUsuario(req));
  this.before("READ", PlanesCruces, (req) => {
    agregarFiltroUsuario(req);
    agregarFiltroEstadoNoEliminado(req);
  });
  this.before("READ", LineasAves, (req) => agregarFiltroUsuario(req));
  this.before("READ", EvaluacionesAves, (req) => agregarFiltroUsuario(req));
  this.before("READ", EvaluacionesPleito, (req) => agregarFiltroUsuario(req));

});
