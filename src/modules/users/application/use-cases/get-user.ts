import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { User } from "../../domain/entities/user.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";

export class GetUserUseCase {
  constructor(private readonly repository: UserRepository) {}

  async execute(id: string): Promise<User> {
    if (!id || id.trim().length === 0) {
      throw new NotFoundError("Usuario no encontrado");
    }
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundError("Usuario no encontrado");
    }
    return user;
  }
}