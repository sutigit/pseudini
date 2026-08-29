export interface ComposerSuggestion {
  readonly label: string;
  readonly source: "file" | "keyword";
}

export function createSuggestions(
  identifiers: readonly string[],
  keywords: readonly string[],
  prefix: string,
): readonly ComposerSuggestion[] {
  const needle = prefix.toLowerCase();
  const seen = new Set<string>();
  const suggestions: ComposerSuggestion[] = [];

  for (const [values, source] of [
    [identifiers, "file"],
    [keywords, "keyword"],
  ] as const) {
    for (const label of values) {
      const normalized = label.toLowerCase();
      if (
        normalized === needle ||
        !normalized.startsWith(needle) ||
        seen.has(normalized)
      ) {
        continue;
      }
      seen.add(normalized);
      suggestions.push({ label, source });
    }
  }

  return suggestions;
}
