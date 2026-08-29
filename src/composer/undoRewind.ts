import * as vscode from "vscode";
import { evaluateUndoStep, MAX_UNDO_STEPS } from "./undoHistory";

/**
 * Replays undo until the document matches `targetText`. On failure it replays
 * redo the same number of times, so the caller never sees a half-rewound file.
 */
export async function rewindDocumentText(
  editor: vscode.TextEditor,
  targetText: string,
): Promise<boolean> {
  if (editor.document.getText() === targetText) {
    return true;
  }
  if (!isFocused(editor)) {
    return false;
  }

  let steps = 0;
  while (steps < MAX_UNDO_STEPS) {
    const versionBeforeUndo = editor.document.version;
    await vscode.commands.executeCommand("undo");
    steps += 1;
    const outcome = evaluateUndoStep(
      editor.document.getText(),
      targetText,
      versionBeforeUndo,
      editor.document.version,
    );
    if (outcome === "restored") {
      return true;
    }
    if (outcome === "exhausted") {
      break;
    }
  }

  for (let step = 0; step < steps; step += 1) {
    await vscode.commands.executeCommand("redo");
  }
  return false;
}

function isFocused(editor: vscode.TextEditor): boolean {
  // Undo follows editor focus, not a document handle.
  return (
    vscode.window.activeTextEditor?.document.uri.toString() ===
    editor.document.uri.toString()
  );
}
