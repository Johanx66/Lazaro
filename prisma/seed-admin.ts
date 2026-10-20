import type { PasswordHasher } from "../src/shared/domain/password-hasher.js";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

export interface SeedAdminInput {
  email: string;
  password: string;
}

// Subconjunto del cliente Prisma que necesita el seed (facilita los tests).
export interface AdminUserStore {
  adminUser: {
    findUnique(args: { where: { email: string }; select: { id: true } }): Promise<{ id: string } | null>;
    create(args: {
      data: { email: string; passwordHash: string; role: "ADMIN" };
    }): Promise<unknown>;
  };
}

export type SeedAdminResult = "created" | "exists" | "skipped-missing" | "skipped-weak-password";

/**
 * Siembra el primer administrador. Es independiente del seed de artículos.
 * Nunca imprime ni registra la contraseña ni el hash.
 */
export async function seedAdmin(
  store: AdminUserStore,
  hasher: PasswordHasher,
  input: SeedAdminInput,
  log: (message: string) => void = console.log,
): Promise<SeedAdminResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (email === "" || password === "") {
    log("Seed de admin omitido: faltan ADMIN_EMAIL y/o ADMIN_PASSWORD.");
    return "skipped-missing";
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    log(
      `Seed de admin omitido: ADMIN_PASSWORD debe tener al menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`,
    );
    return "skipped-weak-password";
  }

  const existing = await store.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    log("Seed de admin omitido: ya existe un administrador con ese email (no se modifica).");
    return "exists";
  }

  const passwordHash = await hasher.hash(password);
  await store.adminUser.create({ data: { email, passwordHash, role: "ADMIN" } });
  log("Seed de admin aplicado: administrador inicial creado.");
  return "created";
}
