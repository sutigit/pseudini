import { extractJsonObject } from "./jsonObject";

export const WHOLE_FILE_CHUNK_LINES = 50;
export const WHOLE_FILE_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string", minLength: 1 },
  },
  required: ["code"],
  additionalProperties: false,
};

export function createWholeFilePrompt(
  languageId: string,
  fileName: string,
  pseudocodeChunk: string,
  chunkIndex: number,
  chunkCount: number,
  previousTail: string,
): string {
  return [
    `Convert pseudocode chunk ${chunkIndex + 1} of ${chunkCount} into executable ${languageId}.`,
    `Target file: ${fileName}`,
    "Return JSON only with shape: {\"code\":\"generated code\"}.",
    "Keep this chunk compatible with the preceding generated code.",
    previousTail ? `Previous generated tail:\n${previousTail}` : "",
    `Pseudocode chunk:\n${pseudocodeChunk}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseWholeFileResponse(responseText: string): string {
  let value: unknown;

  try {
    value = JSON.parse(extractJsonObject(responseText, "code"));
  } catch {
    throw new Error("The model returned invalid whole-file JSON.");
  }

  if (!isRecord(value) || typeof value.code !== "string" || !value.code.trim()) {
    throw new Error("The model did not return generated whole-file code.");
  }

  return value.code;
}

export function chunkLines(value: string, chunkSize: number): readonly string[] {
  const lines = value.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const chunks: string[] = [];

  for (let index = 0; index < lines.length; index += chunkSize) {
    chunks.push(lines.slice(index, index + chunkSize).join("\n"));
  }

  return chunks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
