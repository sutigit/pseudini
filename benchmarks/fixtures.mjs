const workflowStep = (index) =>
  [
    `Step ${index}: read the next record and validate its identifier, timestamp, owner, and status`,
    "before normalizing whitespace, rejecting malformed values, preserving useful error details,",
    "and appending an immutable result that records whether processing succeeded or failed.",
  ].join(" ");

function buildWorkflowPseudocode(stepCount) {
  return Array.from({ length: stepCount }, (_, index) => workflowStep(index + 1)).join(" ");
}

function buildWholeFile(lineCount) {
  const lines = [
    "export function processRecords(records: RecordInput[]): ProcessedRecord[] {",
  ];

  for (let line = 1; line < lineCount - 1; line += 1) {
    lines.push(
      `  // ${line}. validate field${line}, normalize it, and preserve a descriptive failure`,
    );
  }

  lines.push("}");
  return lines.join("\n");
}

export const benchmarkFixtures = [
  {
    id: "small",
    description: "Short logging instruction",
    languageId: "typescript",
    fileName: "logger.ts",
    pseudocode: "log thisIsSomeVariableName",
    source: [
      "export function reportValue(thisIsSomeVariableName: string): void {",
      "  // pseudini: log thisIsSomeVariableName",
      "}",
    ].join("\n"),
    line: 1,
    targetMaxMs: 1_500,
    minOutputTokens: 4,
    maxOutputTokens: 64,
    wrapAsFunctionBody: true,
    requiredCodePatterns: [/console\.log/, /thisIsSomeVariableName/],
  },
  {
    id: "small-general",
    description: "Short non-deterministic collection transformation",
    languageId: "typescript",
    fileName: "users.ts",
    pseudocode: "keep active users and return their names",
    source: [
      "interface User {",
      "  name: string;",
      "  active: boolean;",
      "}",
      "",
      "export function activeUserNames(users: User[]): string[] {",
      "  // pseudini: keep active users and return their names",
      "}",
    ].join("\n"),
    line: 6,
    targetMaxMs: 1_500,
    minOutputTokens: 20,
    maxOutputTokens: 128,
    wrapAsFunctionBody: true,
    requiredCodePatterns: [/\breturn\b/, /\.filter\(/, /\.map\(/, /\.active\b/],
  },
  {
    id: "medium",
    description: "Approximately 500 words of workflow pseudocode",
    languageId: "typescript",
    fileName: "processor.ts",
    pseudocode: buildWorkflowPseudocode(14),
    source: [
      "export function processRecords(records: RecordInput[]): ProcessedRecord[] {",
      "  // pseudini: implement the detailed workflow",
      "}",
    ].join("\n"),
    line: 1,
    targetMaxMs: 3_000,
    minOutputTokens: 300,
    maxOutputTokens: 1_200,
    wrapAsFunctionBody: true,
    requiredCodePatterns: [/\brecords\b/, /\breturn\b/, /error|invalid|fail/i],
  },
  {
    id: "large",
    description: "Approximately 2,000 words of workflow pseudocode",
    languageId: "typescript",
    fileName: "largeProcessor.ts",
    pseudocode: buildWorkflowPseudocode(56),
    source: [
      "export function processRecords(records: RecordInput[]): ProcessedRecord[] {",
      "  // pseudini: implement the detailed workflow",
      "}",
    ].join("\n"),
    line: 1,
    targetMaxMs: 10_000,
    minOutputTokens: 1_200,
    maxOutputTokens: 4_096,
    wrapAsFunctionBody: true,
    requiredCodePatterns: [/\brecords\b/, /\breturn\b/, /error|invalid|fail/i],
  },
  {
    id: "whole-file",
    description: "Two-hundred-line pseudocode file",
    languageId: "typescript",
    fileName: "wholeFile.ts",
    pseudocode:
      "Replace the function body with executable code that implements every numbered requirement.",
    source: buildWholeFile(200),
    measureSourceWords: true,
    line: 1,
    targetMaxMs: 300_000,
    minOutputTokens: 1_000,
    maxOutputTokens: 4_096,
    requiredCodePatterns: [/\b(?:function|const|class|interface)\b/, /field1/, /field198/],
  },
];
