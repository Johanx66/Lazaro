import { beforeEach, describe, expect, it } from "vitest";
import { ChatSessionService } from "../application/chat-session-service.js";
import type { Clock } from "../domain/clock.js";
import {
  InMemoryChatSessionRepository,
  InMemoryCompanyUserRepository,
} from "./in-memory-identity-repository.js";

class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const MINUTE = 60_000;

describe("ChatSessionService", () => {
  let clock: MutableClock;
  let users: InMemoryCompanyUserRepository;
  let repository: InMemoryChatSessionRepository;
  let service: ChatSessionService;

  beforeEach(() => {
    clock = new MutableClock(new Date("2026-01-01T10:00:00.000Z"));
    users = new InMemoryCompanyUserRepository();
    repository = new InMemoryChatSessionRepository(users);
    service = new ChatSessionService({
      repository,
      clock,
      idleMs: 20 * MINUTE,
      absoluteMs: 8 * 60 * MINUTE,
    });
  });

  it("crea una sesión y la devuelve como vigente con su dueño", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x", displayName: "Ana" });
    await service.create(user.id, "WEB", "570000000001");

    const active = await service.getActive("WEB", "570000000001");
    expect(active?.owner.displayName).toBe("Ana");
  });

  it("vence por inactividad", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x" });
    await service.create(user.id, "WEB", "570000000001");

    clock.advance(21 * MINUTE);
    expect(await service.getActive("WEB", "570000000001")).toBeNull();

    // La sesión vencida queda revocada.
    const rows = await repository.listActive();
    expect(rows).toHaveLength(0);
  });

  it("la actividad renueva el vencimiento por inactividad", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x" });
    await service.create(user.id, "WEB", "570000000001");

    for (let i = 0; i < 6; i += 1) {
      clock.advance(15 * MINUTE);
      const active = await service.getActive("WEB", "570000000001");
      expect(active).not.toBeNull();
    }
  });

  it("vence por el tope absoluto aunque haya actividad", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x" });
    await service.create(user.id, "WEB", "570000000001");

    // Actividad cada 15 min durante 8 horas: supera el tope absoluto.
    for (let i = 0; i < 32; i += 1) {
      clock.advance(15 * MINUTE);
      await service.getActive("WEB", "570000000001");
    }
    clock.advance(1 * MINUTE);
    expect(await service.getActive("WEB", "570000000001")).toBeNull();
  });

  it("un usuario inactivo invalida su sesión", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x", active: false });
    await service.create(user.id, "WEB", "570000000001");
    expect(await service.getActive("WEB", "570000000001")).toBeNull();
  });

  it("revokeByContact cierra la sesión vigente", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x" });
    await service.create(user.id, "WEB", "570000000001");

    expect(await service.revokeByContact("WEB", "570000000001")).toBe(true);
    expect(await service.getActive("WEB", "570000000001")).toBeNull();
    expect(await service.revokeByContact("WEB", "570000000001")).toBe(false);
  });

  it("listActive excluye las vencidas", async () => {
    const user = users.addUser({ username: "ana", passwordHash: "x" });
    await service.create(user.id, "WEB", "570000000001");
    await service.create(user.id, "WEB", "570000000002");

    clock.advance(21 * MINUTE);
    await service.create(user.id, "WEB", "570000000003");

    const active = await service.listActive();
    expect(active.map((entry) => entry.session.contactId)).toEqual(["570000000003"]);
  });
});
