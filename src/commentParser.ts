export interface AimeInstruction {
  readonly line: number;
  readonly pseudocode: string;
}

const AIME_COMMENT_PATTERN =
  /^\s*(?:\/\/|#|--|;|\/\*+|\*|<!--)\s*aime:\s*(.*?)(?:\s*(?:\*\/|-->))?\s*$/i;

export function findAimeInstructions(documentText: string): AimeInstruction[] {
  return documentText.split(/\r?\n/).flatMap((text, line) => {
    const match = AIME_COMMENT_PATTERN.exec(text);
    const pseudocode = match?.[1]?.trim();

    return pseudocode ? [{ line, pseudocode }] : [];
  });
}
