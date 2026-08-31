export interface PseudocodeInstruction {
  readonly line: number;
  readonly endLine?: number;
  readonly pseudocode: string;
}

// JSX wraps a block comment in an expression container: `{/* pseudini: ... */}`.
const SINGLE_LINE_PSEUDINI_PATTERN =
  /^\s*(?:\/\/|#|--|;|\{\s*\/\*+|\/\*+|\*|<!--)\s*pseudini:\s*(.*?)(?:\s*(?:\*\/\s*\}?|-->))?\s*$/i;
const LINE_COMMENT_PSEUDINI_PATTERN =
  /^\s*(\/\/|#|--|;)\s*pseudini:\s*(.*?)\s*$/i;

export function findPseudiniInstructions(
  documentText: string,
): PseudocodeInstruction[] {
  const lines = documentText.split(/\r?\n/);
  const instructions: PseudocodeInstruction[] = [];

  for (let line = 0; line < lines.length; line += 1) {
    const lineComment = LINE_COMMENT_PSEUDINI_PATTERN.exec(lines[line]);
    if (lineComment) {
      const marker = lineComment[1];
      const parts = [lineComment[2].trim()].filter(Boolean);
      let endLine = line;

      while (endLine + 1 < lines.length) {
        const continuation = readContinuation(lines[endLine + 1], marker);
        if (continuation === undefined || /^pseudini:/i.test(continuation)) {
          break;
        }
        parts.push(continuation);
        endLine += 1;
      }

      if (parts.length > 0) {
        instructions.push({
          line,
          ...(endLine > line ? { endLine } : {}),
          pseudocode: parts.join(" "),
        });
      }
      line = endLine;
      continue;
    }

    const singleLine = SINGLE_LINE_PSEUDINI_PATTERN.exec(lines[line]);
    const pseudocode = singleLine?.[1]?.trim();
    if (pseudocode) {
      instructions.push({ line, pseudocode });
    }
  }

  return instructions;
}

function readContinuation(text: string, marker: string): string | undefined {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escapedMarker}\\s?(.*?)\\s*$`).exec(text);
  return match?.[1]?.trim();
}
