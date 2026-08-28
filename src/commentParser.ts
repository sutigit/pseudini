export interface AimeInstruction {
  readonly line: number;
  readonly endLine?: number;
  readonly pseudocode: string;
}

// JSX wraps a block comment in an expression container: `{/* aime: ... */}`.
const SINGLE_LINE_AIME_PATTERN =
  /^\s*(?:\/\/|#|--|;|\{\s*\/\*+|\/\*+|\*|<!--)\s*aime:\s*(.*?)(?:\s*(?:\*\/\s*\}?|-->))?\s*$/i;
const LINE_COMMENT_AIME_PATTERN = /^\s*(\/\/|#|--|;)\s*aime:\s*(.*?)\s*$/i;

export function findAimeInstructions(documentText: string): AimeInstruction[] {
  const lines = documentText.split(/\r?\n/);
  const instructions: AimeInstruction[] = [];

  for (let line = 0; line < lines.length; line += 1) {
    const lineComment = LINE_COMMENT_AIME_PATTERN.exec(lines[line]);
    if (lineComment) {
      const marker = lineComment[1];
      const parts = [lineComment[2].trim()].filter(Boolean);
      let endLine = line;

      while (endLine + 1 < lines.length) {
        const continuation = readContinuation(lines[endLine + 1], marker);
        if (continuation === undefined || /^aime:/i.test(continuation)) {
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

    const singleLine = SINGLE_LINE_AIME_PATTERN.exec(lines[line]);
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
