export interface User {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  externalCustomerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  phone: string;
  email: string | null;
  externalCustomerId: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  email?: string | null;
  externalCustomerId?: string;
}