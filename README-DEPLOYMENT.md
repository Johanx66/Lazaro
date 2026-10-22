Guía de Despliegue e Infraestructura en Producción

Este documento contiene las instrucciones paso a paso para desplegar el sistema de Chatbot en un entorno de producción (servidor Linux/Ubuntu) utilizando Docker, Nginx como Proxy Inverso, certificado SSL con Let's Encrypt y respaldos automáticos.

1. Requisitos Previos en el Servidor

Sistema Operativo: Ubuntu Server 22.04 LTS o superior.

Servicios: Docker Engine (v24.0+) y Docker Compose (v2+).

Red: Un nombre de dominio (ejemplo: chatbot.empresa.com) apuntando a la IP pública del servidor en los registros DNS (A Record).

Puertos Abiertos (Firewall/UFW):

80/tcp (HTTP)

443/tcp (HTTPS)

22/tcp (SSH)

2. Preparación del Entorno

Clonar el repositorio en el servidor de destino:

cd /var/www
git clone <URL_DEL_REPOSITORIO> chatbot
cd chatbot


Crear y configurar las variables de entorno de producción:

cp .env.example .env
nano .env


Asegúrate de ajustar las contraseñas, tokens de producción, claves HMAC de WhatsApp y URLs.

3. Despliegue con Docker Compose

Construir e iniciar todos los contenedores en segundo plano:

docker compose up -d --build


Verificar el estado de los contenedores:

docker compose ps


Descargar el modelo de Lenguaje en la instancia local de Ollama:

docker exec -it chatbot_ollama ollama pull qwen2.5:7b-instruct


Aplicar migraciones y cargar datos iniciales (Seed):

El servicio `migrate` (definido en docker-compose.yml) aplica las migraciones y ejecuta el seed
automáticamente antes de arrancar la app; `docker compose up -d --build` ya lo hace. Si lo necesitas
manualmente, se ejecuta desde el stage de construcción (tiene la CLI de Prisma y tsx):

docker compose run --rm migrate

Para sembrar un usuario de empresa de EJEMPLO (login del chat), define en `.env`
COMPANY_SEED_USERNAME, COMPANY_SEED_PASSWORD (mínimo 12 caracteres), COMPANY_SEED_DISPLAY_NAME y
COMPANY_SEED_PHONE antes del seed. Nunca uses credenciales reales.

3b. Base de datos de la empresa (Fase 5, solo lectura)

Las consultas de datos (saldo, estado de pedidos...) usan una conexión PostgreSQL de SOLO LECTURA
a la base de la empresa, distinta de la base del propio chatbot. Configúrala en `.env`:

  COMPANY_DATABASE_URL=postgresql://usuario_solo_lectura:clave@host:5432/base_empresa

Si está vacía, el bot no llama a Ollama ni consulta datos: responde con la base de conocimiento
(palabras clave / FAQ).

Las vistas que usan las herramientas se crean (ejemplo) con `scripts/setup-company-db.sql`, pasando la
contraseña del usuario de solo lectura como variable (no queda escrita en el archivo):

  psql -v readonly_password="$COMPANY_READONLY_PASSWORD" -f scripts/setup-company-db.sql

Los datos de prueba se cargan con `scripts/seed-company-db.sql`. El usuario debe tener permisos
únicamente de SELECT sobre las vistas; nunca escritura.

## Render: Telegram + FAQ

Para desplegar en Render solo con **Telegram + FAQ** (sin Ollama ni `COMPANY_DATABASE_URL`), usa el Blueprint `render.yaml` de la raíz.

### Pasos con Blueprint
1. Conecta el repositorio a Render (Blueprint).
2. Render creará el web service (`chatbot-soporte-backend`) con `runtime: docker` usando el `Dockerfile` existente y la base de datos Postgres (`chatbot-db`) con plan `free`.
3. Rellena las variables con `sync: false` en el panel de Render:
   - `TELEGRAM_BOT_TOKEN` (obligatorio)
   - `TELEGRAM_WEBHOOK_SECRET` (obligatorio, solo `[A-Za-z0-9_-]`, 1-256; debe coincidir con `secret_token` de `setWebhook`)
   - `PUBLIC_BASE_URL` (obligatorio, `https://<dominio-render>`)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` (opcionales; si se definen y no existe ningún ADMIN, se crea al arrancar con contraseña con hash)

### Variables fijas en el Blueprint
- `CHANNEL_MODE=telegram`
- `TRUST_PROXY=true`
- `TELEGRAM_SKIP_PHONE_MATCH=true`
- `DATABASE_URL` se toma de la base de datos de Render mediante `fromDatabase` (connectionString interna)

### Healthcheck
Configura/usa el healthcheck en Render con ruta `/api/health` (público, sin sesión).

### Registrar el webhook
Usa `scripts/set-telegram-webhook.ps1` en PowerShell (lee `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y `PUBLIC_BASE_URL` de las variables de entorno de la sesión, **nunca** de `.env`). El script llama a `setWebhook` con `url=<PUBLIC_BASE_URL>/webhooks/telegram` y `secret_token`, y luego a `getWebhookInfo`. No imprime el token ni el secreto.

Ejemplo (PowerShell):
```powershell
$env:TELEGRAM_BOT_TOKEN="<token>"
$env:TELEGRAM_WEBHOOK_SECRET="<secreto>"
$env:PUBLIC_BASE_URL="https://<dominio-render>"
.\scripts\set-telegram-webhook.ps1
```

### Limitación plan free (Render)
- **Web service:** se **duerme tras 15 minutos sin tráfico**. Al llegar un webhook o mensaje, arranca de nuevo (aprox. 1 minuto), por lo que el **primer mensaje puede tardar** en recibir respuesta. Cada workspace tiene 750 horas de instancia free al mes; un servicio dormido no las consume.
- **Postgres free:** solo se permite **una** base free por workspace, con **1 GB** y **sin backups**. **Caduca a los 30 días** de su creación; después hay 14 días de gracia y luego Render la **borra con todos los datos**. No usarla con datos reales sin subir de plan.
- **Primer despliegue:** el contenedor ejecuta `prisma migrate deploy` al arrancar. Si el primer deploy falla porque la base aún no estaba lista, usa **Manual Deploy → Deploy latest commit** cuando el estado de la base sea *Available*.

> Nota: todos los valores mostrados son de ejemplo.

## RAG para PQRS (experimental, desactivado por defecto)

La base v2 está en `prisma/data/pqrs_base_conocimiento_v2.json` y la evaluación en
`prisma/data/pruebas_rag.json`. El RAG requiere la migración `0007_knowledge_rag`, una
importación inicial y un servicio de embeddings accesible. No activa ni crea un sistema
de radicados: no existe actualmente integración de registro de casos.

Variables de ejemplo:
- `RAG_ENABLED=false` — deja el flujo actual. Cambiar a `true` solo después de importar
  y revisar las respuestas.
- `ALLOW_CLOUDFLARE_EMBEDDINGS=false` — Cloudflare embeddings en producción se bloquea
  por defecto. Solo configúralo en `true` para pruebas con datos ficticios; el arranque
  registra una advertencia clara. Cloudflare recibe texto y datos enviados al proveedor.
- `KB_IMPORT_ON_START=false` — `true` importa/upsertea la base al arrancar y genera los
  embeddings faltantes; necesita que el proveedor configurado esté accesible desde el
  contenedor.
- `EMBEDDING_PROVIDER=ollama`, `EMBEDDING_MODEL=bge-m3` — predeterminado local.
- `RAG_TOP_K=8`, `RAG_MIN_SCORE=0.55`, `RAG_AMBIGUITY_MARGIN=0.04`.
- `LLM_TIMEOUT_MS=10000` controla el timeout de embeddings además del LLM.
- `COMPANY_NAME`, `OFFICIAL_CHANNEL`, `CONDITIONS_URL` — personalizan placeholders.

Para importar desde una máquina con acceso autorizado a la BD y al Ollama local, aplica
la migración y ejecuta `npm run kb:import`. Para no exponer la BD a internet, configura
`KB_IMPORT_ON_START=true` en el servicio donde el proveedor de embeddings también sea
accesible. En Render, el Blueprint actual es Telegram + FAQ y no instala Ollama. Para
permitir Cloudflare embeddings en producción solo con datos ficticios, configura
`ALLOW_CLOUDFLARE_EMBEDDINGS=true`; el servicio registrará una advertencia al arrancar.
No lo uses con datos reales: el texto enviado sale del servidor hacia Cloudflare.

`npm run rag:eval` no necesita PostgreSQL. La primera ejecución genera
`prisma/data/.rag-embeddings-cache.json` con el proveedor configurado; luego evalúa la
base de prueba sin llamar a la BD. Para calibrar, ajusta `RAG_MIN_SCORE` y compara top-1,
top-3 y falsos positivos; no actives el RAG en producción si no cumple las metas de
precisión o si el contenido aún es genérico.

Los modelos recomendados existen en sus catálogos oficiales: Ollama `bge-m3` y
Workers AI `@cf/baai/bge-m3`. El adaptador Ollama consume `embeddings` de `/api/embed`;
el de Cloudflare envía `text` como array al endpoint REST del modelo y lee los vectores
de `result.data` ([documentación Ollama](https://ollama.com/library/bge-m3),
[documentación Workers AI](https://developers.cloudflare.com/workers-ai/models/bge-m3/)).

