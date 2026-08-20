import assert from "node:assert/strict";
import test from "node:test";
import { buildFileContext, buildFileFacts, hashContent } from "../src/fileContext";

test("builds deterministic imports, declarations, indentation, and hash", () => {
  const source = [
    'import { User } from "./types";',
    "",
    "export function activeNames(users: User[]): string[] {",
    "  // aime: return active names",
    "}",
  ].join("\n");
  const facts = buildFileFacts(source, "typescript", "users.ts");

  assert.deepEqual(facts.imports, ['import { User } from "./types";']);
  assert.deepEqual(facts.declarations, [
    "export function activeNames(users: User[]): string[] {",
  ]);
  assert.equal(facts.indentation, "2 spaces");
  assert.equal(facts.contentHash, hashContent(source));
});

test("keeps the complete live source for small files", () => {
  const source = "function total() {\n  // aime: return zero\n}";
  const context = buildFileContext(
    source,
    "typescript",
    "total.ts",
    [{ line: 1, pseudocode: "return zero" }],
  );

  assert.equal(context.usedFullFile, true);
  assert.equal(context.liveSource, source);
});

test("uses live windows and excludes unrelated code in large files", () => {
  const lines = Array.from({ length: 200 }, (_, line) => `const value${line} = ${line};`);
  lines[99] = "function selected() {";
  lines[100] = "  // aime: return value100";
  const source = lines.join("\n");
  const context = buildFileContext(
    source,
    "typescript",
    "large.ts",
    [{ line: 100, pseudocode: "return value100" }],
  );

  assert.equal(context.usedFullFile, false);
  assert.match(context.liveSource, /function selected/);
  assert.match(context.liveSource, /aime: return value100/);
  assert.doesNotMatch(context.liveSource, /value199/);
});

test("includes the complete enclosing scope beyond the default source window", () => {
  const lines = Array.from({ length: 200 }, (_, line) => `const outside${line} = ${line};`);
  lines[50] = "function selected() {";
  lines[51] = "  // aime: finish this function";
  for (let line = 52; line < 120; line += 1) {
    lines[line] = `  const inside${line} = ${line};`;
  }
  lines[120] = "}";
  const context = buildFileContext(
    lines.join("\n"),
    "typescript",
    "large.ts",
    [{ line: 51, pseudocode: "finish this function" }],
  );

  assert.match(context.liveSource, /inside119/);
  assert.match(context.liveSource, /\n}\s*$/);
  assert.doesNotMatch(context.liveSource, /outside121/);
});

test("includes Allman-style scopes and ignores braces inside strings", () => {
  const lines = Array.from({ length: 150 }, (_, line) => `const outside${line} = ${line};`);
  lines[40] = "function selected()";
  lines[41] = "{";
  lines[42] = '  const brace = "}";';
  lines[43] = "  // aime: return the brace";
  lines[44] = "  return brace;";
  lines[45] = "}";
  const context = buildFileContext(
    lines.join("\n"),
    "typescript",
    "allman.ts",
    [{ line: 43, pseudocode: "return the brace" }],
  );

  assert.match(context.liveSource, /function selected\(\)\n\{/);
  assert.match(context.liveSource, /return brace;\n}/);
  assert.doesNotMatch(context.liveSource, /outside46/);
});

test("ignores cached facts when their content hash is stale", () => {
  const source = "function fresh() {\n  // aime: return zero\n}";
  const stale = {
    ...buildFileFacts("function stale() {}", "typescript", "stale.ts"),
    declarations: ["function stale() {}"],
  };
  const context = buildFileContext(
    source,
    "typescript",
    "fresh.ts",
    [{ line: 1, pseudocode: "return zero" }],
    stale,
  );

  assert.deepEqual(context.declarations, ["function fresh() {"]);
});
