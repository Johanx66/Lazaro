import { describe, expect, it } from "vitest";
import type { CreateUserInput, UpdateUserInput, User } from "../../../../src/modules/users/domain/entities/user.js";
import type { UserRepository } from "../../../../src/modules/users/domain/repositories/user-repository.js";
import { CreateUserUseCase } from "../../../../src/modules/users/application/use-cases/create-user.js";
import { GetUserUseCase } from "../../../../src/modules/users/application/use-cases/get-user.js";
import { FindUserByPhoneUseCase } from "../../../../src/modules/users/application/use-cases/find-user-by-phone.js";
import { UpdateUserUseCase } from "../../../../src/modules/users/application/use-cases/update-user.js";
import { NotFoundError, ValidationError } from "../../../../src/shared/errors/app.error.js";

const baseUser: User = {
  id: "u1",
  name: "Ana López",
  phone: "573001234567",
  email: "ana@example.com",
  externalCustomerId: "cust-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function makeRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  let store = new Map<string, User>([[baseUser.id, { ...baseUser }]]);
  return {
    create: overrides.create ?? (async (input: CreateUserInput) => {
      const user: User = { id: "u-new", ...input, createdAt: new Date(), updatedAt: new Date() };
      store.set(user.id, user);
      return user;
    }),
    findById:
      overrides.findById ??
      (async (id) => (id === baseUser.id ? { ...baseUser } : null)),
    findByPhone:
      overrides.findByPhone ??
      (async (phone) => (phone === baseUser.phone ? { ...baseUser } : null)),
    update:
      overrides.update ??
      (async (id, input: UpdateUserInput) => {
        const current = store.get(id);
        if (!current) return null;
        const updated = { ...current, ...input, id };
        store.set(id, updated);
        return updated;
      }),
  };
}

describe("CreateUserUseCase", () => {
  it("crea un usuario válido", async () => {
    const repo = makeRepository({ findByPhone: async () => null });
    const useCase = new CreateUserUseCase(repo);
    const user = await useCase.execute({
      name: "  Pedro  ",
      phone: "573001112233",
      email: "pedro@example.com",
      externalCustomerId: "cust-2",
    });
    expect(user.name).toBe("Pedro");
    expect(user.phone).toBe("573001112233");
    expect(user.externalCustomerId).toBe("cust-2");
  });

  it("rechaza nombre vacío", async () => {
    const useCase = new CreateUserUseCase(makeRepository());
    await expect(
      useCase.execute({ name: "  ", phone: "573001112233", email: null, externalCustomerId: "c1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza correo inválido", async () => {
    const useCase = new CreateUserUseCase(makeRepository());
    await expect(
      useCase.execute({ name: "Pedro", phone: "573001112233", email: "no-es-correo", externalCustomerId: "c1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza teléfono duplicado", async () => {
    const useCase = new CreateUserUseCase(makeRepository());
    await expect(
      useCase.execute({ name: "Pedro", phone: baseUser.phone, email: null, externalCustomerId: "c1" }),
    ).rejects.toThrow(/Ya existe/);
  });
});

describe("GetUserUseCase", () => {
  it("devuelve el usuario existente", async () => {
    const useCase = new GetUserUseCase(makeRepository());
    await expect(useCase.execute(baseUser.id)).resolves.toMatchObject({ id: baseUser.id });
  });

  it("lanza NotFound si no existe", async () => {
    const useCase = new GetUserUseCase(makeRepository({ findById: async () => null }));
    await expect(useCase.execute("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("FindUserByPhoneUseCase", () => {
  it("encuentra por teléfono", async () => {
    const useCase = new FindUserByPhoneUseCase(makeRepository());
    await expect(useCase.execute(baseUser.phone)).resolves.toMatchObject({ id: baseUser.id });
  });

  it("devuelve null cuando no existe", async () => {
    const useCase = new FindUserByPhoneUseCase(makeRepository());
    await expect(useCase.execute("573099999999")).resolves.toBeNull();
  });
});

describe("UpdateUserUseCase", () => {
  it("actualiza campos", async () => {
    const useCase = new UpdateUserUseCase(makeRepository());
    const updated = await useCase.execute(baseUser.id, { name: "Ana Pérez" });
    expect(updated.name).toBe("Ana Pérez");
  });

  it("lanza NotFound si el usuario no existe", async () => {
    const useCase = new UpdateUserUseCase(makeRepository({ update: async () => null }));
    await expect(useCase.execute("nonexistent", { name: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza teléfono duplicado por otro usuario", async () => {
    const repo = makeRepository({
      findByPhone: async () => ({ ...baseUser, id: "otro-id" }),
    });
    const useCase = new UpdateUserUseCase(repo);
    await expect(useCase.execute(baseUser.id, { phone: baseUser.phone })).rejects.toThrow(/Ya existe/);
  });
});