import { beforeEach, describe, expect, it } from "vitest";
import type { PasswordHasher } from "../../../shared/domain/password-hasher.js";
import { CreateCompanyUserUseCase, UsernameTakenError } from "../application/use-cases/create-company-user.js";
import { ListCompanyUsersUseCase } from "../application/use-cases/list-company-users.js";
import { UpdateCompanyUserUseCase } from "../application/use-cases/update-company-user.js";
import {
  InMemoryAuditWriter,
  InMemoryCompanyUserRepository,
} from "./in-memory-identity-repository.js";

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

describe("administración de usuarios de empresa", () => {
  let repository: InMemoryCompanyUserRepository;
  let audit: InMemoryAuditWriter;

  beforeEach(() => {
    repository = new InMemoryCompanyUserRepository();
    audit = new InMemoryAuditWriter();
  });

  it("crea un usuario con la contraseña hasheada y lo audita", async () => {
    const create = new CreateCompanyUserUseCase({ repository, hasher, audit });
    const created = await create.execute({
      username: "ana",
      password: "contrasena-larga-123",
      displayName: "Ana",
      role: "USER",
      registeredPhone: "570000000001",
      adminId: "admin-1",
      ip: "127.0.0.1",
    });

    expect(created).toMatchObject({ username: "ana", displayName: "Ana", role: "USER", active: true });
    expect(created).not.toHaveProperty("passwordHash");
    expect(audit.entries[0]?.action).toBe("COMPANY_USER_CREATED");
    expect(JSON.stringify(created)).not.toContain("contrasena-larga-123");
  });

  it("rechaza un nombre de usuario repetido", async () => {
    const create = new CreateCompanyUserUseCase({ repository, hasher, audit });
    await create.execute({
      username: "ana",
      password: "contrasena-larga-123",
      displayName: "Ana",
      role: "USER",
      registeredPhone: null,
      adminId: "admin-1",
    });
    await expect(
      create.execute({
        username: "ana",
        password: "otra-contrasena-123",
        displayName: "Otra Ana",
        role: "USER",
        registeredPhone: null,
        adminId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it("actualiza el rol, el estado y la contraseña", async () => {
    const user = repository.addUser({ username: "ana", passwordHash: "hash:vieja", displayName: "Ana" });
    const update = new UpdateCompanyUserUseCase({ repository, hasher, audit });

    const updated = await update.execute({
      id: user.id,
      role: "ADMIN",
      active: false,
      password: "nueva-contrasena-123",
      adminId: "admin-1",
    });

    expect(updated.role).toBe("ADMIN");
    expect(updated.active).toBe(false);
    expect(user.passwordHash).toBe("hash:nueva-contrasena-123");
    expect(audit.entries[0]?.action).toBe("COMPANY_USER_DEACTIVATED");
  });

  it("lista los usuarios sin exponer el hash de la contraseña", async () => {
    repository.addUser({ username: "ana", passwordHash: "hash:secreta" });
    const list = new ListCompanyUsersUseCase({ repository });
    const result = await list.execute();
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("hash:secreta");
  });
});
