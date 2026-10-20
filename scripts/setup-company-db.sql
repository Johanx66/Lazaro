-- Crea las vistas de solo lectura y el usuario con el que el bot consulta la BD de la empresa.
--
-- Ejecutar pasando la contraseña como variable (NUNCA la escribas en el archivo):
--   psql -v readonly_password="$COMPANY_READONLY_PASSWORD" -f scripts/setup-company-db.sql

-- 1. Crear Vistas Permitidas sobre las tablas originales de la empresa
CREATE OR REPLACE VIEW v_orders_status AS
SELECT id AS order_id, customer_id, status, total AS total_amount, created_at
FROM company_orders;

CREATE OR REPLACE VIEW v_customer_balance AS
SELECT id AS customer_id, current_balance AS balance, credit_limit
FROM company_customers;

CREATE OR REPLACE VIEW v_recent_orders AS
SELECT id AS order_id, customer_id, status, total AS total_amount, created_at
FROM company_orders;

-- 2. Crear el usuario de SOLO LECTURA para el bot (aislamiento de seguridad).
CREATE USER company_readonly WITH PASSWORD :'readonly_password';

-- 3. Otorgar permisos EXCLUSIVAMENTE de SELECT sobre las VISTAS
GRANT CONNECT ON DATABASE company_db TO company_readonly;
GRANT USAGE ON SCHEMA public TO company_readonly;
GRANT SELECT ON v_orders_status TO company_readonly;
GRANT SELECT ON v_customer_balance TO company_readonly;
GRANT SELECT ON v_recent_orders TO company_readonly;

-- REVOCAR acceso a las tablas base directamente
REVOKE ALL ON company_orders FROM company_readonly;
REVOKE ALL ON company_customers FROM company_readonly;
