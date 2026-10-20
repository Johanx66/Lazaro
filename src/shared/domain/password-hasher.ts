/**
 * Puerto para el hash de contraseñas. El núcleo depende de esta interfaz, no de
 * una librería concreta (se reutiliza en la Fase 4).
 */
export interface PasswordHasher {
  /** Devuelve el hash codificado (incluye algoritmo, parámetros y sal). */
  hash(plain: string): Promise<string>;
  /** true solo si `plain` corresponde a `hash`. NUNCA lanza: ante cualquier error devuelve false. */
  verify(hash: string, plain: string): Promise<boolean>;
}
