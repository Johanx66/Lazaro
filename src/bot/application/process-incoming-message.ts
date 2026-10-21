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
  /**
   * Código de cliente en la BD de la empresa (p. ej. "CLI-000123"). Viene de la
   * sesión; es la única clave con la que se filtran las consultas de datos.
   * `null` = cliente sin vincular: sus consultas de datos se deniegan.
   */
  companyCustomerId: string | null;
}

/** Puerto de consulta de datos de la empresa. Lo implementa `modules/chatbot`. */
export interface DataQueryPort {
  execute(
    text: string,
    session: { companyUserId: string; role: CompanyRole; companyCustomerId: string | null },
  ): Promise<{ reply: string; handoffRequired?: boolean }>;
}

/**
 * Entrega del enlace de acceso a un contacto:
 * - `issued`: se generó un enlace nuevo; `url` es la URL absoluta a entregar.
 * - `reused`: el contacto ya tenía un enlace vigente, así que se reutiliza (no se
 *   genera un token nuevo ni se invalida el que el usuario ya tiene).
 */
export type LoginLinkDelivery =
  | { status: "issued"; url: string }
  | { status: "reused" };

/**
 * Puerto de identidad del chat. Lo implementa el módulo `identity`. Permite al bot
 * gestionar la sesión (login/salir) sin depender de sus detalles.
 */
export interface ChatIdentityPort {
  /** Nombre para mostrar de la sesión vigente del contacto, o null si no hay. */
  getActiveSessionName(channel: ChatChannel, contactId: string): Promise<string | null>;
  /**
   * Identidad autenticada de la sesión vigente, o null si no hay.
   * Devuelve null si el contacto no está verificado, si su sesión venció o se
   * revocó, o si su cuenta de cliente dejó de estar autorizada.
   */
  getActivePrincipal(channel: ChatChannel, contactId: string): Promise<ChatSessionPrincipal | null>;
  /** Entrega un enlace de login de un solo uso: nuevo o reutilizado si ya había uno vigente. */
  startLogin(channel: ChatChannel, contactId: string): Promise<LoginLinkDelivery>;
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

// Mensaje estático OBLIGATORIO para todo contacto sin sesión vigente. Nunca se
// genera con IA y no contiene datos sensibles (el acceso se completa en /login,
// nunca pidiendo contraseña ni token por el chat).
export const UNVERIFIED_REPLY =
  "¡Hola! 😊 Para poder conversar contigo y ayudarte, primero necesitas verificar tu identidad. Por favor, completa el proceso de verificación y después podrás continuar. ¡Gracias por tu comprensión!";

// Variante con el enlace de verificación de un solo uso que se envía en el
// PRIMER mensaje de un contacto no verificado.
const UNVERIFIED_REPLY_WITH_LINK = (url: string): string =>
  `${UNVERIFIED_REPLY}\n\nVerifica tu identidad con este enlace (válido por poco tiempo): ${url}`;

// El contacto ya tenía un enlace vigente: se reutiliza el que ya tiene, así que
// no se envía una URL nueva (el token no se puede recuperar: solo se guarda su hash).
const UNVERIFIED_REPLY_LINK_SENT = `${UNVERIFIED_REPLY}\n\nYa te enviamos un enlace de acceso (válido por poco tiempo). Ábrelo en este chat para completar la verificación.`;

// No hay sesión que cerrar y no corresponde generar enlace de verificación.
const NO_ACTIVE_SESSION_REPLY =
  "No tienes una sesión activa. Si necesitas consultar tus datos, escribe \"iniciar sesión\" para recibir un enlace de acceso.";

const LOGIN_LINK_REPLY = (url: string): string =>
  `Para consultar tus datos, inicia sesión con este enlace (válido por poco tiempo): ${url}`;

// Ya existe un enlace vigente del contacto: se reutiliza el que ya tiene.
const LOGIN_LINK_ALREADY_SENT =
  "Ya te enviamos un enlace de acceso (válido por poco tiempo). Ábrelo para iniciar sesión.";

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

    // El mensaje del contacto se persiste siempre, incluso si está bloqueado.
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

    // PUERTA DE VERIFICACIÓN: ningún mensaje sin sesión vigente llega a la IA.
    // Se comprueba ANTES de la transferencia, las intenciones de identidad, el
    // clasificador y la base de conocimiento, de modo que una pregunta, queja,
    // reclamo, petición, PQRS o sugerencia no pueda saltarse la verificación.
    const gate = await this.handleUnverifiedGate(text, channel, phone, conversation.id);
    if (gate) return gate;

    if (isHumanRequest(text)) {
      resetMissCount(conversation.id);
      return this.transfer(conversation.id, user.id, phone, name, text, "HUMAN_REQUEST");
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

  /**
   * Denegación por defecto: si no se puede confirmar una sesión vigente Y un
   * cliente AUTORIZADO (`getActivePrincipal` solo devuelve no-null cuando la
   * sesión no está revocada ni vencida y el usuario de empresa está activo),
   * se responde con el mensaje estático de verificación y el enlace de un solo
   * uso, sin invocar ninguna IA.
   *
   * Devuelve null si el contacto está verificado y puede continuar el flujo.
   */
  private async handleUnverifiedGate(
    text: string,
    channel: ChatChannel,
    contactId: string,
    conversationId: string,
  ): Promise<ProcessIncomingMessageResult | null> {
    const identity = this.deps.identity;
    // Sin puerto de identidad no hay forma de verificar: se deniega (fail closed).
    if (!identity) {
      const botReply = await this.deps.conversations.recordBotReply(
        conversationId,
        UNVERIFIED_REPLY,
      );
      return {
        conversationId,
        reply: UNVERIFIED_REPLY,
        handledByBot: false,
        status: botReply.status,
      };
    }

    const principal = await identity.getActivePrincipal(channel, contactId);
    if (principal) return null;

    // "Salir" sin sesión: no hay nada que cerrar y no corresponde enlace.
    if (isLogoutRequest(text)) {
      const botReply = await this.deps.conversations.recordBotReply(
        conversationId,
        NO_ACTIVE_SESSION_REPLY,
      );
      return {
        conversationId,
        reply: NO_ACTIVE_SESSION_REPLY,
        handledByBot: false,
        status: botReply.status,
      };
    }

    const delivery = await identity.startLogin(channel, contactId);
    // En el historial se guarda el sustituto sin token, nunca el enlace real.
    const botReply = await this.deps.conversations.recordBotReply(
      conversationId,
      LOGIN_LINK_RECORDED,
    );
    return {
      conversationId,
      reply:
        delivery.status === "issued"
          ? UNVERIFIED_REPLY_WITH_LINK(delivery.url)
          : UNVERIFIED_REPLY_LINK_SENT,
      handledByBot: false,
      status: botReply.status,
    };
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
      const delivery = await identity.startLogin(channel, phone);
      const reply =
        delivery.status === "issued" ? LOGIN_LINK_REPLY(delivery.url) : LOGIN_LINK_ALREADY_SENT;
      resetMissCount(conversationId);
      const botReply = await this.deps.conversations.recordBotReply(conversationId, LOGIN_LINK_RECORDED);
      return { conversationId, reply, handledByBot: true, status: botReply.status };
    }

    const result = await dataQuery.execute(text, {
      companyUserId: principal.companyUserId,
      role: principal.role,
      companyCustomerId: principal.companyCustomerId,
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
      const delivery = await identity.startLogin(channel, contactId);
      const reply =
        delivery.status === "issued" ? LOGIN_LINK_REPLY(delivery.url) : LOGIN_LINK_ALREADY_SENT;
      const botReply = await this.deps.conversations.recordBotReply(conversationId, LOGIN_LINK_RECORDED);
      return { conversationId, reply, handledByBot: true, status: botReply.status };
    }

    return null;
  }
}