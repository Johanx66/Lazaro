import { describe, expect, it, vi } from "vitest";
import type { PasswordHasher } from "../src/shared/domain/password-hasher.js";
import { seedCompanyUser, type CompanyUserStore } from "./seed-company-user.js";

const PASSWORD = "contrasena-larga-123";

function setup(existing: { id: string } | null = null) {
  const findUnique = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockResolvedValue({});
  const store: CompanyUserStore = { companyUser: { findUnique, create } };
  const hasher: PasswordHasher = {
    hash: vi.fn().mockResolvedValue("HASH_FALSO"),
    verify: vi.fn().mockResolvedValue(true),
  };
  const logs: string[] = [];
  const log = (message: string): void => {
    logs.push(message);
  };
  return { store, hasher, findUnique, create, logs, log };
}

const input = (overrides: Partial<Parameters<typeof seedCompanyUser>[2]> = {}) => ({
  username: "cliente.ejemplo",
  password: PASSWORD,
  displayName: "Cliente Ejemplo",
  registeredPhone: "570000000001",
  ...overrides,
});

describe("seedCompanyUser", () => {
  it("omite sin fallar si falta el usuario", async () => {
    const { store, hasher, create, log } = setup();
    await expect(
      seedCompanyUser(store, hasher, input({ username: "" }), log),
    ).resolves.toBe("skipped-missing");
    expect(create).not.toHaveBeenCalled();
  });

  it("omite sin fallar si falta la contraseña", async () => {
    const { store, hasher, create, log } = setup();
    await expect(
      seedCompanyUser(store, hasher, input({ password: "" }), log),
    ).resolves.toBe("skipped-missing");
    expect(create).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas de menos de 12 caracteres", async () => {
    const { store, hasher, create, log } = setup();
    await expect(
      seedCompanyUser(store, hasher, input({ password: "12345678901" }), log),
    ).resolves.toBe("skipped-weak-password");
    expect(create).not.toHaveBeenCalled();
  });

  it("no modifica un usuario existente con ese nombre", async () => {
    const { store, hasher, create, log } = setup({ id: "abc" });
    await expect(seedCompanyUser(store, hasher, input(), log)).resolves.toBe("exists");
    expect(create).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it("crea el usuario con nombre en minúsculas, rol USER y solo el hash", async () => {
    const { store, hasher, create, findUnique, log } = setup();
    await expect(
      seedCompanyUser(store, hasher, input({ username: "  Cliente.Ejemplo " }), log),
    ).resolves.toBe("created");
    expect(findUnique).toHaveBeenCalledWith({
      where: { username: "cliente.ejemplo" },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        username: "cliente.ejemplo",
        passwordHash: "HASH_FALSO",
        displayName: "Cliente Ejemplo",
        role: "USER",
        registeredPhone: "570000000001",
      },
    });
  });

  it("deja el teléfono en null si viene vacío", async () => {
    const { store, hasher, create, log } = setup();
    await seedCompanyUser(store, hasher, input({ registeredPhone: "  " }), log);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ registeredPhone: null }),
    });
  });

  it("nunca registra la contraseña ni el hash", async () => {
    const { store, hasher, logs, log } = setup();
    await seedCompanyUser(store, hasher, input(), log);
    await seedCompanyUser(store, hasher, input({ password: "corta" }), log);
    const output = logs.join("\n");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("HASH_FALSO");
  });
});
