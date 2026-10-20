/**
 * Puerto para avisar al usuario por su canal de chat (no es el adaptador de canal).
 * Un fallo al notificar NUNCA debe romper el login.
 */
export interface ChatNotifier {
  send(channel: string, contactId: string, text: string): Promise<void>;
}
