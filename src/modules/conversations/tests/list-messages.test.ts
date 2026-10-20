import { describe, expect, it } from "vitest";
import type { Message } from "../../../../src/modules/conversations/domain/entities/conversation.js";
import {
  MAX_MESSAGES_PAGE,
  clampMessagesLimit,
  type ListMessagesOptions,
} from "../../../../src/modules/conversations/domain/repositories/conversation-repository.js";

/** Misma semántica que PrismaConversationRepository.listMessages. */
function listMessages(all: Message[], conversationId: string, options: ListMessagesOptions) {
  const key = (m: { createdAt: Date; id: string }) => `${m.createdAt.toISOString()}|${m.id}`;
  const before = options.before ? key(options.before) : null;
  return all
    .filter((m) => m.conversationId === conversationId)
    .filter((m) => before === null || key(m) < before)
    .sort((a, b) => (key(a) < key(b) ? -1 : 1))
    .slice(-clampMessagesLimit(options.limit));
}

const make = (n: number, conversationId = "c1"): Message => ({
  id: `m${String(n).padStart(4, "0")}`,
  conversationId,
  senderType: "USER",
  content: `msg ${n}`,
  metadata: null,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(n / 2))),
});

describe("listMessages", () => {
  const all = Array.from({ length: 10 }, (_, i) => make(i + 1));

  it("devuelve los últimos N en orden ascendente", () => {
    const page = listMessages(all, "c1", { limit: 4 });
    expect(page.map((m) => m.id)).toEqual(["m0007", "m0008", "m0009", "m0010"]);
  });

  it("pagina por cursor (createdAt/id) sin repetir ni saltar, con fechas iguales", () => {
    const p1 = listMessages(all, "c1", { limit: 4 });
    const p2 = listMessages(all, "c1", { limit: 4, before: p1[0]! });
    const p3 = listMessages(all, "c1", { limit: 4, before: p2[0]! });
    expect(p2.map((m) => m.id)).toEqual(["m0003", "m0004", "m0005", "m0006"]);
    expect(p3.map((m) => m.id)).toEqual(["m0001", "m0002"]);
  });

  it("ignora otras conversaciones", () => {
    expect(listMessages([...all, make(99, "c2")], "c1", { limit: 50 })).toHaveLength(10);
  });

  it("limita a 200 como máximo y a 1 como mínimo", () => {
    expect(MAX_MESSAGES_PAGE).toBe(200);
    expect(clampMessagesLimit(5000)).toBe(200);
    expect(clampMessagesLimit(0)).toBe(1);
    const many = Array.from({ length: 300 }, (_, i) => make(i + 1));
    expect(listMessages(many, "c1", { limit: 1000 })).toHaveLength(200);
  });
});
