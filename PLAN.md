# PLAN.md — Chatbot empresarial con IA local

Tres funciones: (1) preguntas frecuentes configurables desde un panel, (2) consulta
a la BD de la empresa en lenguaje natural solo para usuarios autenticados, (3)
transferencia a un asesor humano que responde desde un panel web.

Reglas: ver `AGENTS.md`. Se trabaja UNA fase a la vez.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Canal web simulado (sin WhatsApp) + repositorio | **COMPLETADA** |
| 1 | Seguridad base | **COMPLETADA** |
| 2 | Panel de preguntas frecuentes | **COMPLETADA** |
| 3 | Tickets y asesor (panel web) | **COMPLETADA** |
| 4 | Login de usuarios de la empresa (enlace web aparte del chat) | **COMPLETADA** |
| 5 | IA local + consultas a la BD | **COMPLETADA** |
| 6 | Despliegue en el servidor de la empresa | **COMPLETADA** |
| 7 | WhatsApp real | **pendiente** |
| 8 | Canal Telegram (webhook de la Bot API) | **COMPLETADA** |
| 9 | Puerta de verificación obligatoria (todo contacto sin sesión recibe el mensaje estático y el enlace; cero IA) | **EN CURSO** — puerta y revocación por cambio de teléfono implementadas; revisión de permisos hecha. El mapeo `customer_id` está DECIDIDO e implementado (columna `company_users.companyCustomerId` + scripts de la BD de prueba de Lázaro Software). Quedan 3 decisiones funcionales del dueño (rol ADMIN en el chat, PQRS en el chat, configuración de Telegram) |

Nota: todavía no hay número de WhatsApp. Todo se desarrolla y prueba con el chat web
simulado. WhatsApp se conecta al final como un adaptador más.

Nota: tras fusionar las Fases 5 y 6 se hizo una revisión de todas las fases y se corrigieron
varios problemas (despliegue de Fase 6, parámetros de herramientas de Fase 5, adaptadores
duplicados, enlace de login atómico, seguridad y limpieza). Detalle en
`AUDIT.md` → "Revisión post-integración y correcciones (Fases 0–6)".

---

## FASE 0 — Canal web simulado y repositorio

Ya hecho: puerto `ChannelAdapter`, `WebChatAdapter` (outbox en memoria con cursor,
tope y TTL), `WhatsAppAdapter`, `HandleInboundMessageUseCase`, rutas `/dev/chat`
con lista fija de teléfonos ficticios, `CHANNEL_MODE`, typecheck en 0 errores y 98
tests pasando.

### Parte A — Ajustes pendientes

1. `externalCustomerId`: usa `${channel.toLowerCase()}-${contactId}` (web-… /
   whatsapp-…). Pasa el canal a `UserAccountPort.findOrCreateUser(phone, name,
   channel)`. Elimina "unknown-" y "generic-". Mantén la búsqueda por teléfono.
   Agrega un test que verifique el valor para cada canal.
2. `whatsapp-webhook.ts`: `HandleInboundMessageUseCase` y el adapter son
   OBLIGATORIOS en el router. Elimina todo "cuando está disponible" y cualquier
   camino alternativo. Muéstrame el handler POST como quedó.
3. Tests de `CHANNEL_MODE` en PRODUCCIÓN: `web` no exige variables de WhatsApp;
   `whatsapp` y `both` sí las exigen. Más tests de defaults de `env`.
4. Muéstrame `npx vitest run --reporter=verbose` (solo nombres de tests de archivos
   nuevos o modificados) que confirme: TTL, tope de 200, canal WEB vs WHATSAPP, GET
   con cursor, flujo web → WAITING_AGENT.
5. Dime exactamente qué líneas cambiaste en `state-machine.ts` y
   `observability.test.ts` y confirma que no cambia el comportamiento en runtime.
6. Entrega la salida literal de `npm run typecheck` y `npm test`.

### Parte B — Repositorio git local (solo con la Parte A completa y pasando)

1. `git init` y rama `main`.
2. `.gitignore` debe excluir como mínimo: `.env`, `.env.*`, `node_modules/`, `dist/`,
   `coverage/`, `*.log`, `.pglite-data/`, `src/generated/prisma/`. Mantén
   `!.env.example`. Dime qué agregaste.
3. `git status` y `git add --dry-run .`: confirma con evidencia que NO entran `.env`,
   `node_modules`, `dist`, `.pglite-data` ni `*.log`. Si entra alguno, detente.
4. Busca secretos en lo que se va a versionar (patrones como "EAA", "token",
   "secret", "password", "Bearer"). NO imprimas valores: solo archivo y línea.
   Revisa también `presentacion-v1.md`, `server.log` y `pglite.log`. `.env.example`
   solo con valores de ejemplo. Si hay un secreto real, detente.
5. Primer commit: "Base del proyecto + Fase 0 (canal web simulado)".
6. NO agregues remoto ni hagas push. Muestra `git log --oneline` y `git status`.

### Parte C — Subir a GitHub (SOLO cuando yo lo pida explícitamente)

1. `git remote add origin https://github.com/wilsoncespedes-dot/Chatbot.git`
2. `git branch -M main` y `git remote -v`.
3. Muestra `git ls-files` y PIDE mi confirmación antes del push.
4. Con mi confirmación: `git push -u origin main`. Si pide credenciales, no las
   pidas ni las guardes: avísame y yo las escribo.
5. Nunca `--force`. Si el push falla, muéstrame el error sin resolverlo por tu
   cuenta.

**Criterio de cierre:** typecheck en 0 errores, tests pasando, hablar con el bot desde
el navegador, "agente" deja la conversación en WAITING_AGENT, y repositorio local con
un commit sin secretos.

---

## FASE 1 — Seguridad base

1. ✓ Puerto `PasswordHasher` en `shared/` con implementación argon2id y tests
   (se reutiliza en la Fase 4).
2. ✓ Modelo `AdminUser` (email único, passwordHash, role ADMIN | AGENT, active,
   failedAttempts, lockedUntil). Crea también la migración pendiente del índice
   `(userId, channel, status)` de `conversations`.
3. ✓ Seed del primer admin leyendo `ADMIN_EMAIL` y `ADMIN_PASSWORD` del entorno (solo
   al sembrar; no se loguea ni se guarda en texto plano; `.env.example` con valores
   de ejemplo).
4. ✓ Login de administradores: `POST /auth/login`, sesión en cookie httpOnly,
   SameSite=Strict y Secure en producción, con vencimiento por inactividad, y
   `POST /auth/logout`. Error genérico ("Usuario o contraseña incorrectos") exista
   o no el usuario.
5. ✓ Protege con sesión todos los endpoints `/api/*` excepto `/api/health`. Control
   por rol (ADMIN para gestión; AGENT solo para atención). Las rutas `/dev/chat`
   siguen fuera de `/api` y desactivadas en producción.
6. ✓ CORS con lista de orígenes por variable de entorno (`ALLOWED_ORIGINS`).
   Lista vacía = solo mismo origen; sin credentials.
7. ✓ Rate-limit en login y bloqueo temporal de 15 min tras 5 fallos seguidos.
   Rate-limit por IP: 10/min. Bloqueo 15 min tras 5 fallos. Registra los fallos
   (sin la contraseña).
8. ✓ Webhook de WhatsApp: verifica la firma `X-Hub-Signature-256` con
   `WHATSAPP_APP_SECRET` (captura el cuerpo crudo). En producción con modo que
   incluya whatsapp, `validateConfig` exige el secreto; en desarrollo sin secreto,
   solo un warning.
   Nota: En desarrollo sin WHATSAPP_APP_SECRET: warning al arrancar y el webhook
   responde 401 (falla cerrado).
9. ✓ Tests: 401 sin sesión, 200 con sesión, rol insuficiente, bloqueo por intentos,
   firma válida e inválida, health sigue público.

**Criterio:** `/api/knowledge` responde 401 sin sesión y 200 con sesión de admin.
**Esta fase la reviso yo con cuidado antes de cerrarla (contraseñas y sesiones).**

---

## FASE 2 — Panel de preguntas frecuentes

1. Página en `public/admin/` (HTML + JS sin framework pesado) con login y CRUD de
   preguntas/respuestas: título/pregunta, respuesta, categoría, palabras clave,
   activo/inactivo. Escapa el contenido al mostrarlo (sin XSS).
2. `GET /api/knowledge` con paginación y búsqueda. Validación de entrada.
3. Búsqueda mejorada: normaliza tildes y mayúsculas y devuelve un puntaje de
   confianza de 0 a 1. Si queda por debajo de `FAQ_MIN_CONFIDENCE`, no responde y
   sigue el flujo.
4. Los cambios hechos en el panel se aplican sin reiniciar el servidor.

**Criterio:** creo una FAQ en el panel y el bot la responde en el chat web sin
reiniciar.

---

## FASE 3 — Tickets y transferencia a asesor (panel web)

1. Implementa los módulos `tickets` y `agents` (el esquema ya tiene los modelos).
   Agrega `ConversationRepository.listMessages` para el historial.
2. Al transferir: crea ticket, asigna agente disponible o deja en cola, registra el
   evento y avisa al cliente por su canal.
3. Panel del asesor en `public/admin/`: lista de chats en espera, historial completo
   con el bot, caja para responder y botones "cerrar" y "devolver al bot". La
   respuesta sale por el canal de origen con `adapter.send(..., { sender: "AGENT" })`.
4. WhatsApp solo permite texto libre dentro de las 24 h posteriores al último
   mensaje del cliente. Si la ventana venció, el panel lo muestra y bloquea el envío
   con un aviso claro (no falla en silencio).
5. Disparadores de transferencia: el usuario pide un humano, N respuestas seguidas
   sin entender (`TRANSFER_AFTER_MISSES`) o confianza baja.
6. Con la conversación en WAITING_AGENT o asignada, el bot NO responde.
7. Solo usuarios AGENT/ADMIN autenticados acceden al panel.

**Criterio:** cliente (chat web) → bot no entiende → ticket → asesor responde desde
el panel → el cliente lo recibe → cierre.

---

## FASE 4 — Identidad: login web separado del chat

Principio: el identificador del canal NUNCA autoriza consultas de datos. El acceso
exige usuario y contraseña en una página web aparte; la contraseña nunca viaja por
el chat. Sin sesión válida el bot solo responde FAQs o transfiere.

1. Modelos Prisma (migración): `CompanyUser` (username único, passwordHash,
   displayName, role, active, registeredPhone opcional, failedAttempts,
   lockedUntil), `LoginLink` (tokenHash, channel, contactId, expiresAt, usedAt),
   `ChatSession` (sessionIdHash, companyUserId, channel, contactId, expiresAt por
   inactividad, absoluteExpiresAt, revokedAt, lastActivityAt) y `AuditLog`.
   Guarda solo HASH de tokens (sha256), nunca el token.
2. Enlace de login: token de 32 bytes aleatorios, vence en 10 min, un solo uso, atado
   a (channel, contactId). URL: `PUBLIC_BASE_URL/login?t=<token>`. El teléfono no va
   en la URL.
3. Página `/login` en `public/`: valida el token al cargar (mensaje genérico si es
   inválido, vencido o usado), muestra el contacto enmascarado (`****1234`) y un
   formulario usuario + contraseña con protección CSRF.
4. POST de login: error genérico siempre; verifica el hash incluso si el usuario no
   existe (evitar diferencias de tiempo); rate-limit por IP y por cuenta; bloqueo de
   15 min tras 5 fallos. Con `REQUIRE_PHONE_MATCH=true` (por defecto en production)
   solo entra si el contacto del chat coincide con `registeredPhone`.
5. Si es correcto: marca el enlace como usado, crea la `ChatSession` y envía por el
   canal "Sesión iniciada como <nombre>. Si no fuiste tú, escribe 'salir'."
6. Flujo del bot: antes de cualquier consulta de datos, busca `ChatSession` activa
   para (channel, contactId); si no hay, genera el enlace y lo envía. Renueva
   `lastActivityAt` en cada mensaje; vence a los 20 min de inactividad y a un máximo
   absoluto de 8 h (configurables). "salir" revoca la sesión. En esta fase el login
   se dispara con "iniciar sesión", "login", "consultar mis datos"; en la Fase 5 lo
   hará el clasificador.
7. Panel `/admin` (solo ADMIN): crear y desactivar usuarios de la empresa, asignar
   contraseña inicial y teléfono registrado, ver sesiones activas y revocarlas.
8. Tests: token de un solo uso y vencimiento, hash en BD, bloqueo por intentos,
   error genérico, coincidencia de teléfono, vencimiento de sesión, "salir", y que un
   chat sin sesión nunca ejecute consultas de datos.

**Criterio:** sin sesión, pedir datos solo devuelve el enlace; tras el login el chat
queda autenticado; "salir" o el vencimiento cierran la sesión.
**Esta fase la reviso yo con cuidado antes de cerrarla.**

---

## FASE 5 — IA local + consultas a la BD

1. Puerto `LlmProvider` (domain) y adaptador Ollama (`OLLAMA_BASE_URL`,
   `OLLAMA_MODEL`, por defecto `qwen2.5:7b-instruct`), con timeout
   (`LLM_TIMEOUT_MS`) y manejo de errores. Si Ollama no responde, el bot transfiere
   a asesor; no se cae.
2. Clasificador de intención: FAQ | CONSULTA_DATOS | PEDIR_HUMANO | NO_ENTIENDE, con
   salida JSON validada con zod. JSON inválido: reintenta una vez y transfiere.
   Reemplaza los disparadores por palabras de la Fase 4. El prompt del sistema
   indica que el texto del usuario son DATOS, no instrucciones.
3. Registro de herramientas en `modules/chatbot/tools/`: cada una declara nombre,
   descripción, parámetros tipados (zod), roles permitidos y una consulta
   parametrizada. Empieza con 2 o 3 de ejemplo (estado de un pedido, saldo de un
   cliente, pedidos recientes).
4. Conexión SEPARADA a la BD de la empresa (`COMPANY_DATABASE_URL`), distinta de la
   del bot. Usuario de SOLO LECTURA con acceso únicamente a vistas permitidas,
   timeout (`COMPANY_QUERY_TIMEOUT_MS`) y límite de filas (`COMPANY_MAX_ROWS`).
   Documenta cómo crear ese usuario con `GRANT SELECT` sobre vistas.
5. Flujo de CONSULTA_DATOS: verificar `ChatSession` activa (Fase 4) → el modelo elige
   una herramienta y sus parámetros → el CÓDIGO valida los parámetros con zod → el
   CÓDIGO verifica que el rol permita esa herramienta → ejecuta la consulta
   parametrizada → el modelo redacta la respuesta usando SOLO los datos devueltos.
   Sin datos: "No encontré información", sin inventar.
6. Aislamiento por usuario: las herramientas con datos personales reciben el
   identificador del usuario autenticado desde la sesión, NUNCA desde lo que escriba
   la persona ni lo que diga el modelo.
7. Defensa contra prompt injection: resultados de la BD y texto del usuario van
   delimitados como datos; el modelo no puede invocar herramientas que no estén en el
   registro ni con parámetros que no pasen la validación.
8. BD de ejemplo con datos FICTICIOS (clientes y pedidos) para pruebas.
9. Tests: clasificador con JSON inválido, herramienta no permitida para el rol,
   parámetros inválidos, intento de acceder a datos de otro usuario, timeout del
   modelo → transferencia, y que ninguna consulta se arme con texto del usuario.

**Criterio:** "¿cuál es el estado de mi pedido 123?" funciona solo para usuarios
autenticados y con permiso; sin sesión se envía el enlace de login; un usuario no
puede ver pedidos de otro.
**Esta fase la reviso yo con cuidado antes de cerrarla.**

---

## FASE 6 — Despliegue en el servidor de la empresa

1. `Dockerfile` y `docker-compose.yml` con: app, PostgreSQL y Ollama.
2. Configuración por empresa (nombre, mensajes, umbrales) por variables de entorno o
   tabla de configuración.
3. HTTPS obligatorio en producción (documenta el proxy inverso).
4. README de instalación y guía de variables de entorno.
5. Respaldos de la BD del bot y rotación de logs; sin datos sensibles en logs.
6. Retira lo de Botpress si ya no se usa.

**Criterio:** `docker compose up` levanta todo en una máquina limpia siguiendo solo el
README.

---

## FASE 7 — WhatsApp real (cuando haya número)

1. Activa `WhatsAppAdapter` con `CHANNEL_MODE=whatsapp` o `both`.
2. Las variables de WhatsApp las pongo yo en `.env`; el agente no lo toca.
3. Prueba el mismo flujo de las fases anteriores por WhatsApp.
4. Confirma que el webhook rechaza peticiones sin firma válida.
5. Para la Callback URL en el portal de Meta: con túnel de desarrollo la URL cambia en
   cada arranque; en producción usa el dominio fijo con HTTPS.

**Criterio:** todo lo probado en el chat web funciona igual por WhatsApp.

---

## FASE 8 — Canal Telegram (webhook de la Bot API)

Hecha (detalle y salida literal en `AUDIT.md` → "Fase 8"):

1. `CHANNEL_MODE` acepta `telegram` y listas con comas (`whatsapp,telegram`);
   `both` sigue siendo el alias de `web,whatsapp`.
2. `TelegramAdapter` (solo chats privados, troceado a 4096 sin `parse_mode`) +
   senders real/mock, montado como cualquier otro canal (`ChannelAdapter`).
3. `POST /webhooks/telegram` con `X-Telegram-Bot-Api-Secret-Token` (comparación
   timing-safe, 401 sin secreto), dedupe por `update_id`, rate limit por IP y por
   `chat.id`, 200 para payloads no procesables y 500 solo en fallos reales.
4. Nuevas variables `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   `TELEGRAM_SKIP_PHONE_MATCH` (default false) en `env.ts` y `.env.example`;
   validación en producción para el modo con telegram.
5. El agente responde por el panel sin ventana de 24h (esa ventana es solo de
   WhatsApp); notificación de sesión por el adaptador del canal.

**Criterio:** mensaje al bot por Telegram → respuesta + conversación visible y
respondible desde el panel; webhook rechaza peticiones sin el secreto.
**Nota:** `TELEGRAM_SKIP_PHONE_MATCH` documenta deuda (chat.id guardado en
`User.phone`; identidades distintas por canal) — ver `AUDIT.md`.

---

## FASE 9 — Puerta de verificación obligatoria (en curso)

Hecho (detalle, limitaciones y salida literal en `AUDIT.md` → "Puerta de verificación
obligatoria"):

1. Todo contacto **sin sesión vigente** recibe el mensaje estático obligatorio más el
   enlace de acceso; **ningún** mensaje suyo llega a la IA (ni preguntas, ni quejas,
   reclamos, peticiones, PQRS ni sugerencias, ni "quiero hablar con una persona").
2. La puerta está en `ProcessIncomingMessageUseCase.execute`, por donde pasan los tres
   canales; sin el módulo de identidad se deniega (fail closed), no hay bypass.
3. Se reutiliza el enlace vigente del contacto (no se generan enlaces repetidos ni se
   invalida el que el usuario ya tiene). Solo se crea otro si expiró o se consumió.
4. El token nunca se guarda en el historial, ni en la auditoría, ni en los logs.
5. Al cambiar el `registeredPhone` de un cliente se revocan todas sus sesiones
   abiertas: el contacto anterior no puede seguir usando la sesión y el cliente
   debe volver a verificarse (una sola sentencia `updateMany`, revoción **antes** de
   guardar el teléfono nuevo).
6. Revisión de permisos reales hecha sobre el código (detalle y preguntas en
   `AUDIT.md` → "Revisión de permisos reales"): aislamiento de datos por
   `company_users.id` en las tres herramientas, ausencia de funcionalidad PQRS, y
   garantía real de la vinculación en Telegram.

**Decidido por el dueño del proyecto (esta fase):**

1. **Reenvío de enlaces:** se mantiene el diseño "solo hash" (el enlace **no** se
   reenvía; hay que esperar al TTL, 10 min por defecto). No se implementa A, B ni C.
2. **Mapeo de `customer_id`:** la empresa usa **su propio código de cliente**, no el
   `id` interno del bot. Se añadió la columna única `company_users.companyCustomerId`
   (migración `0006`), el ADMIN la asigna desde el panel ("Código de cliente") y las
   tres herramientas filtran por ese código, que sale siempre de la sesión. Un
   cliente sin código no puede consultar datos: se deniega con un mensaje fijo,
   sin llamada al modelo y sin transferencia. La BD de prueba de Lázaro Software
   (datos ficticios) se carga con `scripts/lazaro-test-db/` (detalle y salida
   literal en `AUDIT.md` → "Mapeo `customer_id`").

**Pendiente de mi decisión (preguntas concretas y solución mínima propuesta en
`AUDIT.md`):**

1. **Rol en el chat:** hoy cualquier cuenta de empresa activa puede hablar por el
   chat, incluida una cuenta con `role = ADMIN` (empleado). Si un `ADMIN` no debe
   poder actuar como cliente, la regla mínima es un solo punto de comprobación
   (`CHAT_LOGIN_ALLOWED_ROLES` en `policy.ts`) sin tocar el esquema.
2. ~~**Mapeo de `customer_id`:**~~ **DECIDIDO** (ver arriba): columna
   `company_users.companyCustomerId` con el código de cliente de la empresa.
3. **PQRS en el chat:** hoy no existe funcionalidad de PQRS; los mensajes de ese tipo
   terminan en transferencia a asesor y el cliente no puede consultar su radicado.
   Si debe poder verlo, la vía mínima es una herramienta de solo lectura aislada por
   `user_id`.
4. **Telegram:** con los valores por defecto de producción el login de Telegram no
   puede funcionar (el `chat.id` tendría que coincidir con `registeredPhone`). Hay
   que registrar el `chat.id` como teléfono **o** activar
   `TELEGRAM_SKIP_PHONE_MATCH=true` (debilita la vinculación a "enlace + credenciales").

**Criterio:** ningún mensaje de un contacto sin verificar genera llamadas a la IA, en
ningún canal, y el enlace se entrega una sola vez mientras siga vigente. La fase
**no se cierra** hasta que se decida lo anterior.
