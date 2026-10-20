import { hash, verify } from "@node-rs/argon2";
import type { Algorithm } from "@node-rs/argon2";
import type { PasswordHasher } from "../domain/password-hasher.js";

// Parámetros de argon2id (recomendación OWASP). Explícitos para que un cambio de
// defaults de la librería no altere la política sin que nos demos cuenta.
//  - memoryCost: 19456 KiB (19 MiB) de memoria por hash.
//  - timeCost: 2 pasadas.
//  - parallelism: 1 hilo.
// La sal aleatoria (16 bytes) la genera la propia librería en cada hash y queda
// codificada dentro del resultado.
// `Algorithm` es un `const enum` de la librería (no existe en runtime), por eso se
// usa su valor numérico: Argon2id = 2.
const ARGON2ID = 2 as Algorithm;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      // Hash mal formado u otro error: nunca se propaga, simplemente no coincide.
      return false;
    }
  }
}
