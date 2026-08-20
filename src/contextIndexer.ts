import * as path from "node:path";
import * as vscode from "vscode";
import { AimeInstruction } from "./commentParser";
import { ContextCache } from "./contextCache";
import {
  buildFileContext,
  buildFileFacts,
  FileContext,
} from "./fileContext";

export class ContextIndexer implements vscode.Disposable {
  private readonly caches = new Map<string, ContextCache>();

  public constructor(private readonly output: vscode.OutputChannel) {}

  public async resolve(
    document: vscode.TextDocument,
    documentText: string,
    instructions: readonly AimeInstruction[],
  ): Promise<FileContext> {
    const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
    const fileName = path.basename(document.fileName);
    const liveFacts = buildFileFacts(documentText, document.languageId, fileName);

    if (!workspace) {
      return buildFileContext(
        documentText,
        document.languageId,
        fileName,
        instructions,
      );
    }

    const sourcePath = path.relative(workspace.uri.fsPath, document.fileName);
    const cache = this.getCache(workspace.uri.fsPath);
    const cachedFacts = await cache.read(sourcePath, liveFacts.contentHash);
    if (!cachedFacts) {
      void cache.write(sourcePath, liveFacts).catch((error) => this.logError(error));
    }

    return buildFileContext(
      documentText,
      document.languageId,
      fileName,
      instructions,
      cachedFacts ?? liveFacts,
    );
  }

  public async refresh(document: vscode.TextDocument): Promise<void> {
    if (
      document.uri.scheme !== "file" ||
      document.fileName.includes(`${path.sep}.aime${path.sep}`)
    ) {
      return;
    }

    const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspace) {
      return;
    }

    const facts = buildFileFacts(
      document.getText(),
      document.languageId,
      path.basename(document.fileName),
    );
    const sourcePath = path.relative(workspace.uri.fsPath, document.fileName);

    try {
      await this.getCache(workspace.uri.fsPath).write(sourcePath, facts);
    } catch (error) {
      this.logError(error);
    }
  }

  public dispose(): void {
    this.caches.clear();
  }

  private getCache(workspaceRoot: string): ContextCache {
    let cache = this.caches.get(workspaceRoot);
    if (!cache) {
      cache = new ContextCache(workspaceRoot);
      this.caches.set(workspaceRoot, cache);
    }
    return cache;
  }

  private logError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.output.appendLine(`[warn] context cache: ${message}`);
  }
}
