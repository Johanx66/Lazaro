/** Enlace de login de un solo uso enviado por el chat. Solo se persiste el hash del token. */
export interface LoginLink {
  id: string;
  tokenHash: string;
  channel: string;
  contactId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreateLoginLinkInput {
  tokenHash: string;
  channel: string;
  contactId: string;
  expiresAt: Date;
}
