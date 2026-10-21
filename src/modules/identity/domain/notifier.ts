/**
 * Puerto para avisar al usuario por su canal de chat (no es el adaptador de canal).
 * Un fallo al notificar NUNCA debe romper el login.
 */
export interface ChatNotifier {
  send(channel: string, contactId: string, text: string): Promise<void>;
}

/**
 * Puerto para entregar el menú de atención al chat verificado. Solo los canales
 * que lo soportan (Telegram) lo reciben; los demás no cambian. Un fallo al
 * enviarlo NUNCA debe romper el login.
 */
export interface ChatMenuNotifier {
  sendMenu(channel: string, contactId: string): Promise<void>;
}
