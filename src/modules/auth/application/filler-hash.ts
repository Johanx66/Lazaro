import { randomBytes } from "node:crypto";
import type { PasswordHasher } from "../../../shared/domain/password-hasher.js";

/**
 * Hash argon2id de relleno, generado al arrancar con una contraseña aleatoria que nadie
 * conoce. Se verifica cuando el usuario no existe para igualar el tiempo de respuesta.
 */
export function createFillerHash(hasher: PasswordHasher): Promise<string> {
  const filler = hasher.hash(randomBytes(32).toString("base64url"));
  // Evita un unhandledRejection si falla antes de que alguien lo espere; el fallo
  // sigue llegando a quien haga `await` (el login responderá 500).
  filler.catch(() => undefined);
  return filler;
}
