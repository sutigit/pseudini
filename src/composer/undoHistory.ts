export const MAX_UNDO_STEPS = 500;

export type UndoStepOutcome = "restored" | "continue" | "exhausted";

/**
 * The editor API cannot prune or merge undo stops, so the only way to drop the
 * composer's own typing history is to replay the editor undo command. The
 * document version is the sole signal that a replay changed anything, which is
 * how we detect the bottom of the undo stack.
 */
export function evaluateUndoStep(
  currentText: string,
  targetText: string,
  versionBeforeUndo: number,
  versionAfterUndo: number,
): UndoStepOutcome {
  if (currentText === targetText) {
    return "restored";
  }
  if (versionAfterUndo === versionBeforeUndo) {
    return "exhausted";
  }
  return "continue";
}
