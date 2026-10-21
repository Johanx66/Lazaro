-- =============================================================================
--  ROL DE SOLO LECTURA PARA EL CHATBOT - LAZARO SOFTWARE S.A.S.
--
--  Crea (o actualiza) el rol `company_readonly`, que es el usuario con el que el
--  bot abre la conexión a la BD de la empresa (COMPANY_DATABASE_URL).
--
--  REGLA DE ORO: ese rol SOLO puede leer las TRES vistas del chatbot. Nunca las
--  tablas base. Por eso NO se copia el `GRANT SELECT ON ALL TABLES` del script
--  original de Lázaro Software (que le daba lectura sobre todo).
--
--  La contraseña NUNCA se escribe en este archivo: llega por variable de psql
--  (-v readonly_password=...) o por la variable de entorno
--  COMPANY_READONLY_PASSWORD. Usa una clave de PRUEBAS, nunca una real.
--
--  Uso:
--    psql "$DATABASE_URL_DE_LAZARO" \
--      -v readonly_password="$COMPANY_READONLY_PASSWORD" \
--      -v readonly_role="company_readonly" \
--      -f scripts/lazaro-test-db/04-roles-lectura.sql
-- =============================================================================

-- Nombre del rol: -v readonly_role=... o READONLY_ROLE; por defecto company_readonly.
\if :{?readonly_role}
\else
  \getenv readonly_role READONLY_ROLE
\endif
\if :{?readonly_role}
\else
  \set readonly_role company_readonly
\endif

-- Contraseña: -v readonly_password=... o COMPANY_READONLY_PASSWORD. Es obligatoria.
\if :{?readonly_password}
\else
  \getenv readonly_password COMPANY_READONLY_PASSWORD
\endif
\if :{?readonly_password}
\else
  \echo 'ERROR: falta -v readonly_password="<clave-de-pruebas>" o COMPANY_READONLY_PASSWORD'
  \quit
\endif

-- 1. Rol de solo lectura (con `search_path` en public, que es donde viven las vistas).
DO $do$
DECLARE
    role_name text := :'readonly_role';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', role_name, :'readonly_password');
    ELSE
        EXECUTE format('ALTER ROLE %I PASSWORD %L', role_name, :'readonly_password');
    END IF;
    EXECUTE format('ALTER ROLE %I SET search_path = public, pg_catalog', role_name);
END
$do$;

-- 2. Permisos MINIMOS: conectar, usar el esquema y SELECT SOLO sobre las vistas.
DO $do$
DECLARE
    role_name text := :'readonly_role';
BEGIN
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);
    EXECUTE format('GRANT SELECT ON v_customer_balance TO %I', role_name);
    EXECUTE format('GRANT SELECT ON v_orders_status  TO %I', role_name);
    EXECUTE format('GRANT SELECT ON v_recent_orders  TO %I', role_name);

    -- Sin acceso directo a las tablas base (ni a las vistas de BI).
    EXECUTE format('REVOKE ALL ON company_orders    FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON company_customers FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON ordenes_detalle   FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON pagos             FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON facturas          FROM %I', role_name);
END
$do$;

-- 3. La base debe permitir la conexion del rol de lectura (sin fijar el nombre
--    de la base: se usa la base actual).
DO $do$
DECLARE
    role_name text := :'readonly_role';
    db_name   text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', db_name, role_name);
END
$do$;

\echo 'Rol de solo lectura listo: SELECT unicamente sobre las 3 vistas del chatbot.'
