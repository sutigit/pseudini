import * as vscode from "vscode";
import { scanIdentifiers } from "./identifierScan";
import { getLanguageKeywords } from "./languagePack";
import { ComposerSession, isComposerContentLine } from "./session";
import { createSuggestions } from "./suggestions";

export type SessionReader = (
  document: vscode.TextDocument,
) => ComposerSession | undefined;

export class ComposerCompletionProvider
  implements vscode.CompletionItemProvider
{
  public constructor(private readonly readSession: SessionReader) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const session = this.readSession(document);
    if (!session || !isComposerContentLine(session, position.line)) {
      return [];
    }

    const wordRange = document.getWordRangeAtPosition(position);
    const prefix = wordRange
      ? document.getText(
          new vscode.Range(wordRange.start, position),
        )
      : "";
    const suggestions = createSuggestions(
      scanIdentifiers(document.getText(), session.range),
      getLanguageKeywords(document.languageId),
      prefix,
    );

    return suggestions.map(({ label, source }, index) => {
      const item = new vscode.CompletionItem(
        label,
        source === "file"
          ? vscode.CompletionItemKind.Variable
          : vscode.CompletionItemKind.Keyword,
      );
      item.sortText = `${source === "file" ? "0" : "1"}-${String(index).padStart(3, "0")}`;
      item.detail = source === "file" ? "Current file" : "Language keyword";
      return item;
    });
  }
}
