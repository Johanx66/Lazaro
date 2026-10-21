
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Permite cargar la configuración sin DATABASE_URL.
    // Los comandos que necesitan la base de datos sí requieren la variable.
    url: process.env.DATABASE_URL ?? "",
  },
});
