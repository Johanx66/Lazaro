-- =============================================================================
--  VISTAS DEL CHATBOT - LAZARO SOFTWARE S.A.S.
--
--  Solo se cargan las TRES vistas que consumen las herramientas del bot
--  (src/modules/chatbot/tools/*). Las vistas analiticas de BI del script
--  original (v_ventas_diarias, v_productos_top, ...) NO se cargan: el chatbot
--  no las usa y el rol de lectura no debe verlas.
--
--  El contrato es EXACTO (columnas y nombres):
--    1) get_customer_balance -> v_customer_balance
--         customer_id, balance, credit_limit
--         WHERE customer_id = $1
--    2) get_order_status     -> v_orders_status
--         order_id, customer_id, status, total_amount, created_at
--         WHERE order_id = $1 AND customer_id = $2 LIMIT 1
--    3) get_recent_orders    -> v_recent_orders
--         order_id, customer_id, status, total_amount, created_at
--         WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2
--
--  El `customer_id` es el CODIGO DE CLIENTE de esta base ('CLI-000123'), que es
--  el valor que el ADMIN asigna en el panel del chatbot (campo companyCustomerId).
--
--  Uso:
--    psql "$DATABASE_URL_DE_LAZARO" -f scripts/lazaro-test-db/03-vistas-chatbot.sql
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW v_orders_status AS
SELECT id          AS order_id,
       customer_id,
       status,
       total       AS total_amount,
       created_at
FROM company_orders;

CREATE OR REPLACE VIEW v_customer_balance AS
SELECT id              AS customer_id,
       current_balance AS balance,
       credit_limit
FROM company_customers;

CREATE OR REPLACE VIEW v_recent_orders AS
SELECT id          AS order_id,
       customer_id,
       status,
       total       AS total_amount,
       created_at
FROM company_orders;

COMMENT ON VIEW v_orders_status   IS 'Estado de un pedido. Usada por la herramienta get_order_status.';
COMMENT ON VIEW v_customer_balance IS 'Saldo y limite de credito. Usada por la herramienta get_customer_balance.';
COMMENT ON VIEW v_recent_orders   IS 'Pedidos recientes del cliente. Usada por la herramienta get_recent_orders.';

COMMIT;
