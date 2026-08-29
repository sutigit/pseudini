import assert from "node:assert/strict";
import test from "node:test";
import { getCommentWrapper } from "../../src/composer/commentSyntax";
import { scanIdentifiers } from "../../src/composer/identifierScan";
import { createComposerInstruction } from "../../src/composer/instructionAdapter";
import { getLanguageKeywords } from "../../src/composer/languagePack";
import {
  createCodeInsertion,
  createRegionInsertion,
  readRegionText,
} from "../../src/composer/region";
import { createComposerSession } from "../../src/composer/session";
import {
  classifyComposerTokens,
  findUnclassifiedSpans,
} from "../../src/composer/tokenClassifier";

test("creates and reads an indented growing region", () => {
  const wrapper = getCommentWrapper("typescript");
  assert.ok(wrapper);
  assert.equal(createRegionInsertion("  ", wrapper), "\n  /*\n  \n  */");
  assert.equal(
    readRegionText(
      ["function total() {", "  sum every line", "  then return it", "}"],
      { startLine: 1, endLineExclusive: 3 },
      "  ",
    ),
    "sum every line\nthen return it",
  );
});

test("places generated code on its own line after the anchor", () => {
  assert.equal(createCodeInsertion("  return total;"), "\n  return total;");
});

test("maps a composer session to one ordered instruction", () => {
  const session = {
    ...createComposerSession({
      documentUri: "file:///example.ts",
      startLine: 3,
      indentation: "  ",
      origin: { text: "function total() {\n}\n", anchorLine: 2 },
    }),
    range: { startLine: 3, endLineExclusive: 6 },
  };
  assert.deepEqual(createComposerInstruction(session, "  return the total  "), {
    line: 3,
    endLine: 5,
    pseudocode: "return the total",
  });
});

test("maps supported languages to parser-safe comment wrappers", () => {
  assert.deepEqual(getCommentWrapper("javascript"), {
    opening: "/*",
    closing: "*/",
  });
  assert.deepEqual(getCommentWrapper("typescriptreact"), {
    opening: "{/*",
    closing: "*/}",
  });
  assert.deepEqual(getCommentWrapper("html"), {
    opening: "<!--",
    closing: "-->",
  });
  assert.equal(getCommentWrapper("python"), undefined);
});

test("scans identifiers outside the composer region", () => {
  const identifiers = scanIdentifiers(
    ["const orderTotal = 1;", "temporary prose", "return orderTotal;"].join("\n"),
    { startLine: 1, endLineExclusive: 2 },
  );
  assert.equal(identifiers.includes("orderTotal"), true);
  assert.equal(identifiers.includes("temporary"), false);
});

test("loads keyword packs by language id", () => {
  assert.equal(getLanguageKeywords("typescript").includes("readonly"), true);
  assert.equal(getLanguageKeywords("typescriptreact").includes("className"), true);
  assert.equal(getLanguageKeywords("html").includes("section"), true);
  assert.equal(getLanguageKeywords("css").includes("display"), true);
  assert.deepEqual(getLanguageKeywords("python"), []);
});

test("classifies reserved words and known file identifiers without parsing prose", () => {
  assert.deepEqual(
    classifyComposerTokens(
      "if orderTotal changes then return newName",
      new Set(["orderTotal"]),
      new Set(["if", "return"]),
    ),
    [
      { start: 0, end: 2, kind: "keyword" },
      { start: 3, end: 13, kind: "identifier" },
      { start: 27, end: 33, kind: "keyword" },
    ],
  );
});

test("gives reserved words priority over scanned identifiers", () => {
  assert.deepEqual(
    classifyComposerTokens("return", new Set(["return"]), new Set(["return"])),
    [{ start: 0, end: 6, kind: "keyword" }],
  );
});

test("leaves the gaps between classified tokens for plain colouring", () => {
  const tokens = classifyComposerTokens(
    "  if orderTotal grows",
    new Set(["orderTotal"]),
    new Set(["if"]),
  );
  assert.deepEqual(findUnclassifiedSpans("  if orderTotal grows".length, tokens), [
    { start: 0, end: 2 },
    { start: 4, end: 5 },
    { start: 15, end: 21 },
  ]);
});

test("covers a whole line when no token is classified", () => {
  assert.deepEqual(findUnclassifiedSpans(12, []), [{ start: 0, end: 12 }]);
});

test("returns no gap when a classified token fills the line", () => {
  assert.deepEqual(
    findUnclassifiedSpans(6, [{ start: 0, end: 6, kind: "keyword" }]),
    [],
  );
});
