import type { BotReplyResult } from "../../modules/conversations/application/use-cases/add-bot-reply.js";
import type { HandleNonTextEventResult } from "../../modules/conversations/application/use-cases/handle-non-text-event.js";
import type { SendMessageResult } from "../../modules/conversations/application/use-cases/send-message.js";
import type { TransferToHumanResult } from "../../modules/conversations/application/use-cases/transfer-to-human.js";
import type {
  Conversation,
  ConversationStatus,
  HandleNonTextEventInput,
  SendMessageInput,
  StartConversationInput,
} from "../../modules/conversations/domain/entities/conversation.js";
import type { KnowledgeRepository } from "../domain/knowledge.js";
import type { InboundMessage } from "../../channels/domain/channel-adapter.js";
import type { CompanyRole } from "../../modules/identity/domain/entities/company-user.js";

export interface UserAccountPort {
  findOrCreateUser(phone: string, name: string, channel: ChatChannel): Promise<{ id: string }>;
}

export type ChatChannel = "WEB" | "WHATSAPP" | "TELEGRAM";

/** Intención detectada por el clasificador (Fase 5). */
export type ChatIntent = "FAQ" | "CONSULTA_DATOS" | "PEDIR_HUMANO" | "NO_ENTIENDE";

/** Puerto del clasificador de intenciones. Lo implementa `modules/chatbot`. */
export interface IntentClassifierPort {
  classify(text: string): Promise<{ intent: ChatIntent }>;
}

/** Identidad autenticada de una sesión de chat vigente (Fase 4). */
export interface ChatSessionPrincipal {
  companyUserId: string;
  displayName: string;
  role: CompanyRole;
}

/** Puerto de consulta de datos de la empresa. Lo implementa `modules/chatbot`. */
export interface DataQueryPort {
  execute(
    text: string,
    session: { companyUserId: string; role: CompanyRole },
  ): Promise<{ reply: string; handoffRequired?: boolean }>;
}

/**
 * Puerto de identidad del chat. Lo implementa el módulo `identity`. Permite al bot
 * gestionar la sesión (login/salir) sin depender de sus detalles.
 */
export interface ChatIdentityPort {
  /** Nombre para mostrar de la sesión vigente del contacto, o null si no hay. */
  getActiveSessionName(channel: ChatChannel, contactId: string): Promise<string | null>;
  /** Identidad autenticada de la sesión vigente, o null si no hay. */
  getActivePrincipal(channel: ChatChannel, contactId: string): Promise<ChatSessionPrincipal | null>;
  /** Genera un enlace de login de un solo uso y devuelve su URL absoluta. */
  startLogin(channel: ChatChannel, contactId: string): Promise<string>;
  /** Cierra la sesión vigente del contacto, si la hay. Idempotente. */
  logout(channel: ChatChannel, contactId: string): Promise<void>;
}

export interface InboundConversationPorts {
  startConversation(input: StartConversationInput): Promise<Conversation>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  recordBotReply(conversationId: string, content: string): Promise<BotReplyResult>;
  handleNonTextEvent(input: HandleNonTextEventInput): Promise<HandleNonTextEventResult>;
  transferToHuman(input: {
    conversationId: string;
    userId: string;
    userPhone: string | null;
    userName: string | null;
    lastCustomerMessage: string;
    reason: "HUMAN_REQUEST" | "LOW_CONFIDENCE" | "MAX_MISSES";
  }): Promise<TransferToHumanResult>;
}

export interface ProcessIncomingMessageResult {
  conversationId: string;
  reply: string | null;
  handledByBot: boolean;
  status: ConversationStatus;
}

const DEFAULT_FALLBACK_REPLY =
  "No pude resolver tu consulta. Un agente humano te atenderá en unos instantes.";

const LOGIN_LINK_REPLY = (url: string): string =>
  `Para consultar tus datos, inicia sesión con este enlace (válido por poco tiempo): ${url}`;

// Texto que se persiste en el historial en lugar del enlace real: el token del
// enlace es una credencial y nunca debe quedar guardado en la tabla de mensajes.
const LOGIN_LINK_RECORDED = "Se envió al usuario un enlace de acceso de un solo uso.";

const LOGOUT_REPLY =
  "He cerrado tu sesión. Si necesitas consultar tus datos de nuevo, pide un nuevo enlace de acceso.";

const HUMAN_REQUEST_KEYWORDS = [
  "agente",
  "humano",
  "persona",
  "operador",
  "transferir",
  "hablar con alguien",
  "hablar con una persona",
  "quiero hablar",
  "necesito ayuda humana",
];

function isHumanRequest(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return HUMAN_REQUEST_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

const LOGIN_KEYWORDS = [
  "iniciar sesion",
  "iniciar sesión",
  "login",
  "loguear",
  "acceder",
  "consultar mis datos",
  "mis datos",
];

const LOGOUT_KEYWORDS = ["salir", "cerrar sesion", "cerrar sesión", "logout"];

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isLoginRequest(text: string): boolean {
  const normalized = normalizeText(text);
  return LOGIN_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function isLogoutRequest(text: string): boolean {
  const normalized = normalizeText(text);
  return LOGOUT_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

const missCounts = new Map<string, number>();

function getMissCount(conversationId: string): number {
  return missCounts.get(conversationId) ?? 0;
}

function incrementMissCount(conversationId: string): number {
  const current = getMissCount(conversationId);
  const next = current + 1;
  missCounts.set(conversationId, next);
  return next;
}

function resetMissCount(conversationId: string): void {
  missCounts.delete(conversationId);
}

export interface ProcessIncomingMessageDeps {
  users: UserAccountPort;
  conversations: InboundConversationPorts;
  knowledge: KnowledgeRepository;
  fallbackReply?: string;
  transferAfterMisses: number;
  /** Opcional: gestión de la sesión de identidad del chat. Sin él, se ignora. */
  identity?: ChatIdentityPort;
  /** Opcional: clasificador de intenciones (Fase 5). Sin él, se usan palabras clave. */
  classifier?: IntentClassifierPort;
  /** Opcional: consulta de datos de la empresa (Fase 5). Requerido si hay classifier. */
  dataQuery?: DataQueryPort;
}

export class ProcessIncomingMessageUseCase {
  private readonly fallbackReply: string;
  private readonly transferAfterMisses: number;

  constructor(private readonly deps: ProcessIncomingMessageDeps) {
    this.fallbackReply = deps.fallbackReply ?? DEFAULT_FALLBACK_REPLY;
    this.transferAfterMisses = deps.transferAfterMisses ?? 3;
  }

  async execute(inbound: InboundMessage): Promise<ProcessIncomingMessageResult> {
    const phone = inbound.contactId;
    const name = inbound.name;
    const text = inbound.text;
    const channel = inbound.channel;

    const user = await this.deps.users.findOrCreateUser(phone, name, channel);

    const conversation = await this.deps.conversations.startConversation({
      userId: user.id,
      channel,
    });

    if (isHumanRequest(text)) {
      resetMissCount(conversation.id);
      return this.transfer(conversation.id, user.id, phone, name, text, "HUMAN_REQUEST");
    }

    const sent = await this.deps.conversations.sendMessage({
      conversationId: conversation.id,
      userId: user.id,
      content: text,
    });

    if (sent.status !== "BOT_HANDLING") {
      resetMissCount(conversation.id);
      return {
        conversationId: conversation.id,
        reply: null,
        handledByBot: false,
        status: sent.status,
      };
    }

    const identityReply = await this.handleIdentityIntent(
      text,
      channel,
      phone,
      conversation.id,
    );
    if (identityReply) return identityReply;

    if (this.deps.classifier) {
      return this.handleWithClassifier(text, user.id, conversation.id, channel, phone, name);
    }

    const answer = await this.deps.knowledge.findAnswer(text);
    if (answer) {
      resetMissCount(conversation.id);
      const botReply = await this.deps.conversations.recordBotReply(conversation.id, answer);
      return {
        conversationId: conversation.id,
        reply: answer,
        handledByBot: true,
        status: botReply.status,
      };
    }

    return this.registerMiss(conversation.id, user.id, phone, name, text);
  }

  /** Enruta el mensaje según la intención detectada por el clasificador (Fase 5). */
  private async handleWithClassifier(
    text: string,
    userId: string,
    conversationId: string,
    channel: ChatChannel,
    phone: string,
    name: string,
  ): Promise<ProcessIncomingMessageResult> {
    const classifier = this.deps.classifier;
    if (!classifier) return this.registerMiss(conversationId, userId, phone, name, text);

    let intent: ChatIntent;
    try {
      ({ intent } = await classifier.classify(text));
    } catch {
      resetMissCount(conversationId);
      return this.transfer(conversationId, userId, phone, name, text, "LOW_CONFIDENCE");
    }

    switch (intent) {
      case "PEDIR_HUMANO":
        resetMissCount(conversationId);
        return this.transfer(conversationId, userId, phone, name, text, "HUMAN_REQUEST");
      case "CONSULTA_DATOS":
        return this.handleDataQuery(text, userId, conversationId, channel, phone, name);
      case "FAQ": {
        const answer = await this.deps.knowledge.findAnswer(text);
        if (answer) {
          resetMissCount(conversationId);
          const botReply = await this.deps.conversations.recordBotReply(conversationId, answer);
          return { conversationId, reply: answer, handledByBot: true, status: botReply.status };
        }
        return this.registerMiss(conversationId, userId, phone, name, text);
      }
      case "NO_ENTIENDE":
      default:
        return this.registerMiss(conversationId, userId, phone, name, text);
    }
  }

  /** Consulta datos de la empresa solo si hay sesión vigente; si no, envía el enlace de login. */
  private async handleDataQuery(
    text: string,
    userId: string,
    conversationId: string,
    channel: ChatChannel,
    phone: string,
    name: string,
  ): Promise<ProcessIncomingMessageResult> {
    const { identity, dataQuery } = this.deps;
    if (!dataQuery) {
      resetMissCount(conversationId);
      return this.transfer(conversationId, userId, phone, name, text, "LOW_CONFIDENCE");
    }

    const principal = identity ? await identity.getActivePrincipal(channel, phone) : null;

    if (!principal) {
      if (!identity) {
        resetMissCount(conversationId);
        return this.transfer(conversationId, userId, phone, name, text, "LOW_CONFIDENCE");
      }
      const reply = LOGIN_LINK_REPLY(await identity.startLogin(channel, phone));
      resetMissCount(conversationId);
      const botReply = await this.deps.conversations.recordBotReply(conversationId, LOGIN_LINK_RECORDED);
      return { conversationId, reply, handledByBot: true, status: botReply.status };
    }

    const result = await dataQuery.execute(text, {
      companyUserId: principal.companyUserId,
      role: principal.role,
    });

    if (result.handoffRequired) {
      resetMissCount(conversationId);
      return this.transfer(conversationId, userId, phone, name, text, "LOW_CONFIDENCE");
    }

    resetMissCount(conversationId);
    const botReply = await this.deps.conversations.recordBotReply(conversationId, result.reply);
    return { conversationId, reply: result.reply, handledByBot: true, status: botReply.status };
  }

  /** Registra un mensaje no entendido y transfiere a asesor al superar el límite. */
  private async registerMiss(
    conversationId: string,
    userId: string,
    phone: string,
    name: string,
    text: string,
  ): Promise<ProcessIncomingMessageResult> {
    const handled = await this.deps.conversations.handleNonTextEvent({
      conversationId,
      eventType: "INTENT_NOT_RECOGNIZED",
    });

    const missCount = incrementMissCount(conversationId);

    if (missCount >= this.transferAfterMisses) {
      return this.transfer(conversationId, userId, phone, name, text, "MAX_MISSES");
    }

    return {
      conversationId,
      reply: this.fallbackReply,
      handledByBot: false,
      status: handled.status,
    };
  }

  /** Transfiere la conversación a un asesor humano con la razón indicada. */
  private async transfer(
    conversationId: string,
    userId: string,
    phone: string,
    name: string,
    text: string,
    reason: "HUMAN_REQUEST" | "LOW_CONFIDENCE" | "MAX_MISSES",
  ): Promise<ProcessIncomingMessageResult> {
    const transferred = await this.deps.conversations.transferToHuman({
      conversationId,
      userId,
      userPhone: phone,
      userName: name.length > 0 ? name : null,
      lastCustomerMessage: text,
      reason,
    });
    return {
      conversationId,
      reply: transferred.messageToCustomer,
      handledByBot: false,
      status: transferred.status,
    };
  }

  /**
   * Gestiona las intenciones de identidad antes de consultar la base de conocimiento.
   * Devuelve null si el mensaje no es de login/salir o no hay puerto de identidad.
   * No cuenta como fallo: siempre responde.
   */
  private async handleIdentityIntent(
    text: string,
    channel: ChatChannel,
    contactId: string,
    conversationId: string,
  ): Promise<ProcessIncomingMessageResult | null> {
    const identity = this.deps.identity;
    if (!identity) return null;

    if (isLogoutRequest(text)) {
      await identity.logout(channel, contactId);
      const botReply = await this.deps.conversations.recordBotReply(conversationId, LOGOUT_REPLY);
      return { conversationId, reply: LOGOUT_REPLY, handledByBot: true, status: botReply.status };
    }

    if (isLoginRequest(text)) {
      const activeName = await identity.getActiveSessionName(channel, contactId);
      if (activeName !== null) {
        const reply = `Ya tienes la sesión iniciada como ${activeName}.`;
        const botReply = await this.deps.conversations.recordBotReply(conversationId, reply);
        return { conversationId, reply, handledByBot: true, status: botReply.status };
      }
      const reply = LOGIN_LINK_REPLY(await identity.startLogin(channel, contactId));
      const botReply = await this.deps.conversations.recordBotReply(conversationId, LOGIN_LINK_RECORDED);
      return { conversationId, reply, handledByBot: true, status: botReply.status };
    }

    return null;
  }
}