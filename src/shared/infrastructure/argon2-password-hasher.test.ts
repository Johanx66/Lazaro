import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./argon2-password-hasher.js";

const PLAIN = "una-contrasena-de-prueba-123";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("el hash empieza por $argon2id$", async () => {
    const hashed = await hasher.hash(PLAIN);
    expect(hashed.startsWith("$argon2id$")).toBe(true);
  });

  it("usa los parámetros m=19456, t=2, p=1", async () => {
    const hashed = await hasher.hash(PLAIN);
    expect(hashed).toContain("m=19456,t=2,p=1");
  });

  it("dos hashes de la misma contraseña son distintos (sal aleatoria)", async () => {
    const first = await hasher.hash(PLAIN);
    const second = await hasher.hash(PLAIN);
    expect(first).not.toBe(second);
  });

  it("verify con la contraseña correcta devuelve true", async () => {
    const hashed = await hasher.hash(PLAIN);
    await expect(hasher.verify(hashed, PLAIN)).resolves.toBe(true);
  });

  it("verify con una contraseña incorrecta devuelve false", async () => {
    const hashed = await hasher.hash(PLAIN);
    await expect(hasher.verify(hashed, "otra-contrasena-distinta")).resolves.toBe(false);
  });

  it("verify con un hash mal formado devuelve false y no lanza", async () => {
    await expect(hasher.verify("esto-no-es-un-hash", PLAIN)).resolves.toBe(false);
    await expect(hasher.verify("$argon2id$v=19$m=xx,t=2,p=1$basura", PLAIN)).resolves.toBe(false);
    await expect(hasher.verify("", PLAIN)).resolves.toBe(false);
  });

  it("el hash no contiene la contraseña en texto plano", async () => {
    const hashed = await hasher.hash(PLAIN);
    expect(hashed).not.toContain(PLAIN);
  });
});
