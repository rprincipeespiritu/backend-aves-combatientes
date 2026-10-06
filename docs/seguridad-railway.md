# Seguridad y despliegue en Railway

El backend usa JWT propio y un middleware de autenticacion de CAP. No requiere
SAP BTP, XSUAA, IAS ni un service binding de SAP. La rama `dev` se prueba en local;
Railway debe desplegar exclusivamente `prd`.

## Desarrollo local: dev

1. Mantener las credenciales locales y `JWT_SECRET` en `.env` (ignorado por Git).
   `.env.example` contiene las variables necesarias. Para generar un secreto:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

2. En una base existente, ejecutar `migrations/001_session_version.sql` antes de
   iniciar esta version. En una base nueva, usar `npm.cmd run deploy` y cargar
   los roles con `insertar_roles.sql`.
3. Ejecutar `npm.cmd test`. Las pruebas HTTP usan una base SQLite en memoria,
   con cuentas sinteticas; no leen ni modifican PostgreSQL ni envian correos.
4. Iniciar con `npm.cmd run watch` y volver a iniciar sesion en el frontend.

Se mantienen las rutas `login`, `obtenerPerfil` y `actualizarPerfil` que utiliza
el frontend. Las sesiones antiguas ya no son validas. Cerrar sesion revoca todas
las sesiones de esa cuenta; cambiar contrasena, rol o estado tambien invalida
los tokens anteriores. Cambiar de estado y volver al estado original debe
incrementar `sessionVersion` si se hace mediante SQL externo. La accion
administrativa del backend ya incrementa esa version automaticamente.

## Configuracion de Railway: prd

Configurar la rama de despliegue del servicio como `prd`. Probar y revisar los
cambios en `dev` antes de incorporarlos a `prd`. Estos ajustes no hacen push,
merge ni despliegue automatico desde la herramienta de desarrollo.

Variables del servicio backend:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Secreto aleatorio exclusivo de produccion, al menos 32 bytes |
| `JWT_EXPIRES` | `1h` o la duracion elegida |
| `PLATFORM_ADMIN_IDS` | UUIDs de administradores reales, separados por comas |
| `CORS_ORIGIN` | Origen HTTPS exacto del frontend; varios separados por comas, sin rutas |
| `CDS_REQUIRES_DB_CREDENTIALS_HOST` | Host del PostgreSQL de Railway |
| `CDS_REQUIRES_DB_CREDENTIALS_PORT` | Puerto de PostgreSQL |
| `CDS_REQUIRES_DB_CREDENTIALS_DATABASE` | Nombre de base |
| `CDS_REQUIRES_DB_CREDENTIALS_USER` | Usuario de PostgreSQL |
| `CDS_REQUIRES_DB_CREDENTIALS` | JSON con la contrasena como texto: `{"password":"TU_PASSWORD"}` |

Railway permite referenciar las variables del servicio PostgreSQL. Usar los
valores del servicio real de este proyecto. Este backend utiliza las variables
CAP indicadas arriba o las variables nativas `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER` y `PGPASSWORD` del servicio backend. No es necesario duplicarlas:
el arranque completa las credenciales CAP faltantes desde las variables `PG...`,
manteniendo la contrasena como texto y dando prioridad a valores CAP explicitos.
Tambien resuelve los placeholders del perfil `pg` durante el arranque.
No interpreta `DATABASE_URL` automaticamente. Si el
servidor PostgreSQL exige TLS, configurar las credenciales `ssl` correspondientes
con verificacion del certificado; no desactivar esa verificacion por defecto.

No definir simultaneamente `CDS_REQUIRES_DB_CREDENTIALS_PASSWORD`. CAP convierte
valores numericos de variables individuales a numeros y PostgreSQL requiere una
contrasena de tipo texto. El objeto JSON mantiene ese tipo y los ceros iniciales.
Tambien se puede incluir host, port, database y user en el mismo objeto JSON.
La migracion SQL registra el campo nuevo en `cds_model`, cuando existe, para
que los siguientes despliegues de CAP no intenten agregarlo una segunda vez.

Conservar tambien las variables existentes de SendGrid, S3, Mercado Pago,
`FRONTEND_URL`, `BACKEND_URL` y las demas integraciones que use la aplicacion.
Comando de instalacion: `npm ci`. Comando de arranque: `npm start`.
Railway proporciona `PORT` y CAP lo respeta.

Antes de activar esta version en produccion:

1. Ejecutar la migracion aditiva `migrations/001_session_version.sql` en la base
   de Railway. No es necesario recrear la base ni volver a cargar sus datos.
2. Verificar que existen los roles activos `ADMIN` y `CRIADOR`.
3. Configurar un `JWT_SECRET` nuevo y los UUIDs administrativos explicitos.
4. Desplegar `prd` y volver a iniciar sesion. Verificar con una cuenta normal
   que `Usuarios` y `Roles` devuelven 404, que `adminListarUsuarios` devuelve 403
   y que `obtenerPerfil` solo devuelve sus datos.

## Administradores y cuentas existentes

El registro publico crea usuarios `CRIADOR`. Un administrador de plataforma
debe tener simultaneamente rol `ADMIN` activo y su UUID en `PLATFORM_ADMIN_IDS`.
La lista usa UUIDs, no emails editables desde el perfil.

Las cuentas antiguas con `ADMIN` que no aparecen en esa lista se tratan como
`CRIADOR`, incluso si el rol almacenado aun dice ADMIN. No es necesario ejecutar
una actualizacion masiva para cerrar el acceso. Si la lista esta vacia, ninguna
cuenta tiene acceso administrativo. Los roles VETERINARIO y VIEWER conservan
sus permisos limitados y el aislamiento por propietario.

Para identificar una cuenta antes de configurar la lista, consultar directamente
la base con una conexion administrativa:

```sql
SELECT ID, username, email, rol_ID
FROM ave_combatiente_Usuario
WHERE email = 'correo-del-administrador';
```

Nunca habilitar la API de usuarios para obtener esa informacion.

## Controles y limites

- `Usuario` y `Rol` permanecen en la base, sin proyecciones publicas ni rutas
  de navegacion a sus datos. Las acciones de perfil usan la identidad autenticada.
- Las acciones administrativas requieren autorizacion explicita. Los permisos
  desconocidos se rechazan. Las acciones que solo estaban declaradas pero no
  implementadas tampoco quedan habilitadas por defecto.
- Las lecturas, modificaciones, referencias y expansiones de entidades de
  negocio verifican el propietario. Los administradores de plataforma tambien
  usan sus propios datos de negocio; las acciones administrativas de cuentas
  son la excepcion explicita.
- Las vistas agregadas antiguas `TopGallos`, `EvolucionPeso` y `BalanceFinanciero`
  quedan bloqueadas hasta definir su aislamiento. El dashboard y los informes
  del frontend que consultan entidades propias siguen disponibles.
- Las suscripciones no admiten escrituras OData directas. `activarSuscripcion`
  solo admite PRUEBA; los planes de pago se gestionan por el checkout/webhook o
  por una accion administrativa protegida.
- La firma de descargas S3 exige una clave bajo el prefijo del usuario actual.
- Las pruebas locales verifican controles de API; no certifican la configuracion
  externa de Railway, los permisos del bucket S3 ni los proveedores de pagos.
