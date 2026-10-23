import type { Prisma } from "../../../generated/prisma/client.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  Conversation,
  ConversationStatus,
  Message,
  SenderType,
} from "../domain/entities/conversation.js";
import { clampMessagesLimit } from "../domain/repositories/conversation-repository.js";
import type {
  AddEventData,
  AddMessageData,
  ConversationRepository,
  CreateConversationData,
  ListMessagesOptions,
  UpdateConversationData,
} from "../domain/repositories/conversation-repository.js";

const MAX_CLOSED_CONVERSATIONS = 100;

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: CreateConversationData): Promise<Conversation> {
    const conversation = await this.db.conversation.create({
      data: {
        userId: data.userId,
        channel: data.channel,
        status: data.status,
        assignedAgentId: data.assignedAgentId,
      },
    });
    return this.toDomain(conversation);
  }

  async findById(id: string): Promise<Conversation | null> {
    const conversation = await this.db.conversation.findUnique({ where: { id } });
    return conversation ? this.toDomain(conversation) : null;
  }

  async findActiveByUserIdAndChannel(
    userId: string,
    channel: string,
  ): Promise<Conversation | null> {
    const conversation = await this.db.conversation.findFirst({
      where: {
        userId,
        channel,
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return conversation ? this.toDomain(conversation) : null;
  }

  async update(id: string, data: UpdateConversationData): Promise<Conversation | null> {
    const updateData: Prisma.ConversationUncheckedUpdateInput = { status: data.status };
    if (data.endedAt !== undefined) updateData.endedAt = data.endedAt;
    if (data.assignedAgentId !== undefined) updateData.assignedAgentId = data.assignedAgentId;

    const conversation = await this.db.conversation.update({ where: { id }, data: updateData });
    return this.toDomain(conversation);
  }

  async addMessage(data: AddMessageData): Promise<Message> {
    const message = await this.db.message.create({
      data: {
        conversationId: data.conversationId,
        senderType: data.senderType as SenderType,
        content: data.content,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return this.toDomainMessage(message);
  }

  async recordEvent(data: AddEventData): Promise<void> {
    await this.db.conversationEvent.create({
      data: {
        conversationId: data.conversationId,
        type: data.type,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listMessages(conversationId: string, options: ListMessagesOptions): Promise<Message[]> {
    const before = options.before;
    const after = options.after;
    const rows = await this.db.message.findMany({
      where: {
        conversationId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { gt: after.createdAt } },
                { createdAt: after.createdAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: before
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "asc" }, { id: "asc" }],
      take: clampMessagesLimit(options.limit),
    });
    return (before ? rows.reverse() : rows).map((row) => this.toDomainMessage(row));
  }

  async hasAgentMessage(conversationId: string): Promise<boolean> {
    return (await this.db.message.count({ where: { conversationId, senderType: "AGENT" } })) > 0;
  }

  async findWaitingForAgent(): Promise<Conversation[]> {
    const conversations = await this.db.conversation.findMany({
      where: {
        OR: [
          { status: "WAITING_AGENT" },
          { status: "OPEN", assignedAgentId: { not: null } },
        ],
      },
      orderBy: { updatedAt: "asc" },
    });
    return conversations.map((c) => this.toDomain(c));
  }

  async findClosed(): Promise<Conversation[]> {
    const conversations = await this.db.conversation.findMany({
      where: { status: { in: ["RESOLVED", "CLOSED"] } },
      orderBy: { endedAt: "desc" },
      take: MAX_CLOSED_CONVERSATIONS,
    });
    return conversations.map((c) => this.toDomain(c));
  }

  private toDomain(conversation: {
    id: string;
    userId: string;
    channel: string;
    status: ConversationStatus;
    assignedAgentId: string | null;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Conversation {
    return {
      id: conversation.id,
      userId: conversation.userId,
      channel: conversation.channel,
      status: conversation.status,
      assignedAgentId: conversation.assignedAgentId,
      startedAt: conversation.startedAt,
      endedAt: conversation.endedAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toDomainMessage(message: {
    id: string;
    conversationId: string;
    senderType: SenderType;
    content: string;
    metadata: unknown;
    createdAt: Date;
  }): Message {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderType: message.senderType,
      content: message.content,
      metadata: (message.metadata ?? null) as Record<string, unknown> | null,
      createdAt: message.createdAt,
    };
  }
}
