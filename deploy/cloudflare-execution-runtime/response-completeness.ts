const scenarioNumbers = (value: string): number[] => [...new Set([...value.matchAll(/(?:^|\s)(?:scenario\s*)?(\d{1,2})\s*\)/gi)].map((match) => Number(match[1])).filter((number) => number >= 1 && number <= 20))].sort((left, right) => left - right);

// Text snippets are deliberately appended to a chat request by the workspace.
// Their source code may contain numbered test cases or examples, which are not
// user-requested scenarios and therefore must not make an otherwise complete
// answer appear incomplete.
const withoutUploadedSnippets = (value: string): string => value.replace(
  /--- uploaded snippet:[^\r\n]*---[\s\S]*?--- end uploaded snippet ---/gi,
  "",
);

export function validateAnswerCompleteness(prompt: string, answer: string): { complete: true; expected: number[] } | { complete: false; expected: number[]; missing: number[] } {
  const expected = scenarioNumbers(withoutUploadedSnippets(prompt));
  if (expected.length < 2) return { complete: true, expected };
  const answered = new Set(scenarioNumbers(answer));
  const missing = expected.filter((number) => !answered.has(number));
  return missing.length === 0 ? { complete: true, expected } : { complete: false, expected, missing };
}
