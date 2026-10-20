import type { CreateUserInput, UpdateUserInput, User } from "../entities/user.js";

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
}