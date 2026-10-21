# BD de prueba de Lázaro Software (datos ficticios)

Estos scripts cargan en un Postgres una **base de datos de prueba** con los datos
de una cadena de restaurantes ficticia (Lázaro Software S.A.S.), para poder
probar el chatbot con consultas en lenguaje natural sobre datos realistas.

**Todos los datos son ficticios**: se generan con `random()` a partir de
listas de nombres y de una semilla fija. No hay datos de personas ni de
clientes reales.

## Qué se carga y qué NO

| Archivo | Qué hace |
|---|---|
| `01-esquema.sql` | 19 tablas (empresa, sucursales, productos, `company_customers`, `company_orders`, pagos, facturas...). **No borra nada**: ejecútalo una vez sobre una base VACÍA. |
| `02-datos.sql` | 1.500 clientes (`CLI-000001`..`CLI-001500`), ~24.000 pedidos (`LZS-AAAA-NNNNNN`), ~96.000 líneas de detalle, ~26.465 pagos, 109 productos, 10 sucursales. |
| `03-vistas-chatbot.sql` | SOLO las tres vistas que usa el bot: `v_customer_balance`, `v_orders_status`, `v_recent_orders`. Las vistas analíticas de BI del script original no se cargan. |
| `04-roles-lectura.sql` | Rol de solo lectura (`company_readonly`) con `GRANT SELECT` únicamente sobre esas tres vistas. |
| `cargar.sh` | Ejecuta los cuatro scripts en orden. |

No se incluye el volcado `lazaro_restaurant_db.dump.sql` (22 MB) del paquete
original: los scripts anteriores regeneran los mismos datos.

## Cómo cargarla

```bash
export LAZARO_DATABASE_URL="postgresql://usuario:clave@host:puerto/base"
export COMPANY_READONLY_PASSWORD="clave-de-pruebas"
bash scripts/lazaro-test-db/cargar.sh
```

O a mano, en este orden:

```bash
psql "$LAZARO_DATABASE_URL" -f scripts/lazaro-test-db/01-esquema.sql
psql "$LAZARO_DATABASE_URL" -f scripts/lazaro-test-db/02-datos.sql
psql "$LAZARO_DATABASE_URL" -f scripts/lazaro-test-db/03-vistas-chatbot.sql
psql "$LAZARO_DATABASE_URL" \
  -v readonly_password="$COMPANY_READONLY_PASSWORD" \
  -f scripts/lazaro-test-db/04-roles-lectura.sql
```

La contraseña del rol de lectura **nunca** se escribe en estos archivos: llega
por variable de psql (`-v readonly_password=`) o por `COMPANY_READONLY_PASSWORD`.

## Railway

La base va en un **servicio Postgres aparte** del de la app (`DATABASE_URL` no
se toca). Desde dentro de la red de Railway el host suele ser
`postgres.railway.internal`. Si la conexión es externa (desde tu máquina), usa
el host público que da Railway.

Si el servidor exige TLS, añade `?sslmode=require` a la URL (o exporta
`PGSSLMODE=require`).

## Configuración del chatbot

```env
COMPANY_DATABASE_URL=postgresql://company_readonly:<clave>@<host>:5432/<base>
COMPANY_CUSTOMER_ID_PATTERN=^[A-Z0-9][A-Z0-9_-]{1,31}$
```

## Vincular un usuario con un cliente

1. Entra en el panel del chatbot (`/admin/identity.html`) como administrador.
2. Crea o edita un usuario y escribe en **Código de cliente** el id de la BD
   de la empresa, por ejemplo `CLI-000123`.
3. El código se normaliza a mayúsculas y es único: dos usuarios no pueden
   apuntar al mismo cliente.
4. El usuario debe iniciar sesión en el chat (enlace de login) para que la
   consulta pase la puerta de verificación.

Si el usuario **no** tiene código de cliente, el bot NO le muestra saldo ni
pedidos: responde con un mensaje fijo y **no llama al modelo** (cero
infecciones).

## Comprobar que la carga quedó bien

```sql
SELECT count(*) FROM company_customers;   -- 1500
SELECT count(*) FROM company_orders;      -- ~24000
SELECT * FROM v_customer_balance WHERE customer_id = 'CLI-000123';
SELECT * FROM v_recent_orders WHERE customer_id = 'CLI-000123'
ORDER BY created_at DESC LIMIT 5;
```

Y que el rol del bot solo ve las vistas:

```bash
psql "$COMPANY_DATABASE_URL" -c "SELECT count(*) FROM company_customers;"
# ERROR: permission denied for table company_customers
```
