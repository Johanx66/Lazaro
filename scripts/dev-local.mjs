import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";

const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
let app = null;
let shuttingDown = false;

function run(label, ...args) {
  const child = spawn(process.execPath, [tsxCli, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const prefix = `\x1b[36m[${label}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) {
        if (line.trim()) console.log(prefix + line);
      }
    });
  }
  return child;
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
  const [dbBusy, appBusy] = await Promise.all([isPortBusy(5432), isPortBusy(3000)]);
  if (dbBusy || appBusy) {
    console.error(
      "\x1b[33m[dev-local] Parece que ya hay una instancia corriendo" +
        (dbBusy ? " en :5432 (base)" : "") +
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

const db = run("db", "scripts/pglite.ts");

const dbBuffer = [];
let started = false;
db.stdout.on("data", (buf) => {
  dbBuffer.push(buf.toString());
  if (!started && /Postgres local \(PGlite\) listo/.test(dbBuffer.join(""))) {
    started = true;
    app = run("app", "watch", "src/main.ts");
    process.stdin.pipe(app.stdin);
    app.on("exit", (code) => shutdown(code ?? 0));
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