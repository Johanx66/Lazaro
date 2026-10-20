import type { User } from "../../domain/entities/user.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";

export class FindUserByPhoneUseCase {
  constructor(private readonly repository: UserRepository) {}

  async execute(phone: string): Promise<User | null> {
    if (!phone || phone.trim().length === 0) {
      return null;
    }
    return this.repository.findByPhone(phone.trim());
  }
}