export function extractJsonObject(
  responseText: string,
  requiredProperty: string,
): string {
  for (
    let start = responseText.indexOf("{");
    start !== -1;
    start = responseText.indexOf("{", start + 1)
  ) {
    const candidate = readBalancedObject(responseText, start);

    if (candidate?.includes(`"${requiredProperty}"`)) {
      return candidate;
    }
  }

  throw new Error("The AI response does not contain the required JSON object.");
}

function readBalancedObject(text: string, start: number): string | undefined {
  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (insideString) {
      escaped = character === "\\";
      insideString = character !== '"';
      continue;
    }

    if (character === '"') {
      insideString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}
