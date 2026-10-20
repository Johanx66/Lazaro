import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.PG_PORT ?? 5432);
const HOST = process.env.PG_HOST ?? "127.0.0.1";
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? ".pglite-data";
const DATABASE = process.env.PG_DATABASE ?? "chatbot";

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

const db = new PGlite({ dataDir: DATA_DIR, database: DATABASE });
const server = new PGLiteSocketServer({ db, port: PORT, host: HOST, maxConnections: 20 });

async function shutdown(): Promise<void> {
  try {
    await server.stop();
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
  await ensureDatabase();
  await db.waitReady;
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
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}