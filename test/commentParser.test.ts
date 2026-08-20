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

test("joins consecutive line-comment pseudocode into one replacement range", () => {
  const documentText = [
    "// aime: validate the request,",
    "// normalize its account identifier,",
    "// and return the accepted record",
    "return existing;",
  ].join("\n");

  assert.deepEqual(findAimeInstructions(documentText), [
    {
      line: 0,
      endLine: 2,
      pseudocode:
        "validate the request, normalize its account identifier, and return the accepted record",
    },
  ]);
});

test("keeps adjacent aime instructions separate", () => {
  const documentText = [
    "// aime: validate the request",
    "// aime: return the accepted record",
  ].join("\n");

  assert.deepEqual(findAimeInstructions(documentText), [
    { line: 0, pseudocode: "validate the request" },
    { line: 1, pseudocode: "return the accepted record" },
  ]);
});
