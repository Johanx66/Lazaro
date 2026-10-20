export type AuditActorType = "ADMIN" | "COMPANY_USER" | "SYSTEM";

/** Entrada de auditoría. NUNCA debe contener contraseñas, hashes ni tokens. */
export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Puerto de escritura de auditoría. Los fallos al auditar no deben romper el flujo. */
export interface AuditWriter {
  record(entry: AuditEntry): Promise<void>;
}
