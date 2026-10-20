import { describe, expect, it, vi } from "vitest";
import type { PasswordHasher } from "../src/shared/domain/password-hasher.js";
import { seedAdmin, type AdminUserStore } from "./seed-admin.js";

const PASSWORD = "contrasena-larga-123";

function setup(existing: { id: string } | null = null) {
  const findUnique = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockResolvedValue({});
  const store: AdminUserStore = { adminUser: { findUnique, create } };
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

describe("seedAdmin", () => {
  it("omite sin fallar si falta el email", async () => {
    const { store, hasher, create, log } = setup();
    await expect(seedAdmin(store, hasher, { email: "", password: PASSWORD }, log)).resolves.toBe(
      "skipped-missing",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("omite sin fallar si falta la contraseña", async () => {
    const { store, hasher, create, log } = setup();
    await expect(
      seedAdmin(store, hasher, { email: "admin@example.com", password: "" }, log),
    ).resolves.toBe("skipped-missing");
    expect(create).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas de menos de 12 caracteres", async () => {
    const { store, hasher, create, log } = setup();
    await expect(
      seedAdmin(store, hasher, { email: "admin@example.com", password: "12345678901" }, log),
    ).resolves.toBe("skipped-weak-password");
    expect(create).not.toHaveBeenCalled();
  });

  it("acepta una contraseña de exactamente 12 caracteres", async () => {
    const { store, hasher, create, log } = setup();
    await expect(
      seedAdmin(store, hasher, { email: "admin@example.com", password: "123456789012" }, log),
    ).resolves.toBe("created");
    expect(create).toHaveBeenCalledOnce();
  });

  it("no modifica un admin existente con ese email", async () => {
    const { store, hasher, create, log } = setup({ id: "abc" });
    await expect(
      seedAdmin(store, hasher, { email: "admin@example.com", password: PASSWORD }, log),
    ).resolves.toBe("exists");
    expect(create).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it("crea el admin con email en minúsculas, rol ADMIN y solo el hash", async () => {
    const { store, hasher, create, findUnique, log } = setup();
    await expect(
      seedAdmin(store, hasher, { email: "  Admin@Example.COM ", password: PASSWORD }, log),
    ).resolves.toBe("created");
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: { email: "admin@example.com", passwordHash: "HASH_FALSO", role: "ADMIN" },
    });
  });

  it("nunca registra la contraseña ni el hash", async () => {
    const { store, hasher, logs, log } = setup();
    await seedAdmin(store, hasher, { email: "admin@example.com", password: PASSWORD }, log);
    await seedAdmin(store, hasher, { email: "admin@example.com", password: "corta" }, log);
    const output = logs.join("\n");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("HASH_FALSO");
  });
});
