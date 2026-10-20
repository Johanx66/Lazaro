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


4. Configuración del Proxy Inverso con Nginx y SSL

Instalar Nginx y Certbot en el servidor anfitrión:

sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx


Crear el archivo de configuración para la aplicación:

sudo nano /etc/nginx/sites-available/chatbot


Pegar la siguiente configuración (reemplazando chatbot.empresa.com por tu dominio real):

server {
    listen 80;
    server_name chatbot.empresa.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}


Habilitar el sitio y reiniciar Nginx:

sudo ln -s /etc/nginx/sites-available/chatbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx


Generar certificado SSL con Let's Encrypt:

sudo certbot --nginx -d chatbot.empresa.com


5. Automatización de Respaldos de Base de Datos

Asignar permisos de ejecución al script de respaldo:

chmod +x scripts/backup-db.sh


Configurar una tarea programada (cron) para ejecutar el respaldo diariamente a las 2:00 AM:

crontab -e


Añadir la siguiente línea al final del archivo:

0 2 * * * /var/www/chatbot/scripts/backup-db.sh >> /var/log/chatbot-backup.log 2>&1


6. Monitoreo y Mantenimiento

Ver logs de la aplicación en tiempo real:

docker logs -f chatbot_app


Ver logs de la IA (Ollama):

docker logs -f chatbot_ollama


Reiniciar servicios:

docker compose restart


Rotación de logs de Docker

Los contenedores escriben logs en el host; configura su rotación en /etc/docker/daemon.json:

{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}

Luego reinicia Docker: sudo systemctl restart docker (recrea los contenedores con
docker compose up -d para aplicar la política).

Nota sobre proxy y rate-limit

Nginx reenvía X-Forwarded-For (ver sección 4). Para que el rate-limit use la IP real del cliente
y no la del proxy, define en `.env`:

  TRUST_PROXY=true