namespace ave.combatiente;

using {
    cuid,
    managed
} from '@sap/cds/common';

//============================================
// ENTIDADES BASE
//============================================

// Maestras de configuración
entity Raza : cuid {
    nombre          : String(50) @mandatory;
    descripcion     : String(500);
    origen          : String(100);
    caracteristicas : LargeString;
    activo          : Boolean default true;
}

entity Color : cuid {
    nombre      : String(50) @mandatory;
    codigoHex   : String(7); // #FFFFFF
    descripcion : String(200);
    activo      : Boolean default true;
}

entity TipoAve : cuid {
    codigo      : String(10) @mandatory;
    nombre      : String(50) @mandatory;
    descripcion : String(200);
    activo      : Boolean default true;
}

//============================================
// GESTIÓN DE AVES
//============================================

entity Ave : cuid, managed {
    // Identificación
    placa              : String(20)              @mandatory; // Placa única
    nombre             : String(100);
    apodo              : String(50);

    // Características físicas
    raza               : String(250);
    color              : String(250);
    tipoAve            : String(250);
    sexo               : String(1)               @assert.enum: {
        M,
        H
    }; // Macho/Hembra

    // Fechas importantes
    fechaNacimiento    : Date;
    fechaCompra        : Date;
    fechaFallecimiento : Date;
    edad               : Integer; // Calculado

    // Genealogía
    padre              : Association to Ave;
    madre              : Association to Ave;
    // hijos              : Association to many Ave
    //                          on hijos.padre = $self
    //                          or hijos.madre = $self;

    // Información adicional
    procedencia        : String(200);
    criador            : String(200);
    valorCompra        : Decimal(10, 2);
    valorActual        : Decimal(10, 2);
    observaciones      : LargeString;

    // Estado
    estado             : String(20)              @assert.enum: {
        ACTIVO,
        VENDIDO,
        PRESTADO,
        RETIRADO,
        FALLECIDO,
        ELIMINADO
    };
    categoria          : String(20)              @assert.enum: {
        BUENO,
        EXCELENTE,
        EXTRAORDINARIO
    };
    cruce              : String(20)              @assert.enum: {
        ABIERTO,
        INBREEDING
    };
    cria               : Boolean;
    padrote            : Boolean;
    ubicacion          : String(200);

    // Relaciones
    pesajes            : Composition of many Pesaje
                             on pesajes.ave = $self;
    peleas             : Association to many Pelea
                             on peleas.ave = $self;
    incubacion         : Association to Incubacion;
    fotos              : Composition of many FotoAve
                             on fotos.ave = $self;
    videos             : Composition of many VideoAve
                             on videos.ave = $self;
    documentos         : Composition of many DocumentoAve
                             on documentos.ave = $self;
    usuario            : Association to Usuario  @mandatory;
    linea              : Association to LineaAve @mandatory;

    // SharePoint
    sharepointFolderId : String(200);
    sharepointUrl      : String(500);
}

//============================================
// PESAJE Y SEGUIMIENTO
//============================================

entity Pesaje : cuid, managed {
    ave                : Association to Ave @mandatory;
    fecha              : DateTime           @mandatory;
    peso               : Decimal(5, 2)      @mandatory; // kg
    altura             : Decimal(5, 2); // cm
    circunferencia     : Decimal(5, 2); // cm

    // Mediciones adicionales
    largoEspolon       : Decimal(4, 2);
    anchoPecho         : Decimal(5, 2);

    // Condición física
    condicionFisica    : String(20)         @assert.enum: {
        EXCELENTE,
        BUENA,
        REGULAR,
        MALA
    };
    observaciones      : String(500);

    // Veterinaria
    temperatura        : Decimal(3, 1);
    frecuenciaCardiaca : Integer;

    // Registro
    responsable        : Association to Usuario;
}

//============================================
// PELEAS Y COMPETENCIAS
//============================================

entity Pelea : cuid, managed {
    ave                 : Association to Ave @mandatory;
    fecha               : DateTime           @mandatory;
    lugar               : String(200);
    evento              : String(200);

    // Oponente
    nombreOponente      : String(100);
    procedenciaOponente : String(200);

    // Resultado
    resultado           : String(20)         @assert.enum: {
        VICTORIA,
        DERROTA,
        EMPATE,
        DESCALIFICADO
    };
    tiempoRonda         : Integer; // minutos
    metodoVictoria      : String(100); // KO, Puntos, Abandono, etc.

    // Premios
    premioDinero        : Decimal(10, 2);
    premioTrofeo        : String(200);

    // Evaluación
    rendimiento         : Integer; // 1-10
    observaciones       : LargeString;
    lesiones            : String(500);

    // Medios
    videoUrl            : String(500);
    fotos               : Composition of many FotoPelea
                              on fotos.pelea = $self;
}

entity FotoPelea : cuid, managed {
    pelea         : Association to Pelea;
    titulo        : String(200);
    descripcion   : String(500);
    urlSharepoint : String(500);
    thumbnailUrl  : String(500);
}

//============================================
// INCUBACIÓN Y REPRODUCCIÓN
//============================================

entity Incubacion : cuid, managed {
    codigo             : String(20)             @mandatory;

    // Fechas
    fechaIncubacion    : DateTime               @mandatory;
    fechaPreNacimiento : DateTime;
    fechaEclosion      : DateTime;
    fechaFinIncubacion : DateTime;

    // Condiciones
    temperatura        : Decimal(4, 2);
    humedad            : Decimal(5, 2);

    // Estado
    estado             : String(20)             @assert.enum: {
        PROGRAMADA,
        EN_PROCESO,
        COMPLETADA,
        CANCELADA,
        ELIMINADO
    };
    observaciones      : LargeString;

    motivoCancelacion  : String(500);

    detalles           : Composition of many IncubacionDetalle
                             on detalles.incubacion = $self;

    usuario            : Association to Usuario @mandatory;

}

entity IncubacionDetalle : cuid, managed {
    incubacion           : Association to Incubacion @mandatory;

    padre                : Association to Ave        @mandatory;
    madre                : Association to Ave        @mandatory;

    totalHuevos          : Integer default 0;
    huevosFertiles       : Integer default 0;
    huevosEclosionados   : Integer default 0;
    huevosNoEclosionados : Integer default 0;

    usuario              : Association to Usuario    @mandatory;

}

// Extender Ave para incluir incubación
// extend Ave {
//     incubacion : Association to Incubacion;
// }

//============================================
// ALIMENTACIÓN Y TRATAMIENTOS
//============================================

entity Alimentacion : cuid, managed {
    ave           : Association to Ave;
    fecha         : DateTime @mandatory;
    tipoAlimento  : String(200);
    cantidad      : Decimal(5, 2);
    unidadMedida  : String(20);
    observaciones : String(500);
}

entity Tratamiento : cuid, managed {
    ave               : Association to Ave @mandatory;
    fecha             : DateTime           @mandatory;
    tipoTratamiento   : String(20)         @assert.enum: {
        VACUNA,
        DESPARASITACION,
        MEDICAMENTO,
        VITAMINAS,
        OTRO
    };

    // Detalles del tratamiento
    medicamento       : String(200);
    dosis             : String(100);
    viaAdministracion : String(50);

    // Duración
    fechaInicio       : Date;
    fechaFin          : Date;
    frecuencia        : String(100);

    // Responsable
    veterinario       : String(200);
    diagnostico       : String(500);
    observaciones     : LargeString;

    // Costos
    costo             : Decimal(10, 2);
}

//============================================
// FINANZAS
//============================================

entity Transaccion : cuid, managed {
    fecha             : DateTime       @mandatory;
    tipo              : String(20)     @assert.enum: {
        INGRESO,
        EGRESO
    };
    categoria         : String(50)     @mandatory;

    // Relacionado a
    ave               : Association to Ave;
    pelea             : Association to Pelea;

    // Detalles financieros
    concepto          : String(200)    @mandatory;
    monto             : Decimal(10, 2) @mandatory;
    moneda            : String(3) default 'PEN';
    metodoPago        : String(50);

    // Documentación
    numeroComprobante : String(50);
    documentoUrl      : String(500);

    observaciones     : String(500);
}

//============================================
// MULTIMEDIA
//============================================

entity FotoAve : cuid, managed {
    ave           : Association to Ave;
    titulo        : String(200);
    descripcion   : String(500);
    fechaFoto     : Date;
    urlSharepoint : String(500) @mandatory;
    thumbnailUrl  : String(500);
    esPrincipal   : Boolean default false;
}

entity VideoAve : cuid, managed {
    ave           : Association to Ave;
    titulo        : String(200);
    descripcion   : String(500);
    fechaVideo    : Date;
    urlSharepoint : String(500) @mandatory;
    duracion      : Integer; // segundos
}

entity DocumentoAve : cuid, managed {
    ave           : Association to Ave;
    titulo        : String(200);
    tipoDocumento : String(50);
    descripcion   : String(500);
    urlSharepoint : String(500) @mandatory;
    tamanio       : Integer; // bytes
}

//============================================
// USUARIOS Y SEGURIDAD
//============================================

entity Usuario : cuid, managed {
    username             : String(50) @mandatory;
    email                : String(100);
    password             : String(500); // hash bcrypt
    nombre               : String(100);
    apellido             : String(200);
    telefono             : String(20);
    direccion            : String(300);

    // Rol
    rol                  : Association to Rol;

    // Estado
    estado               : String(20) default 'PENDIENTE'; // PENDIENTE | ACTIVO | ELIMINADO
    tokenActivacion      : String(255);
    tokenExpiracion      : Timestamp;

    tokenRecuperacion    : String(255);
    tokenRecuperacionExp : Timestamp;

    ultimoAcceso         : DateTime;

    // Preferencias
    preferencias         : LargeString; // JSON
    aves                 : Association to many Ave
                               on aves.usuario = $self;

    incubaciones         : Association to many Incubacion
                               on incubaciones.usuario = $self;

    lineas               : Association to many LineaAve
                               on lineas.usuario = $self;

    cruces               : Association to many PlanCruce
                               on cruces.usuario = $self;

    IncubacionesDetalle  : Association to many IncubacionDetalle
                               on IncubacionesDetalle.usuario = $self;
}

entity Rol : cuid {
    codigo      : String(20) @mandatory;
    nombre      : String(50) @mandatory;
    descripcion : String(200);
    permisos    : LargeString; // JSON con permisos
    activo      : Boolean default true;
}

//============================================
// AUDITORÍA
//============================================

entity HistorialCambios : cuid, managed {
    entidad       : String(50) @mandatory;
    entidadId     : String(36) @mandatory;
    campo         : String(100);
    valorAnterior : String(500);
    valorNuevo    : String(500);
    usuario       : Association to Usuario;
    fecha         : DateTime   @mandatory;
    accion        : String(20) @assert.enum: {
        CREATE,
        UPDATE,
        DELETE
    };
}

entity LineaAve : cuid, managed {
    nombre       : String(100)                 @mandatory;
    descripcion  : String(500);
    objetivo     : String(500);

    estado       : String(20) default 'ACTIVA' @assert.enum: {
        ACTIVA,
        INACTIVA,
        ELIMINADO
    };

    aveFundador  : Association to Ave;
    aveFundadora : Association to Ave;

    planes       : Composition of many PlanCruce
                       on planes.linea = $self;
    aves         : Association to many Ave
                       on aves.linea = $self;

    usuario      : Association to Usuario      @mandatory;
}

entity PlanCruce : cuid, managed {
    linea          : Association to LineaAve @mandatory;

    macho          : Association to Ave      @mandatory;
    hembra         : Association to Ave      @mandatory;

    tipoParentesco : String(50);
    objetivoCruce  : String(500);

    nivelRiesgo    : String(20);
    porcentaje     : Decimal(5, 2);

    recomendacion  : String(1000);
    estado         : String(20) default 'PROPUESTO';

    fechaPropuesta : Date;

    usuario        : Association to Usuario  @mandatory;
}
