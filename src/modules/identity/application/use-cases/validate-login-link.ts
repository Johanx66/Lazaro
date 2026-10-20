import type { Clock } from "../../domain/clock.js";
import type { LoginLinkRepository } from "../../domain/repositories/login-link-repository.js";
import { maskContact } from "../mask.js";
import { hashToken, isWellFormedToken } from "../tokens.js";

export interface ValidateLoginLinkDeps {
  repository: LoginLinkRepository;
  clock: Clock;
}

export interface ValidLoginLink {
  channel: string;
  contactId: string;
  maskedContact: string;
}

/** Verifica un enlace sin consumirlo. Devuelve null si es inválido, vencido o ya usado. */
export class ValidateLoginLinkUseCase {
  constructor(private readonly deps: ValidateLoginLinkDeps) {}

  async execute(token: string): Promise<ValidLoginLink | null> {
    if (!isWellFormedToken(token)) return null;

    const link = await this.deps.repository.findByTokenHash(hashToken(token));
    if (!link) return null;

    const now = this.deps.clock.now();
    if (link.usedAt !== null || link.expiresAt.getTime() <= now.getTime()) return null;

    return {
      channel: link.channel,
      contactId: link.contactId,
      maskedContact: maskContact(link.contactId),
    };
  }
}
