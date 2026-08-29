import * as vscode from "vscode";
import { AimeInstruction } from "../commentParser";
import { readIndentation } from "../indentation";
import { ComposerCompletionProvider } from "./completions";
import { createComposerInstruction } from "./instructionAdapter";
import {
  createRegionInsertion,
  readRegionText,
} from "./region";
import {
  adjustComposerRange,
  beginGeneration,
  ComposerSession,
  createComposerSession,
  updateComposerRange,
} from "./session";
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
  instruction: AimeInstruction,
  token: vscode.CancellationToken,
) => Promise<string>;

export class ComposerHost implements vscode.Disposable {
  private readonly view = new ComposerView();
  private readonly disposables: vscode.Disposable[];
  private session: ComposerSession | undefined;
  private applyingEdit = false;
  private generationCancellation: vscode.CancellationTokenSource | undefined;

  public constructor(private readonly generateCode: GenerateComposerCode) {
    const completionProvider = new ComposerCompletionProvider((document) =>
      this.getSession(document),
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
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshView()),
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
    let applied = false;
    this.applyingEdit = true;
    try {
      applied = await editor.edit(
        (editBuilder) => {
          editBuilder.insert(
            editor.document.lineAt(anchor.line).range.end,
            createRegionInsertion(indentation),
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

    const startLine = anchor.line + 1;
    this.session = createComposerSession(
      editor.document.uri.toString(),
      startLine,
      indentation,
    );
    const position = new vscode.Position(startLine, indentation.length);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
    this.view.show(editor, this.session);
  }

  public async confirm(editor: vscode.TextEditor): Promise<void> {
    const session = this.getSession(editor.document);
    if (!session || session.phase !== "composing") {
      return;
    }
    const pseudocode = readRegionText(
      editor.document.getText().split(/\r?\n/),
      session.range,
      session.indentation,
    );
    if (!pseudocode.trim()) {
      await this.cancel(editor);
      return;
    }

    this.session = beginGeneration(session);
    this.generationCancellation = new vscode.CancellationTokenSource();
    this.view.show(editor, this.session);
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
      await this.replaceRegion(editor, code);
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

  public async cancel(editor?: vscode.TextEditor): Promise<void> {
    const activeEditor = editor ?? this.findSessionEditor();
    const session = this.session;
    if (!session || !activeEditor) {
      this.close(activeEditor);
      return;
    }

    this.generationCancellation?.cancel();
    const range = createRemovalRange(activeEditor.document, session);
    this.close(activeEditor);
    this.applyingEdit = true;
    try {
      await activeEditor.edit(
        (editBuilder) => editBuilder.delete(range),
        { undoStopBefore: true, undoStopAfter: true },
      );
    } finally {
      this.applyingEdit = false;
    }
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
        // The edit removed a composer boundary, such as Undo after opening.
        // An extra deletion could remove source code, so only end the session.
        this.close(this.findSessionEditor());
        return;
      }
    }

    this.session = adjustComposerRange(
      originalSession,
      beforeDelta,
      beforeDelta + insideDelta,
    );
    void this.cancel(this.findSessionEditor());
  }

  private handleWillSave(event: vscode.TextDocumentWillSaveEvent): void {
    const session = this.getSession(event.document);
    if (!session) {
      return;
    }
    this.generationCancellation?.cancel();
    const editor = this.findSessionEditor();
    const removal = createRemovalRange(event.document, session);
    event.waitUntil(Promise.resolve([vscode.TextEdit.delete(removal)]));
    this.close(editor);
  }

  private refreshView(): void {
    const editor = this.findSessionEditor();
    if (editor && this.session) {
      this.view.show(editor, this.session);
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
