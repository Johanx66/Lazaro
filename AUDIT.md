# AUDIT.md — Estado actual del proyecto

Este archivo describe solo el estado VIGENTE: qué hay, cómo probarlo y qué queda. Al
cerrar una fase se actualiza; no se acumula historial ni se pegan salidas completas.

El historial detallado por fase (1.260 líneas, con las salidas literales de cada cierre)
está en git: `git show 148071d:AUDIT.md`.

## Última verificación

2026-11-15, sobre el commit `148071d`:

- `npm run typecheck`: sin errores.
- `npm test`: 70 archivos, 571 tests, todos pasan.
- Arranque en limpio con `npm run dev:all`: migraciones y seed aplicados,
  `/api/health` responde `"database":"connected"`.

## Qué hay

Backend en Node.js 20+, TypeScript, Express 5 y Prisma 7 sobre PostgreSQL, organizado en
capas `domain / application / infrastructure / presentation`.

- **Canales** por el puerto `ChannelAdapter`: chat web simulado, WhatsApp (sin número
  real todavía) y Telegram.
- **FAQ** administrables desde `public/admin/`, con transferencia a asesor y panel de
  atención.
- **Identidad**: login web aparte del chat, sesiones de chat y puerta de verificación
  obligatoria antes de cualquier uso de IA.
- **IA**: Ollama local por defecto; Cloudflare Workers AI solo para pruebas con datos
  ficticios. Consultas a la BD de la empresa mediante herramientas predefinidas y
  parametrizadas, filtradas por el código de cliente de la sesión.
- **RAG para PQRS**: experimental y apagado por defecto (`RAG_ENABLED=false`).
- **Despliegue**: Docker para el servidor de la empresa y Blueprint de Render
  (Telegram + FAQ).

El estado de cada fase está en `PLAN.md`.

## Cómo probarlo

| Qué | Dónde está explicado |
|---|---|
| Abrirlo en un computador (base local embebida) | `README.md` |
| Instalarlo en el servidor de una empresa | `docs/INSTALACION-EMPRESA.md` y `README-DEPLOYMENT.md` |
| Render + Telegram | `README-DEPLOYMENT.md` → "Render: Telegram + FAQ" |
| BD de prueba de la empresa (datos ficticios) | `scripts/lazaro-test-db/README.md` |

## Qué queda

1. Fase 7: WhatsApp real, cuando haya número.
2. Fase 9: tres decisiones del dueño (rol ADMIN en el chat, PQRS en el chat, vinculación
   en Telegram). Detalle en `PLAN.md`.
3. Fase 11: cierre formal y decisión sobre el Postgres free de Render.
4. Fase 12: desplegar en Render y comprobar a mano el aviso de transferencia en Telegram.

## Deuda técnica y riesgos conocidos

1. **Identidad por canal:** el `chat.id` de Telegram se guarda en `User.phone`. La misma
   persona en WhatsApp y Telegram genera dos usuarios distintos.
2. **`TELEGRAM_SKIP_PHONE_MATCH=true`** desactiva la coincidencia de teléfono solo en
   Telegram; el acceso sigue exigiendo usuario, contraseña y enlace de un solo uso. Por
   defecto es `false`; en Render está en `true`.
3. **Sin prueba automática de extremo a extremo** contra la Bot API de Telegram; la
   validación en Render fue manual.
4. **Rate-limit en memoria** (una sola instancia). Con varias réplicas hace falta un
   almacén compartido.
5. **Cloudflare Workers AI** envía el prompt y los datos a un tercero: solo con datos
   ficticios. La cuota gratuita se agota rápido; al agotarse responde 429 y el bot
   transfiere a asesor.
6. **El clasificador de intención se ejecuta antes** de denegar por falta de código de
   cliente. Denegar antes quitaría las FAQ a los clientes sin vincular; es una decisión
   pendiente si se quiere cero IA también ahí.
7. **Postgres free de Render** caduca a los 30 días y solo se permite uno por workspace.
8. **Migraciones:** en cada servidor hay que ejecutar `npm run prisma:deploy` antes de
   arrancar una versión nueva (hoy hay 7 migraciones).
9. **Botpress** sigue en el código en modo MOCK; el punto "retirar Botpress si ya no se
   usa" de la Fase 6 no se hizo.
10. **Seed PQRS:** de los 1.000 artículos, 647 quedan inactivos para revisión (exigen
    asesor o tienen marcadores `{{...}}` sin rellenar).
11. **`npm run dev:all`** usa `@electric-sql/pglite`, que hoy llega como dependencia
    indirecta de `prisma` y no está declarada en `package.json`.
