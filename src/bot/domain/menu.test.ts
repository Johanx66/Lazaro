import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAttentionMenu, buildPqrsAreasMenu, buildAreaTopicsMenu, buildTopicQuestionsMenu,
  buildPqrsAnswerMenu, callbackDataValuesForEntries, parseMenuCallback, PQRS_AREAS,
} from "./menu.js";
import { PQRS_TOPIC_EXAMPLES } from "./pqrs-topic-examples.js";

const knowledge = JSON.parse(readFileSync(new URL("../../../prisma/data/pqrs_base_conocimiento_v2.json", import.meta.url), "utf8")) as {
  entradas: Array<{ id: string; tema: string; pregunta_principal: string; variaciones: string[]; herramienta?: string }>;
};
const entries = knowledge.entradas.map((entry) => ({ id: entry.id, topic: entry.tema, question: entry.pregunta_principal, tool: entry.herramienta ?? null }));

describe("menú Telegram PQRS", () => {
  it("muestra las tres acciones principales en vertical y las siete áreas en filas completas", () => {
    const menu = buildAttentionMenu();
    expect(PQRS_AREAS).toHaveLength(7);
    expect(menu.buttons).toHaveLength(4);
    expect(menu.buttons.every((row) => row.length === 1)).toBe(true);
    expect(menu.buttons.flat().map(({ label }) => label)).toEqual(["📋 PQRS", "👤 Mis datos", "👨‍💼 Hablar con un asesor", "🏠 Volver al menú"]);
    const areas = buildPqrsAreasMenu();
    expect(areas.buttons).toHaveLength(8);
    expect(areas.buttons.every((row) => row.length === 1)).toBe(true);
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
    const topics = new Set(entries.map(({ topic }) => topic));
    const pages = [...topics].reduce((sum, topic) => sum + Math.max(1, Math.ceil(entries.filter((entry) => entry.topic === topic).length / 6)), 0);
    expect(values).toHaveLength(entries.length + 3 + 7 + 7 + topics.size + pages + 5);
    expect(values.every((value) => Buffer.byteLength(value, "utf8") <= 64)).toBe(true);
  });

  it("genera ejemplos solo desde el JSON para los 26 temas", () => {
    const topics = [...new Set(knowledge.entradas.map(({ tema }) => tema))];
    expect(topics).toHaveLength(26);
    expect(Object.keys(PQRS_TOPIC_EXAMPLES).sort()).toEqual([...topics].sort());
    for (const topic of topics) {
      const examples = PQRS_TOPIC_EXAMPLES[topic] ?? [];
      expect(examples.length).toBeGreaterThanOrEqual(2);
      expect(examples.length).toBeLessThanOrEqual(3);
      const source = knowledge.entradas.filter((entry) => entry.tema === topic);
      const phrases = source.flatMap((entry) => [entry.pregunta_principal, ...entry.variaciones]);
      for (const example of examples) {
        expect(phrases).toContain(example);
        expect(example).not.toMatch(/\{\{[^}]+\}\}/u);
      }
    }
  });

  it("mantiene botones de salida en todas las áreas, temas, páginas y respuestas PQRS", () => {
    for (const area of PQRS_AREAS) {
      const areaMenu = buildAreaTopicsMenu(area.id);
      expect(areaMenu.buttons.flat().map(({ callbackData }) => callbackData)).toContain("menu:home");
      for (const topic of area.topics) {
        const matching = entries.filter((entry) => entry.topic === topic);
        const pageCount = Math.max(1, Math.ceil(matching.length / 6));
        for (let page = 0; page < pageCount; page += 1) {
          const screen = buildTopicQuestionsMenu(topic, entries, page, area.id);
          const callbacks = screen.buttons.flat().map(({ callbackData }) => callbackData);
          expect(callbacks).toContain(`pqrs:area:${area.id}`);
          expect(callbacks).toContain("menu:home");
          expect(screen.text.length).toBeLessThan(4096);
          expect(screen.text).not.toMatch(/\{\{[^}]+\}\}/u);
        }
      }
    }
  });

  it("el teclado de cada respuesta tiene retorno al tema y al nivel principal", () => {
    for (const topic of Object.keys(PQRS_TOPIC_EXAMPLES)) {
      const answerMenu = buildPqrsAnswerMenu(topic, "Respuesta PQRS");
      expect(answerMenu.buttons.flat().map(({ callbackData }) => callbackData)).toEqual([
        `pqrs:topic:${topic}`, "menu:home",
      ]);
    }
  });
});
