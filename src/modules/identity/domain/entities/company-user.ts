export type CompanyRole = "USER" | "ADMIN";

export interface CompanyUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
  registeredPhone: string | null;
  /**
   * Código de cliente en la BD de la empresa (p. ej. "CLI-000123"). Es la clave con
   * la que el chatbot filtra las consultas de datos. NUNCA es el id interno del bot.
   * `null` = cliente todavía no vinculado a ningún cliente de la BD de la empresa.
   */
  companyCustomerId: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Vista pública: nunca incluye passwordHash ni contadores de seguridad. */
export interface PublicCompanyUser {
  id: string;
  username: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
  registeredPhone: string | null;
  /** Código de cliente en la BD de la empresa, o null si todavía no está vinculado. */
  companyCustomerId: string | null;
  createdAt: Date;
}

export interface CreateCompanyUserInput {
  username: string;
  passwordHash: string;
  displayName: string;
  role: CompanyRole;
  registeredPhone: string | null;
  /** Código de cliente en la BD de la empresa (ya validado y normalizado). */
  companyCustomerId?: string | null;
}

export interface UpdateCompanyUserInput {
  displayName?: string;
  role?: CompanyRole;
  active?: boolean;
  registeredPhone?: string | null;
  /** Código de cliente en la BD de la empresa (ya validado y normalizado). */
  companyCustomerId?: string | null;
  passwordHash?: string;
}

export function toPublicCompanyUser(user: CompanyUser): PublicCompanyUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    registeredPhone: user.registeredPhone,
    companyCustomerId: user.companyCustomerId,
    createdAt: user.createdAt,
  };
}
