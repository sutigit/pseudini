import { ComposerRange } from "./session";

const IDENTIFIER_PATTERN = /[A-Za-z_$][\w$]*/g;
const MAX_IDENTIFIERS = 200;

export function scanIdentifiers(
  documentText: string,
  excludedRange: ComposerRange,
): readonly string[] {
  const source = documentText
    .split(/\r?\n/)
    .filter(
      (_, line) =>
        line < excludedRange.startLine || line >= excludedRange.endLineExclusive,
    )
    .join("\n");
  const identifiers = new Set<string>();

  for (const match of source.matchAll(IDENTIFIER_PATTERN)) {
    identifiers.add(match[0]);
    if (identifiers.size >= MAX_IDENTIFIERS) {
      break;
    }
  }

  return [...identifiers].sort((left, right) => left.localeCompare(right));
}
