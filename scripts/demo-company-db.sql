-- =============================================================================
-- BD "de empresa" DE DEMOSTRACIÓN para probar la Fase 5 (IA + consultas de datos).
--
-- Este archivo es SOLO para demo/pruebas locales. NO contiene contraseñas reales:
-- la contraseña del usuario de solo lectura se pasa como variable de psql y ese
-- usuario es exclusivamente para el entorno de pruebas.
--
-- Uso (con Postgres real, p. ej. el contenedor de docker-compose):
--   psql "postgresql://<admin>:<clave>@localhost:5432/company_demo" \
--     -v readonly_password="<clave-solo-demo>" \
--     -v readonly_role="company_readonly" \
--     -f scripts/demo-company-db.sql
--
-- Crea un ESQUEMA SEPARADO (`empresa_demo`) con:
--   * Tablas base ficticias (customers, orders).
--   * Vistas con EXACTAMENTE las columnas que esperan las herramientas del bot.
--   * Un usuario de solo lectura con GRANT SELECT ÚNICAMENTE sobre las vistas.
--
-- -----------------------------------------------------------------------------
-- CONTRATO QUE DEBE CUMPLIR LA BD REAL DE LA EMPRESA
-- -----------------------------------------------------------------------------
-- Las herramientas del bot consultan estas VISTAS (nombres sin esquema; el rol de
-- lectura fija su search_path al esquema que las contenga). La empresa solo tiene
-- que crear vistas equivalentes sobre SUS tablas y otorgar SELECT:
--
--   1) get_customer_balance  ->  v_customer_balance
--        columnas: customer_id (texto), balance (numérico/texto), credit_limit (numérico/texto)
--        filtra:   WHERE customer_id = $1  (el id del usuario de la sesión de chat)
--
--   2) get_order_status      ->  v_orders_status
--        columnas: order_id (texto), status (texto), total_amount (numérico/texto), created_at (timestamp)
--        filtra:   WHERE order_id = $1 AND customer_id = $2  (id de sesión) LIMIT 1
--
--   3) get_recent_orders     ->  v_recent_orders
--        columnas: order_id (texto), status (texto), total_amount (numérico/texto), created_at (timestamp)
--        filtra:   WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2
--
-- El `customer_id` de la BD de la empresa debe corresponder al `companyUserId`
-- que la empresa asocie a cada usuario del chat (ver módulo identity).
-- =============================================================================

-- El nombre del rol y su contraseña llegan por variables; nunca escritos aquí.
-- Prioridad: -v readonly_role=... / -v readonly_password=... ; si no, variables de
-- entorno READONLY_ROLE / COMPANY_READONLY_PASSWORD (útil en docker-entrypoint-initdb.d);
-- si no, rol por defecto `company_readonly` (la contraseña es obligatoria).
\if :{?readonly_role}
\else
  \getenv readonly_role READONLY_ROLE
\endif
\if :{?readonly_role}
\else
  \set readonly_role company_readonly
\endif
\if :{?readonly_password}
\else
  \getenv readonly_password COMPANY_READONLY_PASSWORD
\endif
\if :{?readonly_password}
\else
  \echo 'ERROR: falta -v readonly_password="<clave-solo-demo>" o COMPANY_READONLY_PASSWORD'
  \quit
\endif

BEGIN;

-- 1. Esquema separado para aislar las vistas del bot del resto del esquema.
CREATE SCHEMA IF NOT EXISTS empresa_demo;

-- 2. Tablas base ficticias (solo demo). En la empresa real serían sus tablas.
CREATE TABLE IF NOT EXISTS empresa_demo.customers (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    credit_limit    NUMERIC(12,2) NOT NULL DEFAULT 1000.00
);

CREATE TABLE IF NOT EXISTS empresa_demo.orders (
    id          VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL REFERENCES empresa_demo.customers(id),
    status      VARCHAR(30) NOT NULL,
    total       NUMERIC(12,2) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Datos ficticios (los mismos ids que COMPANY_SEED_* espera en la BD del bot).
INSERT INTO empresa_demo.customers (id, name, current_balance, credit_limit) VALUES
    ('usr_101', 'Juan Pérez (ficticio)',  150.50, 500.00),
    ('usr_102', 'Maria Gómez (ficticia)',  0.00, 1000.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO empresa_demo.orders (id, customer_id, status, total, created_at) VALUES
    ('123', 'usr_101', 'EN_TRANSITO',  45.00, NOW() - INTERVAL '3 days'),
    ('124', 'usr_101', 'ENTREGADO',   105.50, NOW() - INTERVAL '1 day'),
    ('125', 'usr_101', 'PROCESANDO',   30.00, NOW()),
    ('999', 'usr_102', 'PROCESANDO',  200.00, NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- 4. Vistas con el contrato exacto que consumen las herramientas del bot.
CREATE OR REPLACE VIEW empresa_demo.v_customer_balance AS
SELECT
    id              AS customer_id,
    current_balance AS balance,
    credit_limit    AS credit_limit
FROM empresa_demo.customers;

CREATE OR REPLACE VIEW empresa_demo.v_orders_status AS
SELECT
    id         AS order_id,
    customer_id,
    status,
    total      AS total_amount,
    created_at
FROM empresa_demo.orders;

CREATE OR REPLACE VIEW empresa_demo.v_recent_orders AS
SELECT
    id         AS order_id,
    customer_id,
    status,
    total      AS total_amount,
    created_at
FROM empresa_demo.orders;

COMMIT;

-- 5. Usuario de SOLO LECTURA para el bot. `search_path` fijado al esquema de demo
--    para que las herramientas encuentren las vistas sin cualificarlas.
--    \gexec ejecuta SQL generado por psql fuera de bloques dollar-quoted para que
--    las variables readonly_role y readonly_password sí se interpolen.
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    :'readonly_role', :'readonly_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'readonly_role')
\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    :'readonly_role', :'readonly_password'
)
\gexec

SELECT format('ALTER ROLE %I SET search_path = empresa_demo, pg_catalog', :'readonly_role')
\gexec

-- Quitar membresías previas y los permisos directos en el esquema de demo para
-- que un rol reutilizado no conserve acceso a las tablas base.
SELECT format('REVOKE %I FROM %I', parent.rolname, :'readonly_role')
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
WHERE membership.member = (SELECT oid FROM pg_roles WHERE rolname = :'readonly_role')
\gexec

-- 6. Permisos MÍNIMOS: conectar + usar el esquema + SELECT SOLO sobre las vistas.
SELECT format('GRANT USAGE ON SCHEMA empresa_demo TO %I', :'readonly_role')
\gexec
REVOKE ALL ON ALL TABLES IN SCHEMA empresa_demo FROM PUBLIC;
SELECT format('REVOKE ALL ON ALL TABLES IN SCHEMA empresa_demo FROM %I', :'readonly_role')
\gexec
SELECT format('GRANT SELECT ON empresa_demo.v_customer_balance TO %I', :'readonly_role')
\gexec
SELECT format('GRANT SELECT ON empresa_demo.v_orders_status TO %I', :'readonly_role')
\gexec
SELECT format('GRANT SELECT ON empresa_demo.v_recent_orders TO %I', :'readonly_role')
\gexec

-- 7. La BD de demo debe permitir conexión al rol de lectura.
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'readonly_role')
\gexec

\echo 'BD de demostración lista: esquema empresa_demo + vistas + usuario de solo lectura.'
\echo 'COMPANY_DATABASE_URL de ejemplo (password de demo, no real):'
\echo '  postgresql://company_readonly:<clave-solo-demo>@localhost:5432/company_demo'


-- ===========================================================================
-- VINCULACIÓN CON EL USUARIO DEL CHAT (FASE 9 / DEMO)
-- ===========================================================================
-- Las herramientas filtran por company_users.id. Para que un usuario creado
-- en /admin/identity.html pueda ver sus datos de esta BD de demo:
--
--   1) Crear el usuario en el panel: username, displayName, role=USER,
--      registeredPhone (coincidir con REQUIRE_PHONE_MATCH/Telegram según el caso).
--   2) En la BD del bot (Postgres de la app), igualar su id al de la demo:
--      UPDATE company_users SET id = 'usr_101' WHERE username = '<username>';
--   El FK chat_sessions.companyUserId tiene ON UPDATE CASCADE (migración 0004).
--
-- Con usr_101 se ven pedidos 123,124,125 y saldo 150.50/500.00.
