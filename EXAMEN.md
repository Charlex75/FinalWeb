# EXAMEN — BildyApp API

## Respuestas a las preguntas socráticas

### 1. ¿Es 400 el código correcto para "already signed" (línea 194) y para el borrado de firmado (línea 263)?

HTTP 400 _Bad Request_ indica que la petición es sintácticamente incorrecta o malformada. En ambos casos la petición es perfectamente válida en forma: lleva token, fichero y ruta correctos. Lo que falla es un conflicto con el **estado actual del recurso**, que es exactamente la semántica de HTTP **409 Conflict**. Así, `PATCH /:id/sign` sobre un albarán ya firmado debería devolver 409, no 400, porque el servidor entiende la petición pero no puede ejecutarla dado el estado actual del documento. Lo mismo aplica a `DELETE /:id` sobre un firmado: la regla de negocio "los firmados son inmutables" es un conflicto de estado, no un error de sintaxis. Usar 400 es una práctica pragmática habitual (muchos clientes no distinguen 4xx), pero no respeta la semántica HTTP definida en RFC 9110.

### 2. Fuga de información si se invierte el orden del filtro (línea 188)

El filtro actual en `deliverynote.controller.ts:188` es `{ _id, company: companyId, deleted: false }`, de forma que si el albarán no pertenece a la compañía del usuario autenticado la consulta no devuelve nada y se lanza 404. Si en cambio se consultara primero por `_id` sin filtrar compañía y luego se comprobara `company` en código, un atacante de otra empresa podría recibir respuestas distintas: **404** cuando el ID no existe en absoluto vs **400 "already signed"** cuando el ID existe pero el albarán ya está firmado, revelando que ese recurso existe en el sistema y además cuál es su estado. El test del caso (4) (`signc2@example.com` intentando firmar `otherCompNoteId`) demuestra el comportamiento correcto: el servidor devuelve 404 sin desvelar nada sobre la existencia ni el estado del albarán ajeno.

### 3. ¿Por qué el test puede verificar `signatureUrl` sin credenciales reales de Cloudinary?

`storage.service.ts:25` devuelve `https://mock.cdn.bildyapp.com/${folder}/${publicId}` cuando las variables de entorno de Cloudinary no están configuradas, como ocurre en el entorno de test. La aserción `typeof signatureUrl === 'string' && length > 0` se cumple con esa URL mock, por lo que el test pasa. El **invariante real** que se verifica es que el controlador: (1) alcanza la llamada a `uploadBuffer` sin lanzar excepción, (2) asigna el valor devuelto a `note.signatureUrl`, (3) persiste el documento y (4) lo incluye en la respuesta JSON. No se prueba que la URL sea accesible ni que el fichero esté almacenado en Cloudinary; eso sería una prueba de integración contra el servicio externo, que requiere credenciales reales y está fuera del alcance del test unitario de controlador.

### 4. ¿Qué queda en BD si llega SIGTERM entre los dos `note.save()` de `signDeliveryNote`?

El controlador realiza dos persistencias separadas: el primer `note.save()` en la línea 209 guarda `signed=true`, `signedAt` y `signatureUrl`; el segundo `note.save()` en la línea 244 guarda `pdfUrl`. Si el proceso recibe SIGTERM y termina entre ambos, la BD conserva el albarán con `signed: true` y `signatureUrl` relleno pero con `pdfUrl: undefined`. El cliente queda firmado sin PDF descargable, un estado inconsistente. Para hacerlo atómico en una sola escritura habría que reordenar: (1) subir la imagen de firma a Cloudinary, (2) generar el PDF en memoria con los datos del documento (sin guardarlo), (3) subir el PDF, y (4) ejecutar un único `note.save()` con `signed`, `signedAt`, `signatureUrl` y `pdfUrl` todos a la vez. De este modo un SIGTERM antes del save deja el albarán sin firmar (estado coherente), aunque los assets ya subidos a Cloudinary quedarían huérfanos, lo que requeriría una tarea de limpieza periódica.

### 5. `beforeAll` compartido vs tests autocontenidos: ¿qué decisión es mejor para los tests de firma?

`beforeAll` es la elección correcta aquí porque cada test de firma verifica una **transición de estado** sobre el mismo tipo de recurso, y crear usuario + empresa + cliente + proyecto + albarán dentro de cada `it` haría la suite prohibitivamente lenta. El riesgo del estado compartido es el acoplamiento: si el `it` que firma `freshNoteId` fallara a mitad, los siguientes podrían fallar por razones ajenas a lo que prueban. La solución adoptada es aislar los datos: cada caso usa su propio albarán (`freshNoteId`, `noFileNoteId`, `otherCompNoteId`) y el `preSignedNoteId` se firma en `beforeAll` antes de cualquier `it`, eliminando dependencias entre casos. Jest ejecuta los `it` de un mismo fichero de forma **secuencial** (single-threaded dentro de un worker), por lo que el paralelismo intra-fichero no es un riesgo real; el paralelismo sí existe entre ficheros (cada fichero corre en su propio worker de Node.js), razón por la que cada fichero de test emplea emails y CIFs únicos para no colisionar en la base de datos en memoria compartida.

---

## Proceso

**Tiempo invertido:** aproximadamente 3 horas distribuidas en dos sesiones.

**Herramientas usadas:**

- **Claude Code (claude-sonnet-4-6)** como asistente principal: revisión del código existente, identificación de los casos de prueba faltantes, redacción de los tests y elaboración de las respuestas socráticas. Los prompts clave fueron: pedir un análisis previo del examen antes de implementar, solicitar la implementación completa con comprobación de que los tests pasan, y revisar los errores del IDE para distinguir falsos positivos de errores reales.
- **VS Code** con extensión REST Client para pruebas manuales de la API contra MongoDB Atlas durante el desarrollo previo.
- **npm test** (`jest --forceExit`) para verificar que los 5 tests nuevos pasan junto con los 139 existentes (144 tests en total, 7 suites).

**Decisiones tomadas:**

- Los 5 tests nuevos se añadieron en un `describe` separado con su propio `beforeAll` para no acoplarlos al estado de los tests existentes.
- Se usaron emails y CIFs distintos (`signc1@example.com` / `SGN1111111`, `signc2@example.com` / `SGN2222222`) para evitar colisiones con los datos creados por otros bloques del mismo fichero.
- El `preSignedNoteId` se firma durante el `beforeAll` (no dentro de un `it`) para que los tests 2 y 5 no dependan del resultado del test 1.
