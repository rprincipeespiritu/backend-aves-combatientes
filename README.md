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

## Learn More

Learn more at https://cap.cloud.sap/docs/get-started/.
