# Instalación del chatbot en el servidor de la empresa

Guía para el equipo de TI. El chatbot se instala **en el servidor de la empresa**
(no es un servicio en la nube): la IA (Ollama) y la base de datos corren localmente,
por lo que los datos no salen de la red de la empresa.

> Contenido relacionado:
> - `README-DEPLOYMENT.md`: despliegue con Nginx/SSL y respaldos (referencia general).
> - `docker-compose.company.yml`: despliegue "todo en uno" (app + Postgres + Ollama).
> - `.env.company.example`: plantilla de variables (copiar a `.env.company`).
> - `scripts/demo-company-db.sql`: BD de demostración para pruebas.
> - `AUDIT.md`: estado del proyecto y fases.

---

## 1. Requisitos de hardware

El modelo de IA local es lo que más recursos consume. Referencia para el modelo
por defecto `qwen2.5:7b-instruct` (cuantizado Q4, ~5 GB):

| Recurso | Mínimo | Recomendado |
| --- | --- | --- |
| CPU | 4 vCPU | 8+ vCPU |
| RAM | 16 GB | 32 GB |
| Disco libre | 30 GB (SO + modelo + datos) | 60 GB SSD |
| GPU | No imprescindible (solo CPU) | NVIDIA con ≥ 8 GB VRAM |

- **Sin GPU**: funciona, pero las respuestas tardan más (segundos por consulta).
  Ajusta `LLM_TIMEOUT_MS` (por defecto 10000 ms) si el equipo es lento.
- **Con GPU NVIDIA**: instala el driver y `nvidia-container-toolkit`, y usa
  `docker-compose.company.gpu.yml` como se explica en la sección 4.
- El chatbot **no falla** si la IA no responde: transfiere la conversación a un
  asesor humano.

## 2. Requisitos de software

- Linux (Ubuntu Server 22.04 LTS o superior recomendado).
- Docker Engine 24+ y Docker Compose v2.
- Un dominio con registro DNS tipo A apuntando a la IP del servidor
  (p. ej. `chatbot.empresa.com`).
- Puertos abiertos en el firewall:
  - `80/tcp` y `443/tcp` (HTTP/HTTPS, para el proxy inverso y los webhooks).
  - `22/tcp` (SSH, administración).
  - **No** expongas a Internet los puertos de Postgres (5432) ni de Ollama (11434):
    en `docker-compose.company.yml` solo se publican dentro de la red de Docker.

## 3. Dominio HTTPS y proxy inverso

La aplicación escucha en el puerto `3000` sobre `0.0.0.0`. Coloca delante un proxy
inverso con TLS (Nginx + Let's Encrypt). Ejemplo mínimo de Nginx:

```nginx
server {
    listen 80;
    server_name chatbot.empresa.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Luego: `sudo certbot --nginx -d chatbot.empresa.com`.

Configura en `.env.company`:

- `PUBLIC_BASE_URL=https://chatbot.empresa.com` → se usa para construir el enlace
  de login del chat (si queda como `localhost`, los enlaces no funcionarán).
- `TRUST_PROXY=true` → para que el límite de peticiones use la IP real del cliente
  y no la del proxy.

## 4. Puesta en marcha

1. Copia la plantilla de variables y edítala (nunca dejes credenciales reales en
   archivos versionados):

   ```bash
   cp .env.company.example .env.company
   nano .env.company
   ```

   Rellena como mínimo: `POSTGRES_PASSWORD`, `PUBLIC_BASE_URL`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, y las variables del canal que vayas a usar (Telegram y/o
   WhatsApp). Ver la sección 5.

2. Levanta los servicios.

   **Solo CPU:**

   ```bash
   docker compose -f docker-compose.company.yml --env-file .env.company up -d --build
   ```

   **Con GPU NVIDIA:**

   ```bash
   docker compose -f docker-compose.company.yml -f docker-compose.company.gpu.yml \
     --env-file .env.company up -d --build
   ```

   Esto arranca Postgres, Ollama, el contenedor `migrate` (aplica migraciones y
   siembra el admin) y la app.

3. Descarga el modelo de IA dentro del contenedor de Ollama:

   ```bash
   docker compose -f docker-compose.company.yml exec ollama ollama pull qwen2.5:7b-instruct
   ```

   El modelo debe coincidir con `OLLAMA_MODEL` en `.env.company`. Se guarda en el
   volumen `ollama_data` (no se descarga dos veces).

4. Comprueba el estado:

   ```bash
   docker compose -f docker-compose.company.yml ps
   curl -s https://chatbot.empresa.com/api/health
   ```

   La respuesta incluye `"status":"ok"` y `"database":"connected"`.

5. Verifica el correo del admin con el que te logueas en `/admin/` y
   `/admin/agent-panel.html`. El admin se crea **al arrancar** si aún no existe
   ninguno: define `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12 caracteres) antes
   del primer arranque. Después puedes quitarlas del entorno; una vez creado, el
   bot no sobrescribe administradores.

## 5. Variables de entorno

Todas las variables se leen en un único sitio (`src/shared/config/env.ts`) y se
validan al arrancar (`src/shared/config/validate.ts`). La plantilla comentada está
en `.env.company.example`. Resumen:

**Obligatorias**

| Variable | Descripción |
| --- | --- |
| `POSTGRES_PASSWORD` | Contraseña del Postgres del chatbot (la inyecta compose en `DATABASE_URL`). |
| `PUBLIC_BASE_URL` | URL HTTPS pública, sin barra final. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin inicial (≥ 12 caracteres). Necesarias en el primer arranque. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | Si `CHANNEL_MODE` incluye `telegram`. |
| `WHATSAPP_*` | Solo si `CHANNEL_MODE` incluye `whatsapp`. |

**Canales**

- `CHANNEL_MODE`: `telegram`, `whatsapp`, `web`, `both` (alias web+whatsapp) o lista
  con comas (`whatsapp,telegram`). En producción no se admite ningún modo con `web`.
- `TELEGRAM_SKIP_PHONE_MATCH=true` omite la coincidencia de teléfono en Telegram
  (el identificador del chat es un `chat.id`, no un teléfono). Por defecto `false`.

**IA y datos de la empresa**

- `OLLAMA_BASE_URL` (por defecto `http://ollama:11434` en compose),
  `OLLAMA_MODEL`, `LLM_TIMEOUT_MS`.
- `COMPANY_DATABASE_URL`: conexión de **solo lectura** a la BD de la empresa. Si
  está vacía, el bot no consulta datos ni llama a la IA: usa la base de
  conocimiento (FAQ/palabras clave).
- `COMPANY_QUERY_TIMEOUT_MS`, `COMPANY_MAX_ROWS`.

**Otras**

`TRUST_PROXY`, `ALLOWED_ORIGINS`, `LOGIN_LINK_TTL_MINUTES`,
`CHAT_SESSION_IDLE_MINUTES`, `CHAT_SESSION_ABSOLUTE_HOURS`, `REQUIRE_PHONE_MATCH`,
`FAQ_MIN_CONFIDENCE`, `TRANSFER_AFTER_MISSES`, `WHATSAPP_TEMPLATE_NAME`.

> Regla de oro: **ninguna contraseña, token ni dato real** debe escribirse en el
> repositorio ni en los logs. Solo en `.env.company` (fuera del control de versiones).

## 6. Registrar el webhook de Telegram

1. Crea el bot con **@BotFather** y guarda el token en `TELEGRAM_BOT_TOKEN`.
2. Genera un secreto aleatorio (1–256 caracteres `A-Za-z0-9_-`) y ponlo en
   `TELEGRAM_WEBHOOK_SECRET`. Debe ser el mismo `secret_token` que uses al registrar
   el webhook.
3. Registra el webhook (el `<TOKEN>` real no se escribe en documentación):

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://chatbot.empresa.com/webhooks/telegram" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

4. Comprueba: `curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`.
5. Escribe al bot desde Telegram: debe responder y la conversación aparecer en el
   panel del asesor (`/admin/agent-panel.html`).

Nota: si falta el secreto, el webhook rechaza todas las peticiones (401).

## 7. Crear el usuario de solo lectura en la BD de la empresa

El bot consulta la BD de la empresa con un usuario que **solo** puede leer vistas
concretas. Nunca se le da acceso directo a las tablas.

1. En la BD de la empresa, crea las vistas con el contrato que esperan las
   herramientas (sección 8) sobre las tablas reales.
2. Crea el usuario y otórgale SELECT **solo** sobre las vistas. Un ejemplo completo
   (y una BD de demostración) está en `scripts/demo-company-db.sql`:

   ```bash
   psql "postgresql://<admin>@<host>:5432/<base_empresa>" \
     -v readonly_role=company_readonly \
     -v readonly_password="<clave-del-usuario-de-lectura>" \
     -f scripts/demo-company-db.sql
   ```

   En la empresa real: crea el rol, `GRANT USAGE ON SCHEMA <esquema>` y
   `GRANT SELECT` sobre cada vista; fija su `search_path` al esquema de las vistas.
3. Pon la conexión en `.env.company`:

   ```text
   COMPANY_DATABASE_URL=postgresql://company_readonly:<clave>@<host>:5432/<base_empresa>
   ```

### Cómo probar la IA en local (equipo de desarrollo)

En la PC de desarrollo no hace falta el stack completo:

1. **Postgres del chatbot**: `docker compose up -d db` (Postgres) o el Postgres
   local con `npm run dev:all` (usa PGlite, sin Docker).
2. **Backend**: `npm run dev` (o `npm run dev:all`, que arranca BD local + app).
   Aplica migraciones con `npm run prisma:deploy` si usas Postgres de Docker.
3. **Ollama en el host** (no en Docker), como pide el flujo de pruebas:

   ```bash
   ollama serve                 # escucha en http://127.0.0.1:11434
   ollama pull qwen2.5:7b-instruct
   ```

   Deja `OLLAMA_BASE_URL=http://127.0.0.1:11434` en tu `.env` (valor por defecto).
4. **BD "de empresa" de demostración**: levántala con el perfil `demo` y apunta
   `COMPANY_DATABASE_URL` al contenedor:

   ```bash
   docker compose -f docker-compose.company.yml --env-file .env.company \
     --profile demo up -d company-demo-db
   # COMPANY_DATABASE_URL=postgresql://company_readonly:solo_demo_readonly@localhost:5432/company_demo
   ```

   Usa `usr_101` (Juan Pérez) como `companyUserId` de un usuario de chat para
   obtener datos de ejemplo (saldo + pedidos `123`, `124`, `125`).

Con `COMPANY_DATABASE_URL` definida y Ollama accesible, el bot clasifica
intenciones y consulta datos. Sin ninguna de las dos, responde por FAQ/palabras
clave y transfiere a asesor cuando no entiende.

## 8. Contrato de vistas que espera el bot (para mapear a las tablas de la empresa)

Las herramientas consultan estas vistas (nombres **sin** esquema; el usuario de
lectura fija su `search_path`). La empresa solo debe crear vistas equivalentes
sobre sus tablas y otorgar `SELECT`:

| Herramienta | Vista | Columnas que deben existir | Filtro |
| --- | --- | --- | --- |
| `get_customer_balance` | `v_customer_balance` | `customer_id`, `balance`, `credit_limit` | `customer_id = $1` |
| `get_order_status` | `v_orders_status` | `order_id`, `status`, `total_amount`, `created_at` | `order_id = $1 AND customer_id = $2` |
| `get_recent_orders` | `v_recent_orders` | `order_id`, `status`, `total_amount`, `created_at` | `customer_id = $1 ORDER BY created_at DESC LIMIT $2` |

El `customer_id` debe corresponder al `companyUserId` que la empresa asocie a cada
usuario del chat. La consulta siempre es parametrizada y el `customer_id` proviene
de la sesión autenticada, **nunca** del texto que escribe el usuario.

## 9. Respaldos

La base de datos propia del chatbot se respalda con `scripts/backup-db.sh` (usa
`docker exec` + `pg_dump` y rota los archivos):

```bash
chmod +x scripts/backup-db.sh
crontab -e
# respaldo diario a las 2:00
0 2 * * * /ruta/al/proyecto/scripts/backup-db.sh >> /var/log/chatbot-backup.log 2>&1
```

- Ajusta `BACKUP_DIR` (por defecto `/var/backups/chatbot`) y `RETENTION_DAYS`
  (por defecto 7) por variables de entorno.
- **La base de datos de la empresa NO la respalda el chatbot**: es responsabilidad
  del equipo de TI, conforme a su política.
- Verifica periódicamente que se puede **restaurar** un respaldo en un entorno de
  prueba.

## 10. Actualización

1. Haz un respaldo reciente de la BD del chatbot (sección 9).
2. Revisa los cambios pendientes y el `AUDIT.md` de la versión nueva.
3. Actualiza el código y reconstruye:

   ```bash
   git pull
   docker compose -f docker-compose.company.yml --env-file .env.company up -d --build
   ```

   El contenedor `migrate` aplica las migraciones nuevas automáticamente
   (`prisma migrate deploy` es idempotente) antes de arrancar la app. El admin
   inicial solo se crea si aún no existe ninguno.
4. Comprueba `/api/health` y revisa los logs:

   ```bash
   docker logs --tail=200 chatbot_app
   docker logs --tail=200 chatbot_ollama
   ```
5. Si actualizas a un modelo nuevo, `ollama pull <modelo>` y actualiza
   `OLLAMA_MODEL` en `.env.company`, luego reinicia la app.

### Parada y arranque

```bash
docker compose -f docker-compose.company.yml down            # detiene (conserva volúmenes)
docker compose -f docker-compose.company.yml up -d           # arranca
docker compose -f docker-compose.company.yml down -v         # ¡borra datos y modelo!
```
