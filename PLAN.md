# PLAN.md — Chatbot empresarial con IA local

Tres funciones: (1) preguntas frecuentes configurables desde un panel, (2) consulta
a la BD de la empresa en lenguaje natural solo para usuarios autenticados, (3)
transferencia a un asesor humano que responde desde un panel web.

Reglas: ver `AGENTS.md`. Se trabaja UNA fase a la vez.

Este archivo se mantiene corto: las fases cerradas ocupan una línea. El texto completo
de cada fase cerrada está en el historial de git (`git show 148071d:PLAN.md`).

## Estado

**Ninguna fase está marcada como ACTUAL.** La última cerrada es la Fase 12. No se
empieza otra hasta que el dueño confirme cuál sigue.

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Canal web simulado (sin WhatsApp) + repositorio | COMPLETADA |
| 1 | Seguridad base | COMPLETADA |
| 2 | Panel de preguntas frecuentes | COMPLETADA |
| 3 | Tickets y asesor (panel web) | COMPLETADA |
| 4 | Login de usuarios de la empresa (enlace web aparte del chat) | COMPLETADA |
| 5 | IA local + consultas a la BD | COMPLETADA |
| 6 | Despliegue en el servidor de la empresa | COMPLETADA |
| 7 | WhatsApp real | **PENDIENTE** (no hay número todavía) |
| 8 | Canal Telegram (webhook de la Bot API) | COMPLETADA |
| 9 | Puerta de verificación obligatoria | **BLOQUEADA** por decisiones del dueño |
| 10 | Despliegue en Railway | ABANDONADA (se pasó a Render) |
| 11 | Despliegue en Render (Blueprint) | **OPERATIVA**, falta el cierre formal |
| 12 | Aviso de transferencia a asesor | COMPLETADA, falta comprobarla desplegada |

Todavía no hay número de WhatsApp: todo se desarrolla y prueba con el chat web
simulado y con Telegram. WhatsApp se conecta al final como un adaptador más.

## Fases cerradas (resumen)

- **0 — Canal web y repositorio.** Puerto `ChannelAdapter`, `WebChatAdapter`,
  `WhatsAppAdapter`, rutas `/dev/chat` con teléfonos ficticios, `CHANNEL_MODE`.
  Repositorio: `https://github.com/Johanx66/Lazaro`.
- **1 — Seguridad base.** Hash argon2id (`PasswordHasher`), `AdminUser` con roles
  ADMIN/AGENT, login con cookie httpOnly, `/api/*` protegido por sesión y rol (menos
  `/api/health`), CORS por `ALLOWED_ORIGINS`, rate-limit y bloqueo tras 5 fallos, firma
  `X-Hub-Signature-256` en el webhook de WhatsApp.
- **2 — Panel de FAQ.** CRUD en `public/admin/`, búsqueda que normaliza tildes y
  devuelve confianza (`FAQ_MIN_CONFIDENCE`); los cambios aplican sin reiniciar.
- **3 — Tickets y asesor.** Transferencia con ticket, panel del asesor, ventana de 24 h
  de WhatsApp, `TRANSFER_AFTER_MISSES`; el bot calla si hay asesor.
- **4 — Identidad.** `CompanyUser`, `LoginLink` (solo hash, 10 min, un uso),
  `ChatSession` (20 min de inactividad, 8 h máximo), página `/login`,
  `REQUIRE_PHONE_MATCH`, "salir" revoca la sesión.
- **5 — IA local y consultas.** `LlmProvider` con Ollama, clasificador de intención
  validado con zod, herramientas con consultas parametrizadas en
  `modules/chatbot/tools/`, BD de la empresa de solo lectura (`COMPANY_DATABASE_URL`),
  aislamiento por usuario desde la sesión. Cloudflare Workers AI solo para pruebas con
  datos ficticios.
- **6 — Despliegue en la empresa.** `Dockerfile`, `docker-compose*.yml`,
  `README-DEPLOYMENT.md`, `docs/INSTALACION-EMPRESA.md`, respaldos.
- **8 — Telegram.** `TelegramAdapter`, `POST /webhooks/telegram` con secreto y dedupe,
  variables `TELEGRAM_*`.
- **10 — Railway.** No se retomó; el despliegue vigente es Render (Fase 11).
- **12 — Aviso de transferencia.** El mensaje anuncia la transferencia por el canal de
  origen; la espera posterior usa un recordatorio distinto.

## Fases abiertas

### FASE 7 — WhatsApp real (cuando haya número)

1. Activa `WhatsAppAdapter` con `CHANNEL_MODE=whatsapp` o `both`.
2. Las variables de WhatsApp las pongo yo en `.env`; el agente no lo toca.
3. Prueba el mismo flujo de las fases anteriores por WhatsApp.
4. Confirma que el webhook rechaza peticiones sin firma válida.
5. Para la Callback URL en el portal de Meta: con túnel de desarrollo la URL cambia en
   cada arranque; en producción usa el dominio fijo con HTTPS.

**Criterio:** todo lo probado en el chat web funciona igual por WhatsApp.

### FASE 9 — Puerta de verificación obligatoria (bloqueada por decisiones)

Hecho: todo contacto sin sesión vigente recibe el mensaje estático y el enlace de
acceso, y ningún mensaje suyo llega a la IA. La puerta está en
`ProcessIncomingMessageUseCase.execute` (los tres canales); sin módulo de identidad se
deniega. Se reutiliza el enlace vigente; el token nunca queda en historial, auditoría
ni logs. Cambiar el `registeredPhone` revoca las sesiones abiertas.

Decidido por el dueño:

1. **Reenvío de enlaces:** se mantiene "solo hash"; el enlace no se reenvía, se espera
   al TTL (10 min).
2. **Código de cliente:** la empresa usa su propio código. Columna única
   `company_users.companyCustomerId` (migración `0006`), asignada por el ADMIN en el
   panel; las herramientas filtran por ese código, que sale de la sesión. Sin código no
   hay consulta de datos. BD de prueba ficticia en `scripts/lazaro-test-db/`.

Pendiente de mi decisión:

1. **Rol en el chat:** hoy una cuenta de empresa con `role = ADMIN` puede hablar por el
   chat como cliente. Si no debe poder, la regla mínima es un solo punto de comprobación
   (`CHAT_LOGIN_ALLOWED_ROLES` en `policy.ts`), sin tocar el esquema.
2. **PQRS en el chat:** el cliente no puede consultar su radicado. Si debe poder, la vía
   mínima es una herramienta de solo lectura aislada por `user_id`.
3. **Telegram:** con los valores por defecto de producción el login no puede funcionar
   (el `chat.id` tendría que coincidir con `registeredPhone`). Hay que registrar el
   `chat.id` como teléfono o activar `TELEGRAM_SKIP_PHONE_MATCH=true`, que debilita la
   vinculación a "enlace + credenciales". En Render se usa `true`.

**Criterio:** ningún mensaje de un contacto sin verificar genera llamadas a la IA, en
ningún canal, y el enlace se entrega una sola vez mientras siga vigente. La fase no se
cierra hasta decidir lo anterior.

### FASE 11 — Despliegue en Render (operativa)

Modo Telegram + FAQ, sin Ollama ni `COMPANY_DATABASE_URL`, con `render.yaml`
(Docker + Postgres `plan: free`, `autoDeploy: false`) y
`scripts/set-telegram-webhook.ps1`. Las cuentas, los secretos y los comandos contra
Render y Telegram los gestiona el dueño. El dueño confirmó que el bot funciona por
Telegram.

Pendiente para el cierre formal:

1. Que el dueño dé por cerrada la fase (el resultado de typecheck y tests está en
   `AUDIT.md`).
2. Decidir si se mantiene el Postgres free de Render, que caduca a los 30 días.

### FASE 12 — Aviso de transferencia (falta comprobarla desplegada)

Pendiente: desplegar esta versión en Render y comprobar a mano el aviso en Telegram.
