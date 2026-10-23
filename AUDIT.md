# Auditoría final — chatbot-soporte-backend

Fecha: 2026-09-28 · Fase 8 del plan de implementación.

## Resumen

Backend de chatbot de soporte en **Node.js 24 + Express 5 + Prisma 7 (PostgreSQL) + TypeScript**,
con Clean Architecture por módulos. Persistencia vía Prisma (cliente generado en
`src/generated/prisma`, driver `@prisma/adapter-pg`). Sin librerías de orquestación externas:
los conectores WhatsApp (Graph API) y Botpress se integran por HTTP nativo y degradan a MOCK
explicito cuando no hay credenciales.

### Módulos

| Módulo | Capa | Estado |
| --- | --- | --- |
| `src/shared` | config, errores, http (request/rate-limit/logger), prisma | ✓ |
| `src/modules/users` | CRUD usuarios (findByPhone para el bot) | ✓ |
| `src/modules/conversations` | máquina de estados + mensajes + eventos | ✓ |
| `src/modules/knowledge` | CRUD base de conocimiento (boletines) | ✓ |
| `src/bot` | KB estática + Prisma + Botpress, orquestador de mensajes, webhook WhatsApp | ✓ |
| `src/connectors` | notificación a agentes al escalar (WhatsApp/Webhook) | ✓ |

### Verificación

- Compilación: `npm run typecheck` y `npm run build` sin errores.
- Tests: **85 tests en 7 archivos** (`npx vitest run`), todos verdes.
- Smoke integral en vivo verificado: `/api/health`, 422 (validación) y 500 (DB caída, controlado)
  en users/conversations/knowledge, handshake webhook 200/403, ack 200, 404 JSON,
  rate-limit webhook 429, `x-request-id` correlacionado en logs.

## Checklist por fase

| Fase | Entregable | Estado |
| --- | --- | --- |
| F1 | Base Express + TS + Prisma + estructura | ✓ |
| F2 | Users (11 reglas validadas, rutas `/api/users`) | ✓ |
| F3 | Conversations (estados, mensajes, eventos 409) | ✓ |
| F4 | Bot + WhatsApp (webhook, KB scoring, mocks) | ✓ |
| F5 | Knowledge + seed (`prisma/seed.ts`) | ✓ |
| F6 | Conectores de escalación (WhatsApp + Webhook) | ✓ |
| F7 | Observabilidad, rate-limit, validación prod, índice | ✓ (operativo pendiente DB) |
| F8 | Auditoría + este informe | ✓ |

## Fase 1 — Seguridad base

### Qué se hizo

1. Puerto `PasswordHasher` en `shared/` con implementación argon2id y tests.
2. Modelo `AdminUser` (email único, passwordHash, rol ADMIN | AGENT, active,
   failedAttempts, lockedUntil) y migración del índice `(userId, channel, status)`
   de `conversations`.
3. Seed del primer admin leyendo `ADMIN_EMAIL`/`ADMIN_PASSWORD` solo al sembrar
   (sin loguear ni guardar en texto plano).
4. Login/logout de administradores (`POST /auth/login`, `POST /auth/logout`) con
   cookie httpOnly, SameSite=Strict, Secure en producción y vencimiento por
   inactividad; error genérico exista o no el usuario.
5. Todos los endpoints `/api/*` exigen sesión salvo `/api/health`; control por rol
   (ADMIN/AGENT); `/dev/chat` queda fuera de `/api` y desactivado en producción.
6. CORS con lista de orígenes por `ALLOWED_ORIGINS` (lista vacía = solo mismo
   origen; sin credentials).
7. Rate-limit en login (10/min por IP) y bloqueo temporal de 15 min tras 5 fallos
   seguidos, registrando los fallos sin la contraseña.
8. Webhook de WhatsApp: verifica `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`
   sobre el cuerpo crudo; en desarrollo sin secreto, warning al arrancar y 401 a
   todo POST (falla cerrado).
9. Tests: 401 sin sesión, 200 con sesión, rol insuficiente, bloqueo por intentos,
   firma válida e inválida y health sigue público.

### Cómo probarlo

- `curl -i http://localhost:3000/api/knowledge` → **401** sin sesión.
- `curl -i http://localhost:3000/api/health` → **200** (público).
- `curl -i -X OPTIONS http://localhost:3000/api/knowledge -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"` → preflight con cabeceras CORS si el origen está en `ALLOWED_ORIGINS`.
- `npm run typecheck` → 0 errores.
- `npm test` → **193 tests en 22 archivos**, todos verdes.

### Pendientes conocidos

- **trust proxy**: configurar antes de producción detrás de proxy inverso (Fase 6),
  porque el rate-limit usa `req.ip`.
- **Rate-limit en memoria**: válido solo para una instancia.
- **Sesiones vencidas**: se borran solo al usarse; falta limpieza periódica.
- **`/api/health`** expone el estado de la base de datos.
- **`validate.ts`** usa `process.env` fuera de `env.ts`.

## Fase 2 — Panel de preguntas frecuentes

### Qué se hizo

1. Panel en `public/admin/` (HTML + JS sin framework, `index.html` + `admin.js` + `admin.css`): login contra `POST /auth/login`, listado paginado, alta y edición de FAQs (título/pregunta, respuesta, categoría, palabras clave y activo/inactivo), activar/desactivar. El contenido se renderiza con `textContent`/`createElement` (sin `innerHTML` ni `eval`).
2. `GET /api/knowledge` con paginación y búsqueda (`page`, `pageSize`, `q`, `category`, `active`) y validación de entrada (`validateListPage`): `pageSize` máx. 100, búsqueda máx. 100 chars, `active` en `all|true|false`.
3. Búsqueda mejorada del bot (`src/bot/domain/knowledge.ts`): normaliza tildes (NFD) y mayúsculas, ignora palabras vacías y devuelve puntaje de confianza 0..1 (`0.6` keyword + `0.3` título + `0.1` contenido). Si queda por debajo de `FAQ_MIN_CONFIDENCE` (default `0.5`, configurable), el bot no responde y sigue el flujo.
4. Los cambios se aplican sin reiniciar el servidor: `PrismaKnowledgeBaseRepository` consulta `knowledgeArticle` en cada mensaje.

### Cómo probarlo manualmente

- `npm run dev` y abrir `http://localhost:3000/admin/` en el navegador.
- Iniciar sesión con el admin sembrado (`ADMIN_EMAIL`/`ADMIN_PASSWORD`); crear una FAQ activa con una palabra clave distintiva (ej. "restablecer contraseña").
- Abrir `http://localhost:3000/dev/chat` y preguntar esa FAQ: el chat respondió correctamente a la FAQ activa sobre "restablecer la contraseña", sin reiniciar el servidor. Desactivarla en el panel y repetir: deja de responder.
- No se verificaron permisos AGENT ni XSS en esta prueba manual.

### Pendientes conocidos

- La búsqueda/puntaje del bot (`src/bot/domain/knowledge.ts`) y el CRUD/paginación del panel (`src/modules/knowledge/`) son **dos implementaciones separadas** del concepto `KnowledgeArticle`; no están unificadas.
- No existe `DELETE` de FAQs: solo alta, edición y activar/desactivar.

## Fase 2 — Panel de preguntas frecuentes

### Qué se hizo

1. Panel en `public/admin/` (HTML + JS sin framework, `index.html` + `admin.js` +
   `admin.css`): login contra `POST /auth/login`, lista paginada, alta y edición de
   FAQs (pregunta, respuesta, categoría, palabras clave y activo/inactivo) y
   activar/desactivar. El contenido se renderiza con `textContent`/`createElement`
   (sin `innerHTML` ni `eval`), por lo que no hay XSS al mostrarlo.
2. `GET /api/knowledge` con paginación y búsqueda (`page`, `pageSize`, `q`,
   `category`, `active`) y validación de entrada (`validateListPage`): `pageSize`
   máx. 100, búsqueda máx. 100 chars, `active` en `all|true|false`.
3. Búsqueda mejorada del bot (`src/bot/domain/knowledge.ts`): normaliza tildes
   (NFD) y mayúsculas, ignora palabras vacías y devuelve un puntaje de confianza
   0..1 (`0.6` keyword + `0.3` título + `0.1` contenido). Si queda por debajo de
   `FAQ_MIN_CONFIDENCE` (default `0.5`, configurable en `.env`; valor inválido lo
   reporta `validateConfig`), el bot no responde y sigue el flujo.
4. Los cambios se aplican sin reiniciar: `PrismaKnowledgeBaseRepository` consulta
   la tabla `knowledgeArticle` en cada mensaje, así que una FAQ creada o
   desactivada en el panel surte efecto de inmediato.

### Cómo probarlo

- `npm run dev` y abrir `http://localhost:3000/admin/` en el navegador.
- Iniciar sesión con el admin sembrado (`ADMIN_EMAIL`/`ADMIN_PASSWORD`); crear una
  FAQ con una palabra clave distintiva. Verificado: `GET /admin/` y
  `/admin/admin.js` responden 200 y `admin.js` no usa `innerHTML`/`eval`
  (`src/modules/knowledge/tests/admin-panel.test.ts`).
- Abrir `http://localhost:3000/dev/chat` y preguntar esa FAQ: el bot responde
  **sin reiniciar** el servidor. Desactivarla en el panel y repetir: deja de
  responder.
- `npm run typecheck` → 0 errores. `npm test` → 244 tests en 24 archivos, verdes.

### Pendientes conocidos

- La búsqueda/puntaje del bot (`src/bot/domain/knowledge.ts`) y el CRUD/paginación
  del panel (`src/modules/knowledge/`) son **dos implementaciones separadas** del
  concepto `KnowledgeArticle`; no están unificadas.
- No hay `DELETE` de FAQs: solo alta, edición y activar/desactivar.

## Fase 3 — Tickets y transferencia a asesor (panel web)

### Qué se hizo

1. Módulos `tickets` (`src/modules/tickets`, use cases Create/Assign/UpdateStatus +
   `PrismaTicketRepository`) y `agents` (`src/modules/agents`, `PickAvailableAgent` con
   reparto por menos carga + `PrismaAgentRepository`), ambos con tests.
2. `ConversationRepository.listMessages` con paginación por cursor
   (`createdAt|id`), tope de 200 y tests; usado por el historial del panel.
3. `TransferToHumanUseCase` (`transfer-to-human.ts`): crea ticket (idempotente por
   conversación), asigna al agente de menor carga o deja en cola, registra eventos en
   `conversationEvent` (TICKET_CREATED, AGENT_ASSIGNED, TRANSFERRED_TO_HUMAN), deja
   mensajes SYSTEM visibles y devuelve el aviso al cliente por su canal.
4. Panel del asesor (`public/admin/agent-panel.html|js` + `agent-panel-controller.ts`,
   rutas `/api/agent/conversations`): lista de espera/asignadas, historial de
   conversaciones cerradas (`/history`), historial completo de mensajes (con el bot),
   caja de respuesta, "cerrar conversación" y "devolver al bot".
   La respuesta sale por el canal de origen con `adapter.send(..., { sender: "AGENT" })`
   al **teléfono real** del cliente (resuelto vía `User`, nunca tomado del body): antes
   se enviaba el literal `"hidden"` y el chat web descartaba el mensaje.
5. Ventana de 24 h de WhatsApp: chequeo en el controlador (409
   `WHATSAPP_WINDOW_EXPIRED`) y aviso en el panel con propuesta de plantilla HSM
   (`send-template`, ahora direccionada al teléfono del usuario).
6. Disparadores de transferencia: el usuario pide un humano y `TRANSFER_AFTER_MISSES`
   fallos seguidos. La confianza baja del bot NO transfiere de inmediato: cuenta como
   un fallo más y dispara por acumulación, como cualquier consulta sin respuesta.
7. Con la conversación en `WAITING_AGENT` o asignada (OPEN), el bot solo guarda el
   mensaje del cliente y no responde (tests `process-incoming-message.handoff.test.ts`).
8. Solo usuarios `AGENT`/`ADMIN` autenticados acceden al panel (`requireRole` en
   `/api/agent`).
9. Tests nuevos: `transfer-to-human.test.ts` y `agent-panel-controller.test.ts`
   (envío al contacto real, bloqueo por ventana vencida, listado del historial).

### Cómo probarlo

- `npm run typecheck` → 0 errores. `npm test` → **280 tests en 31 archivos**, verdes.
- Manual: `npm run dev`, iniciar sesión en `/admin/agent-panel.html` con un usuario
  AGENT/ADMIN sembrado, crear un agente disponible en `agents`; en `/dev/chat`
  escribir algo que el bot no entienda hasta superar `TRANSFER_AFTER_MISSES` (o
  "quiero hablar con un humano"); el ticket aparece en el panel; responder desde el
  panel y verificar que el cliente lo recibe en el chat web; "cerrar" termina el flujo
  y la conversación pasa al historial ("Ver historial").
- En una conversación de WhatsApp simulada con mensaje del cliente más viejo que
  24 h, el panel muestra la ventana expirada y el envío libre responde 409.

### Pendientes conocidos

- `ConversationEvent` se escribe en BD pero aún no se expone por API; el historial del
  panel usa los mensajes.
- No hay endpoints para cambiar el estado del agente (AVAILABLE/BUSY/OFFLINE) ni para
  asignar manualmente un ticket; se asigna solo por el repartidor automático.
- El envío de plantillas HSM requiere configurar `WHATSAPP_TEMPLATE_NAME`.
- `missCounts` es en memoria (se reinicia al reiniciar el servidor).
- `LOW_CONFIDENCE_THRESHOLD` sigue en la configuración pero el flujo del bot ya no lo
  usa: la confianza baja cuenta como un fallo normal. Si se retoma el disparador por
  confianza, reactivar aquí.

## Fase 4 — Identidad: login web separado del chat

### Qué se hizo

1. Esquema Prisma (migración `0004_identity`) + enum `CompanyRole{USER,ADMIN}` y modelos
   `CompanyUser` (username único, passwordHash, displayName, role, active, registeredPhone,
   failedAttempts, lockedUntil), `LoginLink` (tokenHash sha256, channel, contactId, expiresAt,
   usedAt), `ChatSession` (sessionIdHash, companyUserId, channel, contactId, idleExpiresAt,
   absoluteExpiresAt, revokedAt, lastActivityAt) y `AuditLog` (actorType, actorId, action,
   targetType, targetId, ip, metadata). Se guarda solo el HASH de tokens, nunca el token.
2. Módulo `src/modules/identity` (domain/application/infrastructure/presentation):
   - `LoginLink`: token de 32 bytes base64url, TTL `LOGIN_LINK_TTL_MINUTES` (10), un solo uso,
     atado a (channel, contactId). URL `PUBLIC_BASE_URL/login?t=<token>` (el teléfono no viaja).
   - `ChatSessionService`: sesión por (channel, contactId), renueva `lastActivityAt`, vence por
     inactividad (`CHAT_SESSION_IDLE_MINUTES`, 20) y tope absoluto (`CHAT_SESSION_ABSOLUTE_HOURS`, 8).
   - `ChatLoginUseCase`: error genérico siempre; verifica hash aun si el usuario no existe
     (filler argon2id); rate-limit por IP y por cuenta; bloqueo 15 min tras 5 fallos;
     `REQUIRE_PHONE_MATCH` (default true en production) exige que `registeredPhone` coincida.
   - `ValidateLoginLinkUseCase`, `LogoutChatUseCase`, `GenerateLoginLinkUseCase`.
   - CRUD admin: `CreateCompanyUser` (409 `UsernameTaken`), `ListCompanyUsers`, `UpdateCompanyUser`,
     `ListChatSessions`, `RevokeChatSession`; `AuditWriter` registra eventos de identidad y sesión.
3. Página pública `/login` (`public/login.html|js|css`): valida el token al cargar (mensaje genérico
   si inválido/vencido/usado), muestra el contacto enmascarado (`****1234`), formulario usuario +
   contraseña y bloqueo del envío por validación de origen.
4. Anti-CSRF sin `SESSION_SECRET`: token de enlace de un solo uso + validación de origen
   (`Origin`/`Sec-Fetch-Site`) con `trustedOrigins` (`ALLOWED_ORIGINS` + origen de `PUBLIC_BASE_URL`).
5. Integración con el bot (`process-incoming-message.ts`): `ChatIdentityPort` (definido en el
   consumidor; `identity` lo implementa) detecta "iniciar sesión"/"login"/"consultar mis datos" y
   "salir" SOLO cuando la conversación la lleva el bot (`BOT_HANDLING`); sin sesión responde el
   enlace. Item 5 del plan: tras el login el bot avisa por el canal vía `ChatNotifier`
   (`AdapterChatNotifier` sobre los adaptadores existentes).
6. Panel `/admin` (`public/admin/identity.html|js`): crear/desactivar usuarios de empresa,
   asignar contraseña y teléfono registrado, ver sesiones activas y revocarlas. Rutas
   `/api/identity/login` (público), `/api/company-users` y `/api/chat-sessions` (solo ADMIN).
7. `api-guard.isPublicApiRequest` amplía las excepciones: `/identity/login` (cualquier método) y
   `GET /identity/login-link/:token`.

### Cómo probarlo

- `npm run typecheck` → 0 errores. `npm test` → **320 tests en 37 archivos**, verdes.
- Manual (requiere DB): aplicar `0004_identity` (`npx prisma migrate deploy`) y sembrar un
  `CompanyUser`; en `/dev/chat` con un teléfono de prueba escribir "iniciar sesión" → el bot
  envía el enlace; abrir `/login?t=...`, entrar usuario/contraseña; el chat queda autenticado;
  "salir" revoca. En `/admin/identity.html` (ADMIN) crear/desactivar usuarios y revocar sesiones.

### Pendientes conocidos

- La migración `0004_identity` NO se aplicó en este entorno (no hay Postgres). Resuelto: el seed
  ahora crea un `CompanyUser` de ejemplo (`seed-company-user.ts`) para poder probar el login.
- El aviso de login (item 5) usa los adaptadores de `main.ts`; en el simulador web `/dev/chat` NO
  se verá porque `main.ts` y `wireBot` instancian `WebChatAdapter` por separado (duplicación previa).
  En WhatsApp sí se envía. Unificar la instancia de adaptadores queda como mejora futura. **Resuelto**
  (ver "Revisión post-integración"): ahora se comparte un único adaptador.
- "Un chat sin sesión nunca ejecuta consultas de datos" queda parcial: las consultas de datos se
  añaden en la Fase 5.
- El teléfono de prueba de WhatsApp sigue siendo ficticio.

## Fase 5 — IA local + consultas a la BD (integrada)

### Qué se hizo

1. Módulo `src/modules/chatbot`: `LlmProvider` (domain) + `OllamaLlmProvider`
   (infrastructure; `OLLAMA_BASE_URL`, `OLLAMA_MODEL` por defecto `qwen2.5:7b-instruct`,
   timeout `LLM_TIMEOUT_MS`, error controlado) e `IntentClassifier` (FAQ |
   CONSULTA_DATOS | PEDIR_HUMANO | NO_ENTIENDE, salida JSON validada con Zod, un
   reintento y luego `PEDIR_HUMANO`). El prompt marca el texto del usuario como DATOS.
2. Herramientas en `src/modules/chatbot/tools` (`get_customer_balance`,
   `get_order_status`, `get_recent_orders`) con parámetros Zod, roles permitidos
   (`USER`/`ADMIN`) y SQL parametrizado sobre vistas de solo lectura
   (`v_customer_balance`, `v_orders_status`, `v_recent_orders`). `ToolRegistry` con
   `defineTool` (sin `any`).
3. Conexión SEPARADA a la BD de la empresa (`COMPANY_DATABASE_URL`, distinta de la del
   bot) con usuario de solo lectura, timeout `COMPANY_QUERY_TIMEOUT_MS` y límite de
   filas `COMPANY_MAX_ROWS`. Scripts en `scripts/setup-company-db.sql` (vistas + GRANT
   SELECT + usuario `company_readonly`) y `scripts/seed-company-db.sql` (datos ficticios).
4. **Integración real en el flujo del bot** (`process-incoming-message.ts`): el bot usa
   el clasificador cuando está configurado (`classifier`/`dataQuery` inyectados desde
   `main.ts`); si no, conserva los disparadores por palabras de la Fase 4. Flujo
   CONSULTA_DATOS: sesión activa (`ChatIdentityPort.getActivePrincipal`, nueva) → el
   modelo elige herramienta+parámetros → el CÓDIGO valida con Zod y verifica el rol →
   ejecuta la consulta parametrizada → el modelo redacta con SOLO los datos devueltos.
   Sin sesión: responde el enlace de login (`startLogin`), NUNCA consulta la BD.
5. Aislamiento por usuario: `authenticatedUserId` proviene SIEMPRE de la sesión, no del
   texto ni del modelo. Sin datos: "No encontré información". Si el modelo falla, tarda
   o devuelve algo inválido: transferencia a asesor (`LOW_CONFIDENCE`).
6. `main.ts` habilita Fase 5 solo si `COMPANY_DATABASE_URL` está definida (construye
   pool, registry, Ollama, clasificador y caso de uso; cierra el pool en `shutdown`).
   Sin esa variable, todo el sistema sigue funcionando con palabras clave.
7. `env.ts`/`validate.ts`/`.env.example` con las variables nuevas; `package.json` añade
   `@types/pg`.

### Cómo probarlo

- `npm run typecheck` → 0 errores. `npm test` → **333 tests en 39 archivos**, verdes.
- Sin Ollama/BD (desarrollo): el bot sigue respondiendo FAQs y transfiriendo por
  palabras clave; no se rompe.
- Con IA (requiere Ollama + BD de empresa): definir `OLLAMA_*` y `COMPANY_DATABASE_URL`;
  "¿cuál es el estado de mi pedido 123?" funciona solo con sesión válida y permiso; sin
  sesión se envía el enlace de login; un usuario no ve pedidos de otro.

### Pendientes conocidos

- La BD de empresa y Ollama NO estaban disponibles en este entorno: la integración se
  verificó con tests (mocks de `LlmProvider`/`Pool`), no end-to-end real.
- `chatbot-engine.ts` de la rama de origen se DESCARTÓ (duplicaba el flujo del bot);
  su test se reescribió sobre `IntentClassifier` + `QueryDataUseCase`.
- `scripts/setup-company-db.sql` incluye una contraseña de ejemplo para el usuario de
  solo lectura; debe cambiarse en el servidor real.

## Fase 6 — Despliegue en el servidor de la empresa

### Qué se hizo

1. `Dockerfile` multietapa (builder + runner): el cliente Prisma se genera en el builder
   (en `src/generated`) y se compila a `dist`; el runner instala solo dependencias de
   producción con `npm ci --omit=dev --ignore-scripts` (no hay CLI de Prisma en runtime).
2. `docker-compose.yml` con `db` (PostgreSQL 16), `ollama` y `app`, volúmenes, healthcheck
   y `depends_on`; `OLLAMA_BASE_URL` apunta al servicio `ollama`.
3. `scripts/backup-db.sh`: respaldo de la BD con `pg_dump | gzip` y rotación a 7 días;
   usa las mismas variables `POSTGRES_*` que el compose.
4. `README-DEPLOYMENT.md` con la guía de instalación, variables de entorno y proxy HTTPS.

### Cómo probarlo

- Revisar `README-DEPLOYMENT.md`. En una máquina con Docker: `docker compose up` (requiere
  Docker; no se ejecutó en este entorno).

### Pendientes conocidos

- `docker compose up` no se verificó en este entorno (sin Docker/Postgres/Ollama).
- HTTPS queda documentado (proxy inverso) pero no automatizado.
- La configuración por empresa (nombre, mensajes) se resuelve por variables de entorno.

## Disciplina de código

- `process.env` solo en `src/shared/config/env.ts` (+ `validate.ts` y tests); un único punto de config.
- Sin `any`/`as any` ni `TODO`/`FIXME` en código propio.
- `.gitignore` protege `.env`, `node_modules/`, `dist/`, `coverage/`, `*.log` y `src/generated/prisma/`.
- Manejo de errores uniforme: `AppError` (400/404/409/422), 404 JSON, 500 controlado (`INTERNAL_ERROR`/`WEBHOOK_ERROR`).
- Respuestas con formato `{ error: { code, message } }` consistente.

## Pendientes operativos (requieren entorno, no bloquean el código)

1. **Base de datos**: Postgres no está disponible en el entorno de desarrollo. Al levantarlo:
   - `npm run prisma:migrate` → aplica `0001_init` **y genera la migración pendiente** del índice
     compuesto `(userId, channel, status)` de Fase 7 (aún ausente de `0001_init`).
   - `npm run prisma:seed` → crea 3 artículos ficticios de la base de conocimiento.
2. **E2E real**: mensaje WhatsApp → usuario/conversación en DB → bot → `WAITING_USER`
   (o escalación a agente con notificación) — verificable una vez la DB esté activa.
3. **Producción**: completar `.env` (ver `.env.example`): credenciales WhatsApp (token,
   phone number id, verify token), Botpress, `WHATSAPP_SUPPORT_PHONE`,
   `NOTIFICATION_WEBHOOK_URL`, y ejecutar con `NODE_ENV=production`
   (el arranque valida la configuración crítica y corta con listado de pendientes).

## Recomendaciones de seguridad/operación (no implementadas a propósito)

- **CORS abierto** (`cors()`) — Resuelto en Fase 1.
- **Autenticación** de los endpoints admin `/api/*` (users/conversations/knowledge)
  — Resuelto en Fase 1.
- **Rate-limit en memoria** (ventana fija por IP, single-instance): si se escala a varias
  réplicas, migrar a un store compartido.
- **Paginación**: `GET /api/knowledge` no pagina; revisar si la KB crece.
- **Botpress**: el brain se incluye solo si hay `BOTPRESS_WEBHOOK_SECRET`; la KB manejada
  vía webhook queda como integración futura/config.

## Comandos útiles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | servidor de desarrollo (watch) |
| `npm run typecheck` | chequeo de tipos |
| `npm run build` | `prisma generate` + compilación a `dist/` |
| `npm start` | ejecutar `dist/main.js` |
| `npm test` / `npm run test:watch` | tests (vitest) |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:seed` | `prisma db seed` |

## Revisión post-integración y correcciones (Fases 0–6)

Tras fusionar las Fases 5 y 6 se hizo una revisión completa de las 7 fases. Se corrigieron los
siguientes problemas (bugs reales, seguridad y limpieza).

### Bugs reales

1. **Despliegue de Fase 6 no funcionaba en máquina limpia.** El runner no tiene CLI de Prisma ni
   `tsx`, pero el README pedía `docker exec ... prisma migrate deploy` / `db seed`. Ahora
   `docker-compose.yml` incluye un servicio one-shot `migrate` (construido con `target: builder`)
   que aplica migraciones y seed; `app` arranca solo tras `service_completed_successfully`. El
   `Dockerfile` ya no repite `prisma generate` (lo hace `npm run build`) y define un `DATABASE_URL`
   placeholder solo durante la generación.
2. **`get_recent_orders` podía ejecutar SQL sin límite.** `ToolRegistry.validate` descartaba el
   resultado de Zod, así que el `default(5)` no se aplicaba (posible `LIMIT NULL`). Ahora
   `Tool.parse` devuelve los datos parseados (con defaults/coerciones) y `QueryDataUseCase` los usa.
3. **Adaptadores duplicados rompían el canal web.** `main.ts` y `wireBot` creaban instancias
   separadas de `WebChatAdapter`/`WhatsAppAdapter`; los mensajes del panel/notifier no llegaban a
   `/dev/chat`. Ahora `wireBot` recibe los adaptadores y el `sender` de `main.ts` (instancia única).

### Seguridad / operación

4. **`.dockerignore`**: evita copiar `.env`, `node_modules`, `dist`, `src/generated`, logs y `.git`
   a la imagen (fuga de secretos y binarios del host).
5. **`trust proxy` configurable** (`TRUST_PROXY`): sin él, el rate-limit agrupaba a todos en la IP
   del proxy. Documentado en `README-DEPLOYMENT.md`.
6. **`scripts/backup-db.sh`**: `set -euo pipefail`, carga del `.env`, y verifica que el dump no
   quede vacío antes de dar éxito.
7. **Enlace de login de un solo uso atómico**: `LoginLinkRepository.consume` (updateMany con
   `usedAt: null` + vigencia) evita el TOCTOU de verificar y marcar por separado.
8. **No se persiste el token del enlace en `messages`**: al usuario se le envía el enlace real, pero
   el historial guarda un texto redactado.
9. **Seed de `CompanyUser` de ejemplo** (`prisma/seed-company-user.ts`) con
   `COMPANY_SEED_USERNAME/PASSWORD/DISPLAY_NAME/PHONE`; permite probar el login.
10. **`setup-company-db.sql`** ya no lleva contraseña literal: se pasa como variable de `psql`.

### Limpieza

11. Eliminado el token de sesión muerto: columna `sessionIdHash` (migración
    `0005_drop_chat_session_token`), campo `token` de `CreatedChatSession`.
12. Eliminado `lowConfidenceThreshold` (env, validate, processor), `getConversation` del puerto
    interno del bot, y `allowScripts` (campo inexistente en npm).
13. `ChatSessionService.revokeById` lee el reloj una sola vez.
14. `PORT` se valida (`validate.ts`).

### Verificación

- `npm run typecheck` → 0 errores. `npm test` → **341 tests en 40 archivos**, verdes.
- No verificable aquí (sin Docker/Postgres): `docker compose up`, migración `0005` y E2E real.

---

## Fase 8 — Canal Telegram (webhook de la Bot API)

### Qué se hizo

1. **Dominio/canales**
   - `ChannelName` acepta `"TELEGRAM"` (`channels/domain/channel-adapter.ts`).
   - Nuevo puerto `TelegramSender` (`bot/domain/telegram.ts`).
   - Nuevo `TelegramAdapter` (`channels/infrastructure/telegram-adapter.ts`): parsea solo
     chats `private` (grupos/canales se ignoran), extrae `chat.id` como `contactId`,
     trocea las salidas en mensajes de a lo sumo 4096 caracteres Unicode (sin partir
     emoji, sin `parse_mode`). Helpers exportados: `splitTelegramText`,
     `readTelegramUpdateId`, `readTelegramChatId`, `TELEGRAM_MAX_MESSAGE_LENGTH`.
   - Senders: `HttpTelegramSender` (POST a la Bot API con `fetch` nativo; el token no
     aparece en los mensajes de error) y `LogTelegramSender` (mock con log explícito).
2. **Configuración** (solo `env.ts` lee `process.env`)
   - `CHANNEL_MODE` acepta listas por comas (`web`, `whatsapp`, `telegram`, `both`,
     `whatsapp,telegram`…); `both` sigue siendo el alias de `web,whatsapp` (compatibilidad).
   - Nuevas variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
     `TELEGRAM_SKIP_PHONE_MATCH` (booleano, default `false`), en `env.ts` y
     `.env.example` con valores de ejemplo.
   - `validate.ts` en producción: DATABASE_URL siempre; variables de WhatsApp solo si
     el modo incluye whatsapp; `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` solo si
     incluye telegram; el secreto debe cumplir `/^[A-Za-z0-9_-]{1,256}$/` (formato de
     `secret_token`); se rechaza cualquier modo con el token literal `web`
     (`web`, `web,telegram`, …); `TELEGRAM_SKIP_PHONE_MATCH` debe ser `true`/`false`.
     El alias `both` sigue permitido en producción (equivale a whatsapp: el simulador
     `/dev/chat` solo se monta fuera de producción).
3. **Webhook** `POST /webhooks/telegram` (`bot/presentation/telegram-webhook.ts`)
   - Secret header `X-Telegram-Bot-Api-Secret-Token` comparado con SHA-256 +
     `timingSafeEqual` (seguro ante longitudes distintas). Sin secreto configurado o
     con header ausente/incorrecto → **401** `INVALID_SECRET` (fail closed).
   - Dedupe por `update_id` en memoria (TTL 10 min, tope 10 000 entradas): ya procesado
     → 200 sin reprocesar. El dedupe se registra SOLO tras responder bien; si el
     procesamiento falla (500 `WEBHOOK_ERROR`) el reintento de Telegram se procesa.
   - Payload sin texto procesable o no-objeto → 200 `{status:"ok"}` (Telegram no
     reintenta). 500 solo para fallos reales de `handleInbound`.
   - Rate limit por IP (60 s/30, 429) mantenido + rate limit NUEVO por `chat.id`
     (20 msg/min): al excederse responde 200 sin procesar y sin consumir IA.
   - `TelegramAdapter` inexistente con el modo activo → error al arrancar.
4. **Integración**
   - `main.ts`: compone `HttpTelegramSender`/`LogTelegramSender` + `TelegramAdapter`,
     lo registra en `AdapterChatNotifier` (notificación de sesión por Telegram), en el
     panel del asesor y en `wireBot`; warning al arrancar si el modo incluye telegram
     y falta `TELEGRAM_WEBHOOK_SECRET`.
   - `bot/index.ts`: monta `/webhooks/telegram` y loguea `telegram: real|mock|off`.
   - `process-incoming-message.ts`: `ChatChannel` incluye `"TELEGRAM"`; el
     `externalCustomerId` queda `telegram-<chatId>` (misma fórmula por canal).
   - Identidad: `TELEGRAM_SKIP_PHONE_MATCH=true` omite la coincidencia de teléfono
     SOLO cuando el enlace es del canal `TELEGRAM` (`chat-login.ts`); por defecto
     `false` y el comportamiento de WhatsApp/web no cambia.
   - Panel del asesor: puede responder conversaciones `TELEGRAM` sin ventana de 24h
     (la ventana solo aplica a WhatsApp).
   - Sin migración Prisma: `Conversation.channel`, `LoginLink.channel` y
     `ChatSession.channel` son `String`.

### Cómo probarlo

1. Configurar en `.env` (nunca commitear): `CHANNEL_MODE=telegram` (o
   `whatsapp,telegram`), `TELEGRAM_BOT_TOKEN=<token de BotFather>` y
   `TELEGRAM_WEBHOOK_SECRET=<secreto aleatorio 1-256: A-Za-z0-9_->`.
2. Arrancar: `npm run dev` (o build + start). En el log debe aparecer
   `"telegram": "real"` (o `"mock"` sin token en desarrollo).
3. Registrar el webhook (placeholders, nunca valores reales en docs):

   ```bash
   curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://<dominio>/webhooks/telegram" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   Comprobar: `curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"`.
4. Enviar un mensaje al bot desde Telegram: debe responder por el bot y la
   conversación aparece en el panel del asesor (responder desde el panel funciona sin
   ventana de 24h).
5. Probar límites: mismo `update_id` reenviado → solo se procesa una vez; 21+ mensajes
   rápidos del mismo chat → el excedente responde 200 sin invocar al modelo.
6. Sin `TELEGRAM_WEBHOOK_SECRET` → cualquier POST a `/webhooks/telegram` responde 401.

### Pendientes conocidos / deuda técnica

1. **Identidad por canal:** el `chat.id` de Telegram se guarda en `User.phone` (no hay
   campo propio). Una misma persona en WhatsApp y Telegram genera DOS usuarios
   distintos (porque `externalCustomerId` es `telegram-<id>` vs `whatsapp-<tel>`).
2. **`TELEGRAM_SKIP_PHONE_MATCH=true`** desactiva la coincidencia de teléfono solo en
   el canal TELEGRAM. Riesgo: en producción con `REQUIRE_PHONE_MATCH=true` (default),
   el login desde Telegram no exige que el teléfono registrado coincida con el chat.
   El acceso sigue exigiendo usuario + contraseña y el enlace de un solo uso; la
   variable queda en `false` por defecto y solo debe activarse si se acepta ese riesgo.
3. Sin prueba E2E real contra la Bot API (requiere token y dominio público).
4. `WhatsAppAgentNotifier` no se tocó: las escalaciones por Telegram usan
   `AdapterChatNotifier` con el adaptador del canal.

### Verificación (salida literal)

`npm run typecheck`:

```text
npm notice run chatbot-soporte-backend@0.1.0 typecheck
npm notice run tsc -p tsconfig.build.json --noEmit
```

`npm test`:

```text
npm notice run chatbot-soporte-backend@0.1.0 test
npm notice run vitest run

 RUN  v5.0.1 C:/Users/Wilso/Downloads/todo menos ultima fase (en teoria)/prueba/Chatbot-Juan/Chatbot-main


 Test Files  47 passed (47)
      Tests  397 passed (397)
   Start at  23:04:30
   Duration  29.95s (tests 76%, import 15%, transform 8%, worker 1%)
```

Tests nuevos: `telegram-adapter.test.ts`, `telegram-webhook.test.ts`,
`telegram-sender.test.ts`, `telegram-mode.test.ts`, `chat-login.telegram.test.ts`,
`agent-panel-telegram.test.ts` + caso `TELEGRAM` en `process-incoming-message.extid.test.ts`.

## Arranque: creación opcional del admin inicial (Railway)

### Qué se hizo

1. **`src/shared/application/bootstrap-admin.ts`** (nuevo): `bootstrapAdmin(store, hasher, input)`.
   - Sin `ADMIN_EMAIL`/`ADMIN_PASSWORD` → `skipped-missing` (no toca la BD).
   - Contraseña < 12 caracteres → `skipped-weak-password`.
   - Si ya existe **cualquier** usuario con rol `ADMIN` (`count({ where: { role: "ADMIN" } })`) →
     `skipped-existing-admin`; **no sobrescribe** ni el email ni el hash.
   - Si no hay admin → crea uno con email en minúsculas, `passwordHash` (argon2id) y `role: "ADMIN"`.
   - Nunca imprime ni registra la contraseña ni el hash.
2. **`src/main.ts`**: tras validar la config y antes de montar repos, si
   `databaseConfigured` llama a `bootstrapAdmin(prisma, new Argon2PasswordHasher(), …)` y
   loguea el resultado como JSON (`{level,msg}`), sin datos sensibles. El runner ejecuta
   `prisma migrate deploy && node dist/main.js`, así que el admin se crea **después** de migrar.
3. **`.env.example`**: se aclara que `ADMIN_EMAIL`/`ADMIN_PASSWORD` se usan también en el
   arranque (idempotente), no solo en el seed.

### Diferencia con el seed (`prisma db seed`)

- El seed (`prisma/seed.ts` → `seed-admin.ts`) usa **tsx** (devDependency, no está en el
  runner) y además siembra artículos y un usuario de empresa de ejemplo.
- El arranque usa solo código compilado (`dist/`), no requiere tsx ni CLI de Prisma extra:
  es la vía para crear el admin en Railway sin acceso a la BD desde local.

### Cómo probarlo (Railway)

1. Definir `ADMIN_EMAIL` y `ADMIN_PASSWORD` (≥ 12 caracteres) en las variables del servicio.
2. Desplegar/redesplegar; en los logs aparece `"Arranque: administrador inicial creado."` la
   primera vez y `"Arranque: ya existe un administrador; no se crea ninguno nuevo."` después.
3. Login en `/admin/agent-panel.html` (o `/admin/`) con esas credenciales.
4. Opcional: una vez creado, quitar `ADMIN_EMAIL`/`ADMIN_PASSWORD` del entorno (ya no se usan).

### Verificación (salida literal)

`npm run typecheck`: exit 0.

```text
npm notice run chatbot-soporte-backend@0.1.0 typecheck
npm notice run tsc -p tsconfig.build.json --noEmit
```

`npm test`: exit 0.

```text
npm notice run chatbot-soporte-backend@0.1.0 test
npm notice run vitest run

 RUN  v5.0.1 C:/Users/Wilso/Downloads/todo menos ultima fase (en teoria)/prueba/Chatbot-Juan/Chatbot-main


 Test Files  47 passed (47)
      Tests  397 passed (397)
   Start at  23:04:30
   Duration  29.95s (tests 76%, import 15%, transform 8%, worker 1%)
```

Tests nuevos: `src/shared/application/bootstrap-admin.test.ts` (6 casos: faltan var,
contraseña débil, ya existe admin, creación con hash/rol, email en minúsculas, no filtra
contraseña).

## FASE 10 — Recuperar despliegue (Telegram) (Railway)

### Qué se hizo
1. **PLAN.md**: se añadió **Fase 10 — Recuperar despliegue (Telegram)** como **ACTUAL** (Fase 9 sigue **EN CURSO**). Se registró la decisión: **TELEGRAM_SKIP_PHONE_MATCH=true** en este despliegue (vinculación "enlace + credenciales").
2. **Robustez de configuración** (`src/shared/config/validate.ts`):
   - `parseBooleanEnv` ahora acepta `true/false/1/0` (alineado con lo que interpreta `env.ts`).
   - `parsePort` trata `PORT` vacío como no definido (usa por defecto 3000); un `PORT` no numérico o fuera de rango sigue fallando.
   - Nuevos tests vitest: `src/shared/config/config-validation-railway.test.ts` (TRUST_PROXY/REQUIRE_PHONE_MATCH/TELEGRAM_SKIP_PHONE_MATCH con `1/0`, PORT vacío y PORT inválido).
3. **Versión de Node**: comparativa — `Dockerfile` usa `node:20-alpine` (builder/runner), `package.json` `engines.node >=20`, `AGENTS.md` indica "Node.js 20+", `AUDIT.md` menciona "Node.js 24 + ..." en la cabecera (texto descriptivo). Versión real aplicada: **Node 20** (imagen Docker). No se cambia la imagen base ni `AGENTS.md`.
4. **Documentación**: `README-DEPLOYMENT.md` añade sección **"Railway: Telegram + FAQ"** (set mínimo, trampas, Healthcheck Path `/api/health`, registro de webhook con `setWebhook`). `AUDIT.md` actualizado con Fase 10.

### Qué queda
1. **Manual (Railway)**: revisar logs del último deploy, configurar variables con `CHANNEL_MODE=telegram`, `TELEGRAM_SKIP_PHONE_MATCH=true`, `TRUST_PROXY=true`, `PUBLIC_BASE_URL=https://...`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (solo `[A-Za-z0-9_-]`).
2. **Manual (Telegram)**: si cambió el dominio, registrar webhook con el mismo `secret_token` y comprobar `getWebhookInfo`.
3. **Prueba**: mensaje al bot por Telegram → respuesta + conversación visible en el panel.

### Cómo probarlo
- Validación: `npm run typecheck` y `npm test` (ambos deben pasar).
- Configuración mínima Railway (ejemplo): ver `README-DEPLOYMENT.md` → "Railway: Telegram + FAQ".
- Webhook: `POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook` con `url` + `secret_token` idéntico a `TELEGRAM_WEBHOOK_SECRET`.

Nota: el despliegue en Railway no se retomó; se pasa a **Render** (siguiente sección). Los puntos `[OpenCode]` de robustez, versión de Node y documentación quedaron hechos.

## FASE 10 — Despliegue en Render (Blueprint) (EN CURSO)

Contexto: modo **Telegram + FAQ**, sin Ollama ni `COMPANY_DATABASE_URL`. Se despliega en Render con Docker + Postgres de Render. Las cuentas, los secretos y los comandos contra Render/Telegram los gestiona el dueño; aquí solo se preparan los archivos.

### Qué se hizo
1. **render.yaml** (nuevo; primera línea con `$schema`): web service `chatbot-soporte-backend` con `runtime: docker` (usa el `Dockerfile` existente, sin cambios), `region: oregon`, `plan: free`, `healthCheckPath: /api/health`, `autoDeploy: false`. Base Postgres de Render `chatbot-db` (`region: oregon`, `plan: free`) y `DATABASE_URL` vía `fromDatabase` con `property: connectionString` (la conexión interna).
   - Valores fijos: `CHANNEL_MODE=telegram`, `TRUST_PROXY="true"`, `TELEGRAM_SKIP_PHONE_MATCH="true"` (entrecomillados porque el schema solo admite string o número en `value`).
   - `sync: false` (se rellenan en el panel): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
   - No define `WHATSAPP_*`, `OLLAMA_*`, `LLM_*`, `CLOUDFLARE_*`, `COMPANY_*` ni `PORT` (Render lo inyecta). Ningún valor real.
2. **scripts/set-telegram-webhook.ps1** (nuevo): lee `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y `PUBLIC_BASE_URL` de las variables de entorno de la sesión (nunca de `.env`), valida formato, llama a `setWebhook` con `url=<PUBLIC_BASE_URL>/webhooks/telegram` y `secret_token`, y luego a `getWebhookInfo`. Falla con mensaje claro si falta una variable. No imprime el token ni el secreto (los errores muestran solo el estado HTTP). No se ejecutó.
3. **README-DEPLOYMENT.md**: se sustituye la sección Railway por **"Render: Telegram + FAQ"** (pasos del Blueprint, variables a rellenar, healthcheck, uso del script y limitaciones del plan free).
4. **PLAN.md / AUDIT.md**: Fase 10 actualizada con lo hecho, lo pendiente y cómo probarlo.

### Qué queda
1. **[Manual]** Crear el Blueprint en Render desde el repositorio y rellenar las variables `sync: false` en el panel.
2. **[Manual]** Registrar el webhook con `scripts/set-telegram-webhook.ps1` y comprobar `getWebhookInfo`.
3. **[Manual]** Probar: mensaje al bot por Telegram → respuesta y conversación visible en el panel.
4. **[Riesgo]** El Postgres free de Render caduca a los 30 días y solo se permite uno por workspace.

### Cómo probarlo
- YAML: revisado a mano contra `https://render.com/schema/render.yaml.json` y parseado con PyYAML (`YAML OK`). **No** se pudo ejecutar `render blueprints validate` (CLI no instalado en el entorno).
- Healthcheck: `GET /api/health` (público, sin sesión).
- Webhook: `scripts/set-telegram-webhook.ps1` con las variables en la sesión; el script no debe imprimir secretos.

## Preparación para la entrega en servidor de empresa (IA local + BD de empresa)

### Qué se hizo

1. **`scripts/demo-company-db.sql`** (nuevo): BD "de empresa" de demostración en un
   **esquema separado** (`empresa_demo`) con tablas ficticias (`customers`, `orders`),
   las tres vistas del contrato (`v_customer_balance`, `v_orders_status`,
   `v_recent_orders`) y un usuario de **solo lectura** (`GRANT SELECT` únicamente
   sobre las vistas, `REVOKE` sobre las tablas base, `search_path` fijado al
   esquema). La contraseña llega por variable (`-v readonly_password=...`) o por
   entorno (`COMPANY_READONLY_PASSWORD`), nunca escrita en el archivo. Documenta el
   contrato de columnas que la empresa debe mapear.
2. **`docker-compose.company.yml`** (nuevo): app + Postgres (chatbot) + Ollama +
   `migrate` (una sola ejecución, aplica migraciones y siembra el admin), con
   healthchecks, volúmenes (`postgres_data`, `ollama_data`) y un servicio opcional
   `company-demo-db` bajo el perfil `demo` (carga el SQL anterior vía
   `docker-entrypoint-initdb.d`). `.env.company` para las variables.
3. **`docker-compose.company.gpu.yml`** (nuevo): override para GPU NVIDIA
   (`nvidia-container-toolkit`); sin él, Ollama corre en CPU.
4. **`.env.company.example`** (nuevo): plantilla comentada, sin valores reales.
5. **`docs/INSTALACION-EMPRESA.md`** (nuevo): guía de TI — hardware, software, dominio
   HTTPS/puertos, puesta en marcha (CPU y GPU), descarga del modelo, variables,
   registro del webhook de Telegram, usuario de solo lectura, respaldos y
   actualización, incluido el contrato de vistas.
6. **`.gitignore`**: excepción `!.env.company.example` (el `.env.company` real sigue
   ignorado).
7. **`src/modules/chatbot/test/company-db-contract.test.ts`** (nuevo): verifica que
   el SQL real de las herramientas coincide con las vistas/columnas documentadas y
   que el script de demo define esas vistas y otorga SELECT solo sobre ellas.

### Cómo probarlo

- Local: `docker compose up -d db` (o `npm run dev:all`), Ollama en el host
  (`ollama serve` + `ollama pull qwen2.5:7b-instruct`), backend `npm run dev`, y BD
  de demo con `--profile demo` (ver `docs/INSTALACION-EMPRESA.md`, sección 7).
- Empresa: `docker compose -f docker-compose.company.yml --env-file .env.company up -d --build`
  y luego `exec ollama ollama pull <modelo>`.

### Verificación (salida literal)

`npm run typecheck`: exit 0.

```text
npm notice run chatbot-soporte-backend@0.1.0 typecheck
npm notice run tsc -p tsconfig.build.json --noEmit
```

`npm test`: exit 0.

```text
npm notice run chatbot-soporte-backend@0.1.0 test
npm notice run vitest run

 RUN  v5.0.1 C:/Users/Wilso/Downloads/todo menos ultima fase (en teoria)/prueba/Chatbot-Juan/Chatbot-main


 Test Files  48 passed (48)
      Tests  402 passed (402)
   Start at  23:39:47
   Duration  26.76s (tests 74%, import 15%, transform 10%, worker 1%)
```

Nota: no se pudo validar el SQL ni los compose contra Docker/Postgres reales en este
entorno (daemon no disponible); la validación del contrato se hace por test sobre el
SQL de las herramientas y el archivo de demo.


## Puerta de verificación obligatoria (fase en curso, NO cerrada)

### Qué se hizo

Todo contacto **sin sesión vigente** recibe un mensaje estático y **ningún** mensaje
suyo llega a la IA. La puerta está en un solo punto
(`ProcessIncomingMessageUseCase.execute`, `src/bot/application/process-incoming-message.ts`),
que es por donde pasan los tres canales (`/dev/chat`, `/webhooks/whatsapp`,
`/webhooks/telegram` → `HandleInboundMessageUseCase` → `processor.execute`); no existe
ningún endpoint interno que la salte.

- Mensaje estático obligatorio (`UNVERIFIED_REPLY`) + enlace de acceso generado con
  `identity.startLogin(channel, contactId)`.
- La puerta corre **antes** de la transferencia a asesor, de las intenciones de
  identidad, del clasificador y de la base de conocimiento: una pregunta, queja,
  reclamo, petición, PQRS o sugerencia **no** puede saltarse la verificación.
- Sin puerto `identity` la denegación es la regla (fail closed): no hay bypass.
- "Salir" sin sesión → mensaje estático, sin enlace. "Iniciar sesión" con sesión
  vigente → aviso estático de sesión iniciada (sin IA).
- El token **no** se guarda en el historial (se persiste un sustituto), ni en la
  auditoría, ni en los logs (se redacta en los remitentes mock: `redactLoginLinks`).
- **Revocación de sesiones al cambiar el teléfono registrado** (decisión del dueño del
  proyecto, aplicada en esta fase): `UpdateCompanyUserUseCase` revoca **todas** las
  sesiones abiertas del cliente cuando cambia `registeredPhone`. El contacto anterior
  no puede seguir usando la sesión y el cliente debe volver a verificarse.

### Reutilización de enlaces de acceso

`GenerateLoginLinkUseCase` ahora **reutiliza** el enlace vigente del contacto: si
existe uno no usado y no expirado, no se genera un token nuevo **y no se invalida**
el que el usuario ya tiene. Solo se crea otro cuando el anterior expiró, fue
consumido o nunca existió (`findActiveForContact`).

**Limitación conocida (no resuelta por diseño):** `LoginLink` guarda **solo el hash
SHA-256** del token, así que la URL no se puede reconstruir y el enlace **no se puede
reenviar**: si el usuario lo perdió, hay que esperar al vencimiento
(`LOGIN_LINK_TTL_MINUTES`, 10 por defecto) o pedir uno nuevo al expirar. Reenviar la
misma URL exigiría guardar el token en forma recuperable, que es un cambio de
seguridad que NO se hizo:

- **A. Guardar el token en claro en la BD** → habría quetumbar el diseño "solo hash"
  (una filtración de la BD daría enlaces de acceso utilizables). Descartado.
- **B. Guardar el token cifrado (AES-256-GCM) con una clave en `env.ts`** → mantiene la
  propiedad "en la BD no hay tokens en claro", pero exige clave nueva, rotación,
  migración de esquema y migración de los enlaces ya emitidos. Es la opción
  recomendada **si** hace falta el reenvío inmediato.
- **C. Derivar el token de forma determinista (HMAC con secreto del servidor) sobre el
  `id` de `LoginLink`** → permite recomputarlo sin guardarlo en claro, pero cambia la
  semántica de los tokens y añade un secreto global (su rotación invalidaría todos los
  enlaces pendientes).

Pendiente de decisión del dueño del proyecto: **A/B/C o dejarlo como está (B sin
reenvío)**.

### Autorización real del cliente (revisión solicitada)

**Fuente de verdad:** la tabla `company_users` (modelo `CompanyUser`). No existe un
registro de "clientes" aparte: **un cliente ES una cuenta de empresa creada por el
administrador de esa empresa** (`POST /api/company-users`, protegido con sesión de
admin + `requireRole("ADMIN")`). Un contacto se convierte en cliente autorizado solo
si completa `ChatLoginUseCase`, que exige, en este orden: enlace vigente y no usado,
usuario existente, `active = true`, cuenta no bloqueada, contraseña correcta y — si
está activo `REQUIRE_PHONE_MATCH` — coincidencia entre el teléfono del contacto y
`registeredPhone` (excepción en Telegram si `TELEGRAM_SKIP_PHONE_MATCH`). Solo
entonces se crea un `ChatSession` ligado a `(channel, contactId)`.

**Qué se comprueba en CADA mensaje (no solo al iniciar sesión):**
`getActivePrincipal` → `ChatSessionService.getActive` devuelve null (y revoca la
sesión) si la sesión está revocada, vencida por inactividad o por tope absoluto, **si
el dueño está inactivo** (`owner.active === false`) **o si el dueño está bloqueado
temporalmente** (`lockedUntil` vigente, nuevo control de esta fase). Por tanto un
principal no nulo implica: sesión vigente **y** cliente autorizado (cuenta existente,
activa y no bloqueada).

**Limitaciones que no se pueden demostrar con el modelo actual (sin inventar tablas
ni campos):**

1. No existe autorización **por canal**: la misma cuenta sirve para WhatsApp, Telegram
   y web. En Telegram el `contactId` es un `chat.id`, no un teléfono, así que con
   `TELEGRAM_SKIP_PHONE_MATCH=true` la única garantía es "poseer el enlace entregado
   a ese chat + credenciales correctas".
2. No existe autorización **por alcance**: el rol (`USER`/`ADMIN`) solo controla el
   panel de administración; un `ADMIN` no tiene más permisos de datos en el chat que
   un `USER` (la consulta a la BD se limita a las vistas de solo lectura de la BD de
   la empresa).
3. `role = ADMIN` es una cuenta de empresa con permisos de panel; **no** es una
   distinción entre "cliente" y "empleado" de la empresa.

**Hueco 3 de una versión anterior de este documento — cerrado en esta fase:** la
coincidencia de teléfono se exigía solo al iniciar sesión, de modo que cambiar
`registeredPhone` con una sesión abierta la dejaba viva. Ahora, al cambiar
`registeredPhone` se revocan todas las sesiones abiertas del cliente:

- `ChatSessionRepository.revokeAllByCompanyUser(companyUserId, revokedAt)` → una sola
  sentencia (`updateMany`) que revoca todas las sesiones abiertas del cliente; en
  Prisma es atómica para todas sus sesiones.
- `ChatSessionService.revokeByCompanyUser(companyUserId)` → usa el reloj del servicio.
- `UpdateCompanyUserUseCase` compara el teléfono actual con el nuevo y, **si cambia**,
  revoca **antes** de guardar. El orden es deliberado: si la actualización falla
  después, el único efecto es que el cliente tenga que verificarse otra vez; nunca
  queda una sesión viva con un teléfono que ya no le corresponde. Si el teléfono se
  reescribe igual, o se cambian otros campos (nombre, rol, contraseña), **no** se
  revoca nada.
- Se audita con la acción `CHAT_SESSIONS_REVOKED` (motivo `registeredPhone_changed`).
- La desactivación de la cuenta (`active = false`) ya se aplicaba en el siguiente
  mensaje, porque `getActive` comprueba `owner.active` y `owner.lockedUntil`.

### Revisión de permisos reales (encargo de la fase 9)

Comprobación hecha sobre el código, no sobre supuestos. Cada punto indica la regla
**tal como está implementada** y, cuando hace falta una decisión que el código no
puede deducir, la pregunta concreta y la solución mínima.

**1. Qué cuentas pueden usar el chatbot.** Regla actual: **cualquier cuenta de
`company_users` activa y no bloqueada**, con rol `USER` o `ADMIN`. No hay un tipo de
cuenta "cliente": el rol no se comprueba ni al iniciar sesión (`ChatLoginUseCase`
comprueba `active`, `lockedUntil` y la contraseña) ni en la puerta de verificación
(`getActivePrincipal` no mira el rol). Un `ADMIN` de empresa **puede** hablar por el
chat y usar las herramientas de datos (`allowedRoles: ['USER','ADMIN']` en las tres
herramientas).

- **Pregunta (decisión del dueño del proyecto):** ¿una cuenta de empresa con
  `role = ADMIN` (empleado) debe poder abrir sesión de chat como cliente? Hoy puede.
- **Solución mínima propuesta (sin tablas ni campos nuevos):** hacer explícita la
  regla en un único sitio — una constante `CHAT_LOGIN_ALLOWED_ROLES` en
  `src/modules/identity/application/policy.ts` que `ChatLoginUseCase` compruebe al
  iniciar sesión — con el valor actual (`['USER','ADMIN']`) para no cambiar el
  comportamiento, de modo que la decisión sea un cambio de una línea cuando se tome.

**2. Un usuario autenticado solo ve sus datos (y los de su empresa).** Las tres
herramientas filtran **siempre** por el usuario autenticado y nunca por lo que el
modelo pide:

| Herramienta | Filtro |
|---|---|
| `get_customer_balance` | `WHERE customer_id = $1` → `company_users.id` |
| `get_order_status` | `WHERE order_id = $1 AND customer_id = $2` → `company_users.id` |
| `get_recent_orders` | `WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2` → `company_users.id` |

`context.authenticatedUserId` sale **solo** de la sesión de chat
(`session.companyUserId`), nunca del texto del usuario ni de lo que elige el modelo;
los parámetros del modelo se validan con Zod, el SQL es parametrizado y el rol lo
comprueba el **código** (`tool.allowedRoles.includes(session.role)`), no el modelo.
No hay IDOR: un cliente no puede pedir la orden de otro.

**Lo que sí hay que tener en cuenta al instalar (contrato de datos):** el `customer_id`
de la BD de la empresa debe ser **el `id` de `company_users`** (ya está documentado en
`scripts/demo-company-db.sql:38`). Los datos ficticios de demostración usan
`customer_id` = `usr_101` / `usr_102`, que son ids de la tabla antigua `users` y **no**
de `company_users`: por eso, en la demo, un cliente verificado recibe "No encontré
información" en vez de su saldo. El filtro se aplica siempre, así que esto no provoca
una fuga, sino datos de menos.

- **Pregunta:** ¿la empresa va a poblar sus vistas con `company_users.id` o va a
  mapear su código de cliente propio? Si usa su propio código, hace falta una
  columna en `company_users` (o una tabla de correspondencia).
- **Solución mínima propuesta:** sin cambios de código, alinear los datos de la
  empresa con el contrato ya documentado; si la empresa usa otro código, añadir una
  columna `externalCustomerId` a `company_users` y usarla como `customer_id`
  (sería un cambio de esquema con migración versionada).

**3. Funcionalidades de PQRS.** **No existen.** En el repositorio no hay tablas,
casos de uso ni rutas de PQRS (`grep` de `pqrs|petición|reclamo|queja|sugerencia`
solo encuentra comentarios y los textos bloqueados del test de verificación). Lo que
existe hoy:

- Un mensaje de tipo PQRS **sin sesión** lo bloquea la puerta de verificación
  (mensaje estático + enlace), igual que cualquier otro mensaje.
- Un mensaje de tipo PQRS **con sesión** pasa al clasificador; según la intención
  detectada se responde por IA o se transfiere a un asesor
  (`TransferToHumanUseCase`), que crea un `Ticket` **idempotente por conversación**
  (`CreateTicketUseCase` devuelve el ticket abierto si ya existe).
- Los tickets y las conversaciones **no** son consultables por el cliente del chat:
  `/api/conversations` y `/api/agent` exigen sesión de administrador o asesor
  (`requireRole("ADMIN", "AGENT")`) y el cliente del chat no tiene ese tipo de
  sesión (su identidad vive en `company_users`, no en `admin_users`).
- **Pregunta:** ¿la empresa quiere que el cliente del chat pueda consultar el estado
  de su radicado (PQRS)? Hoy no puede.
- **Solución mínima propuesta:** exponer en el chat una herramienta de solo lectura
  (`get_my_tickets`) con el mismo patrón de aislamiento (`WHERE conversation_id IN
  (...) AND user_id = $1`), sin tocar el panel.

**4. Qué garantiza realmente la vinculación en Telegram.** Lo verificado:

- El `contactId` de Telegram es `String(chat.id)` (id numérico del chat), **no** un
  teléfono y **no** el `@username`; `message.from.username` se recibe pero no se usa.
- La **única** vinculación entre la cuenta de Telegram y la cuenta de empresa es el
  `ChatSession` que se crea tras un login correcto: possession del enlace entregado a
  ese chat + usuario existente + `active` + no bloqueado + contraseña correcta (y
  coincidencia de teléfono si `REQUIRE_PHONE_MATCH`).
- El webhook de Telegram valida el `secret_token` con comparación en tiempo constante
  y falla cerrado (401), limita por IP y por chat, y deduplica `update_id`.
- **Con los valores por defecto en producción** (`REQUIRE_PHONE_MATCH` sin definir =
  `true`; `TELEGRAM_SKIP_PHONE_MATCH` sin definir = `false`), el login de Telegram
  **nunca** funciona: el `chat.id` numérico tendría que coincidir con
  `registeredPhone`. La empresa debe registrar el `chat.id` como teléfono del cliente
  **o** poner `TELEGRAM_SKIP_PHONE_MATCH=true` (con lo que la garantía se reduce a
  "enlace + credenciales").
- **Pregunta:** ¿la empresa registra el `chat.id` como teléfono o activa la excepción
  de Telegram? Debe elegirse una de las dos al instalar.
- **Solución mínima propuesta:** es configuración, no código: documentar en el manual
  de instalación que `TELEGRAM_SKIP_PHONE_MATCH=true` **debilita** la vinculación
  (el enlace + la contraseña siguen siendo la garantía) y que la alternativa fuerte
  es registrar el `chat.id` como `registeredPhone`.

**5. Denegación por defecto.** Verificado en los tres puntos de entrada:

- Puerta de verificación: sin puerto `identity` o sin principal vigente, el mensaje
  es estático y **no** hay llamada a IA.
- Herramientas: `getAllForRole` vacía → "No tienes permisos…"; y aunque el modelo
  elija una herramienta prohibida para su rol, el **código** lo rechaza.
- API: `createRequireSession` exige sesión de administrador en todo `/api/*`, salvo
  `GET /api/health`, `POST /api/identity/login` y
  `GET /api/identity/login-link/:token` (públicos por necesidad; el último solo
  devuelve canal, `contactId` y el contacto enmascarado, nunca el usuario).

**6. Cada mensaje pasa por la puerta antes de cualquier IA o herramienta costosa.**
Verificado en el orden real de `ProcessIncomingMessageUseCase.execute`:
`findOrCreateUser` → `startConversation` → `sendMessage` (persiste el mensaje) →
estado de la conversación → **puerta de verificación** → `isHumanRequest` (palabras
clave, sin IA) → intenciones de identidad → **clasificador (Ollama)** → base de
conocimiento → consultas a la BD de la empresa. Antes de la puerta solo hay llamadas
a la BD propia, ninguna a un modelo. El `BotpressBrain` está dentro del
`CompositeKnowledgeRepository`, es decir, también queda detrás de la puerta.

### Cómo probarlo

- `npm run typecheck` y `npm test`.
- Test dedicado: `src/bot/application/process-incoming-message.verification.test.ts`
  (mensaje exacto, enlace, **0 llamadas** a clasificador/consulta/KB, 3 canales,
  complaints/PQRS, "quiero hablar con una persona", fail closed sin `identity`).
- Reutilización: `src/modules/identity/tests/login-link.test.ts` (reutiliza, no
  invalida, crea tras expirar o consumirse, no reutiliza entre canales).
- Autorización: `src/modules/identity/tests/chat-session-service.test.ts` (usuario
  inactivo y usuario bloqueado invalidan la sesión; bloqueo vencido no).
- Cambio de teléfono: `src/modules/identity/tests/company-user-use-cases.test.ts`
  (revoca las sesiones al cambiar el teléfono, **no** al cambiar otros datos ni al
  reescribir el mismo teléfono, auditoría de la revocación) y
  `src/modules/identity/tests/phone-change-revocation.test.ts` (integración con la
  puerta: el contacto anterior pierde la sesión, su siguiente mensaje vuelve al
  mensaje estático sin llamar a la IA, y el cliente puede volver a verificarse).

### Verificación (salida literal)

`npm run typecheck`: exit 0.

```text
npm notice run chatbot-soporte-backend@0.1.0 typecheck
npm notice run tsc -p tsconfig.build.json --noEmit
```

`npm test`: exit 0.

```text
 Test Files  51 passed (51)
      Tests  427 passed (427)
   Start at  13:08:27
   Duration  42.80s (tests 67%, transform 18%, import 14%, worker 1%)
```

---

## Proveedor de IA en la nube para pruebas: Cloudflare Workers AI (Fase 5, incremento)

Estado: **implementado y probado**. No cierra ninguna fase (la Fase 9 sigue en
curso). La IA local (Ollama) **sigue siendo** el proveedor por defecto y el de
producción en la empresa.

### Qué se hizo

1. `AGENTS.md` §5.1: la IA local sigue siendo la regla. `LLM_PROVIDER=cloudflare`
   es **exclusivamente** para pruebas con datos ficticios, con el riesgo de
   terceros anotado (el prompt, el texto del usuario y los datos de la BD salen
   del servidor de la empresa hacia Cloudflare) y la prohibición de registrar
   prompts, respuestas o token.
2. `CloudflareLlmProvider` (`src/modules/chatbot/infrastructure/cloudflare-llm-provider.ts`):
   `fetch` nativo (sin librerías nuevas) contra
   `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{LLM_MODEL}`
   con `Authorization: Bearer <CLOUDFLARE_API_TOKEN>`, timeout con
   `LLM_TIMEOUT_MS` (AbortController), errores controlados (código HTTP + código
   de error traducido, sin el contenido enviado/recibido ni el token) y parseo
   tolerante de JSON (quita fences ```` ```json ````; si el JSON es inválido
   lanza error y el bot transfiere a asesor).
3. `createLlmProvider` (`src/modules/chatbot/infrastructure/create-llm-provider.ts`):
   selecciona el adaptador según `LLM_PROVIDER`; con `cloudflare` y credenciales
   incompletas falla al arrancar (fail fast) en vez de fallar en cada mensaje.
4. Variables nuevas solo en `env.ts`, `.env.example` y `validate.ts`:
   `LLM_PROVIDER` (`ollama` por defecto | `cloudflare`), `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_API_TOKEN` y `LLM_MODEL`. Con `LLM_PROVIDER=cloudflare` las tres
   son obligatorias (en producción y en desarrollo). Con `ollama` nada cambia.
5. `main.ts`: dentro del bloque `phase5` se elige el adaptador según
   `LLM_PROVIDER`; el log de arranque muestra el proveedor (nunca el token).
6. `QueryDataUseCase`: los datos de la BD se envían al modelo delimitados en
   `<data>` y el texto del usuario en `<user_data>`, con la regla explícita de
   que ambos son DATOS y nunca instrucciones. El modelo sigue recibiendo
   **solo** lo que devolvió la herramienta autorizada para el usuario de la
   sesión (y el `customer_id` siempre sale de la sesión, nunca del texto).

### Archivos

- Nuevos: `src/shared/config/llm-provider.ts`,
  `src/modules/chatbot/infrastructure/cloudflare-llm-provider.ts`,
  `src/modules/chatbot/infrastructure/create-llm-provider.ts`,
  `src/shared/config/llm-provider.test.ts`,
  `src/modules/chatbot/test/cloudflare-llm-provider.test.ts`.
- Modificados: `AGENTS.md`, `.env.example`, `src/shared/config/env.ts`,
  `src/shared/config/validate.ts`, `src/main.ts`,
  `src/modules/chatbot/domain/llm-provider.ts` (nuevo `maxTokens` opcional),
  `src/modules/chatbot/application/query-data-use-case.ts` (delimitación de
  datos), `AUDIT.md`.

### Cómo probarlo

- `npm run typecheck` y `npm test`.
- Test del proveedor: `src/modules/chatbot/test/cloudflare-llm-provider.test.ts`
  (éxito, `response_format` en modelos con JSON Mode, instrucción JSON + parseo
  tolerante en los que no lo tienen, JSON inválido, clasificador que deriva en
  `PEDIR_HUMANO`, timeout, token ausente, 429 de cuota diaria sin filtrar token
  ni prompt, respuesta ilegible, error de red y selección de proveedor).
- Test de configuración: `src/shared/config/llm-provider.test.ts` (valor por
  defecto `ollama`, inválido, y `validateConfig` exigiendo las tres variables con
  `cloudflare`).
- Prueba manual (SOLO datos ficticios): `LLM_PROVIDER=cloudflare`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` y `LLM_MODEL` en el entorno;
  con `COMPANY_DATABASE_URL` apuntando a la BD de demo. Sin credenciales, la
  aplicación no arranca (fail fast).

### Verificación (salida literal)

`npm run typecheck`: exit 0.

```text
npm notice run chatbot-soporte-backend@0.1.0 typecheck
npm notice run tsc -p tsconfig.build.json --noEmit
```

`npm test`: exit 0.

```text
 Test Files  53 passed (53)
      Tests  451 passed (451)
   Start at  14:00:27
   Duration  19.45s (tests 73%, transform 19%, import 7%, worker 1%)
```

### Riesgos / pendientes

- El proveedor Cloudflare envía el prompt y los datos a un tercero: solo con
  datos ficticios. Antes de usarlo con datos reales hay que decidir con el
  dueño (tratamiento de datos, contrato, normativa aplicable).
- La cuota gratuita de Workers AI es de 10.000 neuronas/día (se agota rápido):
  cuando se agota, la API responde 429 (código 3036) y el bot transfiere a
  asesor sin caerse.
- Sigue pendiente la decisión ya anotada en `PLAN.md` (Fase 9) sobre el
  mapeo `customer_id` entre `company_users.id` y la BD de la empresa.

---

## Mapeo `customer_id`: código de cliente de la BD de la empresa (Fase 9, decisión 2 tomada)

Estado: **implementado y probado**. Cierra la decisión nº 2 de la revisión de
permisos ("¿la empresa va a poblar sus vistas con `company_users.id` o va a mapear
su código de cliente propio?"). La Fase 9 sigue en curso por las otras tres
decisiones (rol `ADMIN` en el chat, PQRS en el chat y configuración de Telegram).

### Qué se hizo

**Decisión del dueño del proyecto:** la empresa usa **su propio código de cliente**
(en la BD de prueba de Lázaro Software: `CLI-000123`), NO el `id` interno del bot.
Se añadió por eso una columna propia y única en `company_users`.

1. **Esquema (migración versionada `0006_company_user_customer_id`)**:
   `CompanyUser.companyCustomerId String? @unique`. Es única (dos cuentas de empresa
   no pueden apuntar al mismo cliente) y admite varios `NULL` (clientes aún no
   vinculados). El índice único de la base de datos es la garantía final.
2. **Dominio** (`src/modules/identity/domain/customer-code.ts`): patrón de
   validación (por defecto `^[A-Z0-9][A-Z0-9_-]{1,31}$`), normalización a
   mayúsculas y recorte, longitud máxima 32 y resultado tipado
   (`empty` | `too_long` | `format`). Si el patrón configurado no es una expresión
   regular válida se usa el de por defecto (un patrón mal puesto no deja sin poder
   asignar códigos) y `validateConfig` avisa de la incidencia.
3. **Aplicación** (`src/modules/identity/application/company-customer-code.ts`):
   `resolveCompanyCustomerId()` valida, normaliza y comprueba que el código esté
   libre; devuelve `CompanyCustomerIdTakenError` (409) si ya está asignado a **otro**
   usuario e `InvalidCompanyCustomerIdError` (400) si el formato no vale.
4. **Casos de uso**: `CreateCompanyUserUseCase` y `UpdateCompanyUserUseCase` aceptan
   `companyCustomerId` (en `Update`, `null` o "" **quita** el vínculo). Solo un
   ADMIN llega a ellos (`requireRole("ADMIN")` en la API y sesión de admin en el
   panel).
5. **Panel** (`public/admin/identity.html` + `identity.js`): campo "Código de
   cliente" al crear y al editar un usuario; la lista muestra el código o
   "sin vinculado".
6. **Propagación a la sesión**: `ChatSessionOwner.companyCustomerId` →
   `getActivePrincipal` → `ChatSessionPrincipal.companyCustomerId` →
   `DataQuerySession.companyCustomerId`. El código sale **siempre** de la sesión,
   nunca del texto del usuario ni de lo que elige el modelo.
7. **Herramientas** (`ToolContext`): `companyCustomerId` sustituye a
   `authenticatedUserId`. Las tres herramientas filtran igual que antes, pero ahora
   por el **código de cliente**:
   - `get_customer_balance` → `WHERE customer_id = $1`
   - `get_order_status` → `WHERE order_id = $1 AND customer_id = $2`
   - `get_recent_orders` → `WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`
8. **Cliente sin vincular → denegación sin IA**: `QueryDataUseCase.execute` comprueba
   el código **antes de cualquier llamada al modelo** y responde con un texto fijo
   (`CUSTOMER_NOT_LINKED_REPLY`), sin herramienta, sin SQL y **sin transferencia a
   asesor**. La auditoría registra que el vínculo existe o no, **nunca el valor**
   del código.
9. **Auditoría**: acción `COMPANY_CUSTOMER_ID_CHANGED` con
   `metadata.assigned = true|false` (sin el código), y `COMPANY_USER_CREATED` con
   `metadata.companyCustomerIdAssigned`. El valor del código no se escribe en la
   auditoría ni en los logs.
10. **BD de prueba de Lázaro Software** (`scripts/lazaro-test-db/`): scripts
    adaptados del paquete original (esquema sin `DROP`, datos ficticios, las tres
    vistas del chatbot y el rol de solo lectura con `GRANT SELECT` únicamente
    sobre esas vistas). El volcado de 22 MB no se integra: los scripts regeneran
    los mismos datos. **Todos los datos son ficticios** (se generan con
    `random()`).

### Archivos

- Nuevos: `prisma/migrations/0006_company_user_customer_id/migration.sql`,
  `src/modules/identity/domain/customer-code.ts`,
  `src/modules/identity/application/company-customer-code.ts`,
  `src/modules/identity/tests/company-customer-id.test.ts`,
  `src/shared/config/customer-id-pattern.test.ts`,
  `scripts/lazaro-test-db/` (`README.md`, `01-esquema.sql`, `02-datos.sql`,
  `03-vistas-chatbot.sql`, `04-roles-lectura.sql`, `cargar.sh`).
- Modificados: `prisma/schema.prisma`, `src/modules/identity/domain/entities/company-user.ts`,
  `src/modules/identity/domain/entities/chat-session.ts`,
  `src/modules/identity/domain/repositories/company-user-repository.ts`,
  `src/modules/identity/infrastructure/prisma-company-user-repository.ts`,
  `src/modules/identity/infrastructure/prisma-chat-session-repository.ts`,
  `src/modules/identity/application/errors.ts`,
  `src/modules/identity/application/validation.ts`,
  `src/modules/identity/application/use-cases/create-company-user.ts`,
  `src/modules/identity/application/use-cases/update-company-user.ts`,
  `src/modules/identity/presentation/company-user-controller.ts`,
  `src/modules/identity/index.ts`, `src/modules/identity/tests/in-memory-identity-repository.ts`,
  `src/bot/application/process-incoming-message.ts`,
  `src/modules/chatbot/application/query-data-use-case.ts`,
  `src/modules/chatbot/tools/tool-registry.ts` y las tres herramientas,
  `src/shared/config/env.ts`, `src/shared/config/validate.ts`, `src/main.ts`,
  `.env.example`, `public/admin/identity.html`, `public/admin/identity.js`.

### Cómo probarlo

- `npm run typecheck` y `npm test`.
- `src/modules/identity/tests/company-customer-id.test.ts`: formato y normalización,
  rechazo de formato inválido, código repetido (409), reasignación al mismo
  usuario, `null` quita el vínculo, la auditoría **no** guarda el valor del código y
  el código viaja a la sesión de chat.
- `src/modules/chatbot/test/phase5.test.ts` (tests 9 y 10): cliente sin vincular →
  respuesta fija **sin llamadas al modelo ni a la BD**; con cliente vinculado el
  filtro es el código de la sesión.
- `src/modules/chatbot/test/company-db-contract.test.ts`: las tres herramientas
  filtran por el código de cliente y el SQL sigue sin esquema cualificado.
- `src/shared/config/customer-id-pattern.test.ts`: patrón por defecto, patrón
  configurado y patrón inválido (incidencia en `validateConfig`).
- Carga de la BD de prueba: `bash scripts/lazaro-test-db/cargar.sh` (ver el README
  de esa carpeta) y, en el panel, asignar `CLI-000123` a un usuario.

### Riesgos / pendientes

- **El clasificador de intención se ejecuta antes** de la denegación por falta de
  código: la ruta de *consulta de datos* no llama al modelo (cero inferencias),
  pero el botón de "clasificación" que decide si el mensaje es una consulta, una
  FAQ o una PQRS sí se ejecuta. Denegar antes del clasificador impediría las FAQ a
  los clientes sin vincular. Si se quiere **cero IA** también en ese punto, hay que
  decidirlo (implicaría quitar las FAQ a los clientes sin código).
- La migración `0006` hay que aplicarla en el servidor (`npm run prisma:deploy`)
  antes de arrancar la versión nueva.
- Sigue pendiente del dueño: la carga de la BD de prueba en el segundo servicio
  Postgres de Railway (el `COMPANY_DATABASE_URL` concreto) y la decisión de qué
  cuentas de la demo quedan vinculadas a qué `CLI-XXXXXX`.

## Fase 12 — Aviso de transferencia a asesor

Fecha: 2026-10-23.

### Qué se hizo

1. El mensaje de espera ahora informa explícitamente: «Tu conversación fue
   transferida a un asesor. Te responderá por este chat en cuanto esté disponible».
   Se actualizó el valor por defecto y el ejemplo `HANDOFF_WAIT_MESSAGE`.
2. El flujo común de transferencia usa el mismo aviso tanto con agente asignado como
   cuando el caso queda en cola. Se mantiene la entrega por el canal de origen; en
   Telegram el aviso conserva el envío con menú y controles de espera existentes.
3. La espera posterior conserva su recordatorio independiente y no vuelve a anunciar
   una transferencia nueva. No se modificó la base de conocimiento ni la lógica de
   respuesta del bot.
4. Se añadieron/ajustaron pruebas para verificar aviso antes de la respuesta del
   asesor en WEB, WhatsApp y Telegram, recordatorio sin repetir el aviso, mensaje de
   cola y entrega del aviso en el flujo real del chat web.

### Cómo probarlo

- `npm run typecheck`
- `npm test`
- Prueba manual tras desplegar: desde cada canal habilitado, solicitar un asesor o
  provocar una transferencia; comprobar que llega el aviso explícito. Enviar después
  un mensaje desde el panel y comprobar que el aviso precede a la respuesta humana.

### Verificación (salida literal)

`npm run typecheck`:

```text
> chatbot-soporte-backend@0.1.0 typecheck
> tsc -p tsconfig.build.json --noEmit
```

`npm test`:

```text
> chatbot-soporte-backend@0.1.0 test
> vitest run


 RUN  v5.0.1 D:/LazaroV2/Lazaro


 Test Files  70 passed (70)
      Tests  566 passed (566)
   Start at  09:24:43
   Duration  82.64s (tests 59%, transform 22%, import 18%, worker 1%)

    Isolate  70 workers spawned · ~848ms startup each (spawn + environment, per file)
             at least ~18.94s faster with isolate: false — reuses workers across files instead of one per file
```

### Qué queda

- Publicar esta versión en Render y hacer la prueba manual del aviso por Telegram.
