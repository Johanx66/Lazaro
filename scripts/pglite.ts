import { createConnection } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.PG_PORT ?? 5432);
const HOST = process.env.PG_HOST ?? "127.0.0.1";
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? ".pglite-data";
const DATABASE = process.env.PG_DATABASE ?? "chatbot";

let server: PGLiteSocketServer | null = null;

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function isPortBusy(): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: HOST, port: PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function ensureDatabase(): Promise<void> {
  const bootstrap = new PGlite({ dataDir: DATA_DIR });
  await bootstrap.waitReady;
  const rows = await bootstrap.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname = $1",
    [DATABASE],
  );
  if (rows.rows.length === 0) {
    await bootstrap.exec(`CREATE DATABASE "${DATABASE}"`);
    console.log(JSON.stringify({ level: "info", msg: "base de datos creada", database: DATABASE }));
  }
  await bootstrap.close();
}

async function shutdown(): Promise<void> {
  try {
    await server?.stop();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

try {
  if (await isPortBusy()) {
    throw new Error(
      `el puerto ${PORT} ya está en uso (¿hay un PostgreSQL instalado o este proyecto ya está corriendo?). ` +
        "Detén ese servicio o elige otro puerto con PG_PORT y ajusta DATABASE_URL en .env",
    );
  }
  // La instancia definitiva se abre DESPUÉS de crear la base: dos instancias a la vez
  // sobre una carpeta de datos nueva la dejan corrupta (fallaba en el primer arranque).
  await ensureDatabase();
  const db = new PGlite({ dataDir: DATA_DIR, database: DATABASE });
  await db.waitReady;
  server = new PGLiteSocketServer({ db, port: PORT, host: HOST, maxConnections: 20 });
  await server.start();
  console.log(
    JSON.stringify({
      level: "info",
      msg: "Postgres local (PGlite) listo",
      connection: server.getServerConn(),
      dataDir: DATA_DIR,
      database: DATABASE,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "no se pudo iniciar el Postgres local",
      error: describeError(error),
    }),
  );
  process.exit(1);
}
