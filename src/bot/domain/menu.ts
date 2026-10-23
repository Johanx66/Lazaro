import type { TelegramInlineButton, TelegramMenu } from "../../channels/domain/telegram-menu.js";

export type MenuAction = "pqrs" | "datos" | "asesor";
export type DataMenuAction = "balance" | "orders";
export type PqrsAreaId = "compras" | "pedidos" | "pagos" | "cuenta" | "servicios" | "atencion" | "general";

export interface MenuKnowledgeEntry {
  id: string;
  topic: string;
  question: string;
  tool: string | null;
}

export const PQRS_AREAS: ReadonlyArray<{ id: PqrsAreaId; label: string; topics: readonly string[] }> = [
  { id: "compras", label: "🛍️ Compras y productos", topics: ["cotizacion", "precios", "promocion", "producto"] },
  { id: "pedidos", label: "📦 Pedidos y posventa", topics: ["pedido", "entrega", "devolucion", "cancelacion", "reembolso"] },
  { id: "pagos", label: "💳 Pagos y facturas", topics: ["pago", "cobro", "factura", "contrato"] },
  { id: "cuenta", label: "👤 Cuenta y canales digitales", topics: ["cuenta", "datos_personales", "app_movil", "pagina_web", "suscripcion"] },
  { id: "servicios", label: "🧰 Servicios y soporte", topics: ["servicio", "soporte_tecnico", "garantia", "instalacion"] },
  { id: "atencion", label: "🏢 Atención y oficinas", topics: ["atencion_cliente", "cita", "punto_atencion"] },
  { id: "general", label: "ℹ️ Información general", topics: ["general"] },
];

export const PQRS_TOPIC_LABELS: Readonly<Record<string, string>> = {
  app_movil: "Aplicación móvil", atencion_cliente: "Atención al cliente", cancelacion: "Cancelaciones",
  cita: "Citas", cobro: "Cobros", contrato: "Contratos", cotizacion: "Cotizaciones", cuenta: "Cuenta",
  datos_personales: "Datos personales", devolucion: "Devoluciones", entrega: "Entregas", factura: "Facturación",
  garantia: "Garantía", general: "General", instalacion: "Instalaciones", pagina_web: "Página web", pago: "Pagos",
  pedido: "Pedidos", precios: "Precios", producto: "Productos", promocion: "Promociones",
  punto_atencion: "Puntos de atención", reembolso: "Reembolsos", servicio: "Servicios",
  soporte_tecnico: "Soporte técnico", suscripcion: "Suscripciones",
};

export type MenuCallback =
  | { type: "home" }
  | { type: "legacy-action"; action: MenuAction }
  | { type: "area"; area: PqrsAreaId }
  | { type: "topic"; topic: string }
  | { type: "questions-page"; topic: string; page: number }
  | { type: "entry"; entryId: string }
  | { type: "data-menu" }
  | { type: "data-action"; action: DataMenuAction }
  | { type: "advisor" }
  | { type: "unknown" };

export const MENU_CALLBACK_DATA: Record<MenuAction, string> = {
  pqrs: "menu:pqrs",
  datos: "menu:datos",
  asesor: "menu:asesor",
};

export const MENU_LABELS: Record<MenuAction, string> = {
  pqrs: "PQRS",
  datos: "Mis datos",
  asesor: "Hablar con asesor",
};

export const MENU_TEXT_SELECTIONS: Record<string, MenuAction> = {
  "1": "pqrs", "2": "datos", "3": "asesor", pqrs: "pqrs",
  "consultar datos": "datos", "mis datos": "datos", "hablar con asesor": "asesor",
};

export const MENU_COMMAND = "/menu";
export const ATTENTION_MENU_TEXT = "Sesión verificada. Elige una opción:";
export const PQRS_CATEGORY_PREFIX = "PQRS";
export const DATA_QUERY_REQUEST = "Quiero ver mi saldo y mis pedidos recientes.";
export const PQRS_ASK_DETAILS =
  "Cuéntame tu caso: ¿qué petición, queja, reclamo o sugerencia necesitas? Escríbelo y lo busco en la base de PQRS.";
export const MAX_QUESTIONS_PER_PAGE = 6;

const LEGACY_CALLBACKS = new Map<string, MenuAction>(Object.entries(MENU_CALLBACK_DATA).map(([action, data]) => [data, action as MenuAction]));

function inlineRows(buttons: TelegramInlineButton[], width = 2): TelegramInlineButton[][] {
  const rows: TelegramInlineButton[][] = [];
  for (let index = 0; index < buttons.length; index += width) rows.push(buttons.slice(index, index + width));
  return rows;
}

function button(label: string, callbackData: string): TelegramInlineButton {
  return { label, callbackData };
}

export function buildAttentionMenu(): TelegramMenu {
  const areaButtons = PQRS_AREAS.map((area) => button(area.label, `menu:area:${area.id}`));
  areaButtons.push(button("👤 Mis datos", MENU_CALLBACK_DATA.datos));
  areaButtons.push(button("👨‍💼 Hablar con un asesor", MENU_CALLBACK_DATA.asesor));
  return { text: ATTENTION_MENU_TEXT, buttons: inlineRows(areaButtons) };
}

export function buildAreaTopicsMenu(areaId: PqrsAreaId): TelegramMenu {
  const area = PQRS_AREAS.find((item) => item.id === areaId);
  if (!area) return buildAttentionMenu();
  const buttons = area.topics.map((topic) => button(PQRS_TOPIC_LABELS[topic] ?? topic, `pqrs:topic:${topic}`));
  buttons.push(button("🔙 Volver", "pqrs:home"));
  return { text: `${area.label}\nElige un tema:`, buttons: inlineRows(buttons) };
}

export function buildTopicQuestionsMenu(
  topic: string,
  entries: readonly MenuKnowledgeEntry[],
  page: number,
  areaId: PqrsAreaId,
): TelegramMenu {
  const matching = entries.filter((entry) => entry.topic === topic).sort((left, right) => left.id.localeCompare(right.id));
  const lastPage = Math.max(0, Math.ceil(matching.length / MAX_QUESTIONS_PER_PAGE) - 1);
  const safePage = Math.min(Math.max(0, page), lastPage);
  const pageEntries = matching.slice(safePage * MAX_QUESTIONS_PER_PAGE, (safePage + 1) * MAX_QUESTIONS_PER_PAGE);
  const buttons = pageEntries.map((entry) => button(compactQuestionLabel(entry.question), `pqrs:entry:${entry.id}`));
  const navigation: TelegramInlineButton[] = [];
  if (safePage > 0) navigation.push(button("⬅️ Anterior", `pqrs:page:${topic}:${safePage - 1}`));
  if (safePage < lastPage) navigation.push(button("Siguiente ➡️", `pqrs:page:${topic}:${safePage + 1}`));
  navigation.push(button("🔙 Volver", `pqrs:area:${areaId}`));
  return {
    text: matching.length === 0
      ? `${PQRS_TOPIC_LABELS[topic] ?? topic}\nAún no hay preguntas disponibles en este tema. Puedes escribir tu consulta.`
      : `${PQRS_TOPIC_LABELS[topic] ?? topic} (página ${safePage + 1} de ${lastPage + 1})\nElige una pregunta:`,
    buttons: [...inlineRows(buttons), ...inlineRows(navigation)],
  };
}

export function buildDataMenu(only?: DataMenuAction): TelegramMenu {
  const buttons: TelegramInlineButton[] = [];
  if (!only || only === "balance") buttons.push(button("💰 Mi saldo", "data:balance"));
  if (!only || only === "orders") buttons.push(button("📦 Mis pedidos", "data:orders"));
  buttons.push(button("🔙 Volver al menú", "pqrs:home"));
  return { text: "Mis datos. Elige qué quieres consultar:", buttons: inlineRows(buttons) };
}

function compactQuestionLabel(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  return [...clean].length > 48 ? `${[...clean].slice(0, 47).join("")}…` : clean;
}

export function isMenuCallbackPayload(data: string): boolean {
  return ["handoff:", "menu:", "pqrs:", "data:"].some((prefix) => data.startsWith(prefix));
}

function isAreaId(value: string): value is PqrsAreaId {
  return PQRS_AREAS.some((area) => area.id === value);
}

function topicExists(value: string): boolean {
  return Object.hasOwn(PQRS_TOPIC_LABELS, value);
}

export function areaForTopic(topic: string): PqrsAreaId | null {
  return PQRS_AREAS.find((area) => area.topics.includes(topic))?.id ?? null;
}

/** Convierte cada callback conocido en una acción cerrada; ningún dato se interpreta como texto libre. */
export function parseMenuCallback(data: string): MenuCallback | null {
  const legacy = LEGACY_CALLBACKS.get(data);
  if (legacy) return legacy === "asesor" ? { type: "advisor" } : legacy === "datos" ? { type: "data-menu" } : { type: "home" };
  if (data === "handoff:back") return { type: "home" };
  if (data === "pqrs:home") return { type: "home" };
  if (data === "menu:home") return { type: "home" };
  if (data === "data:balance") return { type: "data-action", action: "balance" };
  if (data === "data:orders") return { type: "data-action", action: "orders" };

  const areaMatch = data.match(/^(?:menu|pqrs):area:([a-z_]+)$/);
  if (areaMatch?.[1] && isAreaId(areaMatch[1])) return { type: "area", area: areaMatch[1] };
  const topicMatch = data.match(/^pqrs:topic:([a-z_]+)$/);
  if (topicMatch?.[1] && topicExists(topicMatch[1])) return { type: "topic", topic: topicMatch[1] };
  const pageMatch = data.match(/^pqrs:page:([a-z_]+):(\d{1,3})$/);
  if (pageMatch?.[1] && topicExists(pageMatch[1])) return { type: "questions-page", topic: pageMatch[1], page: Number(pageMatch[2]) };
  const entryMatch = data.match(/^pqrs:entry:([a-z0-9_.-]+)$/i);
  if (entryMatch?.[1]) return { type: "entry", entryId: entryMatch[1] };
  return isMenuCallbackPayload(data) ? { type: "unknown" } : null;
}

export function menuSelectedText(action: MenuAction): string {
  return `Opción seleccionada: ${MENU_LABELS[action]}`;
}

function normalizeSelection(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseMenuSelection(text: string): MenuAction | null {
  return MENU_TEXT_SELECTIONS[normalizeSelection(text)] ?? null;
}

export function menuActionForCallback(callback: MenuCallback): MenuAction | undefined {
  if (callback.type === "advisor") return "asesor";
  if (callback.type === "data-menu" || callback.type === "data-action") return "datos";
  if (callback.type === "entry" || callback.type === "topic" || callback.type === "area" || callback.type === "questions-page") return "pqrs";
  return undefined;
}

export function callbackDataValuesForEntries(entries: readonly MenuKnowledgeEntry[]): string[] {
  return [
    ...Object.values(MENU_CALLBACK_DATA),
    ...PQRS_AREAS.map(({ id }) => `menu:area:${id}`),
    ...PQRS_AREAS.flatMap(({ topics }) => topics.flatMap((topic) => [
      `pqrs:topic:${topic}`, `pqrs:page:${topic}:0`, `pqrs:page:${topic}:1`,
    ])),
    ...entries.map(({ id }) => `pqrs:entry:${id}`),
    "handoff:back", "pqrs:home", "data:balance", "data:orders",
  ];
}
