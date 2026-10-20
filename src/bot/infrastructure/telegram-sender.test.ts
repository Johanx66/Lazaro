import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpTelegramSender, LogTelegramSender } from "./telegram-sender.js";

const TOKEN = "123456:ABC-token-de-prueba";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HttpTelegramSender", () => {
  it("hace POST a la Bot API con chat_id y texto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await new HttpTelegramSender(TOKEN).sendText("570123456789", "hola");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: "570123456789", text: "hola" });
  });

  it("lanza error con el status si la API responde no-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" }),
    );

    const sender = new HttpTelegramSender(TOKEN);
    await expect(sender.sendText("1", "hola")).rejects.toThrow("Telegram API error 403: Forbidden");
  });
});

describe("LogTelegramSender", () => {
  it("registra el mensaje en modo mock sin fallar", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await new LogTelegramSender().sendText("570123456789", "respuesta simulada");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      mock: string;
      chatId: string;
      message: string;
    };
    expect(entry).toEqual({ level: "info", mock: "telegram", chatId: "570123456789", message: "respuesta simulada" });
  });
});
