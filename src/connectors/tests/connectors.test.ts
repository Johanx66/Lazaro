import { describe, expect, it, vi } from "vitest";
import { NotifyWaitingAgentUseCase } from "../../../src/connectors/application/notify-waiting-agent.js";
import type { NotificationChannel } from "../../../src/connectors/application/notify-waiting-agent.js";
import type { EscalatedConversation } from "../../../src/connectors/domain/agent-notifier.js";
import { WhatsAppAgentNotifier } from "../../../src/connectors/infrastructure/whatsapp-agent-notifier.js";
import { WebhookPostNotifier } from "../../../src/connectors/infrastructure/webhook-post-notifier.js";
import { buildAgentNotifier } from "../../../src/connectors/index.js";
import type { WhatsAppSender } from "../../../src/bot/domain/whatsapp.js";

const escalation: EscalatedConversation = {
  conversationId: "c1",
  userPhone: "573001234567",
  userName: "Ana López",
  lastCustomerMessage: "quiero hablar con un agente",
  escalatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function messageSender(sendText = vi.fn()): WhatsAppSender {
  return { sendText: sendText as unknown as WhatsAppSender["sendText"] };
}

describe("NotifyWaitingAgentUseCase", () => {
  it("marca como skipped un canal no configurado", async () => {
    const useCase = new NotifyWaitingAgentUseCase([{ name: "x", isAvailable: () => false, send: vi.fn() }]);
    const results = await useCase.execute(escalation);
    expect(results).toEqual([{ channel: "x", status: "skipped", detail: "conector no configurado" }]);
  });

  it("marca como sent un canal que envío correctamente", async () => {
    const useCase = new NotifyWaitingAgentUseCase([{ name: "x", isAvailable: () => true, send: vi.fn() }]);
    const results = await useCase.execute(escalation);
    expect(results).toEqual([{ channel: "x", status: "sent", detail: "notificación enviada" }]);
  });

  it("no lanza aunque un canal falle y reporta failed", async () => {
    const failing: NotificationChannel = {
      name: "x",
      isAvailable: () => true,
      send: async () => {
        throw new Error("SMTP caído");
      },
    };
    const useCase = new NotifyWaitingAgentUseCase([failing]);
    const results = await useCase.execute(escalation);
    expect(results[0]).toMatchObject({ channel: "x", status: "failed", detail: "SMTP caído" });
  });
});

describe("WhatsAppAgentNotifier", () => {
  it("no está disponible sin teléfono de soporte", () => {
    const notifier = new WhatsAppAgentNotifier(messageSender(), "");
    expect(notifier.isAvailable()).toBe(false);
  });

  it("envía la escalación formateada al teléfono de soporte", async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const notifier = new WhatsAppAgentNotifier(messageSender(sendText), "573005551111");
    await notifier.send(escalation);
    expect(sendText).toHaveBeenCalledTimes(1);
    const [to, message] = sendText.mock.calls[0] as [string, string];
    expect(to).toBe("573005551111");
    expect(message).toContain("Conversación c1");
    expect(message).toContain("Ana López");
    expect(message).toContain("quiero hablar con un agente");
  });
});

describe("WebhookPostNotifier", () => {
  it("no está disponible sin URL", () => {
    const notifier = new WebhookPostNotifier("");
    expect(notifier.isAvailable()).toBe(false);
  });

  it("envía el payload de la escalación vía POST", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const notifier = new WebhookPostNotifier("https://alerts.local/hook", fetchFn as unknown as typeof fetch);
    await notifier.send(escalation);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://alerts.local/hook");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as { event: string; conversationId: string };
    expect(body.event).toBe("conversation.waiting_agent");
    expect(body.conversationId).toBe("c1");
  });

  it("lanza si el webhook responde con error", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const notifier = new WebhookPostNotifier("https://alerts.local/hook", fetchFn as unknown as typeof fetch);
    await expect(notifier.send(escalation)).rejects.toThrow("500");
  });
});

describe("buildAgentNotifier", () => {
  it("arma solo los conectores configurados", async () => {
    const sender = messageSender();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const notifier = buildAgentNotifier({
      sender,
      whatsappSupportPhone: "573005551111",
      notificationWebhookUrl: "https://alerts.local/hook",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const results = await notifier.notify(escalation);
    expect(results.map((r) => r.channel).sort()).toEqual(["webhook", "whatsapp"]);
    expect(results.every((r) => r.status === "sent")).toBe(true);
  });

  it("devuelve vacío sin conectores configurados", async () => {
    const notifier = buildAgentNotifier({
      sender: messageSender(),
      whatsappSupportPhone: "",
      notificationWebhookUrl: "",
    });
    await expect(notifier.notify(escalation)).resolves.toEqual([]);
  });
});