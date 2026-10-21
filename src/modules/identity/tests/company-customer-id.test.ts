import { beforeEach, describe, expect, it } from "vitest";
import type { PasswordHasher } from "../../../shared/domain/password-hasher.js";
import { ChatSessionService } from "../application/chat-session-service.js";
import {
  validateCompanyCustomerId,
  normalizeCompanyCustomerId,
} from "../domain/customer-code.js";
import {
  CompanyCustomerIdTakenError,
  InvalidCompanyCustomerIdError,
} from "../application/errors.js";
import { CreateCompanyUserUseCase } from "../application/use-cases/create-company-user.js";
import { UpdateCompanyUserUseCase } from "../application/use-cases/update-company-user.js";
import {
  InMemoryAuditWriter,
  InMemoryChatSessionRepository,
  InMemoryCompanyUserRepository,
} from "./in-memory-identity-repository.js";

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

const MINUTE = 60_000;

describe("código de cliente de la BD de la empresa (companyCustomerId)", () => {
  let repository: InMemoryCompanyUserRepository;
  let audit: InMemoryAuditWriter;
  let sessions: ChatSessionService;

  beforeEach(() => {
    repository = new InMemoryCompanyUserRepository();
    audit = new InMemoryAuditWriter();
    sessions = new ChatSessionService({
      repository: new InMemoryChatSessionRepository(repository),
      clock: { now: () => new Date() },
      idleMs: 20 * MINUTE,
      absoluteMs: 8 * 60 * MINUTE,
    });
  });

  describe("validación del formato", () => {
    it("normaliza a mayúsculas y recorta espacios", () => {
      expect(normalizeCompanyCustomerId("  cli-000123 ")).toBe("CLI-000123");
    });

    it("acepta el formato de la BD de Lázaro (CLI-000123)", () => {
      expect(validateCompanyCustomerId("CLI-000123")).toEqual({ ok: true, value: "CLI-000123" });
    });

    it("rechaza un código vacío", () => {
      expect(validateCompanyCustomerId("   ")).toEqual({ ok: false, reason: "empty" });
    });

    it("rechaza un código demasiado largo", () => {
      expect(validateCompanyCustomerId("A".repeat(33))).toEqual({ ok: false, reason: "too_long" });
    });

    it("rechaza un formato inválido", () => {
      expect(validateCompanyCustomerId("cli 000123")).toEqual({ ok: false, reason: "format" });
      expect(validateCompanyCustomerId("CLI-000123!")).toEqual({ ok: false, reason: "format" });
      expect(validateCompanyCustomerId("CLI.000123")).toEqual({ ok: false, reason: "format" });
    });

    it("acepta un código que empieza por dígitos (el patrón no los prohíbe)", () => {
      expect(validateCompanyCustomerId("000123")).toEqual({ ok: true, value: "000123" });
    });

    it("usa el patrón por defecto si el configurado no es una expresión regular válida", () => {
      expect(validateCompanyCustomerId("CLI-000123", "([")).toEqual({
        ok: true,
        value: "CLI-000123",
      });
    });

    it("respeta un patrón configurado más restrictivo", () => {
      expect(validateCompanyCustomerId("CLI-000123", "^CLI-\\d{6}$")).toEqual({
        ok: true,
        value: "CLI-000123",
      });
      expect(validateCompanyCustomerId("OTRO-1", "^CLI-\\d{6}$")).toEqual({
        ok: false,
        reason: "format",
      });
    });
  });

  describe("creación de usuario", () => {
    it("guarda el código de cliente normalizado", async () => {
      const create = new CreateCompanyUserUseCase({ repository, hasher, audit });
      const created = await create.execute({
        username: "ana",
        password: "contrasena-larga-123",
        displayName: "Ana",
        role: "USER",
        registeredPhone: null,
        companyCustomerId: " cli-000123 ",
        adminId: "admin-1",
      });

      expect(created.companyCustomerId).toBe("CLI-000123");
    });

    it("crea el usuario sin vincular si no se indica código", async () => {
      const create = new CreateCompanyUserUseCase({ repository, hasher, audit });
      const created = await create.execute({
        username: "ana",
        password: "contrasena-larga-123",
        displayName: "Ana",
        role: "USER",
        registeredPhone: null,
        adminId: "admin-1",
      });

      expect(created.companyCustomerId).toBeNull();
    });

    it("rechaza un código con formato inválido", async () => {
      const create = new CreateCompanyUserUseCase({ repository, hasher, audit });
      await expect(
        create.execute({
          username: "ana",
          password: "contrasena-larga-123",
          displayName: "Ana",
          role: "USER",
          registeredPhone: null,
          companyCustomerId: "cliente ana",
          adminId: "admin-1",
        }),
      ).rejects.toBeInstanceOf(InvalidCompanyCustomerIdError);
    });

    it("rechaza un código que ya está asignado a otro usuario", async () => {
      repository.addUser({
        username: "ana",
        passwordHash: "hash:x",
        companyCustomerId: "CLI-000123",
      });
      const create = new CreateCompanyUserUseCase({ repository, hasher, audit });

      await expect(
        create.execute({
          username: "beto",
          password: "contrasena-larga-123",
          displayName: "Beto",
          role: "USER",
          registeredPhone: null,
          companyCustomerId: "CLI-000123",
          adminId: "admin-1",
        }),
      ).rejects.toBeInstanceOf(CompanyCustomerIdTakenError);
    });

    it("la auditoría NO guarda el valor del código de cliente", async () => {
      const create = new CreateCompanyUserUseCase({ repository, hasher, audit });
      await create.execute({
        username: "ana",
        password: "contrasena-larga-123",
        displayName: "Ana",
        role: "USER",
        registeredPhone: null,
        companyCustomerId: "CLI-000123",
        adminId: "admin-1",
      });

      const entry = audit.entries.find((e) => e.action === "COMPANY_USER_CREATED");
      expect(entry?.metadata).toMatchObject({ companyCustomerIdAssigned: true });
      expect(JSON.stringify(audit.entries)).not.toContain("CLI-000123");
    });
  });

  describe("actualización de usuario", () => {
    it("asigna el código de cliente y lo audita", async () => {
      const user = repository.addUser({ username: "ana", passwordHash: "hash:vieja" });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });

      const updated = await update.execute({
        id: user.id,
        companyCustomerId: "cli-000123",
        adminId: "admin-1",
      });

      expect(updated.companyCustomerId).toBe("CLI-000123");
      const entry = audit.entries.find((e) => e.action === "COMPANY_CUSTOMER_ID_CHANGED");
      expect(entry?.metadata).toMatchObject({ assigned: true });
      expect(JSON.stringify(audit.entries)).not.toContain("CLI-000123");
    });

    it("quita el vínculo con `null`", async () => {
      const user = repository.addUser({
        username: "ana",
        passwordHash: "hash:vieja",
        companyCustomerId: "CLI-000123",
      });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });

      const updated = await update.execute({
        id: user.id,
        companyCustomerId: null,
        adminId: "admin-1",
      });

      expect(updated.companyCustomerId).toBeNull();
      const entry = audit.entries.find((e) => e.action === "COMPANY_CUSTOMER_ID_CHANGED");
      expect(entry?.metadata).toMatchObject({ assigned: false });
    });

    it("no audita el cambio si el código sigue siendo el mismo", async () => {
      const user = repository.addUser({
        username: "ana",
        passwordHash: "hash:vieja",
        companyCustomerId: "CLI-000123",
      });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });

      await update.execute({
        id: user.id,
        companyCustomerId: "cli-000123",
        adminId: "admin-1",
      });

      expect(audit.entries.map((e) => e.action)).not.toContain("COMPANY_CUSTOMER_ID_CHANGED");
    });

    it("permite reasignar al mismo usuario el código que ya tenía", async () => {
      const user = repository.addUser({
        username: "ana",
        passwordHash: "hash:vieja",
        companyCustomerId: "CLI-000123",
      });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });

      const updated = await update.execute({
        id: user.id,
        companyCustomerId: "CLI-000123",
        adminId: "admin-1",
      });

      expect(updated.companyCustomerId).toBe("CLI-000123");
    });

    it("rechaza asignar a un usuario el código de otro", async () => {
      repository.addUser({
        username: "ana",
        passwordHash: "hash:vieja",
        companyCustomerId: "CLI-000123",
      });
      const beto = repository.addUser({ username: "beto", passwordHash: "hash:vieja" });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });

      await expect(
        update.execute({
          id: beto.id,
          companyCustomerId: "CLI-000123",
          adminId: "admin-1",
        }),
      ).rejects.toBeInstanceOf(CompanyCustomerIdTakenError);
    });

    it("rechaza un código con formato inválido", async () => {
      const user = repository.addUser({ username: "ana", passwordHash: "hash:vieja" });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });

      await expect(
        update.execute({
          id: user.id,
          companyCustomerId: "cliente ana",
          adminId: "admin-1",
        }),
      ).rejects.toBeInstanceOf(InvalidCompanyCustomerIdError);
    });

    it("el código viaja a la sesión del chat para poder filtrar los datos", async () => {
      const user = repository.addUser({ username: "ana", passwordHash: "hash:vieja" });
      const update = new UpdateCompanyUserUseCase({ repository, hasher, audit, sessions });
      await update.execute({
        id: user.id,
        companyCustomerId: "CLI-000123",
        adminId: "admin-1",
      });

      await sessions.create(user.id, "WEB", "570000000001");
      const active = await sessions.getActive("WEB", "570000000001");

      expect(active?.owner.companyCustomerId).toBe("CLI-000123");
    });
  });
});
