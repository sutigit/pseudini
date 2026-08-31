import assert from "node:assert/strict";
import test from "node:test";
import { getCommentWrapper } from "../../src/composer/commentSyntax";
import {
  collectSemanticIdentifiers,
  collectSymbolIdentifiers,
} from "../../src/composer/identifierNames";
import { createComposerInstruction } from "../../src/composer/instructionAdapter";
import { getLanguageKeywords } from "../../src/composer/languagePack";
import {
  createCodeInsertion,
  createRegionInsertion,
  isRegionIntact,
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

test("recognizes a region the composer can still remove", () => {
  const wrapper = { opening: "/*", closing: "*/" };
  const range = { startLine: 1, endLineExclusive: 4 };
  assert.equal(
    isRegionIntact(
      ["function total() {", "  /*", "  sum every line", "  */", "}"],
      range,
      wrapper,
    ),
    true,
  );
});

test("refuses to remove a region whose delimiters are gone", () => {
  const wrapper = { opening: "/*", closing: "*/" };
  const range = { startLine: 1, endLineExclusive: 4 };
  assert.equal(
    isRegionIntact(
      ["function total() {", "  /*", "  sum every line", "}"],
      range,
      wrapper,
    ),
    false,
  );
  assert.equal(
    isRegionIntact(["  /*", "  sum every line", "  */"], range, wrapper),
    false,
  );
  assert.equal(
    isRegionIntact(
      ["function total() {", "  /*", "  sum every line", "  */"],
      { startLine: 0, endLineExclusive: 3 },
      wrapper,
    ),
    false,
  );
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

test("keeps semantic names outside the region and drops comment prose", () => {
  const lines = [
    "const orderTotal = 1;",
    "// the dog is out",
    "/*",
    "  sum orderTotal",
    "*/",
    "return orderTotal + shipping;",
  ];
  // Five integers per token: line delta, start delta, length, type, modifiers.
  const data = [
    0, 6, 10, 1, 0, // orderTotal, declared
    1, 0, 17, 0, 0, // the whole English comment line
    2, 6, 10, 1, 0, // inside the composer region
    2, 7, 10, 1, 0, // orderTotal, used
    0, 13, 8, 1, 0, // shipping
  ];

  assert.deepEqual(
    collectSemanticIdentifiers(lines, ["comment", "variable"], data, {
      startLine: 2,
      endLineExclusive: 5,
    }),
    ["orderTotal", "shipping"],
  );
});

test("takes identifier words out of nested document symbols", () => {
  assert.deepEqual(
    collectSymbolIdentifiers([
      { name: ".card .title", children: [{ name: "color" }] },
      { name: "renderCard" },
    ]),
    ["card", "color", "renderCard", "title"],
  );
});

test("loads keyword packs by language id", () => {
  assert.equal(getLanguageKeywords("typescript").includes("readonly"), true);
  assert.equal(getLanguageKeywords("typescriptreact").includes("className"), true);
  assert.equal(getLanguageKeywords("html").includes("section"), true);
  assert.equal(getLanguageKeywords("css").includes("display"), true);
  assert.deepEqual(getLanguageKeywords("python"), []);
});

test("classifies known file identifiers without parsing prose", () => {
  assert.deepEqual(
    classifyComposerTokens(
      "if orderTotal changes then return newName",
      new Set(["orderTotal"]),
    ),
    [{ start: 3, end: 13 }],
  );
});

test("leaves the gaps between classified tokens for plain colouring", () => {
  const line = "  if orderTotal grows";
  const tokens = classifyComposerTokens(line, new Set(["orderTotal"]));
  assert.deepEqual(findUnclassifiedSpans(line.length, tokens), [
    { start: 0, end: 5 },
    { start: 15, end: 21 },
  ]);
});

test("covers a whole line when no token is classified", () => {
  assert.deepEqual(findUnclassifiedSpans(12, []), [{ start: 0, end: 12 }]);
});

test("returns no gap when a classified token fills the line", () => {
  assert.deepEqual(findUnclassifiedSpans(6, [{ start: 0, end: 6 }]), []);
});
