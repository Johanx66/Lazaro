import { readFileSync, writeFileSync } from "node:fs";

interface SourceEntry {
  tema: string;
  pregunta_principal: string;
  variaciones: string[];
}

const sourcePath = new URL("../prisma/data/pqrs_base_conocimiento_v2.json", import.meta.url);
const outputPath = new URL("../src/bot/domain/pqrs-topic-examples.ts", import.meta.url);
const source = JSON.parse(readFileSync(sourcePath, "utf8")) as { entradas: SourceEntry[] };
const groups = new Map<string, string[]>();

for (const entry of source.entradas) {
  const candidates = groups.get(entry.tema) ?? [];
  candidates.push(entry.pregunta_principal, ...entry.variaciones);
  groups.set(entry.tema, candidates);
}

const used = new Set<string>();
const examples = Object.fromEntries([...groups].sort(([left], [right]) => left.localeCompare(right)).map(([topic, candidates]) => {
  const unique = [...new Map(candidates
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && text.length <= 105 && !/\{\{[^}]+\}\}/u.test(text))
    .map((text) => [text.toLocaleLowerCase("es"), text])).values()];
  const ranked = unique.map((text, index) => ({ text, index, score: naturalnessScore(text) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: string[] = [];
  for (const candidate of ranked) {
    const key = candidate.text.toLocaleLowerCase("es");
    if (used.has(key)) continue;
    selected.push(candidate.text);
    used.add(key);
    if (selected.length === 2) break;
  }
  return [topic, selected];
}));

writeFileSync(outputPath, `// Generado desde prisma/data/pqrs_base_conocimiento_v2.json con scripts/generate-pqrs-topic-examples.ts.\nexport const PQRS_TOPIC_EXAMPLES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(examples, null, 2)};\n`);
console.log(`Ejemplos generados para ${Object.keys(examples).length} temas.`);

function naturalnessScore(text: string): number {
  let score = 0;
  if (/^[¿¡A-ZÁÉÍÓÚÜÑ]/u.test(text)) score += 4;
  if (/[?.!]$/u.test(text)) score += 2;
  if (/\b(?:q|xq|xfa|pq|pa|toy|k|ke)\b/iu.test(text)) score -= 8;
  if (/\b\w*(?:cacnel|grantia|graantia|reemolso|cacnelacion|atencoin|porducto|contrto|instalacoin)\w*\b/iu.test(text)) score -= 8;
  if (/^(?:necesito informacion sobre|necesito información sobre|quiero que me expliquen|quisiera saber como funciona|quisiera saber cómo funciona|como hago para consultar algo|cómo hago para consultar algo|tengo una duda con|estoy buscando informacion|estoy buscando información|buenas, una pregunta sobre|es la primera vez que me toca lidiar con|quiero poner una queja por el trato que recibí respecto a|quiero dejar constancia|tengo una queja:|quiero reclamar porque no cumplieron lo ofrecido|les sugiero mejorar|sería genial que pudieran agregar|perdí el documento|mis condiciones cambiaron|cometí un error con|necesito un soporte formal)\b/iu.test(text)) score -= 20;
  if (/\brespecto a el\b/iu.test(text)) score -= 8;
  score += Math.min(text.length, 55) / 10;
  if (text.length < 12) score -= 5;
  if (text.length > 85) score -= 2;
  return score;
}
