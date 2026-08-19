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

Cuando un usuario activa el plan de prueba, el backend puede avisar al dueno de la app:

```env
APP_OWNER_EMAIL=tu-correo@ejemplo.com
# Tambien acepta varios: correo1@ejemplo.com,correo2@ejemplo.com
```

Requiere `SENDGRID_API_KEY` y `SENDGRID_FROM_EMAIL` (mismo servicio de correo de activacion).

Las quejas y sugerencias del dashboard tambien se envian a `APP_OWNER_EMAIL`.

Contacto visible en la app (telefono / WhatsApp):

```env
APP_CONTACT_PHONE=+51 999 999 999
APP_CONTACT_WHATSAPP=51999999999
```

`APP_CONTACT_WHATSAPP` debe ir preferentemente solo con digitos (codigo de pais + numero) para el enlace `https://wa.me/...`.

## Mercado Pago

Para activar suscripciones reales configura estas variables en el ambiente del backend:

```env
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_WEBHOOK_SECRET=...
FRONTEND_URL=http://localhost:8080/index.html
```

En Mercado Pago registra esta URL de notificacion cuando el backend este publicado:

```text
https://tu-dominio.com/api/mercadopago/webhook
```

El checkout se crea desde la accion `crearCheckoutMercadoPago` del servicio CAP. El webhook confirma el estado de la preaprobacion y actualiza la suscripcion local a `PENDIENTE`, `ACTIVA`, `VENCIDA` o `CANCELADA`.

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
