import * as vscode from "vscode";
import {
  collectSemanticIdentifiers,
  collectSymbolIdentifiers,
  DocumentSymbolLike,
} from "./identifierNames";
import { ComposerRange } from "./session";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The names of the active file, as the language service reports them. Loaded
 * once per session: an edit outside the region ends the session, so the names
 * cannot change while the developer types the draft.
 */
export class ComposerIdentifierIndex {
  private names: ReadonlySet<string> = EMPTY;
  private pending: Promise<ReadonlySet<string>> = Promise.resolve(EMPTY);
  private loadCount = 0;

  /** What the view can paint right now. Empty until the providers answer. */
  public get current(): ReadonlySet<string> {
    return this.names;
  }

  /** What completions wait for, so the first suggestion list is complete. */
  public get ready(): Promise<ReadonlySet<string>> {
    return this.pending;
  }

  public load(
    document: vscode.TextDocument,
    excludedRange: ComposerRange,
  ): Promise<ReadonlySet<string>> {
    const load = (this.loadCount += 1);
    this.pending = readIdentifiers(document, excludedRange).then((names) => {
      if (load === this.loadCount) {
        this.names = names;
      }
      return names;
    });
    return this.pending;
  }

  public clear(): void {
    this.loadCount += 1;
    this.names = EMPTY;
    this.pending = Promise.resolve(EMPTY);
  }
}

async function readIdentifiers(
  document: vscode.TextDocument,
  excludedRange: ComposerRange,
): Promise<ReadonlySet<string>> {
  // Snapshot now, because a late answer describes the text as it is here.
  const lines = document.getText().split(/\r?\n/);
  const semantic = await readSemanticIdentifiers(document, lines, excludedRange);
  if (semantic.length > 0) {
    return new Set(semantic);
  }
  return new Set(await readSymbolIdentifiers(document));
}

async function readSemanticIdentifiers(
  document: vscode.TextDocument,
  lines: readonly string[],
  excludedRange: ComposerRange,
): Promise<readonly string[]> {
  const legend = await runProvider<vscode.SemanticTokensLegend>(
    "vscode.provideDocumentSemanticTokensLegend",
    document.uri,
  );
  if (!legend) {
    return [];
  }
  const tokens = await runProvider<vscode.SemanticTokens>(
    "vscode.provideDocumentSemanticTokens",
    document.uri,
  );
  if (!tokens) {
    return [];
  }
  return collectSemanticIdentifiers(
    lines,
    legend.tokenTypes,
    tokens.data,
    excludedRange,
  );
}

async function readSymbolIdentifiers(
  document: vscode.TextDocument,
): Promise<readonly string[]> {
  const symbols = await runProvider<readonly DocumentSymbolLike[]>(
    "vscode.executeDocumentSymbolProvider",
    document.uri,
  );
  return symbols ? collectSymbolIdentifiers(symbols) : [];
}

/**
 * A missing or failing provider is normal: it only means the draft keeps the
 * plain colour. It must never break the composer.
 */
async function runProvider<TResult>(
  command: string,
  uri: vscode.Uri,
): Promise<TResult | undefined> {
  try {
    return await vscode.commands.executeCommand<TResult>(command, uri);
  } catch {
    return undefined;
  }
}
