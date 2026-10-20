-- Tablas base de la empresa (Datos Ficticios)
CREATE TABLE IF NOT EXISTS company_customers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    current_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    credit_limit NUMERIC(10,2) NOT NULL DEFAULT 1000.00
);

CREATE TABLE IF NOT EXISTS company_orders (
    id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) REFERENCES company_customers(id),
    status VARCHAR(30) NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos Ficticios de Prueba
INSERT INTO company_customers (id, name, current_balance, credit_limit) VALUES
('usr_101', 'Juan Pérez', 150.50, 500.00),
('usr_102', 'Maria Gómez', 0.00, 1000.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO company_orders (id, customer_id, status, total) VALUES
('123', 'usr_101', 'EN_TRANSITO', 45.00),
('124', 'usr_101', 'ENTREGADO', 105.50),
('999', 'usr_102', 'PROCESANDO', 200.00)
ON CONFLICT (id) DO NOTHING;