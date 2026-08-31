import { ComposerSession, isComposerContentLine } from "./session";

/**
 * Decoration attachments accept no keyframes or transitions, so the pending
 * spinner is text that the view swaps one frame at a time.
 */
export const SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

export const SPINNER_INTERVAL_MS = 200;
export const HINT_IDLE_TIMEOUT_MS = 2000;

export type HintVisibility = "hidden" | "composing" | "pending";

/**
 * While the region is empty the placeholder already carries the hint, so the
 * chip stays hidden to avoid two hints on one line.
 */
export function readHintVisibility(
  session: ComposerSession,
  caretLine: number,
  regionEmpty: boolean,
): HintVisibility {
  if (session.phase === "pending") {
    return "pending";
  }
  if (regionEmpty || !isComposerContentLine(session, caretLine)) {
    return "hidden";
  }
  return "composing";
}

export function createComposingHint(isMac: boolean): string {
  return padHint(composingHintText(isMac));
}

export function createPendingHint(frame: number): string {
  const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  return padHint(`${spinner} Generating syntax`);
}

/**
 * The placeholder stands in for the chip while the region is empty, so it
 * repeats the chip wording behind a prompt for the developer.
 */
export function createComposerPlaceholder(isMac: boolean): string {
  return `describe your code | ${composingHintText(isMac)}`;
}

export function isMacPlatform(): boolean {
  return process.platform === "darwin";
}

function composingHintText(isMac: boolean): string {
  return `✨ esc cancels | pseudini ${isMac ? "⌘↵" : "Ctrl+↵"}`;
}

/** Attachments have no reliable padding property, so pad with spaces. */
function padHint(text: string): string {
  return ` ${text} `;
}
