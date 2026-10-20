/**
 * Enmascara un contacto para mostrarlo en la página de login sin revelar el
 * identificador completo. Solo se muestran los últimos 4 caracteres.
 */
export function maskContact(contactId: string): string {
  const visible = contactId.slice(-4);
  return `****${visible}`;
}

/**
 * Normaliza un teléfono para comparar el contacto del chat con el teléfono
 * registrado del usuario: se conservan solo los dígitos.
 */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function phoneMatches(registeredPhone: string | null, contactId: string): boolean {
  if (registeredPhone === null) return false;
  const registered = normalizePhone(registeredPhone);
  const contact = normalizePhone(contactId);
  return registered.length > 0 && registered === contact;
}
