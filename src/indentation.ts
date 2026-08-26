const LEADING_WHITESPACE_PATTERN = /^[ \t]*/;

export function readIndentation(line: string): string {
  return LEADING_WHITESPACE_PATTERN.exec(line)?.[0] ?? "";
}

/**
 * Anchors generated code to the comment's indentation. Models return code at an
 * arbitrary base indentation, so the shared base is removed and replaced while the
 * relative indentation of nested lines is preserved.
 */
export function applyCommentIndentation(code: string, indentation: string): string {
  const lines = removeBlankEdges(code.replace(/\r\n?/g, "\n").split("\n"));
  const sharedWidth = findSharedIndentationWidth(lines);

  return lines
    .map((line) => (line.trim() ? `${indentation}${line.slice(sharedWidth)}` : ""))
    .join("\n");
}

function removeBlankEdges(lines: readonly string[]): readonly string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start].trim()) {
    start += 1;
  }
  while (end > start && !lines[end - 1].trim()) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function findSharedIndentationWidth(lines: readonly string[]): number {
  const widths = lines
    .filter((line) => line.trim())
    .map((line) => readIndentation(line).length);

  return widths.length === 0 ? 0 : Math.min(...widths);
}
