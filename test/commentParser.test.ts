import assert from "node:assert/strict";
import test from "node:test";
import { findAimeInstructions } from "../src/commentParser";

test("finds aime instructions in common line-comment styles", () => {
  const documentText = [
    "// aime: return the active users",
    "  # aime: validate the request",
    "-- aime: select the newest row",
    "; aime: load the register",
  ].join("\n");

  assert.deepEqual(findAimeInstructions(documentText), [
    { line: 0, pseudocode: "return the active users" },
    { line: 1, pseudocode: "validate the request" },
    { line: 2, pseudocode: "select the newest row" },
    { line: 3, pseudocode: "load the register" },
  ]);
});

test("finds single-line block and HTML comments", () => {
  const documentText = [
    "/* aime: calculate the total */",
    "<!-- aime: render the account name -->",
  ].join("\n");

  assert.deepEqual(findAimeInstructions(documentText), [
    { line: 0, pseudocode: "calculate the total" },
    { line: 1, pseudocode: "render the account name" },
  ]);
});

test("ignores ordinary and empty comments", () => {
  const documentText = [
    "// explain this implementation",
    "// aime:",
    'const text = "aime: do not parse strings";',
  ].join("\n");

  assert.deepEqual(findAimeInstructions(documentText), []);
});
