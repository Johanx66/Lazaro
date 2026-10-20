export const TEST_PHONES = [
  "570000000001",
  "570000000002",
  "570000000003",
  "570000000004",
  "570000000005",
] as const;

export type TestPhone = (typeof TEST_PHONES)[number];

export function isTestPhone(phone: string): boolean {
  return TEST_PHONES.includes(phone as TestPhone);
}

export function getTestPhones(): string[] {
  return [...TEST_PHONES];
}