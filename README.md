# Lazaro — chatbot empresarial con IA local

Backend del chatbot de soporte (Node.js, TypeScript, Express 5, Prisma 7, PostgreSQL).
Esta guía es para **abrir el proyecto en tu computador** y probarlo. Para instalarlo en
un servidor mira [README-DEPLOYMENT.md](README-DEPLOYMENT.md) y
[docs/INSTALACION-EMPRESA.md](docs/INSTALACION-EMPRESA.md).

## Requisitos

- [Node.js](https://nodejs.org) 20.19 o superior (recomendado: la versión LTS actual).
- [Git](https://git-scm.com) (opcional si descargas el ZIP).

No necesitas instalar PostgreSQL ni Docker: el proyecto trae una base de datos local
embebida para desarrollo.

## Arranque rápido

```bash
git clone https://github.com/Johanx66/Lazaro.git
cd Lazaro
npm install
npm run dev:all
```

Cuando veas `servidor iniciado`, abre <http://localhost:3000>.

`npm run dev:all` hace todo lo necesario la primera vez:

1. Crea el archivo `.env` a partir de `.env.example` si no existe.
2. Arranca la base de datos local (se guarda en la carpeta `.pglite-data/`).
3. Crea las tablas (migraciones) y, solo en el primer arranque, carga datos de ejemplo.
4. Arranca la aplicación y la reinicia sola cuando cambias el código.

Para detenerlo: `Ctrl + C`.

> **Si descargaste el ZIP desde GitHub:** al descomprimir queda una carpeta dentro de
> otra (`Lazaro-main/Lazaro-main`). Abre la terminal y el editor en la carpeta **de
> adentro**, la que contiene `package.json`. Si no, los comandos `npm` fallan.

## Páginas

| Dirección                         | Qué es                                   |
| --------------------------------- | ---------------------------------------- |
| <http://localhost:3000>           | Chat web de prueba                       |
| <http://localhost:3000/admin/>    | Panel de administración                  |
| <http://localhost:3000/api/health>| Estado del servicio y de la base de datos |

Para entrar al panel define `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12 caracteres) en tu
`.env` y vuelve a arrancar. Usa valores de prueba; el `.env` nunca se sube a GitHub.

## IA local (opcional)

Sin configurar nada, el bot responde con la base de conocimiento (palabras clave).
Para probar la IA instala [Ollama](https://ollama.com) y descarga el modelo:

```bash
ollama pull qwen2.5:7b-instruct
```

## Problemas comunes

**`el puerto 5432 ya está en uso`** — ya tienes un PostgreSQL instalado (o el proyecto ya
está corriendo en otra terminal). Detén ese servicio o usa otro puerto para la base local:

1. En `.env` cambia el puerto de `DATABASE_URL` a `5433`.
2. Arranca indicando el puerto:
   - PowerShell: `$env:PG_PORT="5433"; npm run dev:all`
   - macOS / Linux: `PG_PORT=5433 npm run dev:all`

**El puerto 3000 está ocupado** — cambia `PORT` en `.env` (por ejemplo `PORT=3001`).

**`Faltan las dependencias` o `Cannot find module`** — ejecuta `npm install` dentro de la
carpeta del proyecto.

**Quiero empezar con la base vacía** — detén el proyecto, borra la carpeta
`.pglite-data/` y vuelve a ejecutar `npm run dev:all`.

**Prefiero mi propio PostgreSQL** — pon su dirección en `DATABASE_URL`, ejecuta
`npm run prisma:deploy` y `npm run prisma:seed`, y arranca con `npm run dev`.

## Comandos útiles

| Comando             | Para qué sirve                                   |
| ------------------- | ------------------------------------------------ |
| `npm run dev:all`   | Base local + aplicación (lo normal para probar)  |
| `npm run dev`       | Solo la aplicación (la base la pones tú)         |
| `npm run typecheck` | Revisa los tipos de TypeScript                   |
| `npm test`          | Ejecuta las pruebas                              |

Las reglas de trabajo del proyecto están en [AGENTS.md](AGENTS.md) y el plan de fases en
[PLAN.md](PLAN.md).
