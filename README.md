# Getting Started

Welcome to your new project.

It contains these folders and files, following our recommended project layout:

File or Folder | Purpose
---------|----------
`app/` | content for UI frontends goes here
`db/` | your domain models and data go here
`srv/` | your service models and code go here
`package.json` | project metadata and configuration
`readme.md` | this getting started guide


## Next Steps

- Open a new terminal and run `cds watch`
- (in VS Code simply choose _**Terminal** > Run Task > cds watch_)
- Start adding content, for example, a [db/schema.cds](db/schema.cds).


## Notificacion al dueno

El backend avisa a `APP_OWNER_EMAIL` cuando:

1. Se registra un **nuevo usuario**
2. Un usuario activa el plan de **prueba**
3. Llega una **queja o sugerencia**

```env
APP_OWNER_EMAIL=tu-correo@ejemplo.com
# Tambien acepta varios: correo1@ejemplo.com,correo2@ejemplo.com
```

Requiere `SENDGRID_API_KEY` y `SENDGRID_FROM_EMAIL` (mismo servicio de correo de activacion).

Contacto visible en la app (telefono / WhatsApp):

```env
APP_CONTACT_PHONE=+51 999 999 999
APP_CONTACT_WHATSAPP=51999999999
```

`APP_CONTACT_WHATSAPP` debe ir preferentemente solo con digitos (codigo de pais + numero) para el enlace `https://wa.me/...`.

## Mercado Pago

### Variables de entorno (Railway / backend)

```env
# Obligatorio para cobrar
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...          # produccion (o TEST-... en sandbox)
MERCADOPAGO_WEBHOOK_SECRET=...                # secret del webhook en MP
MERCADOPAGO_ENV=production                    # sandbox | production

# URLs publicas
FRONTEND_URL=https://tu-frontend.up.railway.app/index.html
BACKEND_PUBLIC_URL=https://tu-backend.up.railway.app
CORS_ORIGIN=https://tu-frontend.up.railway.app

# Opcional
# ALLOW_MANUAL_PAID_PLANS=true                # solo para pruebas locales; NO usar en prd
# MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE=true
```

### Flujo de la app

1. El usuario elige un plan en `#/suscripcion` y pulsa **Suscribirse**.
2. El frontend llama `crearCheckoutMercadoPago`.
3. El backend crea una *preapproval* en Mercado Pago y devuelve `checkoutUrl`.
4. El usuario paga/autoriza en Mercado Pago.
5. Mercado Pago notifica `POST /api/mercadopago/webhook`.
6. El backend deja la suscripcion en `ACTIVA` (o preserva el acceso vigente si el pago sigue pendiente).

### Webhook a registrar en Mercado Pago

```text
https://tu-backend.up.railway.app/api/mercadopago/webhook
```

Eventos recomendados: `subscription_preapproval` / `preapproval` (suscripciones).

El checkout se crea desde la accion `crearCheckoutMercadoPago` del servicio CAP. El webhook confirma el estado de la preaprobacion y actualiza la suscripcion local a `PENDIENTE`, `ACTIVA`, `VENCIDA` o `CANCELADA`.

### Plan de configuracion (paso a paso)

Ver seccion **"Plan Mercado Pago + Railway"** mas abajo, o el resumen entregado en el PR/chat de despliegue.

## Plan Mercado Pago + Railway

1. **Cuenta Mercado Pago**
   - Crear aplicacion en [https://www.mercadopago.com.pe/developers](https://www.mercadopago.com.pe/developers)
   - Activar **Suscripciones / Preapproval**
   - Confirmar moneda `PEN`

2. **Credenciales**
   - Sandbox: Access Token `TEST-...`
   - Produccion: Access Token `APP_USR-...`
   - Copiar **Webhook secret** al configurar la URL de notificacion

3. **Railway (backend `prd`)**
   - Agregar las variables listadas arriba
   - `BACKEND_PUBLIC_URL` = URL publica del servicio backend
   - `FRONTEND_URL` = URL del frontend + `/index.html`
   - `CORS_ORIGIN` = origen del frontend
   - Redeploy tras guardar variables

4. **Railway (frontend `prd`)**
   - `API_BASE_URL` = URL del backend + `/api/avecombatiente` (segun `replace-config.js`)

5. **Webhook en Mercado Pago**
   - URL: `https://<backend>/api/mercadopago/webhook`
   - Modo produccion cuando cobres real
   - Guardar el secret en `MERCADOPAGO_WEBHOOK_SECRET`

6. **Prueba sandbox**
   - `MERCADOPAGO_ENV=sandbox` + token `TEST-...`
   - Suscribirse desde la app con usuario de prueba MP
   - Verificar webhook → estado `ACTIVA`
   - Probar cancelacion

7. **Go-live**
   - Cambiar a token `APP_USR-...` y `MERCADOPAGO_ENV=production`
   - NO poner `ALLOW_MANUAL_PAID_PLANS=true`
   - Smoke test con un pago real de monto bajo / plan basico
   - Monitorear logs del webhook en Railway

## Archivos en AWS S3

El backend genera URLs prefirmadas para que el navegador suba imagenes y videos directamente a S3 sin exponer las claves AWS. Las acciones disponibles son:

- `prepararCargaArchivoAve`: fotos y videos del ave.
- `prepararCargaVideoCombate`: videos de combates.

Variables listas para conectar S3:

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=tu-bucket
AWS_ACCESS_KEY_ID=tu-access-key
AWS_SECRET_ACCESS_KEY=tu-secret-key
AWS_S3_PRESIGN_EXPIRES_SECONDS=900
ARCHIVO_AVE_MAX_BYTES=104857600
COMBATE_VIDEO_PROVIDER=AWS_S3
COMBATE_VIDEO_MAX_BYTES=524288000
```

Tambien puedes separar buckets si lo necesitas:

```env
AWS_S3_AVES_BUCKET=tu-bucket-aves
AWS_S3_COMBATES_BUCKET=tu-bucket-combates
```

Politica IAM minima para un solo bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::tu-bucket/*"
    }
  ]
}
```

Configura CORS en el bucket para permitir subidas desde SAPUI5 local:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:8080"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Learn More

Learn more at https://cap.cloud.sap/docs/get-started/.
