export interface BotBrain {
  answer(query: string): Promise<string | null>;
}