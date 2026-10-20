import type { PasswordHasher } from "../src/shared/domain/password-hasher.js";

export const MIN_COMPANY_USER_PASSWORD_LENGTH = 12;

export interface SeedCompanyUserInput {
  username: string;
  password: string;
  displayName: string;
  /** Teléfono autorizado para REQUIRE_PHONE_MATCH. Vacío => sin teléfono. */
  registeredPhone: string;
}

// Subconjunto del cliente Prisma que necesita el seed (facilita los tests).
export interface CompanyUserStore {
  companyUser: {
    findUnique(args: {
      where: { username: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        username: string;
        passwordHash: string;
        displayName: string;
        role: "USER";
        registeredPhone: string | null;
      };
    }): Promise<unknown>;
  };
}

export type SeedCompanyUserResult =
  | "created"
  | "exists"
  | "skipped-missing"
  | "skipped-weak-password";

/**
 * Siembra un usuario de empresa de EJEMPLO para probar el login del chat.
 * Nunca imprime ni registra la contraseña ni el hash.
 */
export async function seedCompanyUser(
  store: CompanyUserStore,
  hasher: PasswordHasher,
  input: SeedCompanyUserInput,
  log: (message: string) => void = console.log,
): Promise<SeedCompanyUserResult> {
  const username = input.username.trim().toLowerCase();
  const password = input.password;
  const displayName = input.displayName.trim();
  const registeredPhone = input.registeredPhone.trim();

  if (username === "" || password === "") {
    log("Seed de usuario de empresa omitido: faltan COMPANY_SEED_USERNAME y/o COMPANY_SEED_PASSWORD.");
    return "skipped-missing";
  }

  if (password.length < MIN_COMPANY_USER_PASSWORD_LENGTH) {
    log(
      `Seed de usuario de empresa omitido: COMPANY_SEED_PASSWORD debe tener al menos ${MIN_COMPANY_USER_PASSWORD_LENGTH} caracteres.`,
    );
    return "skipped-weak-password";
  }

  const existing = await store.companyUser.findUnique({ where: { username }, select: { id: true } });
  if (existing) {
    log("Seed de usuario de empresa omitido: ya existe un usuario con ese nombre (no se modifica).");
    return "exists";
  }

  const passwordHash = await hasher.hash(password);
  await store.companyUser.create({
    data: {
      username,
      passwordHash,
      displayName: displayName.length > 0 ? displayName : username,
      role: "USER",
      registeredPhone: registeredPhone.length > 0 ? registeredPhone : null,
    },
  });
  log("Seed de usuario de empresa aplicado: usuario de ejemplo creado.");
  return "created";
}
