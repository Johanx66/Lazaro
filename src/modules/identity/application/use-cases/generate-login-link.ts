import type { Clock } from "../../domain/clock.js";
import type { AuditWriter } from "../../domain/audit.js";
import type { LoginLinkRepository } from "../../domain/repositories/login-link-repository.js";
import { generateOpaqueToken, hashToken } from "../tokens.js";

export interface GenerateLoginLinkDeps {
  repository: LoginLinkRepository;
  clock: Clock;
  ttlMs: number;
  publicBaseUrl: string;
  audit: AuditWriter;
}

export interface GenerateLoginLinkCommand {
  channel: string;
  contactId: string;
  /** IP del solicitante si se conoce; para auditoría. */
  ip?: string | null;
}

export interface GeneratedLoginLink {
  /** URL absoluta a entregar en el chat. No se registra en logs ni auditoría. */
  url: string;
  expiresAt: Date;
}

export class GenerateLoginLinkUseCase {
  constructor(private readonly deps: GenerateLoginLinkDeps) {}

  async execute(command: GenerateLoginLinkCommand): Promise<GeneratedLoginLink> {
    const now = this.deps.clock.now();
    // Un enlace nuevo invalida los anteriores del mismo contacto: solo el último sirve.
    await this.deps.repository.invalidateActiveForContact(command.channel, command.contactId, now);

    const token = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.deps.ttlMs);
    await this.deps.repository.create({
      tokenHash: hashToken(token),
      channel: command.channel,
      contactId: command.contactId,
      expiresAt,
    });

    await this.deps.audit.record({
      actorType: "SYSTEM",
      action: "LOGIN_LINK_CREATED",
      targetType: "login_link",
      ip: command.ip ?? null,
      metadata: { channel: command.channel, contactId: command.contactId },
    });

    return { url: `${this.deps.publicBaseUrl}/login?t=${token}`, expiresAt };
  }
}
