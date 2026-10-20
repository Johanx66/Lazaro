export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  keywords: string[];
}

export interface KnowledgeRepository {
  findAnswer(query: string): Promise<string | null>;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Palabras sin sentido propio; se ignoran al puntuar por título y contenido.
const STOP_WORDS = new Set(
  (
    "como cual cuales cuando donde quien quienes que porque para pero con sin por sobre entre hasta desde " +
    "este esta estos estas ese esa esos esas esto eso aqui alli muy mas menos tambien solo " +
    "puedo puede puedes pueden podria podrian quiero quieres quiere necesito necesita " +
    "tengo tiene tienes tienen hacer hace hago una uno unos unas del los las mis sus nos " +
    "ser son soy estoy esta estan hay"
  ).split(" "),
);

function words(value: string): string[] {
  return normalize(value).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

function significant(value: string): string[] {
  return words(value).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function containsPhrase(queryWords: string[], phrase: string): boolean {
  const target = words(phrase).join(" ");
  if (target.length === 0) return false;
  return ` ${queryWords.join(" ")} `.includes(` ${target} `);
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

// Confianza = 0.6*keyword + 0.3*título + 0.1*contenido, cada componente en [0, 1]:
//  - keyword: 1 si alguna keyword aparece como palabra o frase completa en la consulta.
//  - título: fracción de palabras significativas del título presentes en la consulta.
//  - contenido: fracción de palabras significativas de la consulta presentes en el contenido.
// Los pesos suman 1, por lo que el resultado nunca excede 1.
export function scoreMatch(query: string, article: KnowledgeArticle): number {
  const queryWords = words(query);
  const keyword = article.keywords.some((k) => containsPhrase(queryWords, k)) ? 1 : 0;

  const queryWordSet = new Set(queryWords);
  const titleWords = significant(article.title);
  const title = ratio(titleWords.filter((w) => queryWordSet.has(w)).length, titleWords.length);

  const contentSet = new Set(words(article.content));
  const queryTerms = [...new Set(significant(query))];
  const content = ratio(queryTerms.filter((w) => contentSet.has(w)).length, queryTerms.length);

  const score = 0.6 * keyword + 0.3 * title + 0.1 * content;
  return Math.min(1, Math.max(0, score));
}

export function selectBestMatch(
  query: string,
  articles: KnowledgeArticle[],
  minConfidence: number,
): string | null {
  let best: KnowledgeArticle | null = null;
  let bestScore = 0;
  for (const article of articles) {
    const score = scoreMatch(query, article);
    if (score > bestScore) {
      best = article;
      bestScore = score;
    }
  }
  if (!best || bestScore < minConfidence) return null;
  return best.content.length > 0 ? best.content : null;
}

export const STATIC_KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: "static-greeting",
    title: "Saludo",
    content:
      "¡Hola! Soy el asistente de soporte del bot. ¿En qué puedo ayudarte? Escribe 'ayuda' para ver las opciones disponibles.",
    keywords: ["hola", "buenas", "hello", "hi", "saludos"],
  },
  {
    id: "static-help",
    title: "Ayuda",
    content:
      "Puedes preguntarme, por ejemplo, cómo restablecer tu contraseña o cómo actualizar tus datos de contacto. Si prefieres hablar con un agente humano, escribe 'agente'.",
    keywords: ["ayuda", "ayudame", "help", "opciones"],
  },
  {
    id: "static-agent",
    title: "Agente humano",
    content: "",
    keywords: ["agente", "humano", "persona", "operador", "transferir"],
  },
  {
    id: "static-thanks",
    title: "Agradecimiento",
    content: "¡Con gusto! ¿Necesitas algo más?",
    keywords: ["gracias", "thank", "perfecto"],
  },
];

export class StaticKnowledgeBase implements KnowledgeRepository {
  constructor(private readonly minConfidence: number = 0.5) {}

  async findAnswer(query: string): Promise<string | null> {
    return selectBestMatch(query, STATIC_KNOWLEDGE_ARTICLES, this.minConfidence);
  }
}

export class CompositeKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly repositories: KnowledgeRepository[]) {}

  async findAnswer(query: string): Promise<string | null> {
    for (const repository of this.repositories) {
      try {
        const answer = await repository.findAnswer(query);
        if (answer) return answer;
      } catch (error) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "fuente de conocimiento no disponible, se continúa con la siguiente",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    return null;
  }
}