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

/**
 * Resultado de pedir un enlace de acceso:
 * - `created`: se generó un enlace nuevo y `url` es la URL a entregar.
 * - `reused`: ya existía un enlace vigente del mismo contacto, así que se
 *   REUTILIZA: no se genera un token nuevo y el enlace que el usuario ya tiene
 *   sigue siendo válido hasta su vencimiento.
 */
export type GeneratedLoginLink =
  | { kind: "created"; url: string; expiresAt: Date }
  | { kind: "reused"; expiresAt: Date };

export class GenerateLoginLinkUseCase {
  constructor(private readonly deps: GenerateLoginLinkDeps) {}

  async execute(command: GenerateLoginLinkCommand): Promise<GeneratedLoginLink> {
    const now = this.deps.clock.now();

    // Si el contacto ya tiene un enlace vigente se reutiliza: no se crea un
    // token nuevo y, sobre todo, no se invalida el enlace que el usuario
    // pueda tener abierto. Solo se genera otro cuando el anterior expiró,
    // fue consumido o nunca existió.
    const active = await this.deps.repository.findActiveForContact(
      command.channel,
      command.contactId,
      now,
    );
    if (active) {
      return { kind: "reused", expiresAt: active.expiresAt };
    }

    // No hay enlace utilizable: se invalidan los que quedaran sin usar y se crea uno nuevo.
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

    return { kind: "created", url: `${this.deps.publicBaseUrl}/login?t=${token}`, expiresAt };
  }
}
