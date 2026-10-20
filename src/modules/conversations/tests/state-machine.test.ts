import { describe, expect, it } from "vitest";
import {
  ALL_STATUSES,
  INITIAL_STATUS,
  InvalidTransitionError,
  TRANSITIONS,
  canTransition,
  initialConversationState,
  isTerminalStatus,
  transition,
} from "../../../../src/modules/conversations/domain/state-machine.js";
import type {
  ConversationDomainEventType,
  ConversationStatus,
} from "../../../../src/modules/conversations/domain/state-machine.js";

describe("máquina de estados de conversación", () => {
  it("arranca en estado inicial CLOSED", () => {
    expect(INITIAL_STATUS).toBe("CLOSED");
    expect(initialConversationState()).toEqual({ status: "CLOSED", assignedAgentId: null });
  });

  it("resuelve cada transición permitida", () => {
    for (const [from, map] of Object.entries(TRANSITIONS) as [ConversationStatus, Partial<Record<ConversationDomainEventType, ConversationStatus>>][]) {
      for (const [eventType, to] of Object.entries(map) as [ConversationDomainEventType, ConversationStatus][]) {
        const next = transition({ status: from, assignedAgentId: null }, { type: eventType });
        expect(next.status).toBe(to);
        expect(canTransition(from, eventType)).toBe(true);
      }
    }
  });

  it("consulta una transición no permitida como inválida", () => {
    expect(canTransition("CLOSED", "BOT_RESPONSE")).toBe(false);
    expect(canTransition("OPEN", "TRANSFERRED_TO_HUMAN")).toBe(false);
  });

  it("lanza InvalidTransitionError con la puerta cerrada", () => {
    expect(() =>
      transition({ status: "CLOSED", assignedAgentId: null }, { type: "BOT_RESPONSE" }),
    ).toThrow(InvalidTransitionError);
  });

  it("no permite TRANSFERRED_TO_HUMAN desde OPEN", () => {
    expect(() =>
      transition({ status: "OPEN", assignedAgentId: "a1" }, { type: "TRANSFERRED_TO_HUMAN" }),
    ).toThrow(/Transición inválida/);
  });

  it("termina estados terminales RESOLVED y CLOSED", () => {
    expect(isTerminalStatus("RESOLVED")).toBe(true);
    expect(isTerminalStatus("CLOSED")).toBe(true);
    expect(isTerminalStatus("OPEN")).toBe(false);
  });

  it("preserva el agente asignado en la transición", () => {
    const next = transition({ status: "WAITING_AGENT", assignedAgentId: "a1" }, { type: "AGENT_ASSIGNED" });
    expect(next).toEqual({ status: "OPEN", assignedAgentId: "a1" });
  });

  it("mantiene WAITING_AGENT al recibir un mensaje del cliente", () => {
    const next = transition({ status: "WAITING_AGENT", assignedAgentId: "a1" }, { type: "MESSAGE_RECEIVED" });
    expect(next).toEqual({ status: "WAITING_AGENT", assignedAgentId: "a1" });
  });

  it("devuelve la conversación al bot con RETURNED_TO_BOT", () => {
    expect(
      transition({ status: "WAITING_AGENT", assignedAgentId: null }, { type: "RETURNED_TO_BOT" }).status,
    ).toBe("BOT_HANDLING");
    expect(
      transition({ status: "OPEN", assignedAgentId: "a1" }, { type: "RETURNED_TO_BOT" }).status,
    ).toBe("BOT_HANDLING");
  });

  it("cierra desde WAITING_AGENT", () => {
    expect(
      transition({ status: "WAITING_AGENT", assignedAgentId: "a1" }, { type: "CONVERSATION_CLOSED" }).status,
    ).toBe("CLOSED");
  });

  it("expone todos los estados del contrato", () => {
    expect(ALL_STATUSES).toEqual([
      "OPEN",
      "BOT_HANDLING",
      "WAITING_USER",
      "WAITING_AGENT",
      "RESOLVED",
      "CLOSED",
    ]);
  });
});