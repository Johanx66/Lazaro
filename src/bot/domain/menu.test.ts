import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAttentionMenu, buildAreaTopicsMenu, buildTopicQuestionsMenu,
  callbackDataValuesForEntries, parseMenuCallback, PQRS_AREAS,
} from "./menu.js";

const knowledge = JSON.parse(readFileSync(new URL("../../../prisma/data/pqrs_base_conocimiento_v2.json", import.meta.url), "utf8")) as {
  entradas: Array<{ id: string; tema: string; pregunta_principal: string; herramienta?: string }>;
};
const entries = knowledge.entradas.map((entry) => ({ id: entry.id, topic: entry.tema, question: entry.pregunta_principal, tool: entry.herramienta ?? null }));

describe("menú Telegram PQRS", () => {
  it("muestra las siete áreas, datos y asesor en el nivel inicial", () => {
    const menu = buildAttentionMenu();
    expect(PQRS_AREAS).toHaveLength(7);
    expect(menu.buttons.flat().map(({ label }) => label).join(" ")).toContain("Mis datos");
    expect(menu.buttons.flat().map(({ label }) => label).join(" ")).toContain("Hablar con un asesor");
  });

  it("navega áreas, temas y páginas con hasta seis preguntas por página", () => {
    const area = buildAreaTopicsMenu("pedidos");
    expect(parseMenuCallback(area.buttons[0]?.[0]?.callbackData ?? "")).toEqual({ type: "topic", topic: "pedido" });
    const first = buildTopicQuestionsMenu("pedido", entries, 0, "pedidos");
    const second = buildTopicQuestionsMenu("pedido", entries, 1, "pedidos");
    expect(first.buttons.flat().filter(({ callbackData }) => callbackData.startsWith("pqrs:entry:")).length).toBeLessThanOrEqual(6);
    expect(first.buttons.flat().some(({ callbackData }) => callbackData === "pqrs:page:pedido:1")).toBe(true);
    expect(second.buttons.flat().some(({ callbackData }) => callbackData === "pqrs:page:pedido:0")).toBe(true);
    expect(second.buttons.flat().some(({ callbackData }) => callbackData === "pqrs:area:pedidos")).toBe(true);
  });

  it("mantiene cada callback_data de cada entrada del JSON en un máximo de 64 bytes", () => {
    const values = callbackDataValuesForEntries(entries);
    expect(values).toHaveLength(entries.length + 3 + 7 + 78 + 4);
    expect(values.every((value) => Buffer.byteLength(value, "utf8") <= 64)).toBe(true);
  });
});
