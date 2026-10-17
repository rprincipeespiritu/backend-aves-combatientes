# Precios y viabilidad de LinajeGallo

Investigación y propuesta del 16 de octubre de 2026. Cambios preparados en `dev`; no publicados ni aplicados a contratos existentes.

## Decisión

| Plan | Antes, PEN/mes | Nuevo, PEN/mes | Cambio |
| --- | ---: | ---: | ---: |
| Básico | 19.00 | 19.90 | +4.7% |
| Pro | 49.00 | 34.90 | -28.8% |
| Premium | 99.00 | 59.90 | -39.5% |

Básico mantiene una entrada cercana a S/20; Pro reduce el salto de precio; Premium baja sin igualar el precio de planes que no incluyen multimedia. Son precios finales cobrados por el checkout, sin sumar comisiones al cliente. Para estimar conservadoramente el ingreso se separa un IGV del 18% dentro del precio. Confirmar el tratamiento tributario real y crédito fiscal con la contabilidad.

La rentabilidad es condicional al volumen y consumo. No existe un precio que garantice beneficios con cero clientes o almacenamiento/tráfico sin límite. El titular confirma Railway USD22/mes, SendGrid USD20/mes y Squarespace USD20/año; indica que S3 aún no le ha cobrado y cree no pagar Mercado Pago actualmente. Los fijos informados equivalen a USD43.67/mes (USD524/año), antes de consumo futuro y reservas. A S/3.80/USD presupuestarios son S/165.93/mes. No son facturas auditadas. Faltan usuarios de pago y prueba, mezcla de planes, región S3, GB almacenados y descargados, tarifa efectiva de Mercado Pago, reembolsos y tiempo de soporte.

## Servicios encontrados y tarifas investigadas

| Servicio | Evidencia en código | Referencia de costo |
| --- | --- | --- |
| Railway y PostgreSQL | Historial de despliegue, configuración CAP/Postgres y frontend Express | USD 22/mes confirmado por el usuario. Se asume total de su cuenta, no USD 22 por servicio. Confirmar si incluye frontend, backend y base. |
| AWS S3 | `@aws-sdk/client-s3`, URLs firmadas, fotos, videos y perfiles en `srv/ave-combatiente.js` | Usuario informa cero cobros hasta ahora. Para proyectar crecimiento se mantiene referencia S3 Standard us-east-1: USD0.023/GB-mes, PUT USD0.005/1,000, GET USD0.0004/1,000 y salida USD0.09/GB. Región/clase y causa de ausencia de cobros pendientes. |
| SendGrid | `@sendgrid/mail`: registro, recuperación y notificaciones | USD20/mes confirmado por el titular y usado en el cálculo. Referencia pública Essentials desde USD19.95/mes; revisar excedentes según plan. |
| Mercado Pago Perú | Creación de preapproval en `crearCheckoutMercadoPago` y webhook | No se informa gasto fijo confirmado. No asumir comisión cero: suscripciones publican 3.49% + S/1 + IGV al instante o 3.29% + S/1 + IGV a 14 días. Modelo usa la primera por cada cobro; validar liquidación real. |
| Squarespace | USD20 anuales confirmado por el titular | USD20/12 = USD1.67/mes. Se registra en el rubro anual de dominio; no se añade un plan web mensual que el usuario no ha informado. |
| Copias adicionales | Facturación y retención no confirmadas | Reserva supuesta USD3/mes. No duplicar si ya está incluida en Railway o en la factura S3. |

Railway publica RAM USD10/GB-mes, CPU USD20/vCPU-mes, volumen USD0.15/GB-mes y salida USD0.05/GB. Los mínimos Hobby USD5 y Pro USD20 incluyen uso: no se suman otra vez a la factura de USD22. El escenario de crecimiento permite subir esa factura.

Fuentes oficiales consultadas:

- [Tarifas Railway](https://docs.railway.com/pricing) y [cómo se factura](https://docs.railway.com/pricing/understanding-your-bill).
- [AWS S3](https://aws.amazon.com/s3/pricing/), [ejemplo oficial de almacenamiento y peticiones en us-east-1](https://aws.amazon.com/blogs/awsforsap/secure-file-transfer-with-the-aws-sdk-for-sap-abap/) y [estimación oficial de salida por solicitante](https://aws.amazon.com/blogs/storage/amazon-s3-audit-logging-part-1-analyzing-server-access-logs-with-amazon-athena-for-performance-insights/). Las tablas de la página de precios dependen de región; confirmar la tarifa de la cuenta. No se descuenta la franquicia compartida de 100 GB ni créditos promocionales para evitar depender de ellos.
- [SendGrid Email API](https://www.twilio.com/en-us/products/email-api/pricing).
- [Suscripciones Mercado Pago Perú](https://www.mercadopago.com.pe/herramientas-para-vender/suscripciones).
- [SUNAT: IGV](https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/impuesto-general-las-ventas).
- [Squarespace: renovación y precio del dominio](https://support.squarespace.com/hc/en-us/articles/218193418-When-your-domain-renews-and-what-you-ll-pay) y [facturación mensual o anual del sitio](https://support.squarespace.com/hc/en-us/articles/206536807-Upgrade-your-trial-to-a-paid-website-plan). Son suscripciones separadas; consultar los importes de renovación de la cuenta, no una promoción de primer año. Si dominio y sitio están incluidos en un mismo pago, no duplicarlos.

No se encontró integración activa con Paddle ni una API de WhatsApp de pago en el flujo revisado; el enlace `wa.me` no se contabiliza como mensajería de pago. No se han contratado ni migrado proveedores.

El frontend también carga Meta Pixel, Google Fonts y el CDN de SAPUI5. El repositorio no permite determinar contratos/licencias ni presupuesto publicitario. No se ha supuesto una factura por petición de estas dependencias; cualquier licencia o campaña pagada debe incorporarse como costo adicional. El gasto en anuncios no está incluido en los resultados.

## Referencias competitivas

- [Galpon](https://galpon.cc/plans): plan gratuito limitado y Pro anunciado a USD15/mes con aves ilimitadas y genealogía.
- [AviarySoft](https://aviarysoft.com/es/): Premium anunciado a EUR4.99/mes, orientado a cría de aves, con límites por módulo.
- [GallosApp, descripción publicada por el desarrollador](https://apps.apple.com/es/app/gallosapp/id6791622362): anuncia USD10/mes y USD100/año. El precio de compra puede variar por tienda y país.

Son referencias de posicionamiento, no productos equivalentes ni prueba de disposición de pago en Perú. No se convierte EUR como si fuese USD. Con el supuesto presupuestario de S/3.80/USD, Pro equivale a USD9.18 y Premium a USD15.76; Premium se ubica cerca del competidor de USD15, con multimedia como diferencia. Validar conversión a pago y retención durante un mes antes de reducir más. Básico no se reduce porque el cargo fijo de S/1 pesa mucho en importes bajos. No añadir plan vitalicio: la infraestructura tiene costo recurrente.

## Modelo reproducible

Ejecutar desde el backend:

```powershell
node scripts/evaluar-precios.js
# Opcional: archivo con los mismos campos y consumos reales
node scripts/evaluar-precios.js ruta/a/supuestos.json
```

El programa solo calcula. Los supuestos editables están en `docs/pricing-assumptions.json` y los precios salen directamente del catálogo usado por checkout. No consulta bases, credenciales ni cuentas externas.

Supuestos base (no mediciones):

- Tipo de cambio presupuestario S/3.80/USD, no cotización actual.
- Infraestructura fija USD22 Railway + USD20 SendGrid + USD20/12 Squarespace, según importes informados, más USD3 de reserva estimada de copias. La reserva anterior de dominio/copias queda reemplazada, no se suma otra vez.
- `squarespaceDomainAnnualUSD`: USD20 anuales informados. `squarespaceWebsiteMonthlyUSD`: cero; no se ha informado otro pago. Si existiera un plan adicional, ingresar su costo mensual equivalente. Se retiró el escenario hipotético de USD20/mes de sitio para no confundirlo con el pago anual real.
- Reserva de 18% para posibles impuestos/cargos de proveedores y 15% de contingencia sobre infraestructura. Se trata como costo sin descontar crédito fiscal; si los USD22 ya incluyen impuestos, esta reserva sobredimensiona esa parte intencionalmente.
- 50 usuarios de prueba a S/0.50/mes cada uno. Las nuevas pruebas duran 30 días con acceso Premium; las ya activadas conservan su vencimiento. Este costo puede aumentar mucho; no es un límite aplicado.
- Mezcla esperada: 50% Básico, 35% Pro, 15% Premium. Son proporciones, no clientes reales.
- Reserva por devoluciones/impagos de 3% del precio. Los clientes del cálculo son suscriptores efectivamente cobrados.
- Uso mensual por cliente: Básico 0.05 GB almacenados/0.1 GB descargados; Pro 0.2/0.5 GB; Premium 5/10 GB. Incluye peticiones S3 y S/0.50, S/1 y S/2 por cliente para crecimiento de recursos de la app. Son presupuestos de consumo, no cuotas implementadas.
- S/500/mes opcionales para trabajo del titular. Marketing, adquisición, comisiones bancarias adicionales e impuesto a la renta no están incluidos; deben restarse para obtener utilidad neta final.

Fórmulas:

```text
Ingreso sin IGV = precio / 1.18
Comisión = (precio × 0.0349 + 1) × 1.18
Costo S3 USD = GB guardados × 0.023 + GB salida × 0.09
             + PUT/1000 × 0.005 + GET/1000 × 0.0004
Costo variable PEN = costo S3 USD × cambio × 1.18 × 1.15 + reserva app
Contribución = ingreso sin IGV - comisión - precio × 0.03 - costo variable
Excedente operativo = suma de contribuciones - gastos fijos - costo pruebas
Equilibrio = redondear hacia arriba(gastos fijos / contribución media)
```

Si la contribución es cero o negativa no existe equilibrio para ese plan por aumentar clientes. No es correcto llamar ganancia a lo que queda solo después de Mercado Pago.

| Plan | Comisión PEN | Costo variable estimado PEN | Contribución PEN | Clientes para cubrir todos los fijos si solo se vende ese plan |
| --- | ---: | ---: | ---: | ---: |
| Básico | 2.00 | 0.55 | 13.71 | 20 |
| Pro | 2.62 | 1.26 | 24.65 | 11 |
| Premium | 3.65 | 7.27 | 38.05 | 7 |

Fijos presupuestados más pruebas: **S/265.64/mes**. Este importe supera los S/165.93 informados porque añade reserva de copias, posibles impuestos, contingencia y costo de pruebas. Contribución media: S/21.19, después de costos variables previstos, incluida S3 y Mercado Pago. Equilibrio aproximado con la mezcla: **13 suscriptores**, o **37 incluyendo S/500 para el titular**. El punto exacto depende de la distribución entera de clientes.

El cero actual de S3 no implica gratuidad permanente: no se sabe si responde a poco consumo, créditos o una factura aún no emitida. Tampoco se interpreta la ausencia de pagos conocidos a Mercado Pago como exención de comisión. S3 se proyecta como consumo por cliente y Mercado Pago como comisión por cobro: no sumar sus facturas completas otra vez sobre esos mismos consumos.

| Suscriptores | Excedente operativo PEN/mes | Después de S/500 para el titular |
| ---: | ---: | ---: |
| 5 | -159.67 | -659.67 |
| 10 | -53.71 | -553.71 |
| 20 | 158.23 | -341.77 |
| 30 | 370.16 | -129.84 |
| 50 | 794.04 | 294.04 |
| 100 | 1,853.71 | 1,353.71 |

## Riesgo de pérdidas y condición para producción

El mismo cálculo incluye estrés: Railway USD44, cambio S/4.20, 200 pruebas a S/2/mes, Premium con 50 GB guardados y 100 GB descargados al mes. Premium aporta **-S/14.57 por cliente**. La mezcla completa necesitaría unos 60 clientes para cubrir infraestructura y 98 incluyendo trabajo, pero vender más Premium con ese consumo empeora el resultado.

La implementación actual limita tamaños declarados por archivo (video de combate 500 MiB, archivo de ave 100 MiB, perfil 5 MiB, configurables), pero no impone una cuota acumulada por usuario ni una cuota real de descargas. Reemplazar archivos puede dejar objetos anteriores en S3: no se encontró borrado S3 en esos flujos. Las URLs firmadas pueden reutilizarse durante su vigencia. Por tanto, estos precios son una propuesta viable para consumo moderado y NO una garantía contra pérdidas.

Antes de publicar la rebaja de Premium:

1. Medir S3 por prefijo/usuario, facturación real y consumos de pruebas; activar avisos de presupuesto AWS/Railway. Un aviso no bloquea gastos; un corte duro de Railway puede apagar la aplicación.
2. Definir cuotas comerciales de almacenamiento y transferencia para nuevas altas (referencia inicial: Premium 5 GB guardados/10 GB salida mensual; prueba mucho menor). Implementar medición real, reservas atómicas de subida, validación de tamaño real y control de entrega; contar URLs firmadas no mide bytes descargados. No anunciar estas cuotas como existentes hasta implementarlas.
3. Gestionar reemplazos, objetos huérfanos, versiones y retención al terminar la suscripción, con comunicación al cliente; no borrar contenido existente sin política acordada.
4. Presupuestar pruebas activas, soporte y adquisición. Con los precios nuevos se necesitan más clientes que antes; revisar conversiones, cancelaciones y margen semanalmente durante el lanzamiento.

Las cuotas/retención no se implementan como parte de este cambio de precios: requieren definir el tratamiento de archivos existentes y condiciones del servicio. El beneficio proyectado depende de cumplir el consumo del modelo. No publicar afirmaciones de multimedia sin límite a costo fijo.

## Cambios y pase a producción

- Catálogo único en `srv/subscription-config.js`: 19.90 / 34.90 / 59.90 PEN. Nuevos checkouts y nuevas asignaciones administrativas toman esos valores; la prueba mantiene precio cero y duración actual.
- Acción autenticada `obtenerPlanesSuscripcion`: devuelve precios para la pantalla. No requiere plan vigente; un cliente vencido debe poder ver ofertas.
- Vista `Suscripcion` de dev muestra los precios consultados, conserva dos decimales y deshabilita botones si falla la consulta, sin importes antiguos de respaldo.
- El webhook conserva el precio y moneda registrados del contrato existente. No se envían modificaciones a preapprovals anteriores ni se ejecuta SQL para cambiar sus precios. Un cliente anterior debe consentir una nueva contratación para cambiar de tarifa; no duplicar cargos recurrentes.
- Se conservan capacidades, duración de prueba y el flujo de activación local que ya existe en el frontend dev. Ese botón local no habilita planes pagados: el backend exige pago confirmado o asignación administrativa. La rama prd usa Mercado Pago y tiene su propio controlador.
- Para el pase a prd, adaptar el controlador de pago para que tanto tarjetas como confirmación lean el catálogo (eliminar su mapa estático 19/49/99), preservar sus validaciones, y portar la protección de precio al webhook de prd sin reemplazar sus handlers de pago. Desplegar primero backend, después frontend; verificar ambos con sandbox antes de publicar. No se ha realizado este pase ni un despliegue en este trabajo.
- No se requiere migración del esquema. La propuesta no resuelve una compra ya duplicada ni cambia la lógica histórica de confirmación de pagos.

## Verificación realizada

- Backend: `npm.cmd test`, 20 pruebas aprobadas sobre SQLite en memoria. Incluye consulta autenticada del catálogo, importe y moneda enviados a Mercado Pago para los tres planes y conservación de S/99 en una renovación anterior. Mercado Pago está simulado: ningún cargo real.
- Frontend: `npm.cmd run build`, compilación completa aprobada.
- Frontend: `node scripts/verify-subscription-prices.js`, verifica precios recibidos del servidor, dos decimales, importe de confirmación y bloqueo sin precios cuando hay error o catálogo incompleto.
- Calculadora ejecutada con escenarios base y estrés; detecta contribuciones negativas. Las cifras de este documento corresponden al archivo de supuestos fechado arriba.
- Tras incorporar los importes informados de Squarespace y SendGrid, se recalcularon ambos escenarios y pasaron las 3 pruebas específicas de precios, incluyendo prorrateo anual y detección de contribución negativa. No se modificaron otra vez los precios del catálogo ni se desplegó a producción.
