import assert from "node:assert/strict";
import test from "node:test";
import { applyCommentIndentation, readIndentation } from "../src/indentation";

test("reads the leading whitespace of a comment line", () => {
  assert.equal(readIndentation("    // aime: return the total"), "    ");
  assert.equal(readIndentation("\t\t// aime: return the total"), "\t\t");
  assert.equal(readIndentation("// aime: return the total"), "");
});

test("indents unindented generated code to the comment indentation", () => {
  assert.equal(
    applyCommentIndentation("return values.reduce(sum, 0);", "  "),
    "  return values.reduce(sum, 0);",
  );
});

test("preserves relative indentation of nested generated lines", () => {
  const code = ["if (user.isActive) {", "  names.push(user.name);", "}"].join("\n");

  assert.equal(
    applyCommentIndentation(code, "    "),
    ["    if (user.isActive) {", "      names.push(user.name);", "    }"].join("\n"),
  );
});

test("replaces an existing base indentation instead of adding to it", () => {
  const code = ["      if (user.isActive) {", "        push(user);", "      }"].join("\n");

  assert.equal(
    applyCommentIndentation(code, "  "),
    ["  if (user.isActive) {", "    push(user);", "  }"].join("\n"),
  );
});

test("keeps tab indentation from the comment line", () => {
  assert.equal(
    applyCommentIndentation("names.push(user.name);", "\t\t"),
    "\t\tnames.push(user.name);",
  );
});

test("removes blank edges and trailing whitespace from blank inner lines", () => {
  const code = ["", "const total = 0;", "   ", "return total;", "", ""].join("\n");

  assert.equal(
    applyCommentIndentation(code, "  "),
    ["  const total = 0;", "", "  return total;"].join("\n"),
  );
});

test("normalizes carriage returns before indenting", () => {
  assert.equal(
    applyCommentIndentation("const a = 1;\r\nreturn a;", "  "),
    ["  const a = 1;", "  return a;"].join("\n"),
  );
});
