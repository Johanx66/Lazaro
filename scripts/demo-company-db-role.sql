-- Completa o repara solo el rol de lectura de la BD demo ya cargada.
-- Ejecutar con psql -v ON_ERROR_STOP=1 -v readonly_role=company_readonly
--   -v readonly_password=... -f scripts/demo-company-db-role.sql

\set ON_ERROR_STOP on

-- Si no se especifica nombre, usar el rol esperado por la aplicación.
\if :{?readonly_role}
\else
  \set readonly_role company_readonly
\endif

-- Crear el rol solo si falta. El password se aplica abajo, así el ALTER ROLE
-- repetible también corrige un rol que hubiera quedado con credenciales previas.
SELECT format('CREATE ROLE %I LOGIN', :'readonly_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'readonly_role')
\gexec

SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'readonly_role', :'readonly_password')
\gexec
-- Las consultas de la aplicación usan los nombres de vista sin esquema.
SELECT format('ALTER ROLE %I SET search_path = empresa_demo, pg_catalog', :'readonly_role')
\gexec

-- Quitar membresías que podrían heredar acceso a tablas base.
SELECT format('REVOKE %I FROM %I', parent.rolname, :'readonly_role')
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
WHERE membership.member = (SELECT oid FROM pg_roles WHERE rolname = :'readonly_role')
\gexec

-- Eliminar permisos heredados por PUBLIC y permisos directos del rol en el
-- esquema; luego conceder solo uso del esquema y lectura de las tres vistas.
REVOKE ALL ON ALL TABLES IN SCHEMA empresa_demo FROM PUBLIC;
SELECT format('REVOKE ALL ON ALL TABLES IN SCHEMA empresa_demo FROM %I', :'readonly_role')
\gexec
REVOKE ALL ON SCHEMA empresa_demo FROM PUBLIC;
SELECT format('REVOKE ALL ON SCHEMA empresa_demo FROM %I', :'readonly_role')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'readonly_role')
\gexec
SELECT format('GRANT USAGE ON SCHEMA empresa_demo TO %I', :'readonly_role')
\gexec
SELECT format('GRANT SELECT ON empresa_demo.v_customer_balance TO %I', :'readonly_role')
\gexec
SELECT format('GRANT SELECT ON empresa_demo.v_orders_status TO %I', :'readonly_role')
\gexec
SELECT format('GRANT SELECT ON empresa_demo.v_recent_orders TO %I', :'readonly_role')
\gexec
