export type CompanyRole = "USER" | "ADMIN";

export interface CompanyUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
  registeredPhone: string | null;
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
  createdAt: Date;
}

export interface CreateCompanyUserInput {
  username: string;
  passwordHash: string;
  displayName: string;
  role: CompanyRole;
  registeredPhone: string | null;
}

export interface UpdateCompanyUserInput {
  displayName?: string;
  role?: CompanyRole;
  active?: boolean;
  registeredPhone?: string | null;
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
    createdAt: user.createdAt,
  };
}
