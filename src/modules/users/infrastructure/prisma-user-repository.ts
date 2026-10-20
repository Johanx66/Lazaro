import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { CreateUserInput, UpdateUserInput, User } from "../domain/entities/user.js";
import type { UserRepository } from "../domain/repositories/user-repository.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.db.user.create({ data: input });
    return this.toDomain(user);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.db.user.findUnique({ where: { id } });
    return user ? this.toDomain(user) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const user = await this.db.user.findUnique({ where: { phone } });
    return user ? this.toDomain(user) : null;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const data: Record<string, string | null> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.externalCustomerId !== undefined) data.externalCustomerId = input.externalCustomerId;

    const user = await this.db.user.update({ where: { id }, data });
    return this.toDomain(user);
  }

  private toDomain(user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    externalCustomerId: string;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      externalCustomerId: user.externalCustomerId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}