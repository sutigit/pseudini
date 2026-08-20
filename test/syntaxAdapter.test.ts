import assert from "node:assert/strict";
import test from "node:test";
import { createDeterministicReplacement } from "../src/syntaxAdapter";

test("implements an exact TypeScript log instruction without a model", () => {
  assert.deepEqual(
    createDeterministicReplacement(
      { line: 3, pseudocode: "log thisIsSomeVariableName" },
      "typescript",
      "  // aime: log thisIsSomeVariableName",
    ),
    {
      line: 3,
      code: "  console.log(thisIsSomeVariableName);",
    },
  );
});

test("implements an exact Python log instruction", () => {
  assert.deepEqual(
    createDeterministicReplacement(
      { line: 1, pseudocode: "log account.name" },
      "python",
      "    # aime: log account.name",
    ),
    {
      line: 1,
      code: "    print(account.name)",
    },
  );
});

test("does not guess for unsupported wording or languages", () => {
  assert.equal(
    createDeterministicReplacement(
      { line: 1, pseudocode: "log the user when active" },
      "typescript",
      "  // aime: log the user when active",
    ),
    undefined,
  );
  assert.equal(
    createDeterministicReplacement(
      { line: 1, pseudocode: "log user" },
      "plaintext",
      "log user",
    ),
    undefined,
  );
});
