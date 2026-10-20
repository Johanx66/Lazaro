import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { Conversation } from "../../domain/entities/conversation.js";
import type { ConversationRepository } from "../../domain/repositories/conversation-repository.js";

export class GetConversationUseCase {
  constructor(private readonly repository: ConversationRepository) {}

  async execute(id: string): Promise<Conversation> {
    const conversation = await this.repository.findById(id);
    if (!conversation) {
      throw new NotFoundError("Conversación no encontrada");
    }
    return conversation;
  }
}