import * as vscode from "vscode";
import { ComposerHintView } from "./hintView";
import { getLanguageKeywords } from "./languagePack";
import { ComposerSession, readComposerWrapperLines } from "./session";
import {
  classifyComposerTokens,
  ComposerTokenKind,
  ComposerTokenSpan,
  findUnclassifiedSpans,
} from "./tokenClassifier";

const PLACEHOLDER = "describe the change | esc cancels | translate ⌘⏎";

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
  // Covers only the draft text that is neither a keyword nor a known name.
  // Overlapping colour decorations would fight, so the ranges stay disjoint.
  private readonly plainDecoration =
    vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor("editor.foreground"),
      fontStyle: "normal",
    });
  private readonly keywordDecoration =
    vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor("symbolIcon.keywordForeground"),
      fontStyle: "normal",
    });
  private readonly identifierDecoration =
    vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor("symbolIcon.variableForeground"),
      fontStyle: "normal",
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
  private readonly hint = new ComposerHintView();

  public constructor() {
    this.status.name = "Pseudini inline composer";
  }

  public show(
    editor: vscode.TextEditor,
    session: ComposerSession,
    identifiers: ReadonlySet<string>,
  ): void {
    const region = toEditorRange(editor.document, session);
    const draftRanges = createDraftRanges(editor.document, session, identifiers);
    const regionEmpty = isRegionEmpty(editor.document, session);
    editor.setDecorations(this.regionDecoration, [region]);
    editor.setDecorations(
      this.dimDecoration,
      createDimRanges(editor.document, session),
    );
    editor.setDecorations(this.plainDecoration, draftRanges.plain);
    editor.setDecorations(this.keywordDecoration, draftRanges.keyword);
    editor.setDecorations(this.identifierDecoration, draftRanges.identifier);
    editor.setDecorations(
      this.wrapperDecoration,
      createWrapperRanges(editor.document, session),
    );
    editor.setDecorations(
      this.placeholderDecoration,
      regionEmpty
        ? [editor.document.lineAt(session.contentRange.startLine).range]
        : [],
    );
    this.hint.sync(editor, session, regionEmpty);
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

  /** Typing or a caret move keeps the chip alive for another idle window. */
  public noteActivity(
    editor: vscode.TextEditor,
    session: ComposerSession,
  ): void {
    this.hint.noteActivity(
      editor,
      session,
      isRegionEmpty(editor.document, session),
    );
  }

  public hideHint(editor?: vscode.TextEditor): void {
    this.hint.clear(editor);
  }

  public clear(editor?: vscode.TextEditor): void {
    this.hint.clear(editor);
    if (editor) {
      editor.setDecorations(this.regionDecoration, []);
      editor.setDecorations(this.dimDecoration, []);
      editor.setDecorations(this.plainDecoration, []);
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
    this.hint.dispose();
    this.regionDecoration.dispose();
    this.dimDecoration.dispose();
    this.plainDecoration.dispose();
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

type DraftRanges = Record<ComposerTokenKind | "plain", vscode.Range[]>;

/**
 * Splits the draft into three groups that never overlap: keywords, known names,
 * and everything else. The draft is comment text, so the third group carries the
 * normal foreground that the comment style would otherwise dim.
 */
function createDraftRanges(
  document: vscode.TextDocument,
  session: ComposerSession,
  identifiers: ReadonlySet<string>,
): DraftRanges {
  const keywords = new Set(getLanguageKeywords(document.languageId));
  const ranges: DraftRanges = { identifier: [], keyword: [], plain: [] };

  for (
    let lineNumber = session.contentRange.startLine;
    lineNumber < session.contentRange.endLineExclusive;
    lineNumber += 1
  ) {
    const line = document.lineAt(lineNumber);
    const tokens = classifyComposerTokens(line.text, identifiers, keywords);
    for (const token of tokens) {
      ranges[token.kind].push(toLineRange(lineNumber, token));
    }
    for (const span of findUnclassifiedSpans(line.text.length, tokens)) {
      ranges.plain.push(toLineRange(lineNumber, span));
    }
  }
  return ranges;
}

function toLineRange(
  lineNumber: number,
  span: ComposerTokenSpan,
): vscode.Range {
  return new vscode.Range(
    new vscode.Position(lineNumber, span.start),
    new vscode.Position(lineNumber, span.end),
  );
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
