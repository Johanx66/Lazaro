import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { env } from "../src/shared/config/env.js";
import { Argon2PasswordHasher } from "../src/shared/infrastructure/argon2-password-hasher.js";
import { seedAdmin } from "./seed-admin.js";
import { seedCompanyUser } from "./seed-company-user.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
  }),
});

// Artículos de EJEMPLO claramente ficticios. Sustitúyelos por contenido real
// de los manuales del software en fases posteriores.
const articleExamples = [
  {
    title: "Cómo imprimir una factura",
    category: "Facturación",
    content:
      "[ARTÍCULO FICTICIO DE EJEMPLO] Para imprimir una factura: abra el módulo de facturación, busque el documento y use la opción Imprimir. Sustituir por el manual real.",
    keywords: ["factura", "imprimir", "documento"],
    active: true,
  },
  {
    title: "Reporte con facturas emitidas por rango de fechas",
    category: "Reportes",
    content:
      "[ARTÍCULO FICTICIO DE EJEMPLO] El reporte con las facturas emitidas según rango de fechas se encuentra en Reportes / Ventas. Sustituir por el catálogo real de los ~250 reportes.",
    keywords: ["reporte", "facturas", "fechas", "ventas"],
    active: true,
  },
  {
    title: "Error de conexión con la base de datos",
    category: "Errores comunes",
    content:
      "[ARTÍCULO FICTICIO DE EJEMPLO] Si aparece el error de conexión a la base de datos, verifique que el servidor esté encendido y el servicio de bases activo. Sustituir por los pasos reales.",
    keywords: ["conexión", "base de datos", "servidor", "error"],
    active: true,
  },
];

async function seedArticles(): Promise<void> {
  const existing = await prisma.knowledgeArticle.count();
  if (existing > 0) {
    console.log("Seed omitido: ya existen artículos en knowledge_articles.");
    return;
  }
  await prisma.knowledgeArticle.createMany({ data: articleExamples });
  console.log(`Seed aplicado: ${articleExamples.length} artículos ficticios creados.`);
}

async function main(): Promise<void> {
  await seedArticles();
  const hasher = new Argon2PasswordHasher();
  // El admin no depende de si ya había artículos.
  await seedAdmin(prisma, hasher, {
    email: env.adminEmail,
    password: env.adminPassword,
  });
  // Usuario de empresa de ejemplo para probar el login del chat.
  await seedCompanyUser(prisma, hasher, {
    username: env.companySeedUsername,
    password: env.companySeedPassword,
    displayName: env.companySeedDisplayName,
    registeredPhone: env.companySeedPhone,
  });
}

main()
  .catch((error) => {
    console.error("Error ejecutando el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });