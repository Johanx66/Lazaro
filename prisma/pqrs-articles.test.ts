import { describe, expect, it } from "vitest";
import { mapPqrsDatasets } from "./pqrs-articles.js";

describe("mapPqrsDatasets", () => {
  it("combina las bases con identificadores estables y variaciones como palabras clave", () => {
    const result = mapPqrsDatasets(
      {
        registros: [
          {
            id: "pqrs_001",
            categoria: "peticion",
            pregunta: "Solicitar información",
            variaciones: ["Quiero información"],
            palabras_clave: ["información"],
            respuesta: "Indica qué información necesitas.",
            requiere_agente_humano: false,
          },
        ],
      },
      {
        entradas: [
          {
            id: "PQRS-001",
            categoria: "queja",
            pregunta_principal: "Presentar una queja",
            variaciones: ["Quiero quejarme"],
            palabras_clave: ["queja"],
            respuesta: "Cuéntame qué ocurrió.",
          },
        ],
      },
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "pqrs-base-pqrs_001",
      title: "Solicitar información",
      category: "PQRS peticion",
      active: true,
    });
    expect(result[0]?.keywords).toContain("quiero información");
    expect(result[1]).toMatchObject({
      id: "pqrs-conocimiento-PQRS-001",
      active: true,
    });
  });

  it("desactiva las respuestas que requieren un agente o contienen marcadores", () => {
    const result = mapPqrsDatasets(
      {
        registros: [
          {
            id: "pqrs_002",
            categoria: "reclamo",
            pregunta: "Revisar un cobro",
            variaciones: [],
            palabras_clave: ["cobro"],
            respuesta: "Un agente revisará el cobro.",
            requiere_agente_humano: true,
          },
        ],
      },
      {
        entradas: [
          {
            id: "PQRS-002",
            categoria: "peticion",
            pregunta_principal: "Consultar el pedido",
            variaciones: [],
            palabras_clave: ["pedido"],
            respuesta: "Consulta con {{nombre_empresa}}.",
          },
        ],
      },
    );

    expect(result.map((article) => article.active)).toEqual([false, false]);
  });

  it("acepta los niveles de agente del segundo dataset: solo 'obligatorio' desactiva", () => {
    const entry = (id: string, level: unknown) => ({
      id,
      categoria: "queja",
      pregunta_principal: `Pregunta ${id}`,
      variaciones: [],
      palabras_clave: [],
      respuesta: "Respuesta de ejemplo.",
      requiere_agente_humano: level,
    });

    const result = mapPqrsDatasets(
      { registros: [] },
      {
        entradas: [
          entry("N1", "no"),
          entry("N2", "opcional"),
          entry("N3", "obligatorio"),
          entry("N4", false),
          entry("N5", true),
        ],
      },
    );

    expect(result.map((article) => article.active)).toEqual([true, true, false, true, false]);
  });

  it("rechaza un nivel de agente desconocido", () => {
    expect(() =>
      mapPqrsDatasets(
        { registros: [] },
        {
          entradas: [
            {
              id: "N6",
              categoria: "queja",
              pregunta_principal: "Pregunta N6",
              variaciones: [],
              palabras_clave: [],
              respuesta: "Respuesta de ejemplo.",
              requiere_agente_humano: "a veces",
            },
          ],
        },
      ),
    ).toThrow();
  });
});
