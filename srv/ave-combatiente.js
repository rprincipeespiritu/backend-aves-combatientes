const cds = require("@sap/cds");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");

const JWT_SECRET =
  process.env.JWT_SECRET || "ave-combatiente-secret-2024-xK9#mP";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1h";

const nodemailer = require("nodemailer");

//============================================
// PERMISOS POR ROL
//============================================
const PERMISOS_ROL = {
  ADMIN: {
    Aves: ["READ", "CREATE", "UPDATE", "DELETE"],
    Pesajes: ["READ", "CREATE", "UPDATE", "DELETE"],
    Peleas: ["READ", "CREATE", "UPDATE", "DELETE"],
    Incubaciones: ["READ", "CREATE", "UPDATE", "DELETE", "iniciar", "finalizar", "cancelar"],
    EvaluacionesAves: ["READ", "CREATE", "UPDATE", "DELETE"],
    LineasAves: ["READ", "CREATE", "UPDATE", "DELETE"],
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
    Roles: ["READ", "CREATE", "UPDATE", "DELETE"],
    Historial: ["READ"],
  },
  CRIADOR: {
    Aves: ["READ", "CREATE", "UPDATE"],
    Pesajes: ["READ", "CREATE", "UPDATE"],
    Peleas: ["READ", "CREATE", "UPDATE"],
    Incubaciones: ["READ", "CREATE", "UPDATE"],
    EvaluacionesAves: ["READ", "CREATE", "UPDATE"],
    LineasAves: ["READ", "CREATE", "UPDATE"],
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
    Roles: [],
    Historial: [],
  },
  VETERINARIO: {
    Aves: ["READ"],
    Pesajes: ["READ", "CREATE", "UPDATE"],
    Peleas: ["READ"],
    Incubaciones: ["READ"],
    EvaluacionesAves: ["READ", "CREATE", "UPDATE"],
    LineasAves: ["READ"],
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
    Roles: [],
    Historial: [],
  },
  VIEWER: {
    Aves: ["READ"],
    Pesajes: ["READ"],
    Peleas: ["READ"],
    Incubaciones: ["READ"],
    EvaluacionesAves: ["READ"],
    LineasAves: ["READ"],
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
    Pesajes,
    Peleas,
    Incubaciones,
    IncubacionDetalles,
    HistorialCambios,
    FotosAve,
    Transacciones,
    Usuario,
    Rol,
    LineasAves,
    PlanesCruces,
    EvaluacionesAves
  } = this.entities;

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

    // Verificar permisos por rol
    const rol = req.jwtUser.rol;
    const operacion = req.event; // READ, CREATE, UPDATE, DELETE
    const entidadRaw = req.target?.name || req.entity || "";
    const entidad = req.entity?.split(".").pop(); // "ave.combatiente.Ave" -> "Ave"

    if (!entidad || !operacion) return;

    // Mapear nombre de entidad CDS al nombre del servicio
    const ENTIDAD_MAP = {
      Ave: "Aves",
      Aves: "Aves",
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
      Rol: "Roles",
      Roles: "Roles",
      HistorialCambios: "Historial",
      Historial: "Historial",
      LineaAve: "LineasAves",
      LineasAves: "LineasAves",
      PlanCruce: "PlanesCruces",
      PlanesCruces: "PlanesCruces",
      EvaluacionAve: "EvaluacionesAves",
      EvaluacionesAves: "EvaluacionesAves",
      IncubacionDetalle: "IncubacionDetalles",
      IncubacionDetalles: "IncubacionDetalles",
    };

    const entidadServicio = ENTIDAD_MAP[entidad];
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
      .where({ email });

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
      email: email,
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
    await enviarCorreoActivacion(emailNormalizado, tokenActivacion);

    return {
      success: true,
      message:
        "Usuario registrado correctamente. Revisa tu correo para activar tu cuenta.",
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
        "rol_ID",
      )
      .where({ email });

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
    };
  });

  this.on("logout", async (req) => {
    // JWT es stateless, solo confirmamos al cliente
    return {
      success: true,
      message: "Sesión cerrada exitosamente",
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

  this.before("READ", Aves, (req) => {
    const userId = req.jwtUser && req.jwtUser.id;
    console.log("imprimir req: " + JSON.stringify(req));
    console.log("imprimir userId: " + JSON.stringify(userId));

    if (!userId) return;

    if (!req.query.SELECT.where) {
      req.query.SELECT.where = [];
    } else if (req.query.SELECT.where.length > 0) {
      req.query.SELECT.where.push("and");
    }

    req.query.SELECT.where.push({ ref: ["usuario_ID"] }, "=", { val: userId });
  });
  // Validar datos de ave antes de crear
  this.before("CREATE", "Aves", async (req) => {
    const { placa, fechaNacimiento, padre, madre } = req.data;

    // Validar placa única
    const existePlaca = await SELECT.one.from(Aves).where({ placa });
    if (existePlaca) {
      req.error(400, `La placa ${placa} ya existe`);
    }

    // Validar fecha de nacimiento
    if (fechaNacimiento && new Date(fechaNacimiento) > new Date()) {
      req.error(400, "La fecha de nacimiento no puede ser futura");
    }

    // Validar que padre y madre no sean el mismo
    if (padre && madre && padre.ID === madre.ID) {
      req.error(400, "El padre y la madre no pueden ser la misma ave");
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

    if (data.planCruce_ID) {
      const plan = await SELECT.one.from(PlanesCruces).where({ ID: data.planCruce_ID });
      if (!plan) {
        return req.reject(400, "El plan de cruce seleccionado no existe");
      }

      data.padre_ID = data.padre_ID || plan.macho_ID;
      data.madre_ID = data.madre_ID || plan.hembra_ID;
      data.tipoParentesco = data.tipoParentesco || plan.tipoParentesco;
      data.nivelRiesgo = data.nivelRiesgo || plan.nivelRiesgo;
      data.porcentaje = data.porcentaje ?? plan.porcentaje;
    }

    if (data.padre_ID && data.madre_ID && data.padre_ID === data.madre_ID) {
      return req.reject(400, 'El padre y la madre no pueden ser la misma ave');
    }

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
    if (!req.data.codigo) {
      const fecha = new Date();
      const yyyyMMdd = fecha.toISOString().slice(0, 10).replace(/-/g, "");
      const hhmmss = fecha.toTimeString().slice(0, 8).replace(/:/g, "");
      req.data.codigo = `PC-${yyyyMMdd}-${hhmmss}`;
    }
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

  this.before(['CREATE', 'UPDATE'], Incubaciones, async (req) => {
    const data = req.data;

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
    const { fecha, ave } = req.data;

    // Verificar que el ave esté activa
    const aveData = await SELECT.one.from(Aves).where({ ID: ave.ID });

    if (!aveData) {
      req.error(404, "Ave no encontrada");
    }

    if (aveData.estado !== "ACTIVO") {
      req.error(400, "El ave no está activa");
    }

    // Verificar que no haya peleas muy recientes (menos de 30 días)
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const peleasRecientes = await SELECT.from(Peleas)
      .where({ ave_ID: ave.ID })
      .and({ fecha: { ">": hace30Dias.toISOString() } });

    if (peleasRecientes.length > 0) {
      req.warn("El ave tuvo una pelea en los últimos 30 días");
    }
  });

  //========================================
  // AFTER - PROCESAMIENTO POST-OPERACIÓN
  //========================================

  // Después de crear un ave, crear carpeta en SharePoint
  this.after("CREATE", "Aves", async (data, req) => {
    try {
      // Aquí iría la lógica de SharePoint
      // await crearCarpetaSharePoint(data.ID, data.placa);
      console.log(`Ave creada: ${data.placa}`);
    } catch (error) {
      console.error("Error creando carpeta SharePoint:", error);
    }
  });

  // Calcular estadísticas después de leer aves
  this.after("READ", "Aves", async (aves) => {
    if (!aves) return;

    const avesArray = Array.isArray(aves) ? aves : [aves];

    for (const ave of avesArray) {
      // Calcular edad actual
      if (ave.fechaNacimiento && !ave.fechaFallecimiento) {
        const hoy = new Date();
        const nacimiento = new Date(ave.fechaNacimiento);
        ave.edad = Math.floor(
          (hoy - nacimiento) / (365.25 * 24 * 60 * 60 * 1000),
        );
      }

      // Obtener último peso
      const ultimoPesaje = await SELECT.one
        .from(Pesajes)
        .where({ ave_ID: ave.ID })
        .orderBy({ fecha: "desc" });

      if (ultimoPesaje) {
        ave.pesoActual = ultimoPesaje.peso;
        ave.ultimaActualizacionPeso = ultimoPesaje.fecha;
      }

      // Contar peleas
      const peleas = await SELECT.from(Peleas).where({ ave_ID: ave.ID });

      ave.totalPeleas = peleas.length;
      ave.peleasGanadas = peleas.filter(
        (p) => p.resultado === "VICTORIA",
      ).length;

      if (ave.totalPeleas > 0) {
        ave.porcentajeVictorias = (
          (ave.peleasGanadas / ave.totalPeleas) *
          100
        ).toFixed(2);
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

  async function enviarCorreoActivacion(email, tokenActivacion) {
    const apiKey = process.env.SENDGRID_API_KEY;

    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const appUrl = process.env.APP_URL || "http://localhost:4004";

    if (!apiKey) {
      throw new Error("Falta SENDGRID_API_KEY");
    }

    if (!fromEmail) {
      throw new Error("Falta SENDGRID_FROM_EMAIL");
    }

    sgMail.setApiKey(apiKey);

    const linkActivacion = `${appUrl}/activar-cuenta?token=${tokenActivacion}`;

    const msg = {
      to: email,
      from: fromEmail,
      subject: "Activa tu cuenta",
      html: `
      <h2>Bienvenido</h2>
      <p>Tu cuenta fue creada correctamente.</p>
      <p>Haz clic en el siguiente enlace para activarla:</p>
      <p><a href="${linkActivacion}">${linkActivacion}</a></p>
      <p>Este enlace vence en 24 horas.</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid status:", response.statusCode);
  }

  async function construirArbolGenealogico(aveId, generaciones) {
    if (generaciones <= 0) return null;

    const ave = await SELECT.one.from(Aves).where({ ID: aveId });
    if (!ave) return null;

    const nodo = {
      id: ave.ID,
      placa: ave.placa,
      nombre: ave.nombre,
      sexo: ave.sexo,
      fechaNacimiento: ave.fechaNacimiento,
      padre: null,
      madre: null,
    };

    if (ave.padre_ID) {
      nodo.padre = await construirArbolGenealogico(
        ave.padre_ID,
        generaciones - 1,
      );
    }

    if (ave.madre_ID) {
      nodo.madre = await construirArbolGenealogico(
        ave.madre_ID,
        generaciones - 1,
      );
    }

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

  async function analizarParentescoAutomatico(machoId, hembraId, generaciones = 5) {
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
    let porcentaje = ["PADRE_HIJA", "MADRE_HIJO"].includes(tipoParentesco) ? 25 : 0;

    for (const [id, ancestroMacho] of mapaMacho.entries()) {
      if (id === macho.ID || id === hembra.ID) continue;
      const ancestroHembra = mapaHembra.get(id);
      if (!ancestroHembra) continue;

      const contribucion = Math.pow(0.5, ancestroMacho.distancia + ancestroHembra.distancia + 1) * 100;
      porcentaje += contribucion;
      ancestrosComunes.push({
        ID: id,
        placa: ancestroMacho.placa,
        nombre: ancestroMacho.nombre,
        distanciaMacho: ancestroMacho.distancia,
        distanciaHembra: ancestroHembra.distancia,
        contribucion: Number(contribucion.toFixed(2)),
      });
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

    return {
      tipoParentesco,
      nivelRiesgo: clasificacion.nivelRiesgo,
      porcentaje,
      descripcion: describirParentesco(tipoParentesco),
      recomendacion: clasificacion.recomendacion,
      decision: clasificacion.decision,
      state: clasificacion.state,
      messageType: clasificacion.messageType,
      ancestrosComunes: JSON.stringify(ancestrosComunes),
    };
  }

  this.on("eliminarAve", async (req) => {
    try {
      console.log("BODY:", req.data);

      const lineaAveId = req.data.lineaAveId;

      if (!lineaAveId) {
        return req.reject(400, "El ID es obligatorio");
      }

      const ave = await SELECT.one.from(LineaAves).where({ ID: lineaAveId });

      if (!ave) {
        return req.reject(404, "Línea de ave no encontrada");
      }

      await UPDATE(LineaAves)
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

      const ave = await SELECT.one.from(LineaAves).where({ ID: lineaAveId });

      if (!ave) {
        return req.reject(404, "Línea de ave no encontrada");
      }

      await UPDATE(LineaAves)
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

      const ave = await SELECT.one.from(Incubaciones).where({ ID: incubacionId });

      if (!ave) {
        return req.reject(404, "Incubación no encontrada");
      }

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
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:8080/index.html";

    if (!apiKey) throw new Error("Falta SENDGRID_API_KEY");
    if (!fromEmail) throw new Error("Falta SENDGRID_FROM_EMAIL");

    sgMail.setApiKey(apiKey);

    const link = `${frontendUrl}#/reset-password/${tokenRecuperacion}`;

    const msg = {
      to: email,
      from: fromEmail,
      subject: "Recupera tu contraseña",
      html: `
      <h2>Recuperación de contraseña</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>Haz clic en el siguiente enlace:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Este enlace vence en 1 hora.</p>
      <p>Si no solicitaste este cambio, ignora este correo.</p>
    `,
    };

    const [response] = await sgMail.send(msg);
    console.log("SendGrid reset status:", response.statusCode);
  }

  this.on("obtenerDashboard", async (req) => {
    const { Ave, Incubacion, IncubacionDetalle, LineaAve } =
      cds.entities("ave.combatiente");

    console.log("imprimir req: " + JSON.stringify(req));
    
    const usuarioId =
      req.jwtUser?.ID ||
      req.jwtUser?.id ||
      req.user?.id;

    console.log("imprimir userId: " + JSON.stringify(usuarioId));

    if (!usuarioId) {
      return req.reject(401, "No se pudo identificar el usuario logueado.");
    }

    const totalAves = await SELECT.from(Ave)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" }
      })
      .columns("count(*) as total");

    const totalIncubaciones = await SELECT.from(Incubacion)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" }
      })
      .columns("count(*) as total");

    const incubacionesActivas = await SELECT.from(Incubacion)
      .where({
        usuario_ID: usuarioId,
        estado: "EN_PROCESO"
      })
      .columns("count(*) as total");

    const incubacionesProgramadas = await SELECT.from(Incubacion)
      .where({
        usuario_ID: usuarioId,
        estado: "PROGRAMADA"
      })
      .columns("count(*) as total");

    const totalAvesActivas = await SELECT.from(Ave)
      .where({
        usuario_ID: usuarioId,
        estado: "ACTIVO"
      })
      .columns("count(*) as total");

    const totalLineas = await SELECT.from(LineaAve)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADA" }
      })
      .columns("count(*) as total");

    const totalPlanes = await SELECT.from(PlanesCruces)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADA" }
      })
      .columns("count(*) as total");

    const totalNacidosRes = await SELECT.from(IncubacionDetalle)
      .where({
        usuario_ID: usuarioId
      })
      .columns("sum(huevosEclosionados) as total");

    const recientes = await SELECT.from(Incubacion)
      .where({
        usuario_ID: usuarioId,
        estado: { "!=": "ELIMINADO" }
      })
      .columns("ID", "codigo", "estado", "fechaIncubacion")
      .orderBy("createdAt desc")
      .limit(5);

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
      totalPlanes: totalPlanes?.[0]?.total || 0,
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
    const { macho_ID, hembra_ID, generaciones } = req.data;

    if (!macho_ID || !hembra_ID) {
      return req.reject(400, "Debe seleccionar macho y hembra.");
    }

    try {
      return await analizarParentescoAutomatico(macho_ID, hembra_ID, generaciones || 5);
    } catch (error) {
      return req.reject(400, error.message);
    }
  });

  this.before("READ", Incubaciones, (req) => {
    const userId = req.jwtUser && req.jwtUser.id;
    console.log("imprimir req: " + JSON.stringify(req));
    console.log("imprimir userId: " + JSON.stringify(userId));

    if (!userId) return;

    if (!req.query.SELECT.where) {
      req.query.SELECT.where = [];
    } else if (req.query.SELECT.where.length > 0) {
      req.query.SELECT.where.push("and");
    }

    req.query.SELECT.where.push({ ref: ["usuario_ID"] }, "=", { val: userId });
  });

  this.before("READ", PlanesCruces, (req) => {
    const userId = req.jwtUser && req.jwtUser.id;
    console.log("imprimir req: " + JSON.stringify(req));
    console.log("imprimir userId: " + JSON.stringify(userId));

    if (!userId) return;

    if (!req.query.SELECT.where) {
      req.query.SELECT.where = [];
    } else if (req.query.SELECT.where.length > 0) {
      req.query.SELECT.where.push("and");
    }

    req.query.SELECT.where.push({ ref: ["usuario_ID"] }, "=", { val: userId });
  });

  this.before("READ", LineasAves, (req) => {
    const userId = req.jwtUser && req.jwtUser.id;
    console.log("imprimir req: " + JSON.stringify(req));
    console.log("imprimir userId: " + JSON.stringify(userId));

    if (!userId) return;

    if (!req.query.SELECT.where) {
      req.query.SELECT.where = [];
    } else if (req.query.SELECT.where.length > 0) {
      req.query.SELECT.where.push("and");
    }

    req.query.SELECT.where.push({ ref: ["usuario_ID"] }, "=", { val: userId });
  });

});
