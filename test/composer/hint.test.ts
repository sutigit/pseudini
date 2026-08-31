import assert from "node:assert/strict";
import test from "node:test";
import {
  createComposerPlaceholder,
  createComposingHint,
  createPendingHint,
  readHintVisibility,
  SPINNER_FRAMES,
} from "../../src/composer/hint";
import {
  beginGeneration,
  createComposerSession,
} from "../../src/composer/session";

const ORIGIN = { text: "function total() {\n}\n", anchorLine: 3 };

function openSession(): ReturnType<typeof createComposerSession> {
  return createComposerSession({
    documentUri: "file:///example.ts",
    startLine: 4,
    indentation: "  ",
    origin: ORIGIN,
  });
}

test("names the confirm chord for the platform", () => {
  assert.equal(createComposingHint(true), " ✨ esc cancels | pseudini ⌘↵ ");
  assert.equal(createComposingHint(false), " ✨ esc cancels | pseudini Ctrl+↵ ");
});

test("prompts in the placeholder with the chip wording", () => {
  assert.equal(
    createComposerPlaceholder(true),
    "describe your code | ✨ esc cancels | pseudini ⌘↵",
  );
  assert.equal(
    createComposerPlaceholder(false),
    "describe your code | ✨ esc cancels | pseudini Ctrl+↵",
  );
});

test("cycles the spinner frames", () => {
  assert.equal(createPendingHint(0), ` ${SPINNER_FRAMES[0]} Generating syntax `);
  assert.equal(
    createPendingHint(SPINNER_FRAMES.length),
    ` ${SPINNER_FRAMES[0]} Generating syntax `,
  );
  assert.equal(createPendingHint(3), ` ${SPINNER_FRAMES[3]} Generating syntax `);
});

test("shows the pending chip wherever the caret sits", () => {
  const pending = beginGeneration(openSession());
  assert.equal(readHintVisibility(pending, 0, true), "pending");
  assert.equal(readHintVisibility(pending, 5, false), "pending");
});

test("hides the chip while the placeholder still shows", () => {
  assert.equal(readHintVisibility(openSession(), 5, true), "hidden");
});

test("hides the chip when the caret leaves the draft", () => {
  const session = openSession();
  assert.equal(readHintVisibility(session, 4, false), "hidden");
  assert.equal(readHintVisibility(session, 6, false), "hidden");
});

test("shows the chip on a draft line with text", () => {
  assert.equal(readHintVisibility(openSession(), 5, false), "composing");
});
