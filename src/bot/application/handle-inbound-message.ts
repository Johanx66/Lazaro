import type { AgentNotifier } from "../../connectors/domain/agent-notifier.js";
import type { ChannelAdapter } from "../../channels/domain/channel-adapter.js";
import type { InboundMessage } from "../../channels/domain/channel-adapter.js";
import type { MenuChannelAdapter } from "../../channels/domain/telegram-menu.js";
import type { MessageProcessor, ProcessIncomingMessageResult } from "./message-processor.js";
import { isMenuCallbackPayload } from "../domain/menu.js";

const MENU_HOME_BUTTON = { label: "🔙 Volver al menú", callbackData: "menu:home" };

export interface HandleInboundMessageDeps {
  processor: MessageProcessor;
  adapter: ChannelAdapter;
  notifier?: AgentNotifier;
  /**
   * Canal con teclado inline (Telegram). Sin él, el menú no se entrega y el
   * resto del flujo sigue igual.
   */
  menuAdapter?: MenuChannelAdapter;
}

export class HandleInboundMessageUseCase {
  constructor(private readonly deps: HandleInboundMessageDeps) {}

  async execute(inbound: InboundMessage): Promise<ProcessIncomingMessageResult> {
    const processed = await this.deps.processor.execute(inbound);
    // OPEN identifica una conversación asignada/en atención por un asesor.
    // En ese estado no se agrega navegación que pudiera interrumpirla.
    const result = inbound.channel === "TELEGRAM" && processed.status !== "OPEN"
      ? {
          ...processed,
          ...(processed.menu
            ? { menu: withMenuHome(processed.menu, processed.status) }
            : processed.reply
              ? { menu: {
                  text: processed.reply,
                  buttons: processed.status === "WAITING_AGENT"
                    ? [[{ label: "🔙 Volver al menú", callbackData: "handoff:back" }], [MENU_HOME_BUTTON]]
                    : [[MENU_HOME_BUTTON]],
                } }
              : {}),
        }
      : processed;
    const handoffMenu = result.status === "WAITING_AGENT" && result.reply
      ? {
          text: result.reply,
          buttons: [[{ label: "🔙 Volver al menú", callbackData: "handoff:back" }], [MENU_HOME_BUTTON]],
        }
      : null;
    const editingExistingMenu = inbound.channel === "TELEGRAM" && isMenuCallbackPayload(inbound.text) && result.menu !== undefined;
    if (editingExistingMenu) {
      // Telegram editará el mensaje que originó el callback en el webhook.
    } else if ((result.menu ?? handoffMenu) && this.deps.menuAdapter) {
      // El menú se entrega como mensaje con teclado: no se manda el texto suelto.
      await this.deps.menuAdapter.sendMenu(inbound.contactId, result.menu ?? handoffMenu!).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "warn",
            msg: "no se pudo entregar el menú por el canal",
            to: inbound.contactId,
            channel: this.deps.menuAdapter?.channel,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    } else if (result.reply) {
      await this.deps.adapter.send(inbound.contactId, { text: result.reply, sender: "BOT" }).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "warn",
            msg: "no se pudo entregar la respuesta por el canal",
            to: inbound.contactId,
            channel: this.deps.adapter.channel,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }
    if (result.status === "WAITING_AGENT" && this.deps.notifier) {
      await this.deps.notifier
        .notify({
          conversationId: result.conversationId,
          userPhone: inbound.contactId,
          userName: inbound.name.length > 0 ? inbound.name : null,
          lastCustomerMessage: inbound.text,
          escalatedAt: new Date(),
        })
        .catch(() => []);
    }
    return result;
  }
}

function withMenuHome(
  menu: NonNullable<ProcessIncomingMessageResult["menu"]>,
  status: ProcessIncomingMessageResult["status"],
): NonNullable<ProcessIncomingMessageResult["menu"]> {
  const callbacks = new Set(menu.buttons.flat().map(({ callbackData }) => callbackData));
  const buttons = [...menu.buttons];
  if (status === "WAITING_AGENT" && !callbacks.has("handoff:back")) {
    buttons.push([{ label: "🔙 Cancelar espera", callbackData: "handoff:back" }]);
  }
  if (!callbacks.has(MENU_HOME_BUTTON.callbackData)) buttons.push([MENU_HOME_BUTTON]);
  return { ...menu, buttons };
}
