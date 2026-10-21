import { z } from "zod";

const categorySchema = z.enum(["peticion", "queja", "reclamo", "sugerencia"]);

const firstRecordSchema = z.object({
  id: z.string().min(1),
  categoria: categorySchema,
  pregunta: z.string().min(1),
  variaciones: z.array(z.string()),
  palabras_clave: z.array(z.string()),
  respuesta: z.string().min(1),
  requiere_agente_humano: z.boolean(),
});

const firstDatasetSchema = z.object({
  registros: z.array(firstRecordSchema),
});

const secondRecordSchema = z.object({
  id: z.string().min(1),
  categoria: categorySchema,
  pregunta_principal: z.string().min(1),
  variaciones: z.array(z.string()),
  palabras_clave: z.array(z.string()),
  respuesta: z.string().min(1),
  requiere_agente_humano: z.boolean().optional().default(false),
});

const secondDatasetSchema = z.object({
  entradas: z.array(secondRecordSchema),
});

export interface PqrsArticleSeed {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  active: boolean;
}

function toArticle(
  source: "base" | "conocimiento",
  record: {
    id: string;
    categoria: string;
    pregunta: string;
    variaciones: string[];
    palabras_clave: string[];
    respuesta: string;
    requiere_agente_humano: boolean;
  },
): PqrsArticleSeed {
  const keywords = new Set(
    [record.pregunta, ...record.variaciones, ...record.palabras_clave]
      .map((keyword) => keyword.trim().toLocaleLowerCase("es-CO"))
      .filter((keyword) => keyword.length > 0),
  );

  return {
    id: `pqrs-${source}-${record.id}`,
    title: record.pregunta,
    content: record.respuesta,
    category: `PQRS ${record.categoria}`,
    keywords: [...keywords],
    active:
      !record.requiere_agente_humano && !/\{\{[^{}]+\}\}/u.test(record.respuesta),
  };
}

export function mapPqrsDatasets(first: unknown, second: unknown): PqrsArticleSeed[] {
  const firstRecords = firstDatasetSchema.parse(first).registros;
  const secondRecords = secondDatasetSchema.parse(second).entradas;

  return [
    ...firstRecords.map((record) =>
      toArticle("base", {
        id: record.id,
        categoria: record.categoria,
        pregunta: record.pregunta,
        variaciones: record.variaciones,
        palabras_clave: record.palabras_clave,
        respuesta: record.respuesta,
        requiere_agente_humano: record.requiere_agente_humano,
      }),
    ),
    ...secondRecords.map((record) =>
      toArticle("conocimiento", {
        id: record.id,
        categoria: record.categoria,
        pregunta: record.pregunta_principal,
        variaciones: record.variaciones,
        palabras_clave: record.palabras_clave,
        respuesta: record.respuesta,
        requiere_agente_humano: record.requiere_agente_humano,
      }),
    ),
  ];
}
