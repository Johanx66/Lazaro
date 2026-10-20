#!/bin/bash
# Respaldo de la base de datos del chatbot. Lee las variables de un .env si existe.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/chatbot}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/chatbot_db_$TIMESTAMP.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Carga el .env del proyecto si existe (mismas variables que docker-compose.yml).
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-chatbot_user}"
POSTGRES_DB="${POSTGRES_DB:-chatbot_db}"
DB_CONTAINER="${DB_CONTAINER:-chatbot_db}"

mkdir -p "$BACKUP_DIR"

if ! docker exec -t "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"; then
  echo "ERROR: falló el respaldo de la base de datos." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: el archivo de respaldo quedó vacío." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "Respaldo completado: $BACKUP_FILE"

find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -exec rm {} \;
echo "Respaldos antiguos eliminados."
