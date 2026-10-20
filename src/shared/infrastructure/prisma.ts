import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../config/env.js";

export const databaseConfigured = env.databaseUrl.length > 0;

const connectionString =
  env.databaseUrl || "postgresql://postgres:postgres@localhost:5432/chatbot?schema=public";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});