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
import type { TelegramMenu } from "../../channels/domain/telegram-menu.js";
import type { CompanyRole } from "../../modules/identity/domain/entities/company-user.js";
import { DEFAULT_HANDOFF_WAIT_MESSAGE, HANDOFF_TIMEOUT_NOTICE } from "../../shared/config/handoff-messages.js";
import {
  buildAttentionMenu,
  DATA_QUERY_REQUEST,
  MENU_COMMAND,
  MENU_LABELS,
  parseMenuCallback,
  parseMenuSelection,
  PQRS_ASK_DETAILS,
} from "../domain/menu.js";
import type { MenuAction } from "../domain/menu.js";
import type { RagService } from "../../modules/rag/rag-service.js";
import { maskLongNumbers } from "../../modules/rag/rag-service.js";

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
  handoff?: {
    findActiveTicketCreatedAt(conversationId: string): Promise<Date | null>;
    hasAgentMessage(conversationId: string): Promise<boolean>;
    hasReminder(conversationId: string, since: Date, reminder: string): Promise<boolean>;
    sendReminder(conversationId: string, reminder: string): Promise<void>;
    cancel(conversationId: string): Promise<void>;
  };
}

export interface ProcessIncomingMessageResult {
  conversationId: string;
  reply: string | null;
  handledByBot: boolean;
  status: ConversationStatus;
  /** Menú con teclado inline que el canal debe enviar (solo Telegram). */
  menu?: TelegramMenu;
  /** Acción del menú que eligió el usuario, si eligió alguna. */
  menuAction?: MenuAction;
}

const DEFAULT_FALLBACK_REPLY =
  "No pude resolver tu consulta. Un agente humano te atenderá en unos instantes.";
const HANDOFF_REMINDER = "⏳ Seguimos buscando a un asesor. Escribe «menú» o pulsa 🔙 Volver al menú para elegir otra opción.";

function isReturnToMenuCommand(text: string): boolean {
  const normalized = text.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^(?:\/menu|menu|volver|volver al menu|regresar|regresar al menu|otra opcion|otras opciones|cambiar de opcion|inicio|🔙 volver al menu)$/u.test(normalized);
}

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
  /**
   * Base de conocimiento de PQRS (artículos con categoría PQRS). Se usa solo en
   * el modo PQRS del menú. Opcional: sin ella, la búsqueda PQRS no encuentra nada
   * y el mensaje se cuenta como no entendido.
   */
  pqrsKnowledge?: KnowledgeRepository;
  rag?: RagService;
  ragEnabled?: boolean;
  ragMinScore?: number;
  recentMessages?: (conversationId: string, limit: number) => Promise<string[]>;
  fallbackReply?: string;
  transferAfterMisses: number;
  handoffTimeoutMinutes?: number;
  handoffWaitMessage?: string;
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
  private readonly handoffTimeoutMinutes: number;
  private readonly handoffWaitMessage: string;
  /**
   * Conversaciones con una búsqueda PQRS armada: el siguiente mensaje del
   * cliente se busca SOLO en los artículos de PQRS. Estado en memoria por
   * instancia (se pierde al reiniciar el proceso).
   */
  private readonly pqrsArmed = new Set<string>();
  private readonly pendingRagConfirmations = new Map<string, string>();
  private readonly pendingAgentOffers = new Map<string, string>();

  constructor(private readonly deps: ProcessIncomingMessageDeps) {
    this.fallbackReply = deps.fallbackReply ?? DEFAULT_FALLBACK_REPLY;
    this.transferAfterMisses = deps.transferAfterMisses ?? 3;
    this.handoffTimeoutMinutes = deps.handoffTimeoutMinutes ?? 15;
    this.handoffWaitMessage = deps.handoffWaitMessage ?? DEFAULT_HANDOFF_WAIT_MESSAGE;
  }

  async execute(inbound: InboundMessage): Promise<ProcessIncomingMessageResult> {
    const phone = inbound.contactId;
    const name = inbound.name;
    const channel = inbound.channel;
    // Un botón pulsado llega como `callback_data`; se traduce a la etiqueta
    // legible de la opción para que el historial no guarde identificadores internos.
    const text = this.resolveInboundText(inbound.text);

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

    if ((sent.status === "WAITING_AGENT" || sent.status === "OPEN") && this.deps.conversations.handoff) {
      const handoff = this.deps.conversations.handoff;
      const startedAt = await handoff.findActiveTicketCreatedAt(conversation.id);
      if (startedAt) {
        const agentHasReplied = await handoff.hasAgentMessage(conversation.id);
        if (!agentHasReplied && Date.now() - startedAt.getTime() >= this.handoffTimeoutMinutes * 60_000) {
          await handoff.cancel(conversation.id);
          return this.showMenu(conversation.id, channel, HANDOFF_TIMEOUT_NOTICE);
        }
        if (isReturnToMenuCommand(text)) {
          await handoff.cancel(conversation.id);
          return this.showMenu(conversation.id, channel);
        }
        if (agentHasReplied) {
          return { conversationId: conversation.id, reply: null, handledByBot: false, status: sent.status };
        }
        const reminder = HANDOFF_REMINDER;
        const alreadyReminded = await handoff.hasReminder(conversation.id, startedAt, reminder);
        if (!alreadyReminded) {
          await handoff.sendReminder(conversation.id, reminder);
          return { conversationId: conversation.id, reply: reminder, handledByBot: true, status: sent.status };
        }
      }
    }

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

    const offeredContext = this.pendingAgentOffers.get(conversation.id);
    if (offeredContext) {
      this.pendingAgentOffers.delete(conversation.id);
      if (/^(sí|si|acepto|por favor)$/iu.test(text.trim())) {
        return this.transfer(conversation.id, user.id, phone, name, offeredContext, "HUMAN_REQUEST");
      }
      if (/^no$/iu.test(text.trim())) {
        const reply = "Entendido. Si necesitas algo más, cuéntame y te ayudo.";
        const saved = await this.deps.conversations.recordBotReply(conversation.id, reply);
        return { conversationId: conversation.id, reply, handledByBot: true, status: saved.status };
      }
    }

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

    // Menú de atención (solo Telegram, que es el único canal con teclado inline).
    const menuReply = await this.handleMenu(
      text,
      user.id,
      conversation.id,
      channel,
      phone,
      name,
    );
    if (menuReply) return menuReply;

    if (this.deps.ragEnabled && this.deps.rag) {
      return this.handleWithRag(text, user.id, conversation.id, channel, phone, name);
    }

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
      ({ intent } = await classifier.classify(maskLongNumbers(text)));
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

    let result: { reply: string; handoffRequired?: boolean };
    try {
      result = await dataQuery.execute(maskLongNumbers(text), {
        companyUserId: principal.companyUserId,
        role: principal.role,
        companyCustomerId: principal.companyCustomerId,
      });
    } catch {
      resetMissCount(conversationId);
      return this.transfer(conversationId, userId, phone, name, text, "LOW_CONFIDENCE");
    }

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
    fallbackReply = this.fallbackReply,
    maxMisses = this.transferAfterMisses,
  ): Promise<ProcessIncomingMessageResult> {
    const handled = await this.deps.conversations.handleNonTextEvent({
      conversationId,
      eventType: "INTENT_NOT_RECOGNIZED",
    });

    const missCount = incrementMissCount(conversationId);

    if (missCount >= maxMisses) {
      return this.transfer(conversationId, userId, phone, name, text, "MAX_MISSES");
    }

    return {
      conversationId,
      reply: fallbackReply,
      handledByBot: false,
      status: handled.status,
    };
  }

  private registerRagMiss(
    conversationId: string,
    userId: string,
    phone: string,
    name: string,
    text: string,
  ): Promise<ProcessIncomingMessageResult> {
    const message = this.deps.rag?.lowConfidenceMessage ?? this.fallbackReply;
    return this.registerMiss(conversationId, userId, phone, name, text, message, 3);
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
      reply: transferred.status === "WAITING_AGENT" || transferred.status === "OPEN"
        ? this.handoffWaitMessage
        : transferred.messageToCustomer,
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

  /**
   * Traduce el `callback_data` de un botón pulsado a la etiqueta legible de la
   * opción. El resto del texto llega tal cual.
   */
  private resolveInboundText(raw: string): string {
    const action = parseMenuCallback(raw);
    if (raw === "handoff:back") return "volver al menú";
    return action ? MENU_LABELS[action] : raw;
  }

  /**
   * Menú de atención (solo Telegram, que es el único canal con teclado inline):
   * - "/menu" vuelve a mostrar el menú con teclado inline.
   * - "1", "2", "3" o la etiqueta de la opción ejecutan esa acción.
   * - Con una búsqueda PQRS armada, el mensaje se busca SOLO en los artículos PQRS.
   *
   * Devuelve null si el mensaje no es del menú y hay que seguir el flujo normal.
   */
  private async handleMenu(
    text: string,
    userId: string,
    conversationId: string,
    channel: ChatChannel,
    phone: string,
    name: string,
  ): Promise<ProcessIncomingMessageResult | null> {
    if (isReturnToMenuCommand(text)) {
      return this.showMenu(conversationId, channel);
    }
    if (channel !== "TELEGRAM") return null;

    if (text.trim().toLowerCase() === MENU_COMMAND) {
      return this.showMenu(conversationId);
    }

    const action = parseMenuSelection(text);
    if (action) {
      return this.handleMenuAction(action, userId, conversationId, channel, phone, name);
    }

    // Búsqueda PQRS armada: consume el mensaje y NO cae en el flujo general.
    if (this.pqrsArmed.has(conversationId)) {
      this.pqrsArmed.delete(conversationId);
      return this.handlePqrsQuery(text, userId, conversationId, phone, name);
    }

    return null;
  }

  /** Ejecuta la opción elegida del menú de atención. */
  private async handleMenuAction(
    action: MenuAction,
    userId: string,
    conversationId: string,
    channel: ChatChannel,
    phone: string,
    name: string,
  ): Promise<ProcessIncomingMessageResult> {
    // Elegir otra opción cancela cualquier búsqueda PQRS pendiente.
    this.pqrsArmed.delete(conversationId);
    this.pendingRagConfirmations.delete(conversationId);
    this.pendingAgentOffers.delete(conversationId);

    if (action === "pqrs") {
      this.pqrsArmed.add(conversationId);
      const botReply = await this.deps.conversations.recordBotReply(conversationId, PQRS_ASK_DETAILS);
      return {
        conversationId,
        reply: PQRS_ASK_DETAILS,
        handledByBot: true,
        status: botReply.status,
        menuAction: action,
      };
    }

    if (action === "datos") {
      const result = await this.handleDataQuery(
        DATA_QUERY_REQUEST,
        userId,
        conversationId,
        channel,
        phone,
        name,
      );
      return { ...result, menuAction: action };
    }

    resetMissCount(conversationId);
    const transferred = await this.transfer(
      conversationId,
      userId,
      phone,
      name,
      MENU_LABELS.asesor,
      "HUMAN_REQUEST",
    );
    return { ...transferred, menuAction: action };
  }

  /** Vuelve a mostrar el menú de atención. */
  private async showMenu(conversationId: string, channel: ChatChannel = "TELEGRAM", notice?: string): Promise<ProcessIncomingMessageResult> {
    this.pendingRagConfirmations.delete(conversationId);
    this.pendingAgentOffers.delete(conversationId);
    const menu = buildAttentionMenu();
    const text = notice ? `${notice}\n\n${menu.text}` : menu.text;
    const botReply = await this.deps.conversations.recordBotReply(conversationId, text);
    return {
      conversationId,
      reply: text,
      handledByBot: true,
      status: botReply.status,
    ...(channel === "TELEGRAM" ? { menu: { ...menu, text } } : {}),
    };
  }

  /**
   * Busca el mensaje del cliente SOLO en los artículos de PQRS. Si no hay
   * coincidencia, cuenta como mensaje no entendido (mismo camino seguro que el
   * resto del bot: nunca se inventa una respuesta).
   */
  private async handlePqrsQuery(
    text: string,
    userId: string,
    conversationId: string,
    phone: string,
    name: string,
  ): Promise<ProcessIncomingMessageResult> {
    if (this.deps.ragEnabled && this.deps.rag) {
      return this.handleWithRag(text, userId, conversationId, "TELEGRAM", phone, name);
    }
    const pqrs = this.deps.pqrsKnowledge;
    const answer = pqrs ? await pqrs.findAnswer(text) : null;
    if (answer) {
      resetMissCount(conversationId);
      const botReply = await this.deps.conversations.recordBotReply(conversationId, answer);
      return { conversationId, reply: answer, handledByBot: true, status: botReply.status };
    }
    return this.registerMiss(conversationId, userId, phone, name, text);
  }

  private async handleWithRag(
    text: string,
    userId: string,
    conversationId: string,
    channel: ChatChannel,
    phone: string,
    name: string,
  ): Promise<ProcessIncomingMessageResult> {
    const rag = this.deps.rag;
    if (!rag) return this.registerMiss(conversationId, userId, phone, name, text);
    const pendingId = this.pendingRagConfirmations.get(conversationId);
    if (pendingId) {
      this.pendingRagConfirmations.delete(conversationId);
      if (/^(sí|si|correcto|eso)$/iu.test(text.trim())) {
        const confirmed = rag.getEntry(pendingId);
        if (confirmed) return this.replyWithRagEntry(confirmed, 1, 0, conversationId, userId, channel, phone, name, text);
      }
      if (/^no$/iu.test(text.trim())) return this.registerRagMiss(conversationId, userId, phone, name, text);
    }
    const startedAt = Date.now();
    try {
      let query = text;
      if (text.trim().split(/\s+/u).filter(Boolean).length <= 3 && this.deps.recentMessages) {
        const previous = await this.deps.recentMessages(conversationId, 6);
        const context = previous.filter((message) => message !== text).slice(-4);
        if (context.length > 0) query = `${context.join("\n")}\n${text}`;
      }
      const match = await rag.find(query);
      const minimum = this.deps.ragMinScore ?? 0.55;
      if (!match) {
        console.log(JSON.stringify({ level: "info", msg: "rag_decision", decision: "aclarar", top1: 0, top2: 0, latencyMs: Date.now() - startedAt }));
        return this.registerRagMiss(conversationId, userId, phone, name, text);
      }
      if (match.entry.priority === "critica") {
        return this.replyWithRagEntry(match.entry, match.score, match.secondScore, conversationId, userId, channel, phone, name, text, startedAt);
      }
      if (match.score < minimum) {
        console.log(JSON.stringify({ level: "info", msg: "rag_decision", entryId: match.entry.id, decision: "aclarar", top1: match.score, top2: match.secondScore, escalationMode: match.entry.escalationMode, latencyMs: Date.now() - startedAt }));
        return this.registerRagMiss(conversationId, userId, phone, name, text);
      }
      if (match.ambiguous) {
        const question = match.entry.confirmationQuestion ?? "¿Te refieres a este tema?";
        this.pendingRagConfirmations.set(conversationId, match.entry.id);
        const saved = await this.deps.conversations.recordBotReply(conversationId, question);
        console.log(JSON.stringify({ level: "info", msg: "rag_decision", entryId: match.entry.id, top1: match.score, top2: match.secondScore, decision: "confirmar", escalationMode: match.entry.escalationMode, latencyMs: Date.now() - startedAt }));
        return { conversationId, reply: question, handledByBot: true, status: saved.status };
      }
      return this.replyWithRagEntry(match.entry, match.score, match.secondScore, conversationId, userId, channel, phone, name, text, startedAt);
    } catch {
      console.log(JSON.stringify({ level: "info", msg: "rag_decision", decision: "aclarar", reason: "embedding_error", latencyMs: Date.now() - startedAt }));
      return this.registerRagMiss(conversationId, userId, phone, name, text);
    }
  }

  private async replyWithRagEntry(
    entry: import("../../modules/rag/rag-service.js").RagEntry,
    score: number,
    secondScore: number,
    conversationId: string,
    userId: string,
    channel: ChatChannel,
    phone: string,
    name: string,
    text: string,
    startedAt = Date.now(),
  ): Promise<ProcessIncomingMessageResult> {
    if (entry.tool && this.deps.dataQuery) {
      console.log(JSON.stringify({ level: "info", msg: "rag_decision", entryId: entry.id, top1: score, top2: secondScore, decision: "herramienta", escalationMode: entry.escalationMode, latencyMs: Date.now() - startedAt }));
      const toolRequest = entry.tool === "consulta_saldo" ? "consulta mi saldo" : "consulta mis pedidos recientes";
      return this.handleDataQuery(toolRequest, userId, conversationId, channel, phone, name);
    }
    if (entry.tool) {
      const unavailable = "No puedo consultar ese dato en este momento. Si quieres, puedo comunicarte con un asesor.";
      this.pendingAgentOffers.set(conversationId, text);
      const saved = await this.deps.conversations.recordBotReply(conversationId, unavailable);
      console.log(JSON.stringify({ level: "info", msg: "rag_decision", entryId: entry.id, top1: score, top2: secondScore, decision: "herramienta_no_disponible", escalationMode: entry.escalationMode, latencyMs: Date.now() - startedAt }));
      return { conversationId, reply: unavailable, handledByBot: true, status: saved.status };
    }
    const offer = entry.escalationMode === "ofrecer" ? " Si quieres, puedo comunicarte con un asesor." : "";
    const answer = `${entry.answer}${offer}`;
    if (entry.escalationMode === "ofrecer") this.pendingAgentOffers.set(conversationId, text);
    resetMissCount(conversationId);
    const saved = await this.deps.conversations.recordBotReply(conversationId, answer);
    console.log(JSON.stringify({ level: "info", msg: "rag_decision", entryId: entry.id, top1: score, top2: secondScore, decision: entry.escalationMode === "inmediato" || entry.priority === "critica" ? "escalar" : "responder", escalationMode: entry.escalationMode, latencyMs: Date.now() - startedAt }));
    if (entry.escalationMode === "inmediato" || entry.priority === "critica") {
      const transferred = await this.transfer(conversationId, userId, phone, name, text, "LOW_CONFIDENCE");
      return { ...transferred, reply: `${answer}\n\n${transferred.reply ?? "Un asesor continuará contigo."}` };
    }
    return { conversationId, reply: answer, handledByBot: true, status: saved.status };
  }
}
