const scenarioNumbers = (value: string): number[] => [...new Set([...value.matchAll(/(?:^|\s)(?:scenario\s*)?(\d{1,2})\s*\)/gi)].map((match) => Number(match[1])).filter((number) => number >= 1 && number <= 20))].sort((left, right) => left - right);

export function validateAnswerCompleteness(prompt: string, answer: string): { complete: true; expected: number[] } | { complete: false; expected: number[]; missing: number[] } {
  const expected = scenarioNumbers(prompt);
  if (expected.length < 2) return { complete: true, expected };
  const answered = new Set(scenarioNumbers(answer));
  const missing = expected.filter((number) => !answered.has(number));
  return missing.length === 0 ? { complete: true, expected } : { complete: false, expected, missing };
}
