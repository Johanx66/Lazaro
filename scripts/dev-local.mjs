import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";

const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
const prismaCli = path.resolve("node_modules/prisma/build/index.js");
const dbPort = Number(process.env.PG_PORT ?? 5432);
const dbName = process.env.PG_DATABASE ?? "chatbot";
const dataDir = process.env.PGLITE_DATA_DIR ?? ".pglite-data";
// Las migraciones y el seed de dev:all van SIEMPRE a la base local embebida,
// aunque el .env apunte a otra base (así nunca se tocan bases ajenas por accidente).
// sslmode=disable: la base embebida no habla SSL y sin esto "prisma migrate" no conecta.
const localDatabaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/${dbName}?schema=public&sslmode=disable`;
let app = null;
let shuttingDown = false;

function info(message) {
  console.log(`\x1b[36m[dev-local]\x1b[0m ${message}`);
}

function fail(message) {
  console.error(`\x1b[31m[dev-local] ${message}\x1b[0m`);
}

if (!existsSync(tsxCli) || !existsSync(prismaCli)) {
  fail("Faltan las dependencias. Ejecuta primero: npm install");
  process.exit(1);
}

if (!existsSync(".env")) {
  if (!existsSync(".env.example")) {
    fail("No encuentro .env.example. Ejecuta este comando dentro de la carpeta del proyecto (la que tiene package.json).");
    process.exit(1);
  }
  copyFileSync(".env.example", ".env");
  info("No había archivo .env: se creó uno a partir de .env.example (valores de ejemplo).");
}

// Primer arranque en este computador: todavía no existe la carpeta de datos local.
const firstRun = !existsSync(dataDir);

function pipeOutput(child, label) {
  const prefix = `\x1b[36m[${label}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) {
        if (line.trim()) console.log(prefix + line);
      }
    });
  }
}

function run(label, ...args) {
  const child = spawn(process.execPath, [tsxCli, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  pipeOutput(child, label);
  return child;
}

async function runPrisma(label, ...args) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [prismaCli, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: localDatabaseUrl },
    });
    pipeOutput(child, label);
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function isPortBusy(port) {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function reportWhyDbFailed() {
  const [dbBusy, appBusy] = await Promise.all([isPortBusy(dbPort), isPortBusy(3000)]);
  if (dbBusy || appBusy) {
    console.error(
      "\x1b[33m[dev-local] Parece que ya hay una instancia corriendo" +
        (dbBusy ? ` en :${dbPort} (base)` : "") +
        (dbBusy && appBusy ? " y" : "") +
        (appBusy ? " en :3000 (app)" : "") +
        ".\x1b[0m"
    );
    console.error(
      "\x1b[33m[dev-local] Úsala directamente o detenla (Ctrl+C en la terminal que la levantó) y vuelve a ejecutar.\x1b[0m"
    );
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [db, app].filter(Boolean)) {
    try {
      child.kill();
    } catch {
      /* noop */
    }
  }
  process.exit(code ?? 0);
}

async function prepareDatabase() {
  info("Aplicando migraciones en la base local...");
  const migrateCode = await runPrisma("migrate", "migrate", "deploy");
  if (migrateCode !== 0) {
    fail("No se pudieron aplicar las migraciones en la base local.");
    return false;
  }
  if (firstRun) {
    info("Primer arranque: cargando datos de ejemplo (seed)...");
    const seedCode = await runPrisma("seed", "db", "seed");
    if (seedCode !== 0) {
      console.error(
        "\x1b[33m[dev-local] El seed falló; la app arranca igual. Puedes repetirlo con: npm run prisma:seed\x1b[0m"
      );
    }
  }
  return true;
}

const db = run("db", "scripts/pglite.ts");

const dbBuffer = [];
let started = false;
db.stdout.on("data", (buf) => {
  dbBuffer.push(buf.toString());
  if (!started && /Postgres local \(PGlite\) listo/.test(dbBuffer.join(""))) {
    started = true;
    void prepareDatabase().then((ready) => {
      if (shuttingDown) return;
      if (!ready) {
        shutdown(1);
        return;
      }
      app = run("app", "watch", "src/main.ts");
      process.stdin.pipe(app.stdin);
      app.on("exit", (code) => shutdown(code ?? 0));
    });
  }
});

db.on("exit", async (code) => {
  if (!started && code !== 0) {
    console.error("\x1b[31m[dev-local] La base de datos local no arrancó.\x1b[0m");
    await reportWhyDbFailed();
  }
  shutdown(code ?? 0);
});

process.stdin.resume();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
