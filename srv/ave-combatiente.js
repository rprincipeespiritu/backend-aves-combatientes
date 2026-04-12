const cds = require("@sap/cds");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

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
    Incubaciones: ["READ", "CREATE", "UPDATE", "DELETE"],
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
    HistorialCambios,
    FotosAve,
    Transacciones,
    Usuario,
    Rol,
  } = this.entities;

  // Intercepta TODAS las operaciones del servicio
  this.before("*", async (req) => {
    // El action login no requiere token
    const accionesPublicas = ["login", "logout", "registrarUsuario", "reenviarActivacion"];
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

    return SELECT.one.from(Incubaciones).where({ codigo });
  });

  //========================================
  // FUNCIONES AUXILIARES
  //========================================

  async function enviarCorreoActivacion(email, tokenActivacion) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const urlBase = process.env.APP_URL || "http://localhost:8080";
    const linkActivacion = `${urlBase}/activar-cuenta?token=${tokenActivacion}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Activa tu cuenta",
      html: `
      <h2>Bienvenido</h2>
      <p>Tu cuenta fue creada correctamente.</p>
      <p>Haz clic en el siguiente enlace para activarla:</p>
      <p><a href="${linkActivacion}">${linkActivacion}</a></p>
      <p>Este enlace vence en 24 horas.</p>
    `,
    });
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
      return req.reject(500, error.message);
    }
  });
});
