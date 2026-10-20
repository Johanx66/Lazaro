export const DEFAULT_FAQ_MIN_CONFIDENCE = 0.5;

export type FaqMinConfidenceResult = { ok: true; value: number } | { ok: false; raw: string };

// Vacío o ausente => 0.5. Solo números decimales simples dentro de 0..1.
export function parseFaqMinConfidence(raw: string | undefined): FaqMinConfidenceResult {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: true, value: DEFAULT_FAQ_MIN_CONFIDENCE };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return { ok: false, raw: text };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1) return { ok: false, raw: text };
  return { ok: true, value };
}
