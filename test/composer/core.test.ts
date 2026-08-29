import assert from "node:assert/strict";
import test from "node:test";
import { scanIdentifiers } from "../../src/composer/identifierScan";
import { createComposerInstruction } from "../../src/composer/instructionAdapter";
import { getLanguageKeywords } from "../../src/composer/languagePack";
import {
  createRegionInsertion,
  createRegionReplacement,
  readRegionText,
} from "../../src/composer/region";
import { createComposerSession } from "../../src/composer/session";

test("creates and reads an indented growing region", () => {
  assert.equal(createRegionInsertion("  "), "\n  ");
  assert.equal(
    readRegionText(
      ["function total() {", "  sum every line", "  then return it", "}"],
      { startLine: 1, endLineExclusive: 3 },
      "  ",
    ),
    "sum every line\nthen return it",
  );
  assert.equal(createRegionReplacement("  return total;"), "\n  return total;");
});

test("maps a composer session to one ordered instruction", () => {
  const session = {
    ...createComposerSession("file:///example.ts", 3, "  "),
    range: { startLine: 3, endLineExclusive: 5 },
  };
  assert.deepEqual(createComposerInstruction(session, "  return the total  "), {
    line: 3,
    endLine: 4,
    pseudocode: "return the total",
  });
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
