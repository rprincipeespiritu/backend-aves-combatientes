using ave.combatiente from '../db/schema';

//============================================
// SERVICIO PRINCIPAL
//============================================

@path: '/api/avecombatiente'
service AveCombatienteService {

    //========================================
    // ENTIDADES PRINCIPALES
    //========================================

    //@odata.draft.enabled
    @cds.redirection.target
    entity Aves                as projection on combatiente.Ave
        actions {
            action marcarComoVendido(precio: Decimal, comprador: String) returns Aves;
            action marcarComoFallecido(fecha: Date, causa: String)       returns Aves;
            action generarArbolGenealogico()                             returns LargeString; // JSON del árbol
        };

    action   eliminarAve(aveId: String)                                                                                                                 returns {
        success : Boolean;
        message : String;
    };

    action   eliminarCria(criaId: String)                                                                                                               returns {
        success : Boolean;
        message : String;
    };

    action   registrarCriaComoAve(criaId: String,
                                  placa: String,
                                  genero: String)                                                                                                       returns Aves;

    entity Crias               as projection on combatiente.Cria;
    entity LineasAves          as projection on combatiente.LineaAve;
    entity PlanesCruces        as projection on combatiente.PlanCruce;
    entity EvaluacionesAves    as projection on combatiente.EvaluacionAve;

    ////@odata.draft.enabled
    @cds.redirection.target
    entity Pesajes             as projection on combatiente.Pesaje;

    //@odata.draft.enabled
    entity Peleas              as projection on combatiente.Pelea;

    //@odata.draft.enabled
    @cds.redirection.target
    entity Incubaciones        as projection on combatiente.Incubacion
        actions {
            action iniciar()                      returns String;
            action finalizar(cantidadFertiles: Integer,
                             cantidadNacidos: Integer,
                             cantidadNoEclosion: Integer,
                             observacion: String) returns String;

            action cancelar(observacion: String)  returns String;
        };

    entity IncubacionDetalles  as projection on combatiente.IncubacionDetalle;

    //@odata.draft.enabled
    entity Tratamientos        as projection on combatiente.Tratamiento;

    entity Alimentaciones      as projection on combatiente.Alimentacion;

    entity Transacciones       as projection on combatiente.Transaccion;

    //========================================
    // ENTIDADES DE CONFIGURACIÓN
    //========================================

    entity Razas               as projection on combatiente.Raza;
    entity Colores             as projection on combatiente.Color;
    entity TiposAve            as projection on combatiente.TipoAve;

    //========================================
    // MULTIMEDIA
    //========================================

    entity FotosAve            as projection on combatiente.FotoAve;
    entity VideosAve           as projection on combatiente.VideoAve;
    entity DocumentosAve       as projection on combatiente.DocumentoAve;
    entity FotosPelea          as projection on combatiente.FotoPelea;

    //========================================
    // USUARIOS Y SEGURIDAD
    //========================================

    entity Usuarios            as projection on combatiente.Usuario;

    entity Roles               as projection on combatiente.Rol;

    //========================================
    // AUDITORÍA
    //========================================

    @readonly
    entity Historial           as projection on combatiente.HistorialCambios;

    //========================================
    // VISTAS Y REPORTES
    //========================================

    @readonly
    entity IncubacionesActivas as
        select from combatiente.Incubacion
        where
            estado <> 'ELIMINADO';

    // Vista: Aves activas con estadísticas
    @readonly
    entity AvesActivas         as
        select from combatiente.Ave
        where
            estado <> 'ELIMINADO';

    @cds.redirection.target
    @readonly
    entity LineasAvesActivas   as
        select from combatiente.LineaAve
        where
            estado <> 'ELIMINADO';

    // Vista: Top gallos por peleas ganadas
    @readonly
    entity TopGallos           as
        select from combatiente.Ave {
            key ID,
                placa,
                nombre,
                count(peleas.ID)                                             as totalPeleas         : Integer,
                count(case
                          when peleas.resultado = 'VICTORIA'
                               then 1
                      end)                                                   as peleasGanadas       : Integer,
                cast ( count(case
                                 when peleas.resultado = 'VICTORIA'
                                      then 1
                             end) as Decimal(5, 2)) / count(peleas.ID) * 100 as porcentajeVictorias : Decimal(5, 2)
        }
        group by
            ID,
            placa,
            nombre;


    // Vista: Evolución de peso por ave
    @readonly
    entity EvolucionPeso       as
        select from combatiente.Pesaje {
            key ID,
                ave.ID as aveId,
                ave.placa,
                ave.nombre,
                fecha,
                peso,
                condicionFisica
        }
        order by
            Pesaje.ave.ID,
            fecha desc;

    // Vista: Balance financiero
    @readonly
    entity BalanceFinanciero   as
        select from combatiente.Transaccion {
            key fecha                     : DateTime,
                sum(case
                        when tipo = 'INGRESO'
                             then monto
                        else 0
                    end) as totalIngresos : Decimal(10, 2),
                sum(case
                        when tipo = 'EGRESO'
                             then monto
                        else 0
                    end) as totalEgresos  : Decimal(10, 2),
                sum(case
                        when tipo = 'INGRESO'
                             then monto
                        else -monto
                    end) as balance       : Decimal(10, 2)
        }
        group by
            fecha
        order by
            fecha desc;

    //========================================
    // FUNCIONES PERSONALIZADAS
    //========================================

    // Obtener árbol genealógico
    function obtenerGenealogiaCompleta(aveId: String)                                                                                                   returns LargeString;

    // Calcular estadísticas de un ave
    function calcularEstadisticasAve(aveId: String)                                                                                                     returns {
        totalPeleas         : Integer;
        victorias           : Integer;
        derrotas            : Integer;
        empates             : Integer;
        porcentajeVictorias : Decimal;
        pesoPromedio        : Decimal;
        pesoActual          : Decimal;
        edadMeses           : Integer;
    };

    // Obtener aves disponibles para reproducción
    function avesDisponiblesReproduccion()                                                                                                              returns array of Aves;

    // Calcular rentabilidad de un ave
    function calcularRentabilidad(aveId: String)                                                                                                        returns {
        inversionTotal : Decimal;
        ingresosTotal  : Decimal;
        ganancia       : Decimal;
        roi            : Decimal;
    };

    //========================================
    // ACCIONES PERSONALIZADAS
    //========================================

    // Crear incubación automática
    action   crearIncubacion(padreId: String,
                             madreId: String,
                             totalHuevos: Integer,
                             fechaIncubacion: Date)                                                                                                     returns Incubaciones;

    // Registrar pelea rápida
    action   registrarPelea(aveId: String,
                            fecha: DateTime,
                            lugar: String,
                            resultado: String,
                            observaciones: String)                                                                                                      returns Peleas;

    // Generar reporte de ave
    action   generarReporteAve(aveId: String)                                                                                                           returns LargeString; // PDF Base64

    // Sincronizar con SharePoint
    action   sincronizarSharePoint(aveId: String)                                                                                                       returns Boolean;

    action   registrarUsuario(username: String, email: String, password: String, nombre: String, apellido: String, telefono: String, direccion: String) returns {
        success   : Boolean;
        message   : String;
        userId    : String;
        username  : String;
        nombre    : String;
        apellido  : String;
        email     : String;
        rol       : String;
        estado    : String;
        telefono  : String;
        direccion : String;
    };

    action   reenviarActivacion(email: String)                                                                                                          returns {
        success : Boolean;
        message : String;
    };

    action   login(email: String, password: String)                                                                                                     returns {
        success  : Boolean;
        token    : String;
        username : String;
        email    : String;
        rol      : String;
        userId   : String;
    };

    action   logout()                                                                                                                                   returns {
        success : Boolean;
        message : String;
    };

    action   registrarRoles(codigo: String, nombre: String, descripcion: String, permisos: String, activo: Boolean)                                     returns {
        success     : Boolean;
        codigo      : String;
        nombre      : String;
        descripcion : String;
        activo      : String;
    };

    action   solicitarRecuperacionPassword(email: String)                                                                                               returns {
        success : Boolean;
        message : String;
    };

    action   restablecerPassword(token: String,
                                 newPassword: String)                                                                                                   returns {
        success : Boolean;
        message : String;
    };

    action   obtenerDashboard()                                                                                                                         returns {
        totalAves               : Integer;
        totalIncubaciones       : Integer;
        incubacionesActivas     : Integer;
        incubacionesProgramadas : Integer;
        totalAvesActivas        : Integer;
        totalNacidos            : Integer;
        alertaIncubaciones      : String;
        alertaEclosion          : String;
        incubacionesRecientes   : many {
            ID              : UUID;
            codigo          : String;
            estado          : String;
            fechaIncubacion : Timestamp;
        };
        totalLineas             : Integer;
    };

    action   analizarCrucePorParentesco(macho_ID: UUID,
                                        hembra_ID: UUID,
                                        tipoParentesco: String)                                                                                         returns {
        nivelRiesgo   : String;
        porcentaje    : Decimal(5, 2);
        descripcion   : String;
        recomendacion : String;
        state         : String;
        messageType   : String;
    };

    action   analizarCruceAutomatico(macho_ID: UUID,
                                     hembra_ID: UUID,
                                     generaciones: Integer)                                                                                             returns {
        tipoParentesco   : String;
        nivelRiesgo      : String;
        porcentaje       : Decimal(5, 2);
        descripcion      : String;
        recomendacion    : String;
        decision         : String;
        state            : String;
        messageType      : String;
        ancestrosComunes : LargeString;
    };

    action   eliminarLineaAve(lineaAveId: String)                                                                                                                 returns {
        success : Boolean;
        message : String;
    };   

    action   eliminarIncubacion(incubacionId: String)                                                                                                                 returns {
        success : Boolean;
        message : String;
    };

}
