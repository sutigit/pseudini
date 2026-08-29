import * as vscode from "vscode";
import { getLanguageKeywords } from "./languagePack";
import { ComposerSession } from "./session";

const PLACEHOLDER = "describe the change";

export class ComposerView implements vscode.Disposable {
  private readonly regionDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    borderColor: new vscode.ThemeColor("focusBorder"),
    borderStyle: "solid",
    borderWidth: "0 0 0 2px",
  });
  private readonly dimDecoration = vscode.window.createTextEditorDecorationType({
    opacity: "0.35",
  });
  private readonly keywordDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor("symbolIcon.keywordForeground"),
  });
  private readonly placeholderDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: PLACEHOLDER,
      color: new vscode.ThemeColor("editorGhostText.foreground"),
      margin: "0 0 0 0.25rem",
    },
  });
  private readonly status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );

  public constructor() {
    this.status.name = "Pseudini inline composer";
  }

  public show(editor: vscode.TextEditor, session: ComposerSession): void {
    const region = toEditorRange(editor.document, session);
    editor.setDecorations(this.regionDecoration, [region]);
    editor.setDecorations(this.dimDecoration, createDimRanges(editor.document, session));
    editor.setDecorations(
      this.keywordDecoration,
      createKeywordRanges(editor.document, session),
    );
    editor.setDecorations(
      this.placeholderDecoration,
      isRegionEmpty(editor.document, session)
        ? [editor.document.lineAt(session.range.startLine).range]
        : [],
    );
    this.status.text =
      session.phase === "pending"
        ? "$(loading~spin) Pseudini: generating syntax"
        : "$(sparkle) Pseudini  $(keyboard) ⌘↵ confirm · Esc cancel";
    this.status.show();
    void vscode.commands.executeCommand("setContext", "pseudini.composerActive", true);
  }

  public clear(editor?: vscode.TextEditor): void {
    if (editor) {
      editor.setDecorations(this.regionDecoration, []);
      editor.setDecorations(this.dimDecoration, []);
      editor.setDecorations(this.keywordDecoration, []);
      editor.setDecorations(this.placeholderDecoration, []);
    }
    this.status.hide();
    void vscode.commands.executeCommand("setContext", "pseudini.composerActive", false);
  }

  public dispose(): void {
    this.clear();
    this.regionDecoration.dispose();
    this.dimDecoration.dispose();
    this.keywordDecoration.dispose();
    this.placeholderDecoration.dispose();
    this.status.dispose();
  }
}

function toEditorRange(
  document: vscode.TextDocument,
  session: ComposerSession,
): vscode.Range {
  const lastLine = session.range.endLineExclusive - 1;
  return new vscode.Range(
    document.lineAt(session.range.startLine).range.start,
    document.lineAt(lastLine).range.end,
  );
}

function createDimRanges(
  document: vscode.TextDocument,
  session: ComposerSession,
): readonly vscode.Range[] {
  const ranges: vscode.Range[] = [];
  if (session.range.startLine > 0) {
    ranges.push(
      new vscode.Range(
        document.lineAt(0).range.start,
        document.lineAt(session.range.startLine - 1).range.end,
      ),
    );
  }
  if (session.range.endLineExclusive < document.lineCount) {
    ranges.push(
      new vscode.Range(
        document.lineAt(session.range.endLineExclusive).range.start,
        document.lineAt(document.lineCount - 1).range.end,
      ),
    );
  }
  return ranges;
}

function createKeywordRanges(
  document: vscode.TextDocument,
  session: ComposerSession,
): readonly vscode.Range[] {
  const keywords = new Set(getLanguageKeywords(document.languageId));
  const ranges: vscode.Range[] = [];

  for (
    let lineNumber = session.range.startLine;
    lineNumber < session.range.endLineExclusive;
    lineNumber += 1
  ) {
    const line = document.lineAt(lineNumber);
    for (const match of line.text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (!keywords.has(match[0]) || match.index === undefined) {
        continue;
      }
      ranges.push(
        new vscode.Range(
          new vscode.Position(lineNumber, match.index),
          new vscode.Position(lineNumber, match.index + match[0].length),
        ),
      );
    }
  }
  return ranges;
}

function isRegionEmpty(
  document: vscode.TextDocument,
  session: ComposerSession,
): boolean {
  for (
    let line = session.range.startLine;
    line < session.range.endLineExclusive;
    line += 1
  ) {
    if (document.lineAt(line).text.trim()) {
      return false;
    }
  }
  return true;
}
