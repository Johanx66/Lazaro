-- =============================================================================
--  DATOS DE PRUEBA - LAZARO SOFTWARE S.A.S. (cadena de restaurantes)
--  Volumen objetivo: > 3 MB de base de datos (el script genera ~50 MB de datos
--  en 19 tablas y 13 vistas analiticas).
--
--  Para reproducibilidad se fija la semilla del generador aleatorio.
--
--  IMPORTANTE: TODOS ESTOS DATOS SON FICTICIOS (generados aleatoriamente para
--  pruebas). No contienen datos de clientes reales ni de personas reales.
--
--  Los identificadores de cliente son 'CLI-000001' .. 'CLI-001500' y los de
--  pedido 'LZS-AAAA-NNNNNN'. Son los que se asignan en el panel del chatbot
--  (campo "Código de cliente").
--
--  Uso:
--    psql "$DATABASE_URL_DE_LAZARO" -f scripts/lazaro-test-db/02-datos.sql
-- =============================================================================

SET client_encoding = 'UTF8';
SELECT setseed(0.424242);

-- -----------------------------------------------------------------------------
-- 1. Empresa
-- -----------------------------------------------------------------------------
INSERT INTO empresa (id, razon_social, nombre_comercial, nit, sector, fundacion,
                     email, telefono, direccion, ciudad, pais, moneda)
VALUES (1,
        'LAZARO SOFTWARE S.A.S.', 'Lazaro Kitchen & Coffee', '901.456.789-1',
        'RESTAURACION', DATE '2016-03-18',
        'info@lazarosoftware.co', '+57 601 742 8800',
        'Carrera 11 # 93-45, Oficina 802', 'Bogota', 'Colombia', 'COP');

-- -----------------------------------------------------------------------------
-- 2. Sucursales (10 sedes)
-- -----------------------------------------------------------------------------
INSERT INTO sucursales (id, codigo, nombre, tipo, direccion, barrio, ciudad, telefono,
                        email, hora_apertura, hora_cierre, mesas_activas, fecha_inauguracion,
                        gerente, inversion_inicial, activo)
VALUES
(1,  'BOG-CHI', 'Lazaro Chicó',            'RESTAURANTE', 'Calle 85 # 11-54',            'El Chicó',      'Bogota',      '+57 601 745 1101', 'chico@lazarosoftware.co', '11:00', '23:00', 46, DATE '2016-05-20', 'Marta Rojas',      185000000, true),
(2,  'BOG-CHA', 'Lazaro Chapinero',        'RESTAURANTE', 'Calle 57 # 9-22',              'Chapinero',     'Bogota',      '+57 601 745 1102', 'chapinero@lazarosoftware.co', '11:30', '23:30', 38, DATE '2017-09-02', 'Julian Betancur',   142000000, true),
(3,  'BOG-USA', 'Lazaro Usaquén',           'RESTAURANTE', 'Carrera 7 # 71-18',            'Usaquén',       'Bogota',      '+57 601 745 1103', 'usaquen@lazarosoftware.co', '10:00', '22:00', 52, DATE '2016-11-11', 'Laura Palacios',   210000000, true),
(4,  'BOG-ZOT', 'Lazaro Zona T',            'BAR',         'Calle 110 # 34-15',            'Zona T',        'Bogota',      '+57 601 745 1104', 'zonat@lazarosoftware.co', '12:00', '02:00', 30, DATE '2018-06-08', 'Andres Villamil',   980000000, true),
(5,  'MED-POB', 'Lazaro El Poblado',        'RESTAURANTE', 'Carrera 37 # 8A-45',           'El Poblado',    'Medellin',   '+57 604 428 2201', 'poblado@lazarosoftware.co', '11:00', '23:00', 44, DATE '2017-02-14', 'Sara Montoya',    165000000, true),
(6,  'MED-LAR', 'Lazaro Laureles',          'CAFE',        'Carrera 37 # 40-22',           'Laureles',      'Medellin',   '+57 604 428 2202', 'laureles@lazarosoftware.co', '07:00', '21:00', 26, DATE '2019-01-20', 'Diego Alzate',     72000000, true),
(7,  'CAL-SAN', 'Lazaro San Fernando',      'RESTAURANTE', 'Calle 10 # 34-19',             'San Fernando',  'Cali',        '+57 602 884 3301', 'sanfernando@lazarosoftware.co', '11:00', '23:00', 40, DATE '2018-03-03', 'Camilo Restrepo',  131000000, true),
(8,  'BOG-SAL', 'Lazaro Salitre',           'COMIDA_RAPIDA','Calle 26 # 37-19',            'Salitre',       'Bogota',      '+57 601 745 1105', 'salitre@lazarosoftware.co', '10:30', '22:30', 22, DATE '2019-08-16', 'Daniel Ocampo',    58000000, true),
(9,  'BAR-CAT', 'Lazaro Bocagrande',        'CATERING',     'Carrera 1 # 33-40',            'El Bocagrande', 'Barranquilla','+57 605 321 4401','bocagrande@lazarosoftware.co', '09:00', '20:00', 18, DATE '2020-05-25', 'Veronica Guzman',  47000000, true),
(10, 'BOG-CAV', 'Lazaro La Cavita',         'RESTAURANTE', 'Diagonal 170 # 8-90',          'La Candelaria', 'Bogota',      '+57 601 745 1106', 'cavita@lazarosoftware.co', '12:00', '23:30', 28, DATE '2020-11-13', 'Ricardo Molina',   89000000, false);

-- -----------------------------------------------------------------------------
-- 3. Zonas por sucursal
-- -----------------------------------------------------------------------------
INSERT INTO zonas (id, sucursal_id, nombre, tipo, capacidad_personas)
SELECT (s.id * 10) + z.n,
       s.id,
       CASE z.n
         WHEN 1 THEN 'Salon Principal'
         WHEN 2 THEN 'Barra'
         WHEN 3 THEN 'Terraza'
         WHEN 4 THEN 'Cavita VIP'
         ELSE 'Delivery'
       END,
       CASE z.n
         WHEN 1 THEN 'SALON'
         WHEN 2 THEN 'BARRA'
         WHEN 3 THEN 'TERRAZA'
         WHEN 4 THEN 'VIP'
         ELSE 'DELIVERY'
       END,
       20 + z.n * 6
FROM sucursales s
CROSS JOIN generate_series(1, 5) AS z(n);

-- -----------------------------------------------------------------------------
-- 4. Categorias del menu
-- -----------------------------------------------------------------------------
INSERT INTO categorias (id, codigo, nombre, tipo_producto, descripcion, activa)
VALUES
(1,  'ENT',  'Entradas',                   'ENTRADA',    'Para compartir mientras espera', true),
(2,  'CASA', 'Platos de la casa',          'PLATO',      'Especialidades de la cocina Lazaro', true),
(3,  'TIP',  'Platos tipicos',             'PLATO',      'Cocina colombiana tradicional', true),
(4,  'HAM',  'Hamburguesas',               'PLATO',      'Carnes maduradas al punto', true),
(5,  'PIZ',  'Pizzas',                     'PLATO',      'Masa artesanal de 24 horas', true),
(6,  'ENS',  'Ensaladas',                  'PLATO',      'Frescas y workings de temporada', true),
(7,  'POS',  'Postres',                    'POSTRE',     'Opciones para compartir', true),
(8,  'BCH',  'Bebidas calientes',          'BEBIDA',     'Cafe de especialidad y te', true),
(9,  'BCF',  'Bebidas frias',              'BEBIDA',     'Limonada, jugos y milkshakes', true),
(10, 'CER',  'Cervezas',                   'BEBIDA',     'Importadas y artesanales', true),
(11, 'COM',  'Combos',                     'COMBO',      'Plato + bebida + postre', true),
(12, 'ADI',  'Adicionales',                'ADICIONAL',  'Papas, salsas y extras', true);

-- -----------------------------------------------------------------------------
-- 5. Productos (109 referencias de menu)
-- -----------------------------------------------------------------------------
INSERT INTO productos (id, sku, nombre, descripcion, categoria_id, precio_venta,
                       costo_producto, iva_pct, unidad_medida, tiempo_preparacion_min,
                       vegetariano, activo, fecha_alta)
VALUES
-- Entradas (1)
(1,  'ENT-001', 'Arepas de chocoqui con queso (2 und)',   'Masa de maiz dulce con queso campesino', 1, 12000, 4200, 0.19, 'PORCION', 10, true,  true, DATE '2016-05-20'),
(2,  'ENT-002', 'Empanadas de carne (3 und)',              'Masa quebrada rellena de carne mechada', 1, 13500, 5100, 0.19, 'PORCION', 12, false, true,  DATE '2016-05-20'),
(3,  'ENT-003', 'Patacones con hogao (3 und)',             'Platano verde con hogao de tomate', 1, 14000, 4600, 0.19, 'PORCION', 14, true,  true, DATE '2016-05-20'),
(4,  'ENT-004', 'Croquetas de pollo (4 und)',              'Pollo apanado con dip de ajo', 1, 13000, 4300, 0.19, 'PORCION', 12, false, true,  DATE '2016-08-11'),
(5,  'ENT-005', 'Palomas de camaron (4 und)',              'Camaron apanado en panko', 1, 22000, 8900, 0.19, 'PORCION', 18, false, true, DATE '2017-02-05'),
(6,  'ENT-006', 'Sopa de papa deafrita',                  'Crema de papa con capea y queso', 1, 9000, 2500, 0.19, 'PORCION', 10, true,  true, DATE '2017-06-30'),
-- Platos de la casa (2)
(7,  'CAS-001', 'Bandeja paisa completa',                  'Arroz, frjol, chicharron, egg, chorizo, arepa', 2, 32000, 13500, 0.19, 'PORCION', 30, false, true, DATE '2016-05-20'),
(8,  'CAS-002', 'Arroz con pollo al estilo de la casa',    'Pollo guisado con arroz de coco', 2, 19000, 7600, 0.19, 'PORCION', 25, false, true, DATE '2016-05-20'),
(9,  'CAS-003', 'Pollo guisado con championship',          'Pechuga en salsa de tomate y champinones', 2, 18500, 7100, 0.19, 'PORCION', 25, false, true, DATE '2016-05-20'),
(10, 'CAS-004', 'Sancocho de gallina con arroz y ensalada','Gallo guisado con yuca y platano', 2, 21000, 8400, 0.19, 'PORCION', 35, false, true, DATE '2016-11-11'),
(11, 'CAS-005', 'Chulapa de pollo con ensalada',           'Pollo a la plancha con alcaparras', 2, 19500, 7900, 0.19, 'PORCION', 25, false, true, DATE '2017-03-15'),
(12, 'CAS-006', 'Carne sudada con puré de papas',          'Punta de anca en salsa gravy', 2, 26500, 11800, 0.19, 'PORCION', 28, false, true, DATE '2017-09-02'),
(13, 'CAS-007', 'Picada paisa para dos',                   'Seleccion de cortes con acompanamientos', 2, 54000, 22500, 0.19, 'PORCION', 40, false, true, DATE '2018-03-03'),
(14, 'CAS-008', 'Pasta al pomodoro con albahaca',          'Salsa de tomate rostizado y queso pecorino', 2, 24000, 8200, 0.19, 'PORCION', 22, true,  true, DATE '2018-06-08'),
(15, 'CAS-009', 'Risotto de hongos champinones',           'Arroz cremoso con hongos', 2, 28000, 9900, 0.19, 'PORCION', 28, true,  true, DATE '2019-01-20'),
(16, 'CAS-010', 'Lasaña de carne con salsa blanca',        'Capas de pasta al horno', 2, 26000, 10100, 0.19, 'PORCION', 30, false, true, DATE '2019-08-16'),
(17, 'CAS-011', 'Wok de pollo con vegetales',              'Salteado en wok con wok oriental', 2, 23500, 8700, 0.19, 'PORCION', 20, false, true, DATE '2020-11-13'),
(18, 'CAS-012', 'Salmon al ajillo con puré',               'Lomo de salmon con ajo confitado', 2, 39000, 18500, 0.19, 'PORCION', 25, false, true, DATE '2021-04-09'),
-- Platos tipicos (3)
(19, 'TIP-001', 'Ajiaco santafereño',                      'Guiso de pollo con maitaca y habichuela', 3, 23000, 9200, 0.19, 'PORCION', 30, false, true, DATE '2016-05-20'),
(20, 'TIP-002', 'Sancocho de gallina macho',               'Guiso de gallina con maiz y yuca', 3, 20500, 8300, 0.19, 'PORCION', 35, false, true, DATE '2016-05-20'),
(21, 'TIP-003', 'Mote de queso con mariscos',              'Maiz dulce con queso y camarones', 3, 17500, 6900, 0.19, 'PORCION', 18, false, true, DATE '2016-08-11'),
(22, 'TIP-004', 'Arepa de chócoli con huevo',              'Arepa mediana con huevo cocido', 3, 11000, 3900, 0.19, 'PORCION', 12, true,  true, DATE '2017-02-05'),
(23, 'TIP-005', 'Caldo de pescado con verduras',           'Sopa clara de pescado con cilantro', 3, 12500, 4400, 0.19, 'PORCION', 15, false, true, DATE '2017-06-30'),
(24, 'TIP-006', 'Frjol con hogao y chicharron',            'Frjol criollo con arroz y hogao', 3, 17500, 6800, 0.19, 'PORCION', 20, false, true, DATE '2017-09-02'),
(25, 'TIP-007', 'Chicharron de cerdo con arepa',           'Costilla de cerdo frita y arepa', 3, 21500, 9100, 0.19, 'PORCION', 20, false, true, DATE '2018-03-03'),
(26, 'TIP-008', 'Sobrebarril de pollo guisado',            'Pollo en olla de barro con patacones', 3, 24500, 9700, 0.19, 'PORCION', 30, false, true, DATE '2018-06-08'),
(27, 'TIP-009', 'Ropa vieja con patacones',                'Carne desmechada en salsa de tomate', 3, 22000, 8800, 0.19, 'PORCION', 28, false, true, DATE '2019-01-20'),
(28, 'TIP-010', 'Pastel de pollo con papas',               'Masa de maiz horneada', 3, 14000, 5200, 0.19, 'PORCION', 18, false, true, DATE '2019-08-16'),
-- Hamburguesas (4)
(29, 'HAM-001', 'Hamburguesa Lazaro clasica',              'Carne 180g, queso, lechuga, tomate y salsas', 4, 26500, 10800, 0.19, 'PORCION', 18, false, true, DATE '2016-11-11'),
(30, 'HAM-002', 'Hamburguesa con tocineta y queso ahumado', 'Doble carne, tocineta y cheddar', 4, 31500, 13400, 0.19, 'PORCION', 20, false, true, DATE '2017-02-05'),
(31, 'HAM-003', 'Hamburguesa vegetariana de lentejas',     'Lentejas, Champinones y queso vegano', 4, 24500, 9600, 0.19, 'PORCION', 18, true,  true, DATE '2017-09-02'),
(32, 'HAM-004', 'Hamburguesa de pollo crujiente',          'Pollo empanizado con ensalada de coleslaw', 4, 25500, 10100, 0.19, 'PORCION', 18, false, true, DATE '2018-03-03'),
(33, 'HAM-005', 'Hamburguesa blue cheese',                 'Queso azul, pepinazos y cebolla caramelizada', 4, 29500, 12100, 0.19, 'PORCION', 20, false, true, DATE '2018-06-08'),
(34, 'HAM-006', 'Hamburguesa doble queso y bacon',         'Doble carne y bacon ahumado', 4, 33000, 14100, 0.19, 'PORCION', 22, false, true, DATE '2019-01-20'),
(35, 'HAM-007', 'Hamburguesa de la casa con champinones',   'Nuestra receta signature con salsa de la casa', 4, 30500, 12600, 0.19, 'PORCION', 20, false, true, DATE '2019-08-16'),
(36, 'HAM-008', 'Hamburguesa hawaiana de pino',            'Pina, jamon y salsa de soja', 4, 27500, 11200, 0.19, 'PORCION', 18, false, true, DATE '2020-05-25'),
-- Pizzas (5)
(37, 'PIZ-001', 'Pizza margarita',                         'Tomate, mozzarella y albahaca', 5, 29000, 10500, 0.19, 'PORCION', 25, true,  true, DATE '2016-05-20'),
(38, 'PIZ-002', 'Pizza pepperoni',                         'Pepperoni picante y mozzarella', 5, 34500, 12800, 0.19, 'PORCION', 25, false, true, DATE '2016-05-20'),
(39, 'PIZ-003', 'Pizza hawaiana',                          'Jamon, pina y maiz dulce', 5, 33500, 12400, 0.19, 'PORCION', 25, false, true, DATE '2016-08-11'),
(40, 'PIZ-004', 'Pizza vegetariana',                       'Pimientos, champinones, olivas y queso', 5, 31500, 11200, 0.19, 'PORCION', 25, true,  true, DATE '2017-02-05'),
(41, 'PIZ-005', 'Pizza cuatro quesos',                     'Mozzarella, gorgonzola, parmesano y azul', 5, 36500, 13600, 0.19, 'PORCION', 26, true,  true, DATE '2017-06-30'),
(42, 'PIZ-006', 'Pizza con camarones y pesto',             'Camarones, pesto y tomate cherry', 5, 39500, 15200, 0.19, 'PORCION', 28, false, true, DATE '2017-09-02'),
(43, 'PIZ-007', 'Pizza de carne desmechada',               'Pollo o carne desmechada con cebolla', 5, 35500, 13100, 0.19, 'PORCION', 26, false, true, DATE '2018-03-03'),
(44, 'PIZ-008', 'Pizza bacon y huevo',                     'Bacon, huevo y salsa BBQ', 5, 34500, 12700, 0.19, 'PORCION', 25, false, true, DATE '2018-06-08'),
(45, 'PIZ-009', 'Pizza caprese',                           'Tomate, mozzarella fresca y pesto', 5, 32000, 11500, 0.19, 'PORCION', 24, true,  true, DATE '2019-01-20'),
(46, 'PIZ-010', 'Pizza diavola picante',                    'Pepperoni, jalapeno y salsa picante', 5, 35500, 13400, 0.19, 'PORCION', 26, false, true, DATE '2019-08-16'),
-- Ensaladas (6)
(47, 'ENS-001', 'Ensalada cesar con pollo',                'Lechuga romana, pollo, crutones y parmesan', 6, 22500, 7900, 0.19, 'PORCION', 15, false, true, DATE '2017-03-15'),
(48, 'ENS-002', 'Ensalada caprese',                        'Tomate, mozzarella, albahaca y pesto', 6, 19500, 7100, 0.19, 'PORCION', 12, true,  true, DATE '2017-09-02'),
(49, 'ENS-003', 'Ensalada de aguacate y mango',            'Mango, palta, lechuga y limon', 6, 21000, 7800, 0.19, 'PORCION', 12, true,  true, DATE '2018-03-03'),
(50, 'ENS-004', 'Ensalada de quinoa y falafel',            'Quinoa, falafel, tomate cherry y tahini', 6, 23000, 8200, 0.19, 'PORCION', 15, true,  true, DATE '2018-06-08'),
(51, 'ENS-005', 'Ensalada de pollo al ajillo',             'Pechuga a la plancha con ensalada verde', 6, 24500, 8700, 0.19, 'PORCION', 16, false, true, DATE '2019-01-20'),
(52, 'ENS-006', 'Ensalada de atun y aceitunas',            'Atun, aceitunas, huevo y pimiento', 6, 20500, 7600, 0.19, 'PORCION', 12, false, true, DATE '2020-11-13'),
-- Postres (7)
(53, 'POS-001', 'Brownie con helado de vainilla',          'Brownie tibio con helado de vainilla', 7, 14500, 4900, 0.19, 'PORCION', 8, true,  true, DATE '2016-05-20'),
(54, 'POS-002', 'Cheesecake de lichi',                     'Base de galleta y crema de lichi', 7, 13500, 4400, 0.19, 'PORCION', 6, true,  true, DATE '2016-08-11'),
(55, 'POS-003', 'Flan de coco con cafe de olla',           'Flan casero con cafe de olla', 7, 11000, 3400, 0.19, 'PORCION', 6, true,  true, DATE '2017-02-05'),
(56, 'POS-004', 'Sundae de fresa con crema chantilly',     'Tres bolas de helado de fresa', 7, 12000, 3900, 0.19, 'PORCION', 5, true,  true, DATE '2017-06-30'),
(57, 'POS-005', 'Pastel de tres leches',                   'Bizcocho HUMEDO con crema de leche', 7, 15000, 5100, 0.19, 'PORCION', 6, true,  true, DATE '2017-09-02'),
(58, 'POS-006', 'Volcano de chocolate con helado',         'Pastel tibio con helado de vainilla', 7, 17500, 6200, 0.19, 'PORCION', 10, true,  true, DATE '2018-03-03'),
(59, 'POS-007', 'Copa de frutas con helado',              'Mix de frutas de temporada', 7, 12500, 4100, 0.19, 'PORCION', 5, true,  true, DATE '2018-06-08'),
(60, 'POS-008', 'Churros con chocolate y arequipe',        'Churros calienticos con chocolate', 7, 13000, 4300, 0.19, 'PORCION', 7, true,  true, DATE '2019-01-20'),
-- Bebidas calientes (8)
(61, 'BCH-001', 'Cafe de olla pequeno',                    'Cafe de olla 8 oz', 8, 4500, 1200, 0.19, 'ML', 4, true,  true, DATE '2016-05-20'),
(62, 'BCH-002', 'Cafe de olla grande',                     'Cafe de olla 16 oz', 8, 7000, 1900, 0.19, 'ML', 4, true,  true, DATE '2016-05-20'),
(63, 'BCH-003', 'Espresso',                               'Doble shot de cafe', 8, 5000, 1400, 0.19, 'ML', 3, true,  true, DATE '2016-05-20'),
(64, 'BCH-004', 'Capuchino',                              'Espresso con leche vaporizada', 8, 9500, 2600, 0.19, 'ML', 6, true,  true, DATE '2016-08-11'),
(65, 'BCH-005', 'Latte de vainilla',                       'Espresso, leche y vainilla', 8, 10500, 2900, 0.19, 'ML', 6, true,  true, DATE '2017-02-05'),
(66, 'BCH-006', 'Chocolate caliente con marshmallows',     'Chocolate espeso con marshmallows', 8, 12000, 3500, 0.19, 'ML', 7, true,  true, DATE '2017-06-30'),
(67, 'BCH-007', 'Te de manzanilla',                        'Infusion de manzanilla', 8, 5000, 1100, 0.19, 'ML', 4, true,  true, DATE '2018-03-03'),
(68, 'BCH-008', 'Cafe frappe de coffee',                   'Frappe batido con cafe', 8, 13500, 3900, 0.19, 'ML', 8, true,  true, DATE '2019-08-16'),
-- Bebidas frias (9)
(69, 'BCF-001', 'Limonada de menta',                       'Limonada con hierbabuena', 9, 9500, 2400, 0.19, 'ML', 5, true,  true, DATE '2016-05-20'),
(70, 'BCF-002', 'Limonada de coco',                       'Limonada de coco natural', 9, 10500, 2700, 0.19, 'ML', 5, true,  true, DATE '2016-08-11'),
(71, 'BCF-003', 'Jugo de mango natural 16 oz',             'Jugo prensado de mango', 9, 8500, 2100, 0.19, 'ML', 4, true,  true, DATE '2017-02-05'),
(72, 'BCF-004', 'Jugo de lulo con agua de coco',            NULL, 9, 9000, 2300, 0.19, 'ML', 4, true,  true, DATE '2017-06-30'),
(73, 'BCF-005', 'Jugo de maracuya 16 oz',                  'Jugo de maracuya natural', 9, 9000, 2200, 0.19, 'ML', 4, true,  true, DATE '2017-09-02'),
(74, 'BCF-006', 'Agua de melon con hierbabuena',              NULL, 9, 11000, 2900, 0.19, 'ML', 5, true,  true, DATE '2018-03-03'),
(75, 'BCF-007', 'Milkshake de fresa 16 oz',               'Batido de helado de fresa', 9, 14500, 4300, 0.19, 'ML', 7, true,  true, DATE '2018-06-08'),
(76, 'BCF-008', 'Milkshake de chocolate 16 oz',            'Batido de helado de chocolate', 9, 14500, 4300, 0.19, 'ML', 7, true,  true, DATE '2019-01-20'),
(77, 'BCF-009', 'Limonada de jamaica',                    'Limonada de flor de jamaica', 9, 10000, 2500, 0.19, 'ML', 5, true,  true, DATE '2020-11-13'),
-- Cervezas (10)
(78, 'CER-001', 'Cerveza nacional Lager 330 ml',           'Cerveza ligera nacional', 10, 7500, 2600, 0.19, 'LATA', 2, true,  true, DATE '2016-05-20'),
(79, 'CER-002', 'Cerveza artesanal IPA 330 ml',            'IPA de cerveceria local', 10, 13500, 5200, 0.19, 'LATA', 2, true,  true, DATE '2017-02-05'),
(80, 'CER-003', 'Cerveza artesanal Stout 330 ml',          'Stout oscuro con cafe', 10, 14500, 5600, 0.19, 'LATA', 2, true,  true, DATE '2017-06-30'),
(81, 'CER-004', 'Cerveza importada Pilsen 330 ml',         'Pilsen europea premium', 10, 11500, 4300, 0.19, 'LATA', 2, true,  true, DATE '2018-03-03'),
(82, 'CER-005', 'Cerveza sin alcohol 330 ml',              'Cerveza 0.0%', 10, 8500, 3000, 0.19, 'LATA', 2, true,  true, DATE '2020-05-25'),
(83, 'CER-006', 'Michelada Lazaro',                       'Cerveza con limon, sal y chile', 10, 12500, 3400, 0.19, 'PORCION', 4, true,  true, DATE '2019-08-16'),
(84, 'CER-007', 'Cerveza artesanal Pale Ale 355 ml',       'Pale ale de baixa fermentacion', 10, 15500, 6100, 0.19, 'BOTELLA', 2, true,  true, DATE '2020-11-13'),
(85, 'CER-008', 'Cocteles de la casa - Margarita',         'Tequila, triple sec y Margarita de la casa', 10, 18500, 6200, 0.19, 'PORCION', 6, true,  true, DATE '2018-06-08'),
(86, 'CER-009', 'Cocteles de la casa - Mojito',             'Ron, menta y lima', 10, 17500, 5800, 0.19, 'PORCION', 6, true,  true, DATE '2018-06-08'),
(87, 'CER-010', 'Cocteles de la casa - Aperol Spritz',      'Aperol, prosecco y naranja', 10, 19500, 6500, 0.19, 'PORCION', 5, true,  true, DATE '2021-04-09'),
-- Combos (11)
(88, 'COM-001', 'Combo personal de almuerzo',              'Plato del dia, sopa, jugo y postre', 11, 39500, 16500, 0.19, 'PORCION', 25, false, true, DATE '2017-03-15'),
(89, 'COM-002', 'Combo personal de cena',                  'Plato del dia, jugo y postre', 11, 42500, 17800, 0.19, 'PORCION', 25, false, true, DATE '2017-09-02'),
(90, 'COM-003', 'Combo ejecutivo',                         'Hamburguesa, papas, jugo y postre', 11, 38500, 15900, 0.19, 'PORCION', 25, false, true, DATE '2018-03-03'),
(91, 'COM-004', 'Combo vegetariano',                       'Ensalada, jugo y postre', 11, 35500, 14100, 0.19, 'PORCION', 22, true,  true, DATE '2018-06-08'),
(92, 'COM-005', 'Combo pareja',                            'Dos platos del dia, dos jugos y postre para compartir', 11, 72000, 30500, 0.19, 'PORCION', 35, false, true, DATE '2019-01-20'),
(93, 'COM-006', 'Combo familiar (4 personas)',             'Cuatro platos, cuatro jugos y postre', 11, 128000, 54000, 0.19, 'PORCION', 45, false, true, DATE '2019-08-16'),
(94, 'COM-007', 'Combo hamburguesa + cerveza',             'Hamburguesa, papas y cerveza artesanal', 11, 39500, 16100, 0.19, 'PORCION', 25, false, true, DATE '2020-05-25'),
(95, 'COM-008', 'Combo pizza + postre',                    'Pizza mediana y postre para compartir', 11, 42500, 17000, 0.19, 'PORCION', 28, false, true, DATE '2020-11-13'),
(96, 'COM-009', 'Combo certificado corporate',              'Almuerzo ejecutivo para reuniones', 11, 38500, 15200, 0.19, 'PORCION', 22, false, true, DATE '2021-04-09'),
(97, 'COM-010', 'Combo Premium',                           'Plato del dia, jugo premium y postre de la casa', 11, 46500, 18800, 0.19, 'PORCION', 25, false, true, DATE '2021-04-09'),
-- Adicionales (12)
(98,  'ADI-001', 'Papas a la francesa',                     'Porcion de papas fritas', 12, 7500, 2100, 0.19, 'PORCION', 8, true,  true, DATE '2016-05-20'),
(99,  'ADI-002', 'Papas con tocineta y queso',              'Papas salteadas con tocineta y queso fundido', 12, 11500, 3400, 0.19, 'PORCION', 10, false, true, DATE '2016-08-11'),
(100, 'ADI-003', 'Ensalada pequena de la casa',             'Lechugas, tomate y cebolla', 12, 6500, 1900, 0.19, 'PORCION', 6, true,  true, DATE '2017-02-05'),
(101, 'ADI-004', 'Hummus con pan pita',                     'Hummus de garbanzo con pan', 12, 9000, 2600, 0.19, 'PORCION', 5, true,  true, DATE '2017-06-30'),
(102, 'ADI-005', 'Tostadas de\Schema',                      NULL, 12, 10500, 3100, 0.19, 'PORCION', 8, true,  true, DATE '2017-09-02'),
(103, 'ADI-006', 'Queso fundido con chorizo',               'Fundido de queso con chorizo', 12, 15500, 5600, 0.19, 'PORCION', 10, false, true, DATE '2018-03-03'),
(104, 'ADI-007', 'Morro de iguana (150 g)',                 'Croqueta de carne de iguana', 12, 18500, 6800, 0.19, 'PORCION', 10, false, true, DATE '2018-06-08'),
(105, 'ADI-008', 'Chicharron de cerdo adicional',           'Media libra de chicharron', 12, 21000, 8900, 0.19, 'GRAMO', 12, false, true, DATE '2019-01-20'),
(106, 'ADI-009', 'Arepa de queso (1 und)',                  'Arepa con queso campesino', 12, 5000, 1500, 0.19, 'PORCION', 5, true,  true, DATE '2019-08-16'),
(107, 'ADI-010', 'Salsa de ajo (extra)',                   'Salsa de ajo artesanal', 12, 2000, 500, 0.19, 'PORCION', 1, true,  true, DATE '2020-05-25'),
(108, 'ADI-011', 'Salsa de la casa (extra)',                'Salsa secreta de la casa', 12, 2500, 600, 0.19, 'PORCION', 1, true,  true, DATE '2020-11-13'),
(109, 'ADI-012', 'Copa de vino tinto (150 ml)',             'Vino tinto de la casa', 12, 16000, 6000, 0.19, 'ML', 3, true,  true, DATE '2021-04-09');

-- -----------------------------------------------------------------------------
-- 6. Metodos de pago
-- -----------------------------------------------------------------------------
INSERT INTO metodos_pago (id, codigo, nombre, requiere_referencia, activo)
VALUES (1, 'EFECTIVO',       'Efectivo',                false, true),
       (2, 'TARJETA_DEBITO',  'Tarjeta debito',          false, true),
       (3, 'TARJETA_CREDITO', 'Tarjeta credito',         false, true),
       (4, 'PSE',             'PSE / transferencia',     true,  true),
       (5, 'NEQUI',           'Nequi',                   true,  true),
       (6, 'DAVIPLATA',       'Daviplata',               true,  true),
       (7, 'CREDITO_EMPRESA', 'Credito corporativo',     true,  true),
       (8, 'BONO',            'Bono / gift card',        true,  true);

-- -----------------------------------------------------------------------------
-- 7. Empleados (54: 6 por sucursal)
-- -----------------------------------------------------------------------------
INSERT INTO employees (id, codigo, nombre, tipo_cargo, sucursal_id, documento,
                       telefono, fecha_ingreso, salario_base, comision_pct, activo)
SELECT (s.id * 100) + e.n,
       'EMP-' || lpad((s.id * 100 + e.n)::text, 4, '0'),
       (ARRAY['Juan','Carlos','Andres','Felipe','David','Alejandro','Luis','Miguel','Camilo','Sebastian','Daniel','Jorge','Sergio','Eduardo','Fernando','Ricardo','Mauricio','Hector','Nelson','Oscar'])
         [1 + floor(random() * 20)::int] || ' ' ||
       (ARRAY['Gomez','Rodriguez','Perez','Martinez','Lopez','Hernandez','Garcia','Sanchez','Ramirez','Torres','Flores','Romero','Suarez','Cardona','Velez','Castro','Ospina','Zapata','Bernal','Quintero'])
         [1 + floor(random() * 20)::int],
       CASE e.n
         WHEN 1 THEN 'MESERO'
         WHEN 2 THEN 'MESERO'
         WHEN 3 THEN 'MESERO'
         WHEN 4 THEN 'CAJERO'
         WHEN 5 THEN 'COCINERO'
         ELSE 'SUPERVISOR'
       END,
       s.id,
       lpad((1000000000 + s.id * 100000 + e.n * 1000 + floor(random() * 999)::int)::text, 10, '0'),
       '+57 3' || lpad((10 + floor(random() * 90)::int)::text, 2, '0') || ' ' ||
             lpad((2000000 + floor(random() * 8999999)::int)::text, 7, '0'),
       DATE '2016-01-01' + (floor(random() * 3200)::int * INTERVAL '1 day'),
       CASE e.n
         WHEN 1 THEN 2200000 WHEN 2 THEN 2200000 WHEN 3 THEN 2200000
         WHEN 4 THEN 2600000 WHEN 5 THEN 2400000 ELSE 3800000
       END,
       CASE WHEN e.n IN (1,2,3) THEN 2.50 ELSE 0 END,
       (s.id <> 10) OR (e.n <> 6)
FROM sucursales s
CROSS JOIN generate_series(1, 6) AS e(n);

-- -----------------------------------------------------------------------------
-- 8. Mesas (10 por sucursal)
-- -----------------------------------------------------------------------------
INSERT INTO mesas (id, codigo, sucursal_id, zona_id, capacidad, estado, fecha_instalacion)
SELECT (s.id * 100) + m.n,
       'M' || lpad(s.id::text, 2, '0') || '-' || lpad(m.n::text, 2, '0'),
       s.id,
       (s.id * 10) + (1 + floor(random() * 4)::int),
       CASE WHEN m.n % 3 = 0 THEN 6 WHEN m.n % 3 = 1 THEN 4 ELSE 2 END,
       'DISPONIBLE',
       s.fecha_inauguracion
FROM sucursales s
CROSS JOIN generate_series(1, 10) AS m(n);

-- -----------------------------------------------------------------------------
-- 9. company_customers (1.500 clientes)
-- -----------------------------------------------------------------------------
INSERT INTO company_customers (id, name, current_balance, credit_limit, tipo_documento,
                                documento, email, telefono, segmento, sucursal_principal_id,
                                ciudad, fecha_registro, visitas, total_gastado, ultima_visita, activo)
SELECT 'CLI-' || lpad(c.n::text, 6, '0'),
       (ARRAY['Juan','Carlos','Andres','Felipe','David','Alejandro','Luis','Miguel','Camilo','Sebastian','Daniel','Jorge','Sergio','Eduardo','Fernando','Ricardo','Mauricio','Hector','Nelson','Oscar','Julio','Ivan','Oscar','Wilson','Armando','Wilson','Aldo','Yamid','Steven','Brayan','Gianluca'])
         [1 + floor(random() * 30)::int] || ' ' ||
       (ARRAY['Gomez','Rodriguez','Perez','Martinez','Lopez','Hernandez','Garcia','Sanchez','Ramirez','Torres','Flores','Romero','Suarez','Cardona','Velez','Castro','Ospina','Zapata','Bernal','Quintero','Molina','Salazar','Escobar','Cuadrado','Arias','Pineda','Cabrera','Mora','Restrepo','Bedoya'])
         [1 + floor(random() * 30)::int],
       0, 0,
       CASE WHEN random() < 0.85 THEN 'CC' WHEN random() < 0.6 THEN 'CE' ELSE 'NIT' END,
       lpad((1000000000 + floor(random() * 8999999999)::bigint)::text, 10, '0'),
       CASE WHEN random() < 0.8
            THEN lower((ARRAY['juan','carlos','andres','felipe','david','alejandro','luis','miguel','camilo','sebastian','daniel','jorge','sergio','eduardo','fernando','ricardo','mauricio','hector','nelson','oscar'])
                    [1 + floor(random() * 20)::int]) || '.' ||
                 lower((ARRAY['gomez','rodriguez','perez','martinez','lopez','hernandez','garcia','sanchez','ramirez','torres','flores','romero','suarez','cardona','velez','castro','ospina','zapata','bernal','quintero'])
                    [1 + floor(random() * 20)::int]) || '@correo.com'
            ELSE NULL END,
       '+57 3' || lpad((10 + floor(random() * 90)::int)::text, 2, '0') || ' ' ||
             lpad((2000000 + floor(random() * 8999999)::int)::text, 7, '0'),
       CASE
         WHEN random() < 0.10 THEN 'VIP'
         WHEN random() < 0.20 THEN 'CORPORATIVO'
         WHEN random() < 0.28 THEN 'EMPRESARIAL'
         WHEN random() < 0.45 THEN 'DELIVERY'
         WHEN random() < 0.72 THEN 'FRECUENTE'
         ELSE 'OCASIONAL'
       END,
       1 + floor(random() * 9)::int,
       (ARRAY['Bogota','Bogota','Bogota','Medellin','Cali','Barranquilla'])
         [1 + floor(random() * 6)::int],
       DATE '2016-01-01' + (floor(random() * 3600)::int * INTERVAL '1 day'),
       0, 0, NULL, true
FROM generate_series(1, 1500) AS c(n);

-- -----------------------------------------------------------------------------
-- 10. company_orders (24.000 ordenes en 18 meses)
-- -----------------------------------------------------------------------------
INSERT INTO company_orders (id, customer_id, status, total, created_at, sucursal_id,
                            empleado_id, mesa_id, tipo_servicio, canal, estado_pago,
                            subtotal, descuento, impuesto, propina, tiempo_servicio_min,
                            comentarios, cerrado_at)
WITH base AS (
    SELECT
        'LZS-' || to_char(ts, 'YYYY') || '-' || lpad(rn::text, 6, '0') AS id,
        ts,
        rn,
        1 + floor(random() * 10)::int AS sucursal_id,
        floor(random() * 100)::int AS r_suc
    FROM (
        SELECT ts, row_number() OVER (ORDER BY ts, seq) AS rn
        FROM (
            SELECT
                timestamp '2025-04-01 10:00:00'
                  + (floor(random() * 548)::int * INTERVAL '1 day')
                  + (floor(random() * 780)::int * INTERVAL '1 minute') AS ts,
                generate_series(1, 1) AS seq
            FROM generate_series(1, 24000)
        ) src
    ) ord
),
enriched AS (
    SELECT b.*,
           CASE WHEN random() < 0.72 THEN 'CLI-' || lpad((1 + ((b.rn * 37 + b.r_suc * 11) % 1500))::text, 6, '0') ELSE NULL END AS customer_id,
           CASE
             WHEN random() < 0.55 THEN 'MESA'
             WHEN random() < 0.80 THEN 'LOCAL'
             WHEN random() < 0.95 THEN 'DOMICILIO'
             ELSE 'MENU_CORPORATIVO'
           END AS tipo_servicio,
           CASE
             WHEN random() < 0.52 THEN 'POS'
             WHEN random() < 0.72 THEN 'APP'
             WHEN random() < 0.84 THEN 'WEB'
             WHEN random() < 0.95 THEN 'WHATSAPP'
             ELSE 'TELEFONO'
           END AS canal
    FROM base b
)
SELECT e.id,
       e.customer_id,
       CASE
         WHEN e.ts > timestamp '2026-09-25' AND random() < 0.45 THEN 'PROCESANDO'
         WHEN e.ts > timestamp '2026-09-28' AND random() < 0.50 THEN 'EN_TRANSITO'
         WHEN random() < 0.030 THEN 'CANCELADO'
         WHEN random() < 0.038 THEN 'REEMBOLSADO'
         WHEN random() < 0.045 THEN 'PENDIENTE'
         ELSE 'ENTREGADO'
       END,
       0,  -- total (se recalcula despues con el detalle)
       e.ts,
       e.sucursal_id,
       (e.sucursal_id * 100) + (1 + floor(random() * 6)::int),
       CASE WHEN e.tipo_servicio = 'MESA' THEN (e.sucursal_id * 100) + (1 + floor(random() * 10)::int) ELSE NULL END,
       e.tipo_servicio,
       e.canal,
       CASE
         WHEN e.tipo_servicio = 'MENU_CORPORATIVO' THEN 'PENDIENTE'
         ELSE 'PAGADO'
       END,
       0, 0, 0, 0,
       CASE WHEN e.tipo_servicio IN ('MESA','LOCAL') THEN 15 + floor(random() * 55)::int ELSE NULL END,
       CASE WHEN random() < 0.06
            THEN (ARRAY['Cliente pidio sin cebolla.','Mesa junto a la ventana, zona tranquila.','Regalo de cumpleanos con vela.','Solicito factura electronica.','Pidio el plato sin picante.','Mesa para 6 personas, un filtro.','Entrega a las 7:30 pm.','Aplazo el postre 10 minutos.'])
                 [1 + floor(random() * 8)::int]
            ELSE NULL END,
       e.ts + (INTERVAL '1 minute' * (20 + floor(random() * 70)::int))
FROM enriched e;

-- -----------------------------------------------------------------------------
-- 11. ordenes_detalle (lineas de venta; ~3 lineas promedio por orden)
-- -----------------------------------------------------------------------------
INSERT INTO ordenes_detalle (order_id, producto_id, cantidad, precio_unitario,
                             descuento, impuesto, total_linea, notas, estado)
SELECT o.id,
       p.id,
       (1 + floor(random() * 3)::int)::smallint,
       p.precio_venta,
       0,
       round(p.precio_venta * p.iva_pct, 2),
       round(p.precio_venta * (1 + p.iva_pct), 2),
       CASE WHEN random() < 0.10
            THEN (ARRAY['Sin cebolla','Sin picante','Tocar en la mesa','Sin lactosa','Bien cocido','Servir cuando llegue','Extra queso','Sin sal'])
                 [1 + floor(random() * 8)::int]
            ELSE NULL END,
       CASE
         WHEN o.status IN ('CANCELADO','REEMBOLSADO') THEN 'CANCELADO'
         WHEN o.status = 'PROCESANDO' AND random() < 0.35 THEN 'EN_PREPARACION'
         WHEN o.status = 'PENDIENTE' THEN 'PENDIENTE'
         ELSE 'SERVIDO'
       END
FROM company_orders o
CROSS JOIN LATERAL generate_series(1, 1 + floor(random() * 5)::int) AS g(n)
CROSS JOIN LATERAL (
    -- El OFFSET depende de o.id y g.n para que PostgreSQL NO evalue la
    -- subconsulta una sola vez (InitPlan) sino una vez por cada linea.
    SELECT p.*
    FROM productos p
    WHERE p.activo
    ORDER BY p.id
    OFFSET (('x' || substr(md5(o.id || '-' || g.n::text), 1, 7))::bit(28)::int
            % (SELECT count(*) FROM productos WHERE activo))::int
    LIMIT 1
) p;

-- -----------------------------------------------------------------------------
-- 12. Recalcular totales de la orden a partir del detalle
-- -----------------------------------------------------------------------------
UPDATE company_orders o
SET subtotal  = a.subtotal,
    impuesto  = a.impuesto,
    descuento = 0,
    total     = a.subtotal + a.impuesto,
    propina   = CASE WHEN o.tipo_servicio IN ('MESA','LOCAL') AND random() < 0.45
                      THEN round(a.subtotal * 0.10, 2) ELSE 0 END,
    tiempo_servicio_min = CASE WHEN o.tipo_servicio IN ('MESA','LOCAL')
                               THEN 12 + floor(random() * 50)::int ELSE NULL END
FROM (
    SELECT order_id,
           sum(precio_unitario * cantidad) AS subtotal,
           sum(impuesto) AS impuesto
    FROM ordenes_detalle
    WHERE estado <> 'CANCELADO'
    GROUP BY order_id
) a
WHERE o.id = a.order_id;

-- Las ordenes canceladas quedan con total 0 (no se facturan).
UPDATE company_orders SET total = 0, subtotal = 0, impuesto = 0, estado_pago = 'REEMBOLSADO'
WHERE status IN ('CANCELADO', 'REEMBOLSADO');

-- -----------------------------------------------------------------------------
-- 13. Pagos (1 o 2 metodos por orden; la suma cuadra con el total)
-- -----------------------------------------------------------------------------
WITH ops AS (
    SELECT o.id, o.total, o.created_at, o.sucursal_id,
           CASE WHEN random() < 0.18 THEN 2 ELSE 1 END AS n_pagos,
           1 + floor(random() * 8)::int AS metodo
    FROM company_orders o
    WHERE o.total > 0
)
INSERT INTO pagos (order_id, metodo_pago_id, monto, referencia, cajero_id, fecha_pago)
-- Pago unico
SELECT id, metodo, total,
       CASE WHEN metodo IN (4,5,6,8) THEN 'REF' || upper(substr(md5(id || metodo::text), 1, 12)) ELSE NULL END,
       (sucursal_id * 100) + 4,
       created_at + INTERVAL '6 minutes'
FROM ops WHERE n_pagos = 1
UNION ALL
-- Pago dividido (60% / 40%)
SELECT id, metodo, round(total * 0.60, 2),
       CASE WHEN metodo IN (4,5,6,8) THEN 'REF' || upper(substr(md5(id || metodo::text), 1, 12)) ELSE NULL END,
       (sucursal_id * 100) + 4,
       created_at + INTERVAL '6 minutes'
FROM ops WHERE n_pagos = 2
UNION ALL
SELECT id,
       -- El resto se paga en efectivo cuando el primer metodo fue digital
       CASE WHEN metodo IN (2,3,5,6,8) THEN 1 ELSE metodo END,
       total - round(total * 0.60, 2),
       CASE WHEN metodo IN (4,5,6,8) THEN 'REF' || upper(substr(md5(id || (metodo + 1)::text), 1, 12)) ELSE NULL END,
       (sucursal_id * 100) + 4,
       created_at + INTERVAL '8 minutes'
FROM ops WHERE n_pagos = 2;

-- -----------------------------------------------------------------------------
-- 14. Facturas electronicas
-- -----------------------------------------------------------------------------
INSERT INTO facturas (numero, order_id, cliente_id, subtotal, descuento, impuesto,
                      propina, total, estado, fecha_emision, venta_caja, resolucion_dian)
SELECT 'FE-' || o.id,
       o.id,
       o.customer_id,
       o.subtotal,
       o.descuento,
       o.impuesto,
       o.propina,
       o.total,
       CASE WHEN o.status = 'CANCELADO' THEN 'ANULADA'
            WHEN o.estado_pago = 'PAGADO' THEN 'PAGADA' ELSE 'EMITIDA' END,
       o.cerrado_at,
       'CAJA-' || lpad(o.sucursal_id::text, 2, '0'),
       'DIAN-' || lpad(o.sucursal_id::text, 2, '0') || '-' || lpad((1876400000 + o.sucursal_id)::text, 10, '0')
FROM company_orders o
WHERE o.total > 0 OR o.status IN ('CANCELADO', 'REEMBOLSADO');

-- -----------------------------------------------------------------------------
-- 15. Domicilios (para ordenes tipo DOMICILIO)
-- -----------------------------------------------------------------------------
INSERT INTO domicilios (order_id, cliente_id, direccion_destino, barrio_destino, zona_id,
                        tarifa, tiempo_prometido_min, tiempo_real_min, repartidor_id,
                        estado, metodo_pago, fecha_pedido, fecha_entrega)
SELECT o.id,
       o.customer_id,
       (ARRAY['Calle ' || (10 + floor(random() * 180)::int) || ' # ' || (1 + floor(random() * 120)::int) || '-' || (1 + floor(random() * 99)::int),
              'Carrera ' || (5 + floor(random() * 90)::int) || ' # ' || (10 + floor(random() * 90)::int) || '-' || (1 + floor(random() * 99)::int),
              'Avenida ' || (6 + floor(random() * 180)::int) || ' # ' || (1 + floor(random() * 120)::int) || '-' || (1 + floor(random() * 99)::int)])
         [1 + floor(random() * 3)::int] || ', Bogota',
       (ARRAY['Chapinero','La Candelaria','Santa Lucia','La Bolita','Galeria','La Estrada','Santa Fe','Los Alcázares','Santa Bárbara','La Sofía'])
         [1 + floor(random() * 10)::int],
       (o.sucursal_id * 10) + 5,
       CASE WHEN o.canal IN ('APP','WEB') THEN 3500 ELSE 2500 END,
       30 + floor(random() * 20)::int,
       CASE WHEN o.status IN ('ENTREGADO','PROCESANDO','EN_TRANSITO')
            THEN 25 + floor(random() * 35)::int ELSE NULL END,
       (o.sucursal_id * 100) + 6,
       CASE WHEN o.status = 'CANCELADO' THEN 'CANCELADO'
            WHEN o.status = 'EN_TRANSITO' THEN 'EN_RUTA'
            WHEN o.status = 'ENTREGADO' THEN 'ENTREGADO'
            ELSE 'ASIGNADO' END,
       CASE WHEN o.canal IN ('APP','WEB') THEN 'TARJETA_CREDITO' ELSE 'EFECTIVO' END,
       o.created_at,
       CASE WHEN o.status IN ('ENTREGADO','PROCESANDO','EN_TRANSITO')
            THEN o.created_at + (INTERVAL '1 minute' * (28 + floor(random() * 30)::int)) ELSE NULL END
FROM company_orders o
WHERE o.tipo_servicio = 'DOMICILIO';

-- -----------------------------------------------------------------------------
-- 16. Promociones
-- -----------------------------------------------------------------------------
INSERT INTO promociones (id, codigo, nombre, tipo, valor, fecha_inicio, fecha_fin, activa)
VALUES (1,  'PROMO-LUNCH',  'Almuerzo corporativo 10%',   'PORCENTAJE',   10, DATE '2025-04-01', DATE '2026-09-30', true),
       (2,  'PROMO-2X1',    '2x1 en bebidas los martes',  '2X1',           0, DATE '2025-01-01', DATE '2026-12-31', true),
       (3,  'PROMO-DELIV',  'Envio gratis desde 60 mil',   'ENVIO_GRATIS',  0, DATE '2025-06-01', DATE '2026-09-30', true),
       (4,  'PROMO-WELCOME','Bienvenida primer plato',     'FIJO',      5000, DATE '2025-01-01', DATE '2026-12-31', true),
       (5,  'PROMO-BANCO',  'Combo ejecutivo banco',       'COMBO',     1000, DATE '2026-01-15', DATE '2026-06-30', false),
       (6,  'PROMO-HAPPY',  'Happy hour 20% bebidas',      'PORCENTAJE',   20, DATE '2026-03-01', DATE '2026-12-31', true),
       (7,  'PROMO-NATAL',  'Navidad menu especial',       'PORCENTAJE',   15, DATE '2026-11-15', DATE '2026-12-31', false),
       (8,  'PROMO-VEG',    'Lunes vegetariano 15%',       'PORCENTAJE',   15, DATE '2025-04-01', DATE '2026-09-30', true),
       (9,  'PROMO-FAMILY', 'Combo familiar 5% off',       'PORCENTAJE',    5, DATE '2026-05-01', DATE '2026-09-30', true),
       (10, 'PROMO-DELIV2', 'Domicilio sin tarifa sur',    'FIJO',       2500, DATE '2026-02-01', DATE '2026-09-30', true);

-- -----------------------------------------------------------------------------
-- 17. Movimientos de inventario (45.000)
-- -----------------------------------------------------------------------------
INSERT INTO inventario_movimientos (producto_id, sucursal_id, tipo_movimiento, cantidad,
                                    costo_unitario, documento, fecha)
SELECT p.id,
       s.id,
       CASE
         WHEN random() < 0.42 THEN 'ENTRADA'
         WHEN random() < 0.82 THEN 'SALIDA'
         WHEN random() < 0.90 THEN 'AJUSTE'
         WHEN random() < 0.96 THEN 'DEVOLUCION'
         ELSE 'MERMA'
       END,
       round((1 + random() * 60)::numeric, 2),
       p.costo_producto,
       CASE WHEN random() < 0.5 THEN 'OC-' || lpad((1 + floor(random() * 24000)::int)::text, 6, '0') ELSE NULL END,
       timestamp '2025-04-01' + (floor(random() * 548)::int * INTERVAL '1 day')
                              + (floor(random() * 780)::int * INTERVAL '1 minute')
FROM productos p
CROSS JOIN sucursales s
CROSS JOIN generate_series(1, 30) AS g(n);

-- -----------------------------------------------------------------------------
-- 18. Reservas (5.000)
-- -----------------------------------------------------------------------------
INSERT INTO reservas (codigo, sucursal_id, mesa_id, cliente_id, personas, fecha_reserva,
                       duracion_min, estado, total_estimado, motivo_cancelacion)
SELECT 'RES-' || lpad(r.n::text, 6, '0'),
       1 + floor(random() * 10)::int,
       NULL,
       CASE WHEN random() < 0.75 THEN 'CLI-' || lpad((1 + floor(random() * 1500)::int)::text, 6, '0') ELSE NULL END,
       (1 + floor(random() * 8)::int),
       timestamp '2025-04-01' + (floor(random() * 548)::int * INTERVAL '1 day')
                          + (floor(random() * 780)::int * INTERVAL '1 minute'),
       CASE WHEN random() < 0.6 THEN 90 WHEN random() < 0.85 THEN 120 ELSE 60 END,
       CASE
         WHEN random() < 0.62 THEN 'CONFIRMADA'
         WHEN random() < 0.78 THEN 'COMPLETADA'
         WHEN random() < 0.90 THEN 'PENDIENTE'
         WHEN random() < 0.96 THEN 'CANCELADA'
         ELSE 'NO_SHOW'
       END,
       round((35000 + random() * 180000)::numeric, 2),
       CASE WHEN random() < 0.9 THEN NULL
            ELSE (ARRAY['El cliente cancelo por cambio de planes','No se presento','Se modifico la fecha','Cerrado por clima'])
                 [1 + floor(random() * 4)::int] END
FROM generate_series(1, 5000) AS r(n);

-- -----------------------------------------------------------------------------
-- 19. Evaluaciones (5.000 sobre ordenes entregadas)
-- -----------------------------------------------------------------------------
INSERT INTO evaluaciones (order_id, cliente_id, sucursal_id, calificacion, comida, servicio,
                          ambiente, tiempo, comentario, fecha)
SELECT o.id,
       o.customer_id,
       o.sucursal_id,
       (1 + floor(random() * 5)::int)::smallint,
       (1 + floor(random() * 5)::int)::smallint,
       (1 + floor(random() * 5)::int)::smallint,
       (1 + floor(random() * 5)::int)::smallint,
       (1 + floor(random() * 5)::int)::smallint,
       CASE WHEN random() < 0.75
            THEN (ARRAY['Excelente atencion, volveria sin duda','La comida llego rapida y caliente','Muy buena relacion precio calidad','El mesero fue muy amable','Sala un poco llena pero el sabor es excelente','Tardaron un poco mas de lo esperado','Todo perfecto, recomendado','Las papas estaban crujientes, me encantaron','Buena atencion, ambiente agradable','La comida estuvo deliciosa'])
                 [1 + floor(random() * 10)::int]
            ELSE NULL END,
       o.cerrado_at
FROM company_orders o
WHERE o.status = 'ENTREGADO'
  AND o.customer_id IS NOT NULL
  AND random() < 0.22;

-- -----------------------------------------------------------------------------
-- 20. Bitacora del punto de venta (30.000 eventos)
-- -----------------------------------------------------------------------------
INSERT INTO bitacora_sistema (usuario, modulo, accion, entidad, entidad_id, detalle, fecha)
SELECT (ARRAY['caja01','caja02','caja03','mesero01','mesero02','mesero03','admin','supervisor','kiosco','app_web'])
         [1 + floor(random() * 10)::int],
       (ARRAY['VENTAS','PEDIDOS','CAJA','INVENTARIO','CLIENTES','REPORTES','CONFIGURACION'])
         [1 + floor(random() * 7)::int],
       (ARRAY['CREAR','ACTUALIZAR','ELIMINAR','CONSULTAR','IMPRIMIR','CERRAR','ANULAR'])
         [1 + floor(random() * 7)::int],
       (ARRAY['ORDEN','PAGO','CLIENTE','PRODUCTO','MESA','FACTURA','PROMOCION'])
         [1 + floor(random() * 7)::int],
       CASE WHEN random() < 0.6
            THEN 'LZS-' || to_char(timestamp '2025-04-01' + (floor(random() * 548)::int * INTERVAL '1 day'), 'YYYY') || '-' || lpad((1 + floor(random() * 24000)::int)::text, 6, '0')
            ELSE NULL END,
       jsonb_build_object(
           'canal',     (ARRAY['POS','WEB','APP','WHATSAPP','TELEFONO'])[1 + floor(random() * 5)::int],
           'duracion_ms', floor(random() * 1500)::int,
           'resultado', CASE WHEN random() < 0.9 THEN 'OK' ELSE 'ERROR' END
       ),
       timestamp '2025-04-01' + (floor(random() * 548)::int * INTERVAL '1 day')
                              + (floor(random() * 780)::int * INTERVAL '1 minute')
FROM generate_series(1, 30000);

-- -----------------------------------------------------------------------------
-- 21. Agregados del cliente (visitas, total gastado, ultima visita)
-- -----------------------------------------------------------------------------
UPDATE company_customers c
SET visitas       = a.visitas,
    total_gastado = a.total_gastado,
    ultima_visita = a.ultima_visita,
    -- Saldo pendiente: entre el 5% y el 65% de la linea de credito, y nunca
    -- mayor a lo ya gastado ni al limite otorgado.
    current_balance = CASE
        WHEN c.segmento = 'VIP'
            THEN LEAST(round((1500000 * (0.05 + random() * 0.60))::numeric, 2), a.total_gastado)
        WHEN c.segmento IN ('CORPORATIVO', 'EMPRESARIAL')
            THEN LEAST(round((800000 * (0.05 + random() * 0.60))::numeric, 2), a.total_gastado)
        WHEN c.segmento = 'FRECUENTE'
            THEN LEAST(round((300000 * (0.05 + random() * 0.60))::numeric, 2), a.total_gastado)
        ELSE 0
    END,
    credit_limit = CASE
        WHEN c.segmento = 'VIP'           THEN 1500000
        WHEN c.segmento IN ('CORPORATIVO','EMPRESARIAL') THEN 800000
        WHEN c.segmento = 'FRECUENTE'    THEN 300000
        ELSE 0 END
FROM (
    SELECT customer_id,
           count(*) AS visitas,
           sum(total) AS total_gastado,
           max(created_at)::date AS ultima_visita
    FROM company_orders
    WHERE customer_id IS NOT NULL AND status NOT IN ('CANCELADO', 'REEMBOLSADO')
    GROUP BY customer_id
) a
WHERE c.id = a.customer_id;

-- Clientes sin compras: limite y saldo en cero.
UPDATE company_customers
SET current_balance = 0, credit_limit = 0
WHERE visitas = 0;

-- -----------------------------------------------------------------------------
-- 22. ANALISIS (fills de la base)
-- -----------------------------------------------------------------------------
ANALYZE;

-- -----------------------------------------------------------------------------
-- 23. Resumen de control
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_total numeric;
BEGIN
    SELECT sum(total) INTO v_total FROM company_orders;
    RAISE NOTICE 'ORDENES CREADAS: %', (SELECT count(*) FROM company_orders);
    RAISE NOTICE 'LINEAS DE DETALLE: %', (SELECT count(*) FROM ordenes_detalle);
    RAISE NOTICE 'VENTA TOTAL (COP): %', to_char(v_total, 'FM999,999,999,999');
END $$;
