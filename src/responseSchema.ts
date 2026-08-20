export function createReplacementSchema(lines: readonly number[]): object {
  return {
    type: "object",
    properties: {
      replacements: {
        type: "array",
        minItems: lines.length,
        maxItems: lines.length,
        items: {
          type: "object",
          properties: {
            code: { type: "string", minLength: 1 },
          },
          required: ["code"],
          additionalProperties: false,
        },
      },
    },
    required: ["replacements"],
    additionalProperties: false,
  };
}
