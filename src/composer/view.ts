import * as vscode from "vscode";
import { scanIdentifiers } from "./identifierScan";
import { getLanguageKeywords } from "./languagePack";
import { ComposerSession, readComposerWrapperLines } from "./session";
import { classifyComposerTokens, ComposerTokenKind } from "./tokenClassifier";

const PLACEHOLDER = "describe the change | esc cancels | pseudini ⌘⏎";

export class ComposerView implements vscode.Disposable {
  private readonly regionDecoration =
    vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
      borderColor: new vscode.ThemeColor("focusBorder"),
      borderStyle: "solid",
      borderWidth: "0 0 0 2px",
    });
  private readonly dimDecoration = vscode.window.createTextEditorDecorationType(
    {
      opacity: "0.4",
    },
  );
  private readonly keywordDecoration =
    vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor("symbolIcon.keywordForeground"),
    });
  private readonly identifierDecoration =
    vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor("symbolIcon.variableForeground"),
    });
  // The delimiters must stay in the buffer to keep parsers quiet, but the
  // developer should see an input box, not a comment.
  private readonly wrapperDecoration =
    vscode.window.createTextEditorDecorationType({
      color: "transparent",
      letterSpacing: "-1em",
    });
  private readonly placeholderDecoration =
    vscode.window.createTextEditorDecorationType({
      after: {
        contentText: PLACEHOLDER,
        color: new vscode.ThemeColor("editorGhostText.foreground"),
        margin: "0 0 0 1rem",
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
    const tokenRanges = createTokenRanges(editor.document, session);
    editor.setDecorations(this.regionDecoration, [region]);
    editor.setDecorations(
      this.dimDecoration,
      createDimRanges(editor.document, session),
    );
    editor.setDecorations(this.keywordDecoration, tokenRanges.keyword);
    editor.setDecorations(this.identifierDecoration, tokenRanges.identifier);
    editor.setDecorations(
      this.wrapperDecoration,
      createWrapperRanges(editor.document, session),
    );
    editor.setDecorations(
      this.placeholderDecoration,
      isRegionEmpty(editor.document, session)
        ? [editor.document.lineAt(session.contentRange.startLine).range]
        : [],
    );
    this.status.text =
      session.phase === "pending"
        ? "$(loading~spin) Pseudini: generating syntax"
        : "$(sparkle) Pseudini  $(keyboard) ⌘↵ confirm · Esc cancel";
    this.status.show();
    void vscode.commands.executeCommand(
      "setContext",
      "pseudini.composerActive",
      true,
    );
  }

  public clear(editor?: vscode.TextEditor): void {
    if (editor) {
      editor.setDecorations(this.regionDecoration, []);
      editor.setDecorations(this.dimDecoration, []);
      editor.setDecorations(this.keywordDecoration, []);
      editor.setDecorations(this.identifierDecoration, []);
      editor.setDecorations(this.wrapperDecoration, []);
      editor.setDecorations(this.placeholderDecoration, []);
    }
    this.status.hide();
    void vscode.commands.executeCommand(
      "setContext",
      "pseudini.composerActive",
      false,
    );
  }

  public dispose(): void {
    this.clear();
    this.regionDecoration.dispose();
    this.dimDecoration.dispose();
    this.keywordDecoration.dispose();
    this.identifierDecoration.dispose();
    this.wrapperDecoration.dispose();
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

function createTokenRanges(
  document: vscode.TextDocument,
  session: ComposerSession,
): Record<ComposerTokenKind, vscode.Range[]> {
  const identifiers = new Set(
    scanIdentifiers(document.getText(), session.range),
  );
  const keywords = new Set(getLanguageKeywords(document.languageId));
  const ranges: Record<ComposerTokenKind, vscode.Range[]> = {
    identifier: [],
    keyword: [],
  };

  for (
    let lineNumber = session.contentRange.startLine;
    lineNumber < session.contentRange.endLineExclusive;
    lineNumber += 1
  ) {
    const line = document.lineAt(lineNumber);
    for (const token of classifyComposerTokens(
      line.text,
      identifiers,
      keywords,
    )) {
      ranges[token.kind].push(
        new vscode.Range(
          new vscode.Position(lineNumber, token.start),
          new vscode.Position(lineNumber, token.end),
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
    let line = session.contentRange.startLine;
    line < session.contentRange.endLineExclusive;
    line += 1
  ) {
    if (document.lineAt(line).text.trim()) {
      return false;
    }
  }
  return true;
}

function createWrapperRanges(
  document: vscode.TextDocument,
  session: ComposerSession,
): readonly vscode.Range[] {
  return readComposerWrapperLines(session).map((lineNumber) => {
    const line = document.lineAt(lineNumber);
    return new vscode.Range(
      new vscode.Position(lineNumber, line.firstNonWhitespaceCharacterIndex),
      line.range.end,
    );
  });
}
