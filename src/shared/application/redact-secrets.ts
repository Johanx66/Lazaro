/**
 * Oculta el token de los enlaces de acceso (`/login?t=<token>`) antes de escribir
 * un texto en el log. El enlace de login es una credencial de un solo uso: nunca
 * debe quedar registrado en los logs.
 */
export function redactLoginLinks(text: string): string {
  return text.replace(/(\/login\?t=)[A-Za-z0-9_-]+/g, "$1***");
}
