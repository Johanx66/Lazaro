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
});
