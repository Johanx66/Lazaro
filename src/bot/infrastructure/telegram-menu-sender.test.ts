import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpTelegramMenuSender, TelegramMenuApiError } from "./telegram-menu-sender.js";

afterEach(() => vi.unstubAllGlobals());

describe("HttpTelegramMenuSender", () => {
  it("expone la description de Telegram sin volcar la respuesta completa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error_code: 400, description: "Message is too old" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const sender = new HttpTelegramMenuSender("token-ficticio");

    await expect(sender.editMenu("570000000001", 42, { text: "menú", buttons: [] })).rejects.toMatchObject({
      name: "TelegramMenuApiError",
      status: 400,
      description: "Message is too old",
    } satisfies Partial<TelegramMenuApiError>);
  });
});
