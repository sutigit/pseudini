import * as vscode from "vscode";
import { PseudocodeInstruction } from "../commentParser";
import { readIndentation } from "../indentation";
import { getCommentWrapper } from "./commentSyntax";
import { ComposerCompletionProvider } from "./completions";
import { ComposerIdentifierIndex } from "./identifierIndex";
import { createComposerInstruction } from "./instructionAdapter";
import {
  createCodeInsertion,
  createRegionInsertion,
  isRegionIntact,
  readRegionText,
} from "./region";
import {
  adjustComposerRange,
  beginGeneration,
  clampToComposerContent,
  ComposerSession,
  createComposerSession,
  updateComposerRange,
} from "./session";
import { shouldTriggerComposerSuggestions } from "./suggestions";
import { rewindDocumentText } from "./undoRewind";
import { ComposerView } from "./view";

const SUPPORTED_LANGUAGE_IDS = [
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
  "html",
  "css",
];

export type GenerateComposerCode = (
  editor: vscode.TextEditor,
  instruction: PseudocodeInstruction,
  token: vscode.CancellationToken,
) => Promise<string>;

export class ComposerHost implements vscode.Disposable {
  private readonly view = new ComposerView();
  private readonly identifiers = new ComposerIdentifierIndex();
  private readonly disposables: vscode.Disposable[];
  private session: ComposerSession | undefined;
  private applyingEdit = false;
  private generationCancellation: vscode.CancellationTokenSource | undefined;

  public constructor(private readonly generateCode: GenerateComposerCode) {
    const completionProvider = new ComposerCompletionProvider(
      (document) => this.getSession(document),
      () => this.identifiers.ready,
    );
    this.disposables = [
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.handleDocumentChange(event),
      ),
      vscode.workspace.onWillSaveTextDocument((event) =>
        this.handleWillSave(event),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (this.getSession(document)) {
          this.close();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) =>
        this.handleActiveEditorChange(editor),
      ),
      // No event reports a loss of text focus, so a blurred window is the only
      // signal the chip gets besides its own idle timer.
      vscode.window.onDidChangeWindowState((state) => {
        if (!state.focused) {
          this.view.hideHint(this.findSessionEditor());
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.keepCaretInContent(event.textEditor);
        this.noteActivity(event.textEditor);
      }),
      vscode.languages.registerCompletionItemProvider(
        SUPPORTED_LANGUAGE_IDS.map((language) => ({ language })),
        completionProvider,
      ),
    ];
  }

  public async open(editor: vscode.TextEditor): Promise<void> {
    if (this.session) {
      void vscode.window.showInformationMessage(
        "Pseudini already has an inline composer open.",
      );
      return;
    }
    if (!SUPPORTED_LANGUAGE_IDS.includes(editor.document.languageId)) {
      void vscode.window.showInformationMessage(
        `Pseudini inline input does not support ${editor.document.languageId}.`,
      );
      return;
    }

    const anchor = editor.selection.active;
    const indentation = readComposerIndentation(editor, anchor.line);
    const wrapper = getCommentWrapper(editor.document.languageId);
    if (!wrapper) {
      return;
    }
    const origin = {
      text: editor.document.getText(),
      anchorLine: anchor.line,
    };
    let applied = false;
    this.applyingEdit = true;
    try {
      applied = await editor.edit(
        (editBuilder) => {
          editBuilder.insert(
            editor.document.lineAt(anchor.line).range.end,
            createRegionInsertion(indentation, wrapper),
          );
        },
        { undoStopBefore: true, undoStopAfter: true },
      );
    } finally {
      this.applyingEdit = false;
    }

    if (!applied) {
      throw new Error("Cursor could not open the Pseudini inline composer.");
    }

    this.session = createComposerSession({
      documentUri: editor.document.uri.toString(),
      startLine: anchor.line + 1,
      indentation,
      origin,
    });
    const position = new vscode.Position(
      this.session.contentRange.startLine,
      indentation.length,
    );
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
    this.view.show(editor, this.session, this.identifiers.current);
    // The providers answer after the region is already usable, so paint again.
    void this.identifiers
      .load(editor.document, this.session.range)
      .then(() => this.refreshView());
  }

  public async confirm(editor: vscode.TextEditor): Promise<void> {
    const session = this.getSession(editor.document);
    if (!session || session.phase !== "composing") {
      return;
    }
    const pseudocode = readRegionText(
      editor.document.getText().split(/\r?\n/),
      session.contentRange,
      session.indentation,
    );
    if (!pseudocode.trim()) {
      await this.cancel(editor);
      return;
    }

    this.session = beginGeneration(session);
    this.generationCancellation = new vscode.CancellationTokenSource();
    this.view.show(editor, this.session, this.identifiers.current);
    const version = editor.document.version;

    try {
      const instruction = createComposerInstruction(this.session, pseudocode);
      const code = await this.generateCode(
        editor,
        instruction,
        this.generationCancellation.token,
      );
      if (editor.document.version !== version) {
        throw new Error(
          "The file changed while Pseudini was generating code. Run the command again.",
        );
      }
      await this.applyGeneratedCode(editor, code);
      this.close(editor);
      void vscode.window.showInformationMessage(
        "Pseudini implemented the inline pseudocode.",
      );
    } catch (error) {
      await this.cancel(editor);
      if (!(error instanceof vscode.CancellationError)) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Pseudini: ${message}`);
      }
    } finally {
      this.generationCancellation?.dispose();
      this.generationCancellation = undefined;
    }
  }

  /**
   * Cancel ends the whole interaction: no wrapper, no draft, no session, and
   * no suggestion widget. The rewind is preferred because it also drops the
   * typing history; the forward delete covers a history that is not ours.
   */
  public async cancel(editor?: vscode.TextEditor): Promise<void> {
    const activeEditor = editor ?? this.findSessionEditor();
    const session = this.session;
    hideSuggestWidget();
    if (!session || !activeEditor) {
      this.close(activeEditor);
      return;
    }

    this.generationCancellation?.cancel();
    if (
      session.phase === "composing" &&
      (await this.rewindToOrigin(activeEditor, session))
    ) {
      this.close(activeEditor);
      return;
    }
    await this.endSession(activeEditor, session);
  }

  public getSession(
    document: vscode.TextDocument,
  ): ComposerSession | undefined {
    return this.session?.documentUri === document.uri.toString()
      ? this.session
      : undefined;
  }

  public dispose(): void {
    this.generationCancellation?.cancel();
    this.generationCancellation?.dispose();
    this.view.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  /**
   * Preferred path: drop the composer's own history, then add the generated
   * code as the single undo step. Falls back to replacing the visible region
   * when the history cannot be rewound.
   */
  private async applyGeneratedCode(
    editor: vscode.TextEditor,
    code: string,
  ): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }
    if (await this.rewindToOrigin(editor, session)) {
      await this.insertAtOrigin(editor, session, code);
      return;
    }
    await this.replaceRegion(editor, code);
  }

  private async rewindToOrigin(
    editor: vscode.TextEditor,
    session: ComposerSession,
  ): Promise<boolean> {
    this.applyingEdit = true;
    try {
      return await rewindDocumentText(editor, session.origin.text);
    } catch {
      // A refused undo replay is a failed rewind, not a failed cancel.
      return false;
    } finally {
      this.applyingEdit = false;
    }
  }

  private async insertAtOrigin(
    editor: vscode.TextEditor,
    session: ComposerSession,
    code: string,
  ): Promise<void> {
    const anchorLine = Math.min(
      session.origin.anchorLine,
      editor.document.lineCount - 1,
    );
    const anchor = editor.document.lineAt(anchorLine).range.end;
    this.applyingEdit = true;
    let applied = false;
    try {
      applied = await editor.edit(
        (editBuilder) => editBuilder.insert(anchor, createCodeInsertion(code)),
        { undoStopBefore: true, undoStopAfter: true },
      );
    } finally {
      this.applyingEdit = false;
    }
    if (!applied) {
      throw new Error("Cursor could not apply the generated code.");
    }
  }

  private async replaceRegion(
    editor: vscode.TextEditor,
    code: string,
  ): Promise<void> {
    if (!this.session) {
      return;
    }
    const range = createContentRange(editor.document, this.session);
    this.applyingEdit = true;
    let applied = false;
    try {
      applied = await editor.edit(
        (editBuilder) => editBuilder.replace(range, code),
        { undoStopBefore: true, undoStopAfter: true },
      );
    } finally {
      this.applyingEdit = false;
    }
    if (!applied) {
      throw new Error("Cursor could not apply the generated code.");
    }
  }

  /**
   * Removal by forward edit. Used when the history is not ours to rewind,
   * such as after an edit outside the region. Deletes nothing when the
   * delimiters are gone, because the remaining text is no longer ours.
   */
  private async removeRegion(
    editor: vscode.TextEditor,
    session: ComposerSession,
  ): Promise<boolean> {
    if (!isRegionRemovable(editor.document, session)) {
      return false;
    }
    const range = createRemovalRange(editor.document, session);
    this.applyingEdit = true;
    try {
      return await editor.edit((editBuilder) => editBuilder.delete(range), {
        undoStopBefore: true,
        undoStopAfter: true,
      });
    } finally {
      this.applyingEdit = false;
    }
  }

  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (this.applyingEdit || !this.session || !this.getSession(event.document)) {
      return;
    }
    if (this.session.phase === "pending") {
      this.generationCancellation?.cancel();
      void this.cancel(this.findSessionEditor());
      return;
    }

    const originalSession = this.session;
    let nextSession: ComposerSession | undefined = originalSession;
    for (const change of event.contentChanges) {
      nextSession = updateComposerRange(
        nextSession,
        change.range.start.line,
        change.range.end.line,
        change.text.split(/\r?\n/).length,
      );
      if (!nextSession) {
        this.handleForeignChange(event, originalSession);
        return;
      }
    }
    this.session = nextSession;
    this.refreshView();
    this.noteActivity(this.findSessionEditor());
    if (event.contentChanges.some((change) => shouldTriggerComposerSuggestions(change.text))) {
      void vscode.commands.executeCommand("editor.action.triggerSuggest");
    }
  }

  private handleForeignChange(
    event: vscode.TextDocumentChangeEvent,
    originalSession: ComposerSession,
  ): void {
    let beforeDelta = 0;
    let insideDelta = 0;

    for (const change of event.contentChanges) {
      const lineDelta =
        change.text.split(/\r?\n/).length -
        1 -
        (change.range.end.line - change.range.start.line);
      if (change.range.end.line < originalSession.range.startLine) {
        beforeDelta += lineDelta;
      } else if (
        change.range.start.line >= originalSession.range.startLine &&
        change.range.end.line < originalSession.range.endLineExclusive
      ) {
        insideDelta += lineDelta;
      } else if (
        change.range.start.line < originalSession.range.endLineExclusive &&
        change.range.end.line >= originalSession.range.startLine
      ) {
        void this.endSessionAfterDelimiterEdit(originalSession);
        return;
      }
    }

    const adjusted = adjustComposerRange(
      originalSession,
      beforeDelta,
      beforeDelta + insideDelta,
    );
    this.session = adjusted;
    void this.endSession(this.findSessionEditor(), adjusted);
  }

  /** Ends the session first, so the removal edit cannot re-enter the host. */
  private async endSession(
    editor: vscode.TextEditor | undefined,
    session: ComposerSession,
  ): Promise<void> {
    this.close(editor);
    if (editor) {
      await this.removeRegion(editor, session);
    }
  }

  /**
   * An edit that crossed a delimiter ends the session, such as Undo after
   * opening or a Backspace that joined the draft with the opening mark. When
   * the marks no longer match, the region is not ours to delete, so the undo
   * replay takes the file back to the state it had before the input opened.
   */
  private async endSessionAfterDelimiterEdit(
    session: ComposerSession,
  ): Promise<void> {
    const editor = this.findSessionEditor();
    this.close(editor);
    if (!editor || (await this.removeRegion(editor, session))) {
      return;
    }
    await this.rewindToOrigin(editor, session);
  }

  private handleWillSave(event: vscode.TextDocumentWillSaveEvent): void {
    const session = this.getSession(event.document);
    if (!session) {
      return;
    }
    this.generationCancellation?.cancel();
    const editor = this.findSessionEditor();
    if (isRegionRemovable(event.document, session)) {
      const removal = createRemovalRange(event.document, session);
      event.waitUntil(Promise.resolve([vscode.TextEdit.delete(removal)]));
    }
    this.close(editor);
  }

  private keepCaretInContent(editor: vscode.TextEditor): void {
    const session = this.getSession(editor.document);
    if (!session || session.phase !== "composing" || this.applyingEdit) {
      return;
    }
    const target = clampToComposerContent(session, editor.selection.active.line);
    if (!target) {
      return;
    }
    const line = editor.document.lineAt(target.line);
    const position =
      target.edge === "start"
        ? new vscode.Position(target.line, line.firstNonWhitespaceCharacterIndex)
        : line.range.end;
    editor.selection = new vscode.Selection(position, position);
  }

  private handleActiveEditorChange(
    editor: vscode.TextEditor | undefined,
  ): void {
    if (!editor || !this.getSession(editor.document)) {
      this.view.hideHint(this.findSessionEditor());
    }
    this.refreshView();
  }

  /**
   * Kept apart from refreshView, because the identifier index also repaints and
   * that is not the developer touching the file.
   */
  private noteActivity(editor: vscode.TextEditor | undefined): void {
    if (editor && this.session && this.getSession(editor.document)) {
      this.view.noteActivity(editor, this.session);
    }
  }

  private refreshView(): void {
    const editor = this.findSessionEditor();
    if (editor && this.session) {
      this.view.show(editor, this.session, this.identifiers.current);
    }
  }

  private findSessionEditor(): vscode.TextEditor | undefined {
    if (!this.session) {
      return undefined;
    }
    return vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === this.session?.documentUri,
    );
  }

  private close(editor?: vscode.TextEditor): void {
    this.view.clear(editor);
    this.identifiers.clear();
    this.session = undefined;
  }
}

function readComposerIndentation(
  editor: vscode.TextEditor,
  lineNumber: number,
): string {
  const text = editor.document.lineAt(lineNumber).text;
  const base = readIndentation(text);
  if (!text.trimEnd().endsWith("{")) {
    return base;
  }
  if (!editor.options.insertSpaces) {
    return `${base}\t`;
  }
  const tabSize =
    typeof editor.options.tabSize === "number" ? editor.options.tabSize : 2;
  return `${base}${" ".repeat(tabSize)}`;
}

function createContentRange(
  document: vscode.TextDocument,
  session: ComposerSession,
): vscode.Range {
  return new vscode.Range(
    document.lineAt(session.range.startLine).range.start,
    document.lineAt(session.range.endLineExclusive - 1).range.end,
  );
}

function createRemovalRange(
  document: vscode.TextDocument,
  session: ComposerSession,
): vscode.Range {
  return new vscode.Range(
    document.lineAt(session.range.startLine - 1).range.end,
    document.lineAt(session.range.endLineExclusive - 1).range.end,
  );
}

function isRegionRemovable(
  document: vscode.TextDocument,
  session: ComposerSession,
): boolean {
  const wrapper = getCommentWrapper(document.languageId);
  return (
    wrapper !== undefined &&
    isRegionIntact(document.getText().split(/\r?\n/), session.range, wrapper)
  );
}

/**
 * The composer opens the suggestion widget itself, so cancel closes it. The
 * command does nothing when no widget is visible.
 */
function hideSuggestWidget(): void {
  void Promise.resolve(
    vscode.commands.executeCommand("hideSuggestWidget"),
  ).then(undefined, () => undefined);
}
