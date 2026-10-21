-- =============================================================================
--  ESQUEMA - LAZARO SOFTWARE S.A.S. (adaptado por el chatbot)
--  Contexto: ventas de una empresa restauratera (cadena de restaurantes)
--  Motor: PostgreSQL 17  |  Zona horaria: America/Bogota  |  Moneda: COP
--
--  ADAPTACIONES respecto al script original de Lázaro Software:
--   * NO hay DROP ... CASCADE: este script NO destruye nada. Se ejecuta UNA sola
--     vez sobre una base de datos VACIA.
--   * El `ALTER DATABASE` ya no fija el nombre `lazaro_restaurant_db`: usa
--     `current_database()`, así que sirve en cualquier base (Railway, local...).
--   * Las tablas `company_customers` y `company_orders` conservan los nombres de
--     columna del contrato del chatbot (`customer_id`, `total`, `created_at`).
--
--  Uso:
--    psql "$DATABASE_URL_DE_LAZARO" -f scripts/lazaro-test-db/01-esquema.sql
-- =============================================================================

SET client_encoding = 'UTF8';

-- -----------------------------------------------------------------------------
-- 0. Limpieza
-- -----------------------------------------------------------------------------
-- (sin DROP a proposito: este script no borra nada. Si la base ya tiene estas
--  tablas, la carga debe hacerse sobre una base VACIA.)

-- -----------------------------------------------------------------------------
-- 1. Empresa (la razon social que produce los datos)
-- -----------------------------------------------------------------------------
CREATE TABLE empresa (
    id                  smallint PRIMARY KEY DEFAULT 1,
    razon_social        varchar(160) NOT NULL,
    nombre_comercial    varchar(120) NOT NULL,
    nit                 varchar(20)  NOT NULL UNIQUE,
    sector              varchar(40)  NOT NULL DEFAULT 'RESTAURACION',
    fundacion           date         NOT NULL,
    email               varchar(120),
    telefono            varchar(30),
    direccion           varchar(160),
    ciudad              varchar(60)  NOT NULL DEFAULT 'Bogota',
    pais                varchar(40)  NOT NULL DEFAULT 'Colombia',
    moneda              varchar(6)   NOT NULL DEFAULT 'COP',
    CONSTRAINT empresa_unica CHECK (id = 1)
);
COMMENT ON TABLE empresa IS 'Datos maestros de LAZARO SOFTWARE S.A.S. (operadora del negocio de restaurantes)';

-- -----------------------------------------------------------------------------
-- 2. Sucursales (restaurantes de la cadena)
-- -----------------------------------------------------------------------------
CREATE TABLE sucursales (
    id                  smallint PRIMARY KEY,
    codigo              varchar(10)  NOT NULL UNIQUE,
    nombre              varchar(80)  NOT NULL,
    tipo                varchar(20)  NOT NULL
                        CHECK (tipo IN ('RESTAURANTE','CAFE','BAR','COMIDA_RAPIDA','CATERING','FOOD_COURT')),
    direccion           varchar(160) NOT NULL,
    barrio              varchar(60)  NOT NULL,
    ciudad              varchar(60)  NOT NULL DEFAULT 'Bogota',
    telefono            varchar(30),
    email               varchar(120),
    zona_horaria        varchar(60)  NOT NULL DEFAULT 'America/Bogota',
    hora_apertura       time         NOT NULL,
    hora_cierre         time         NOT NULL,
    mesas_activas       smallint     NOT NULL DEFAULT 0,
    fecha_inauguracion  date         NOT NULL,
    gerente             varchar(120) NOT NULL,
    inversion_inicial   numeric(14,2) NOT NULL DEFAULT 0,
    activo              boolean      NOT NULL DEFAULT true,
    CONSTRAINT sucursales_horario CHECK (hora_cierre <> hora_apertura)
);
COMMENT ON TABLE sucursales IS 'Restaurantes/sedes de la cadena';

-- -----------------------------------------------------------------------------
-- 3. Zonas (salon, barra, terraza, cavita) por sucursal
-- -----------------------------------------------------------------------------
CREATE TABLE zonas (
    id                  smallint PRIMARY KEY,
    sucursal_id         smallint     NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    nombre              varchar(50)  NOT NULL,
    tipo                varchar(20)  NOT NULL
                        CHECK (tipo IN ('SALON','BARRA','TERRAZA','DELIVERY','CAVITA','VIP')),
    capacidad_personas  smallint     NOT NULL DEFAULT 0,
    CONSTRAINT zonas_unica UNIQUE (sucursal_id, nombre)
);

-- -----------------------------------------------------------------------------
-- 4. Categorias del menu
-- -----------------------------------------------------------------------------
CREATE TABLE categorias (
    id            smallint PRIMARY KEY,
    codigo        varchar(12)  NOT NULL UNIQUE,
    nombre        varchar(60)  NOT NULL,
    tipo_producto varchar(20)  NOT NULL
                  CHECK (tipo_producto IN ('ENTRADA','PLATO','BEBIDA','POSTRE','ADICIONAL','COMBO','MERCHANDISE')),
    descripcion   text,
    activa        boolean      NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- 5. Productos (platos, bebidas, combos)
-- -----------------------------------------------------------------------------
CREATE TABLE productos (
    id                    integer PRIMARY KEY,
    sku                   varchar(24)  NOT NULL UNIQUE,
    nombre                varchar(120) NOT NULL,
    descripcion           text,
    categoria_id          smallint     NOT NULL REFERENCES categorias(id),
    precio_venta          numeric(12,2) NOT NULL CHECK (precio_venta >= 0),
    costo_producto        numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_producto >= 0),
    iva_pct               numeric(4,2)  NOT NULL DEFAULT 0.19,
    unidad_medida         varchar(20)  NOT NULL DEFAULT 'PORCION'
                          CHECK (unidad_medida IN ('PORCION','GRAMO','ML','BOTTLE','BOTELLA','LATA')),
    tiempo_preparacion_min smallint    NOT NULL DEFAULT 15,
    vegetariano            boolean      NOT NULL DEFAULT false,
    activo                 boolean      NOT NULL DEFAULT true,
    fecha_alta             date         NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT productos_margen CHECK (precio_venta >= costo_producto)
);
COMMENT ON COLUMN productos.precio_venta IS 'Precio de venta en pesos colombianos (COP)';

-- -----------------------------------------------------------------------------
-- 6. Metodos de pago
-- -----------------------------------------------------------------------------
CREATE TABLE metodos_pago (
    id                 smallint PRIMARY KEY,
    codigo             varchar(20) NOT NULL UNIQUE,
    nombre             varchar(50) NOT NULL,
    requiere_referencia boolean NOT NULL DEFAULT false,
    activo             boolean     NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- 7. company_customers
--    Nombres de columna conservados del script original del proyecto
--    (scripts/seed-company-db.sql) para no romper el chatbot.
-- -----------------------------------------------------------------------------
CREATE TABLE company_customers (
    id                  varchar(50) PRIMARY KEY,
    name                varchar(100) NOT NULL,
    current_balance     numeric(10,2) NOT NULL DEFAULT 0.00,
    credit_limit        numeric(10,2) NOT NULL DEFAULT 1000.00,
    -- Extension de datos de contexto (ventas)
    tipo_documento      varchar(12) NOT NULL DEFAULT 'CC'
                        CHECK (tipo_documento IN ('CC','CE','NIT','PAS','PT')),
    documento           varchar(20) NOT NULL,
    email               varchar(120),
    telefono            varchar(20),
    segmento            varchar(20) NOT NULL DEFAULT 'OCASIONAL'
                        CHECK (segmento IN ('OCASIONAL','FRECUENTE','VIP','CORPORATIVO','DELIVERY','EMPRESARIAL')),
    sucursal_principal_id smallint REFERENCES sucursales(id),
    ciudad              varchar(60) NOT NULL DEFAULT 'Bogota',
    fecha_registro      date NOT NULL,
    visitas             integer NOT NULL DEFAULT 0,
    total_gastado       numeric(14,2) NOT NULL DEFAULT 0,
    ultima_visita       date,
    activo              boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_company_customers_documento ON company_customers (documento);
CREATE INDEX idx_company_customers_segmento   ON company_customers (segmento);

-- -----------------------------------------------------------------------------
-- 8. company_orders
--    Nombres de columna conservados del script original del proyecto.
--    `total` incluye impuestos; `subtotal`/`descuento` se guardan por separado.
-- -----------------------------------------------------------------------------
CREATE TABLE company_orders (
    id                  varchar(50) PRIMARY KEY,
    customer_id         varchar(50) REFERENCES company_customers(id),
    status              varchar(30) NOT NULL
                        CHECK (status IN ('PENDIENTE','PROCESANDO','EN_TRANSITO','ENTREGADO','CANCELADO','REEMBOLSADO')),
    total               numeric(10,2) NOT NULL CHECK (total >= 0),
    created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Extension de datos de contexto (ventas)
    sucursal_id         smallint REFERENCES sucursales(id),
    empleado_id         integer,
    mesa_id             integer,
    tipo_servicio       varchar(20) NOT NULL DEFAULT 'MESA'
                        CHECK (tipo_servicio IN ('MESA','LOCAL','DOMICILIO','MENU_CORPORATIVO')),
    canal               varchar(20) NOT NULL DEFAULT 'POS'
                        CHECK (canal IN ('POS','WEB','APP','WHATSAPP','TELEFONO','WHATSAPP_BUSINESS')),
    estado_pago         varchar(20) NOT NULL DEFAULT 'PAGADO'
                        CHECK (estado_pago IN ('PENDIENTE','PARCIAL','PAGADO','REEMBOLSADO')),
    subtotal            numeric(12,2) NOT NULL DEFAULT 0,
    descuento           numeric(12,2) NOT NULL DEFAULT 0,
    impuesto            numeric(12,2) NOT NULL DEFAULT 0,
    propina             numeric(12,2) NOT NULL DEFAULT 0,
    tiempo_servicio_min smallint,
    comentarios         text,
    cerrado_at          timestamp
);
CREATE INDEX idx_company_orders_customer  ON company_orders (customer_id);
CREATE INDEX idx_company_orders_created   ON company_orders (created_at DESC);
CREATE INDEX idx_company_orders_status    ON company_orders (status);
CREATE INDEX idx_company_orders_sucursal  ON company_orders (sucursal_id);

-- -----------------------------------------------------------------------------
-- 9. Empleados (meseros, cajeros, cocineros, repartidores, ...)
-- -----------------------------------------------------------------------------
CREATE TABLE employees (
    id              integer PRIMARY KEY,
    codigo          varchar(12) NOT NULL UNIQUE,
    nombre          varchar(120) NOT NULL,
    tipo_cargo      varchar(20) NOT NULL
                    CHECK (tipo_cargo IN ('MESERO','CAJERO','COCINERO','BARMAN','SUPERVISOR','DOMICILIO','ADMIN')),
    sucursal_id     smallint NOT NULL REFERENCES sucursales(id),
    documento       varchar(20) NOT NULL,
    telefono        varchar(20),
    fecha_ingreso   date NOT NULL,
    salario_base    numeric(10,2) NOT NULL DEFAULT 0,
    comision_pct    numeric(4,2) NOT NULL DEFAULT 0,
    activo          boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_employees_sucursal ON employees (sucursal_id);

-- -----------------------------------------------------------------------------
-- 10. Mesas
-- -----------------------------------------------------------------------------
CREATE TABLE mesas (
    id                integer PRIMARY KEY,
    codigo            varchar(10) NOT NULL UNIQUE,
    sucursal_id       smallint NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    zona_id           smallint REFERENCES zonas(id),
    capacidad         smallint NOT NULL DEFAULT 4 CHECK (capacidad > 0),
    estado            varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
                      CHECK (estado IN ('DISPONIBLE','OCUPADA','RESERVADA','MANTENIMIENTO')),
    fecha_instalacion date NOT NULL DEFAULT CURRENT_DATE
);

-- Las claves foraneas de la orden se agregan aqui porque employees y mesas
-- se crean despues que company_orders.
ALTER TABLE company_orders
    ADD CONSTRAINT fk_orders_empleado FOREIGN KEY (empleado_id) REFERENCES employees(id);
ALTER TABLE company_orders
    ADD CONSTRAINT fk_orders_mesa     FOREIGN KEY (mesa_id)     REFERENCES mesas(id);

-- -----------------------------------------------------------------------------
-- 11. Detalle de la orden (lineas de venta)
-- -----------------------------------------------------------------------------
CREATE TABLE ordenes_detalle (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id          varchar(50) NOT NULL REFERENCES company_orders(id) ON DELETE CASCADE,
    producto_id       integer NOT NULL REFERENCES productos(id),
    cantidad          smallint NOT NULL CHECK (cantidad > 0),
    precio_unitario   numeric(12,2) NOT NULL CHECK (precio_unitario >= 0),
    descuento         numeric(12,2) NOT NULL DEFAULT 0,
    impuesto          numeric(12,2) NOT NULL DEFAULT 0,
    total_linea       numeric(12,2) NOT NULL,
    notas             text,
    estado            varchar(20) NOT NULL DEFAULT 'SERVIDO'
                      CHECK (estado IN ('PENDIENTE','EN_PREPARACION','SERVIDO','CANCELADO','DEVUELTO'))
);
CREATE INDEX idx_ordenes_detalle_order    ON ordenes_detalle (order_id);
CREATE INDEX idx_ordenes_detalle_producto ON ordenes_detalle (producto_id);

-- -----------------------------------------------------------------------------
-- 12. Pagos
-- -----------------------------------------------------------------------------
CREATE TABLE pagos (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id        varchar(50) NOT NULL REFERENCES company_orders(id) ON DELETE CASCADE,
    metodo_pago_id  smallint NOT NULL REFERENCES metodos_pago(id),
    monto           numeric(12,2) NOT NULL CHECK (monto > 0),
    referencia      varchar(60),
    cajero_id       integer REFERENCES employees(id),
    fecha_pago      timestamp NOT NULL
);
CREATE INDEX idx_pagos_order ON pagos (order_id);

-- -----------------------------------------------------------------------------
-- 13. Facturas (electronicas)
-- -----------------------------------------------------------------------------
CREATE TABLE facturas (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero        varchar(24) NOT NULL UNIQUE,
    order_id      varchar(50) NOT NULL UNIQUE REFERENCES company_orders(id) ON DELETE CASCADE,
    cliente_id    varchar(50) REFERENCES company_customers(id),
    subtotal      numeric(12,2) NOT NULL,
    descuento     numeric(12,2) NOT NULL DEFAULT 0,
    impuesto      numeric(12,2) NOT NULL DEFAULT 0,
    propina       numeric(12,2) NOT NULL DEFAULT 0,
    total         numeric(12,2) NOT NULL,
    estado        varchar(20) NOT NULL DEFAULT 'EMITIDA'
                  CHECK (estado IN ('BORRADOR','EMITIDA','PAGADA','ANULADA')),
    fecha_emision timestamp NOT NULL,
    venta_caja    varchar(20),
    resolucion_dian varchar(30)
);
CREATE INDEX idx_facturas_cliente ON facturas (cliente_id);
CREATE INDEX idx_facturas_fecha   ON facturas (fecha_emision DESC);

-- -----------------------------------------------------------------------------
-- 14. Domicilios (delivery)
-- -----------------------------------------------------------------------------
CREATE TABLE domicilios (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id            varchar(50) NOT NULL UNIQUE REFERENCES company_orders(id) ON DELETE CASCADE,
    cliente_id          varchar(50) REFERENCES company_customers(id),
    direccion_destino   varchar(200) NOT NULL,
    barrio_destino      varchar(60),
    zona_id             smallint REFERENCES zonas(id),
    tarifa              numeric(10,2) NOT NULL DEFAULT 0,
    tiempo_prometido_min smallint NOT NULL DEFAULT 40,
    tiempo_real_min     smallint,
    repartidor_id       integer REFERENCES employees(id),
    estado              varchar(20) NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','ASIGNADO','EN_RUTA','ENTREGADO','CANCELADO')),
    metodo_pago         varchar(20) NOT NULL DEFAULT 'EFECTIVO',
    fecha_pedido        timestamp NOT NULL,
    fecha_entrega       timestamp
);
CREATE INDEX idx_domicilios_cliente ON domicilios (cliente_id);
CREATE INDEX idx_domicilios_fecha   ON domicilios (fecha_pedido DESC);

-- -----------------------------------------------------------------------------
-- 15. Promociones
-- -----------------------------------------------------------------------------
CREATE TABLE promociones (
    id          smallint PRIMARY KEY,
    codigo      varchar(20) NOT NULL UNIQUE,
    nombre      varchar(80) NOT NULL,
    tipo        varchar(20) NOT NULL
                CHECK (tipo IN ('PORCENTAJE','FIJO','COMBO','2X1','ENVIO_GRATIS')),
    valor       numeric(12,2) NOT NULL DEFAULT 0,
    fecha_inicio date NOT NULL,
    fecha_fin   date NOT NULL,
    activa      boolean NOT NULL DEFAULT true,
    CONSTRAINT promociones_fechas CHECK (fecha_fin >= fecha_inicio)
);

-- -----------------------------------------------------------------------------
-- 16. Movimientos de inventario
-- -----------------------------------------------------------------------------
CREATE TABLE inventario_movimientos (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id    integer NOT NULL REFERENCES productos(id),
    sucursal_id    smallint NOT NULL REFERENCES sucursales(id),
    tipo_movimiento varchar(20) NOT NULL
                   CHECK (tipo_movimiento IN ('ENTRADA','SALIDA','AJUSTE','DEVOLUCION','MERMA','PRODUCION')),
    cantidad       numeric(12,2) NOT NULL,
    costo_unitario numeric(12,2) NOT NULL DEFAULT 0,
    documento      varchar(40),
    fecha          timestamp NOT NULL
);
CREATE INDEX idx_inventario_producto ON inventario_movimientos (producto_id);
CREATE INDEX idx_inventario_fecha    ON inventario_movimientos (fecha);

-- -----------------------------------------------------------------------------
-- 17. Reservas
-- -----------------------------------------------------------------------------
CREATE TABLE reservas (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo         varchar(16) NOT NULL UNIQUE,
    sucursal_id    smallint NOT NULL REFERENCES sucursales(id),
    mesa_id        integer REFERENCES mesas(id),
    cliente_id     varchar(50) REFERENCES company_customers(id),
    personas       smallint NOT NULL CHECK (personas > 0),
    fecha_reserva  timestamp NOT NULL,
    duracion_min   smallint NOT NULL DEFAULT 90,
    estado         varchar(20) NOT NULL DEFAULT 'CONFIRMADA'
                   CHECK (estado IN ('PENDIENTE','CONFIRMADA','CANCELADA','COMPLETADA','NO_SHOW')),
    total_estimado numeric(12,2) NOT NULL DEFAULT 0,
    motivo_cancelacion text
);
CREATE INDEX idx_reservas_fecha   ON reservas (fecha_reserva DESC);
CREATE INDEX idx_reservas_cliente ON reservas (cliente_id);

-- -----------------------------------------------------------------------------
-- 18. Evaluaciones (servicio al cliente)
-- -----------------------------------------------------------------------------
CREATE TABLE evaluaciones (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id     varchar(50) NOT NULL REFERENCES company_orders(id) ON DELETE CASCADE,
    cliente_id   varchar(50) REFERENCES company_customers(id),
    sucursal_id  smallint NOT NULL REFERENCES sucursales(id),
    calificacion smallint NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comida       smallint CHECK (comida BETWEEN 1 AND 5),
    servicio     smallint CHECK (servicio BETWEEN 1 AND 5),
    ambiente     smallint CHECK (ambiente BETWEEN 1 AND 5),
    tiempo       smallint CHECK (tiempo BETWEEN 1 AND 5),
    comentario   text,
    fecha        timestamp NOT NULL,
    CONSTRAINT evaluaciones_unica UNIQUE (order_id)
);
CREATE INDEX idx_evaluaciones_sucursal ON evaluaciones (sucursal_id);

-- -----------------------------------------------------------------------------
-- 19. Bitacora / auditoria del sistema (trafico del punto de venta)
-- -----------------------------------------------------------------------------
CREATE TABLE bitacora_sistema (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario     varchar(60) NOT NULL,
    modulo      varchar(40) NOT NULL,
    accion      varchar(40) NOT NULL,
    entidad     varchar(40) NOT NULL,
    entidad_id  varchar(40),
    detalle     jsonb,
    fecha       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX idx_bitacora_fecha ON bitacora_sistema (fecha DESC);
CREATE INDEX idx_bitacora_modulo ON bitacora_sistema (modulo);

-- -----------------------------------------------------------------------------
-- 20. Zona horaria y moneda de la base
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    db_name text := current_database();
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', db_name, 'America/Bogota');
    EXECUTE format('ALTER DATABASE %I SET lc_monetary TO %L', db_name, 'C');
    EXECUTE format('ALTER DATABASE %I SET DateStyle TO %L', db_name, 'ISO, MDY');
END
$do$;
