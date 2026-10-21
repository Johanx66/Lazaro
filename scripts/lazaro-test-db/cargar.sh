#!/usr/bin/env bash
# =============================================================================
#  Carga la BD de prueba de Lázaro Software en una base de datos Postgres.
#
#  TODO lo que se carga son DATOS FICTICIOS (generados aleatoriamente).
#
#  Requisitos: psql (>= 9.6) y credenciales de un Postgres donde el usuario
#  pueda crear tablas, vistas y roles.
#
#  Variables de entorno (NO se escriben contraseñas en el repositorio):
#    LAZARO_DATABASE_URL  -> URL de la base destino (obligatoria)
#    COMPANY_READONLY_PASSWORD -> contraseña del rol de solo lectura (obligatoria)
#    READONLY_ROLE        -> nombre del rol de solo lectura (opcional, por
#                             defecto `company_readonly`)
#
#  Ejemplo (PowerShell):
#    $env:LAZARO_DATABASE_URL = "postgresql://usuario:clave@host:puerto/base"
#    $env:COMPANY_READONLY_PASSWORD = "clave-de-pruebas"
#    bash scripts/lazaro-test-db/cargar.sh
#
#  Ejemplo (bash):
#    LAZARO_DATABASE_URL="postgresql://..." \
#    COMPANY_READONLY_PASSWORD="clave-de-pruebas" \
#    bash scripts/lazaro-test-db/cargar.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${LAZARO_DATABASE_URL:-}" ]; then
  echo "ERROR: falta la variable de entorno LAZARO_DATABASE_URL" >&2
  exit 1
fi

if [ -z "${COMPANY_READONLY_PASSWORD:-}" ]; then
  echo "ERROR: falta la variable de entorno COMPANY_READONLY_PASSWORD" >&2
  exit 1
fi

readonly_role="${READONLY_ROLE:-company_readonly}"

echo "1/4 esquema..."
psql "$LAZARO_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/01-esquema.sql"

echo "2/4 datos de prueba (ficticios)..."
psql "$LAZARO_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/02-datos.sql"

echo "3/4 vistas del chatbot..."
psql "$LAZARO_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/03-vistas-chatbot.sql"

echo "4/4 rol de solo lectura..."
psql "$LAZARO_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v readonly_role="$readonly_role" \
  -v readonly_password="$COMPANY_READONLY_PASSWORD" \
  -f "$SCRIPT_DIR/04-roles-lectura.sql"

cat <<'EOF'

Carga completa. Resumen:
  * company_customers: 1.500 clientes ficticios (CLI-000001 .. CLI-001500)
  * company_orders:    ~24.000 pedidos ficticios (LZS-AAAA-NNNNNN)
  * Vistas del chatbot: v_customer_balance, v_orders_status, v_recent_orders

Siguiente paso: en el panel del chatbot (/admin/identity.html) asigna a un
usuario el "Código de cliente" (por ejemplo CLI-000123) y pon en .env:

  COMPANY_DATABASE_URL=postgresql://<readonly_role>:<clave>@<host>:<puerto>/<base>
  COMPANY_CUSTOMER_ID_PATTERN=^[A-Z0-9][A-Z0-9_-]{1,31}$

Si la base está en Railway (host interno), la URL suele ser:
  postgresql://<readonly_role>:<clave>@postgres.railway.internal:5432/<base>
EOF
