import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { Conversation, StartConversationInput } from "../../domain/entities/conversation.js";
import type { ConversationRepository } from "../../domain/repositories/conversation-repository.js";
import { initialConversationState } from "../../domain/state-machine.js";
import { validateStartConversation } from "../validation.js";

export interface StartConversationDeps {
  repository: ConversationRepository;
  findUser: (userId: string) => Promise<{ id: string } | null>;
}

export class StartConversationUseCase {
  constructor(private readonly deps: StartConversationDeps) {}

  async execute(input: StartConversationInput): Promise<Conversation> {
    const valid = validateStartConversation(input);

    const user = await this.deps.findUser(valid.userId);
    if (!user) {
      throw new NotFoundError("Usuario no encontrado");
    }

    const existing = await this.deps.repository.findActiveByUserIdAndChannel(
      valid.userId,
      valid.channel,
    );
    if (existing) {
      return existing;
    }

    const state = initialConversationState();
    return this.deps.repository.create({
      userId: valid.userId,
      channel: valid.channel,
      status: state.status,
      assignedAgentId: state.assignedAgentId,
    });
  }
}