import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { PrismaAdminAuthRepository } from "../infrastructure/prisma-admin-auth-repository.js";

function setup() {
  const adminUser = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({ failedAttempts: 3 }),
  };
  const adminSession = {
    create: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = new PrismaAdminAuthRepository({ adminUser, adminSession } as unknown as PrismaClient);
  return { repository, adminUser, adminSession };
}

describe("PrismaAdminAuthRepository", () => {
  it("incrementa failedAttempts con una operación atómica `increment` y devuelve el nuevo valor", async () => {
    const { repository, adminUser } = setup();
    await expect(repository.incrementFailedAttempts("a1")).resolves.toBe(3);
    expect(adminUser.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
  });

  it("reinicia failedAttempts y lockedUntil en una sola escritura", async () => {
    const { repository, adminUser } = setup();
    await repository.resetFailedAttempts("a1");
    expect(adminUser.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  });

  it("guarda la sesión solo con tokenHash (no existe ningún campo de token en claro)", async () => {
    const { repository, adminSession } = setup();
    const now = new Date("2026-01-01T10:00:00.000Z");
    const expiresAt = new Date("2026-01-01T22:00:00.000Z");
    await repository.createSession({ adminUserId: "a1", tokenHash: "hash-hex", now, expiresAt });
    expect(adminSession.create).toHaveBeenCalledWith({
      data: { adminUserId: "a1", tokenHash: "hash-hex", createdAt: now, lastSeenAt: now, expiresAt },
    });
  });

  it("busca la sesión por tokenHash y separa la sesión de su propietario", async () => {
    const { repository, adminSession } = setup();
    const date = new Date("2026-01-01T10:00:00.000Z");
    adminSession.findUnique.mockResolvedValue({
      id: "s1",
      adminUserId: "a1",
      tokenHash: "hash-hex",
      createdAt: date,
      lastSeenAt: date,
      expiresAt: date,
      adminUser: { id: "a1", email: "admin@example.com", role: "ADMIN", active: true },
    });
    const found = await repository.findSessionByTokenHash("hash-hex");
    expect(found?.owner).toEqual({ id: "a1", email: "admin@example.com", role: "ADMIN", active: true });
    expect(found?.session.id).toBe("s1");
    expect(found?.session).not.toHaveProperty("adminUser");
  });

  it("devuelve null si la sesión no existe", async () => {
    const { repository, adminSession } = setup();
    adminSession.findUnique.mockResolvedValue(null);
    await expect(repository.findSessionByTokenHash("nada")).resolves.toBeNull();
  });

  it("borrar y renovar sesiones usa updateMany/deleteMany (idempotente)", async () => {
    const { repository, adminSession } = setup();
    const now = new Date();
    await repository.touchSession("s1", now);
    await repository.deleteSessionByTokenHash("hash-hex");
    expect(adminSession.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { lastSeenAt: now } });
    expect(adminSession.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: "hash-hex" } });
  });
});
