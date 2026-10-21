import { describe, expect, it, vi } from "vitest";
import type { PasswordHasher } from "../domain/password-hasher.js";
import { bootstrapAdmin, type AdminBootstrapStore } from "./bootstrap-admin.js";

const PASSWORD = "contrasena-larga-123";

function setup(existingAdmins = 0) {
  const count = vi.fn().mockResolvedValue(existingAdmins);
  const create = vi.fn().mockResolvedValue({});
  const store: AdminBootstrapStore = { adminUser: { count, create } };
  const hasher: PasswordHasher = {
    hash: vi.fn().mockResolvedValue("HASH_FALSO"),
    verify: vi.fn().mockResolvedValue(true),
  };
  const logs: string[] = [];
  const log = (message: string): void => {
    logs.push(message);
  };
  return { store, hasher, count, create, logs, log };
}

describe("bootstrapAdmin", () => {
  it("no hace nada si falta el email", async () => {
    const { store, hasher, create, count, log } = setup();
    await expect(
      bootstrapAdmin(store, hasher, { email: "", password: PASSWORD }, log),
    ).resolves.toBe("skipped-missing");
    expect(count).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("no hace nada si falta la contraseña", async () => {
    const { store, hasher, create, count, log } = setup();
    await expect(
      bootstrapAdmin(store, hasher, { email: "admin@example.com", password: "" }, log),
    ).resolves.toBe("skipped-missing");
    expect(count).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas de menos de 12 caracteres", async () => {
    const { store, hasher, create, count, log } = setup();
    await expect(
      bootstrapAdmin(store, hasher, { email: "admin@example.com", password: "12345678901" }, log),
    ).resolves.toBe("skipped-weak-password");
    expect(count).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("no crea nada si ya existe un admin (no sobrescribe)", async () => {
    const { store, hasher, create, count, log } = setup(1);
    await expect(
      bootstrapAdmin(store, hasher, { email: "admin@example.com", password: PASSWORD }, log),
    ).resolves.toBe("skipped-existing-admin");
    expect(count).toHaveBeenCalledWith({ where: { role: "ADMIN" } });
    expect(create).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it("crea el admin con email en minúsculas, rol ADMIN y solo el hash", async () => {
    const { store, hasher, create, log } = setup(0);
    await expect(
      bootstrapAdmin(store, hasher, { email: "  Admin@Example.COM ", password: PASSWORD }, log),
    ).resolves.toBe("created");
    expect(create).toHaveBeenCalledWith({
      data: { email: "admin@example.com", passwordHash: "HASH_FALSO", role: "ADMIN" },
    });
  });

  it("nunca registra la contraseña ni el hash", async () => {
    const { store, hasher, logs, log } = setup(0);
    await bootstrapAdmin(store, hasher, { email: "admin@example.com", password: PASSWORD }, log);
    await bootstrapAdmin(store, hasher, { email: "admin@example.com", password: "corta" }, log);
    const output = logs.join("\n");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("HASH_FALSO");
  });
});
