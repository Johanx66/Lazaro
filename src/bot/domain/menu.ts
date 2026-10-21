import type { TelegramInlineButton, TelegramMenu } from "../../channels/domain/telegram-menu.js";

/** Opciones del menú de atención. */
export type MenuAction = "pqrs" | "datos" | "asesor";

/** Orden de las opciones del menú. */
export const MENU_ACTIONS: readonly MenuAction[] = ["pqrs", "datos", "asesor"];

/**
 * `callback_data` breve de cada opción (Telegram admite 64 bytes). Son
 * identificadores opacos: no contienen datos del usuario ni secretos.
 */
export const MENU_CALLBACK_DATA: Record<MenuAction, string> = {
  pqrs: "menu:pqrs",
  datos: "menu:datos",
  asesor: "menu:asesor",
};

/** Etiqueta visible de cada opción. */
export const MENU_LABELS: Record<MenuAction, string> = {
  pqrs: "PQRS",
  datos: "Consultar datos",
  asesor: "Hablar con asesor",
};

/**
 * Selección por texto: "1", "2" y "3" (en el orden del menú) o la etiqueta de
 * la opción. Las claves van normalizadas (minúsculas, sin espacios extra).
 */
export const MENU_TEXT_SELECTIONS: Record<string, MenuAction> = {
  "1": "pqrs",
  "2": "datos",
  "3": "asesor",
  pqrs: "pqrs",
  "consultar datos": "datos",
  "hablar con asesor": "asesor",
};

/** Comando para volver a mostrar el menú. */
export const MENU_COMMAND = "/menu";

/** Texto del menú de atención. */
export const ATTENTION_MENU_TEXT = "Sesión verificada. Elige una opción:";

/**
 * Prefijo de la categoría de los artículos de PQRS en la base de conocimiento
 * (los importados se guardan como "PQRS peticion", "PQRS queja", etc.).
 */
export const PQRS_CATEGORY_PREFIX = "PQRS";

/** Texto con el que se edita el mensaje del menú después de elegir una opción. */
export function menuSelectedText(action: MenuAction): string {
  return `Opción seleccionada: ${MENU_LABELS[action]}`;
}

/** Petición que se envía a las herramientas de solo lectura al elegir "Consultar datos". */
export const DATA_QUERY_REQUEST = "Quiero ver mi saldo y mis pedidos recientes.";

/** Se pide el detalle del caso cuando el cliente elige PQRS sin escribir su solicitud. */
export const PQRS_ASK_DETAILS =
  "Cuéntame tu caso: ¿qué petición, queja, reclamo o sugerencia necesitas? Escríbelo y lo busco en la base de PQRS.";

/** Construye el menú de atención con teclado inline. */
export function buildAttentionMenu(): TelegramMenu {
  const buttons: TelegramInlineButton[] = MENU_ACTIONS.map((action) => ({
    label: MENU_LABELS[action],
    callbackData: MENU_CALLBACK_DATA[action],
  }));
  return { text: ATTENTION_MENU_TEXT, buttons: [buttons] };
}

/** Acción del menú a la que corresponde un `callback_data` (null si no es del menú). */
export function parseMenuCallback(data: string): MenuAction | null {
  return MENU_ACTIONS.find((action) => MENU_CALLBACK_DATA[action] === data) ?? null;
}

/** Normaliza un texto de entrada para compararlo con las selecciones del menú. */
function normalizeSelection(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Acción del menú a la que corresponde una selección por texto ("1", "2" o "3"). */
export function parseMenuSelection(text: string): MenuAction | null {
  return MENU_TEXT_SELECTIONS[normalizeSelection(text)] ?? null;
}
