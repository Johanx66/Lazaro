import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import type { ConversationRepository } from "../domain/repositories/conversation-repository.js";
import type { ChannelAdapter } from "../../../channels/domain/channel-adapter.js";
import type { WhatsAppSender } from "../../../bot/domain/whatsapp.js";
import type { UserRepository } from "../../users/domain/repositories/user-repository.js";
import type { Conversation } from "../domain/entities/conversation.js";
import { clampMessagesLimit } from "../domain/repositories/conversation-repository.js";

function queryParam(req: Request, key: string): string {
  const value = req.query[key];
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : "";
  }
  return typeof value === "string" ? value : "";
}

const WHATSAPP_WINDOW_HOURS = 24;

export interface AgentPanelControllerDeps {
  conversationRepository: ConversationRepository;
  userRepository: UserRepository;
  webAdapter: ChannelAdapter;
  whatsappAdapter?: ChannelAdapter;
  telegramAdapter?: ChannelAdapter;
  whatsappSender?: WhatsAppSender;
  whatsappTemplateName?: string;
}

export class AgentPanelController {
  constructor(private readonly deps: AgentPanelControllerDeps) {}

  async listWaiting(req: Request, res: Response): Promise<void> {
    const conversations = await this.deps.conversationRepository.findWaitingForAgent();
    res.json({ conversations: await this.enrich(conversations) });
  }

  async listHistory(req: Request, res: Response): Promise<void> {
    const conversations = await this.deps.conversationRepository.findClosed();
    res.json({ conversations: await this.enrich(conversations) });
  }

  // Añade el teléfono/nombre del cliente (para responder por el canal de origen)
  // y la hora de su último mensaje (ventana de WhatsApp) a cada conversación.
  private async enrich(
    conversations: Conversation[],
  ): Promise<Array<Conversation & { userName: string | null; userPhone: string | null; lastCustomerMessageAt: string | null }>> {
    return Promise.all(
      conversations.map(async (conv) => {
        const user = await this.deps.userRepository.findById(conv.userId);
        const messages = await this.deps.conversationRepository.listMessages(conv.id, { limit: 50 });
        const lastCustomerMsg = messages
          .filter((m) => m.senderType === "USER")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return {
          ...conv,
          userName: user?.name ?? null,
          userPhone: user?.phone ?? null,
          lastCustomerMessageAt: lastCustomerMsg?.createdAt?.toISOString() ?? null,
        };
      })
    );
  }

  async getMessages(req: Request, res: Response): Promise<void> {
    const conversationId = param(req, "id");
    const limit = clampMessagesLimit(Number(queryParam(req, "limit")) || 50);
    const beforeCursor = queryParam(req, "before");

    let before: { createdAt: Date; id: string } | undefined;
    if (beforeCursor) {
      const parts = beforeCursor.split("|");
      if (parts.length === 2 && parts[0] && parts[1]) {
        before = { createdAt: new Date(parts[0]), id: parts[1] };
      }
    }

    const messages = await this.deps.conversationRepository.listMessages(conversationId, {
      limit,
      before,
    });
    res.json({ messages });
  }

  async getWhatsAppWindow(req: Request, res: Response): Promise<void> {
    const conversationId = param(req, "id");
    const conversation = await this.deps.conversationRepository.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversación no encontrada" } });
      return;
    }

    if (conversation.channel !== "WHATSAPP") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "No es una conversación de WhatsApp" } });
      return;
    }

    const messages = await this.deps.conversationRepository.listMessages(conversationId, { limit: 50 });
    const lastCustomerMsg = messages
      .filter((m) => m.senderType === "USER")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!lastCustomerMsg) {
      res.json({ canReply: false, expiresAt: null, reason: "No hay mensajes del cliente" });
      return;
    }

    const windowEnd = new Date(lastCustomerMsg.createdAt.getTime() + WHATSAPP_WINDOW_HOURS * 60 * 60 * 1000);
    const now = new Date();
    const canReply = now < windowEnd;

    res.json({
      canReply,
      expiresAt: windowEnd.toISOString(),
      lastCustomerMessageAt: lastCustomerMsg.createdAt.toISOString(),
    });
  }

  async sendAgentReply(req: Request, res: Response): Promise<void> {
    const conversationId = param(req, "id");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (text.length === 0) {
      res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "El campo 'text' es obligatorio" } });
      return;
    }

    const conversation = await this.deps.conversationRepository.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversación no encontrada" } });
      return;
    }

    // El contacto y el canal se derivan del servidor: el asesor responde por el
    // canal de origen al cliente de la conversación, nunca a un contacto arbitrario.
    const user = await this.deps.userRepository.findById(conversation.userId);
    const phone = user?.phone ?? "";
    if (phone.length === 0) {
      res.status(409).json({ error: { code: "NO_CONTACT", message: "La conversación no tiene un contacto válido" } });
      return;
    }

    const channel = conversation.channel;
    if (channel !== "WHATSAPP" && channel !== "WEB" && channel !== "TELEGRAM") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: `Canal "${channel}" no soportado` } });
      return;
    }

    // Check WhatsApp window for free-form messages (Telegram y web no tienen ventana)
    if (channel === "WHATSAPP" && !(await this.canFreeFormReply(conversationId, res))) {
      return;
    }

    const adapter =
      channel === "WHATSAPP" ? this.deps.whatsappAdapter : channel === "TELEGRAM" ? this.deps.telegramAdapter : this.deps.webAdapter;
    if (!adapter) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: `Adaptador ${channel} no disponible` } });
      return;
    }

    await adapter.send(phone, { text, sender: "AGENT" });

    await this.deps.conversationRepository.addMessage({
      conversationId,
      senderType: "AGENT",
      content: text,
    });

    res.status(201).json({ status: "sent" });
  }

  /** true si se puede responder libre (dentro de la ventana), false si ya respondió. */
  private async canFreeFormReply(conversationId: string, res: Response): Promise<boolean> {
    const messages = await this.deps.conversationRepository.listMessages(conversationId, { limit: 50 });
    const lastCustomerMsg = messages
      .filter((m) => m.senderType === "USER")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!lastCustomerMsg) return true;

    const windowEnd = new Date(lastCustomerMsg.createdAt.getTime() + WHATSAPP_WINDOW_HOURS * 60 * 60 * 1000);
    if (new Date() >= windowEnd) {
      res.status(409).json({
        error: {
          code: "WHATSAPP_WINDOW_EXPIRED",
          message: "La ventana de 24h para mensajes libres ha expirado. Use una plantilla HSM.",
        },
      });
      return false;
    }
    return true;
  }

  async sendTemplate(req: Request, res: Response): Promise<void> {
    const conversationId = param(req, "id");
    const conversation = await this.deps.conversationRepository.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversación no encontrada" } });
      return;
    }

    if (conversation.channel !== "WHATSAPP") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "No es una conversación de WhatsApp" } });
      return;
    }

    if (!this.deps.whatsappSender || !this.deps.whatsappTemplateName) {
      res.status(500).json({ error: { code: "NOT_CONFIGURED", message: "Envío de plantillas no configurado" } });
      return;
    }

    const user = await this.deps.userRepository.findById(conversation.userId);
    const phone = user?.phone ?? "";
    if (phone.length === 0) {
      res.status(409).json({ error: { code: "NO_CONTACT", message: "La conversación no tiene un contacto válido" } });
      return;
    }

    try {
      await this.deps.whatsappSender.sendTemplate({
        to: phone,
        templateName: this.deps.whatsappTemplateName,
        languageCode: "es",
      });

      await this.deps.conversationRepository.addMessage({
        conversationId,
        senderType: "AGENT",
        content: "[Plantilla HSM enviada: " + this.deps.whatsappTemplateName + "]",
      });

      res.json({ status: "sent" });
    } catch (error) {
      res.status(500).json({
        error: {
          code: "TEMPLATE_SEND_FAILED",
          message: error instanceof Error ? error.message : "Error enviando plantilla",
        },
      });
    }
  }

  async closeConversation(req: Request, res: Response): Promise<void> {
    const conversationId = param(req, "id");
    const conversation = await this.deps.conversationRepository.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversación no encontrada" } });
      return;
    }

    await this.deps.conversationRepository.update(conversationId, { status: "CLOSED", endedAt: new Date() });
    await this.deps.conversationRepository.addMessage({
      conversationId,
      senderType: "SYSTEM",
      content: "Conversación cerrada por el agente.",
    });

    res.json({ status: "closed" });
  }

  async returnToBot(req: Request, res: Response): Promise<void> {
    const conversationId = param(req, "id");
    const conversation = await this.deps.conversationRepository.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversación no encontrada" } });
      return;
    }

    await this.deps.conversationRepository.update(conversationId, { status: "BOT_HANDLING", assignedAgentId: null });
    await this.deps.conversationRepository.addMessage({
      conversationId,
      senderType: "SYSTEM",
      content: "Conversación devuelta al bot.",
    });

    res.json({ status: "returned_to_bot" });
  }
}