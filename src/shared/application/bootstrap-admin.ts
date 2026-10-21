import type { PasswordHasher } from "../domain/password-hasher.js";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

// Subconjunto del cliente Prisma que necesita el arranque (facilita los tests).
export interface AdminBootstrapStore {
  adminUser: {
    count(args: { where: { role: "ADMIN" } }): Promise<number>;
    create(args: {
      data: { email: string; passwordHash: string; role: "ADMIN" };
    }): Promise<unknown>;
  };
}

export type BootstrapAdminResult =
  | "created"
  | "skipped-missing"
  | "skipped-weak-password"
  | "skipped-existing-admin";

export interface BootstrapAdminInput {
  email: string;
  password: string;
}

/**
 * Crea el primer administrador al arrancar, de forma opcional e idempotente:
 * - Si faltan ADMIN_EMAIL o ADMIN_PASSWORD, no hace nada.
 * - Si ya existe CUALQUIER usuario con rol ADMIN, no hace nada (nunca sobrescribe).
 * - Si la contraseña es débil, no crea nada.
 * Nunca imprime ni registra la contraseña ni el hash.
 */
export async function bootstrapAdmin(
  store: AdminBootstrapStore,
  hasher: PasswordHasher,
  input: BootstrapAdminInput,
  log: (message: string) => void = console.log,
): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (email === "" || password === "") {
    log("Arranque: sin ADMIN_EMAIL/ADMIN_PASSWORD, no se siembra administrador.");
    return "skipped-missing";
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    log(
      `Arranque: ADMIN_PASSWORD debe tener al menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres; no se siembra administrador.`,
    );
    return "skipped-weak-password";
  }

  const existing = await store.adminUser.count({ where: { role: "ADMIN" } });
  if (existing > 0) {
    log("Arranque: ya existe un administrador; no se crea ninguno nuevo.");
    return "skipped-existing-admin";
  }

  const passwordHash = await hasher.hash(password);
  await store.adminUser.create({ data: { email, passwordHash, role: "ADMIN" } });
  log("Arranque: administrador inicial creado.");
  return "created";
}
