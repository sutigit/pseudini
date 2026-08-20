import { CodeReplacement } from "./prompt";

export function mergeReplacementFragments(
  replacements: readonly CodeReplacement[],
): readonly CodeReplacement[] {
  const merged = new Map<number, CodeReplacement>();

  for (const replacement of replacements) {
    const existing = merged.get(replacement.line);
    merged.set(
      replacement.line,
      existing
        ? {
            ...existing,
            code: `${existing.code}\n${replacement.code}`,
          }
        : replacement,
    );
  }

  return [...merged.values()].sort((left, right) => left.line - right.line);
}
