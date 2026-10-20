/** Convierte ALLOWED_ORIGINS (separada por comas) en una lista recortada, sin vacíos ni duplicados. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...new Set(entries)];
}

const DEV_HTTP_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Devuelve el motivo por el que el origen no es válido, o null si lo es. */
export function originProblem(entry: string, nodeEnv: string): string | null {
  if (entry === "*") return 'No se permite "*"; indique orígenes explícitos';

  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return `"${entry}" no es un origen válido (use esquema://host[:puerto])`;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `"${entry}" debe usar http:// o https://`;
  }
  if (url.origin !== entry) {
    return `"${entry}" no es un origen exacto (sin ruta, barra final, credenciales ni parámetros)`;
  }
  if (url.protocol === "https:") return null;

  if (nodeEnv === "production") return `"${entry}" debe usar https:// en producción`;
  if (!DEV_HTTP_HOSTS.has(url.hostname)) {
    return `"${entry}" usa http://; solo se permite para localhost o 127.0.0.1 en desarrollo`;
  }
  return null;
}

/** Lista de problemas (vacía si todos los orígenes son válidos). */
export function validateAllowedOrigins(origins: string[], nodeEnv: string): string[] {
  const problems: string[] = [];
  for (const origin of origins) {
    const problem = originProblem(origin, nodeEnv);
    if (problem) problems.push(problem);
  }
  return problems;
}
