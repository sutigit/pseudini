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
      if (!isCandidate(normalized, needle) || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      suggestions.push({ label, source });
    }
  }

  return suggestions;
}

/**
 * The word the caret sits at the end of. Empty when the character before the
 * caret cannot start or continue a name, which is where the widget must close.
 */
export function readSuggestionPrefix(
  lineText: string,
  character: number,
): string {
  return /[A-Za-z_$][\w$]*$/.exec(lineText.slice(0, character))?.[0] ?? "";
}

/**
 * Whether the widget has anything to offer. Comments suppress
 * `editor.quickSuggestions`, so the host opens the widget itself and must not
 * open an empty one over free prose.
 */
export function hasSuggestionCandidates(
  identifiers: readonly string[],
  keywords: readonly string[],
  prefix: string,
): boolean {
  if (!prefix) {
    return false;
  }
  const needle = prefix.toLowerCase();
  for (const values of [identifiers, keywords]) {
    for (const label of values) {
      if (isCandidate(label.toLowerCase(), needle)) {
        return true;
      }
    }
  }
  return false;
}

/** A word already typed in full is not worth suggesting back. */
function isCandidate(normalizedLabel: string, needle: string): boolean {
  return normalizedLabel !== needle && normalizedLabel.startsWith(needle);
}
