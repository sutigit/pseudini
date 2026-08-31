import * as vscode from "vscode";
import {
  createComposingHint,
  createPendingHint,
  HINT_IDLE_TIMEOUT_MS,
  isMacPlatform,
  readHintVisibility,
  SPINNER_INTERVAL_MS,
} from "./hint";
import { ComposerSession } from "./session";

/**
 * A chip beside the caret. The editor has no zone widget and no readable text
 * focus, so the chip lives on an idle timer: typing or moving the caret shows
 * it, and silence hides it again.
 */
export class ComposerHintView implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    after: {
      color: new vscode.ThemeColor("editorWidget.foreground"),
      backgroundColor: new vscode.ThemeColor("editorWidget.background"),
      margin: "0 0 0 1rem",
      fontStyle: "normal",
      textDecoration:
        "none; border-radius: 4px; padding: 4px 10px 4px 6px; opacity: 0.8; font-size: 10px;", // This is totally ad-hoc. "smuggled css"
    },
  });
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private spinnerTimer: ReturnType<typeof setInterval> | undefined;
  private spinnerFrame = 0;

  /** Repaint for the current phase without extending the chip's life. */
  public sync(
    editor: vscode.TextEditor,
    session: ComposerSession,
    regionEmpty: boolean,
  ): void {
    const visibility = readHintVisibility(
      session,
      editor.selection.active.line,
      regionEmpty,
    );
    if (visibility === "pending") {
      this.startSpinner(editor, session);
      return;
    }
    this.stopSpinner();
    if (visibility === "hidden" || !this.idleTimer) {
      this.hide(editor);
      return;
    }
    this.paint(editor, session, createComposingHint(isMacPlatform()));
  }

  public noteActivity(
    editor: vscode.TextEditor,
    session: ComposerSession,
    regionEmpty: boolean,
  ): void {
    if (session.phase !== "pending") {
      this.restartIdleTimer(editor);
    }
    this.sync(editor, session, regionEmpty);
  }

  public clear(editor?: vscode.TextEditor): void {
    this.stopSpinner();
    this.stopIdleTimer();
    if (editor) {
      editor.setDecorations(this.decoration, []);
    }
  }

  public dispose(): void {
    this.clear();
    this.decoration.dispose();
  }

  private startSpinner(
    editor: vscode.TextEditor,
    session: ComposerSession,
  ): void {
    this.stopIdleTimer();
    this.paint(editor, session, createPendingHint(this.spinnerFrame));
    if (this.spinnerTimer) {
      return;
    }
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame += 1;
      this.paint(editor, session, createPendingHint(this.spinnerFrame));
    }, SPINNER_INTERVAL_MS);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    this.spinnerFrame = 0;
  }

  private restartIdleTimer(editor: vscode.TextEditor): void {
    this.stopIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.hide(editor);
    }, HINT_IDLE_TIMEOUT_MS);
  }

  private stopIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private paint(
    editor: vscode.TextEditor,
    session: ComposerSession,
    contentText: string,
  ): void {
    const anchor = readAnchorPosition(editor, session);
    editor.setDecorations(this.decoration, [
      {
        range: new vscode.Range(anchor, anchor),
        renderOptions: { after: { contentText } },
      },
    ]);
  }

  private hide(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decoration, []);
  }
}

/**
 * End of the caret's line, so the chip never splits or shifts the draft. While
 * pending the caret may sit anywhere, so fall back to the last draft line.
 */
function readAnchorPosition(
  editor: vscode.TextEditor,
  session: ComposerSession,
): vscode.Position {
  const caretLine = editor.selection.active.line;
  const lineNumber =
    session.phase === "pending"
      ? session.contentRange.endLineExclusive - 1
      : caretLine;
  return editor.document.lineAt(lineNumber).range.end;
}
