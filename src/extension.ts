import * as path from "node:path";
import * as vscode from "vscode";
import { AimeInstruction, findAimeInstructions } from "./commentParser";
import { ContextIndexer } from "./contextIndexer";
import { GenerationService } from "./generationService";
import {
  CodeReplacement,
  createImplementationPrompt,
  parseModelResponse,
} from "./prompt";
import { mergeReplacementFragments } from "./replacementMerger";
import {
  chunkInstructions,
  countWords,
  estimateMaxOutputTokens,
} from "./requestPlanner";
import { createDeterministicReplacement } from "./syntaxAdapter";
import {
  chunkLines,
  createWholeFilePrompt,
  parseWholeFileResponse,
  WHOLE_FILE_CHUNK_LINES,
  WHOLE_FILE_SCHEMA,
} from "./wholeFile";

const FLESH_OUT_COMMAND_ID = "pseudini.fleshOutAimeComments";
const WHOLE_FILE_COMMAND_ID = "pseudini.fleshOutWholeFile";
const SET_API_KEY_COMMAND_ID = "pseudini.setApiKey";
const CLEAR_API_KEY_COMMAND_ID = "pseudini.clearApiKey";
const CONFIGURATION_SECTION = "pseudini";

let performanceOutput: vscode.OutputChannel | undefined;
let contextIndexer: ContextIndexer | undefined;
let generationService: GenerationService | undefined;

export function activate(context: vscode.ExtensionContext): void {
  performanceOutput = vscode.window.createOutputChannel("Pseudini: Performance", {
    log: true,
  });
  const activeContextIndexer = new ContextIndexer(performanceOutput);
  const activeGenerationService = new GenerationService(
    performanceOutput,
    context.secrets,
  );
  contextIndexer = activeContextIndexer;
  generationService = activeGenerationService;
  const fleshOutCommand = vscode.commands.registerTextEditorCommand(
    FLESH_OUT_COMMAND_ID,
    fleshOutAimeComments,
  );
  const wholeFileCommand = vscode.commands.registerTextEditorCommand(
    WHOLE_FILE_COMMAND_ID,
    fleshOutWholeFile,
  );
  const setApiKeyCommand = vscode.commands.registerCommand(
    SET_API_KEY_COMMAND_ID,
    () => runProviderKeyCommand(() => activeGenerationService.setProviderApiKey()),
  );
  const clearApiKeyCommand = vscode.commands.registerCommand(
    CLEAR_API_KEY_COMMAND_ID,
    () => runProviderKeyCommand(() => activeGenerationService.clearProviderApiKey()),
  );
  const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
    void activeContextIndexer.refresh(document);
  });
  const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    void activeContextIndexer.refresh(document);
  });
  const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      !event.affectsConfiguration(`${CONFIGURATION_SECTION}.model`) &&
      !event.affectsConfiguration(`${CONFIGURATION_SECTION}.ollamaUrl`)
    ) {
      return;
    }

    activeGenerationService.reconfigure();
  });

  context.subscriptions.push(
    fleshOutCommand,
    wholeFileCommand,
    setApiKeyCommand,
    clearApiKeyCommand,
    openListener,
    saveListener,
    configurationListener,
    performanceOutput,
    activeContextIndexer,
    activeGenerationService,
  );

  for (const document of vscode.workspace.textDocuments) {
    void activeContextIndexer.refresh(document);
  }
  void activeGenerationService.warm();
}

export function deactivate(): void {
  performanceOutput = undefined;
  contextIndexer = undefined;
  generationService = undefined;
}

async function fleshOutAimeComments(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const documentText = document.getText();
  const documentVersion = document.version;
  const instructions = findAimeInstructions(documentText);

  if (instructions.length === 0) {
    void vscode.window.showInformationMessage(
      'Pseudini did not find comments that start with "aime:".',
    );
    return;
  }

  try {
    const replacements = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pseudini is implementing ${instructions.length} comment(s)`,
        cancellable: true,
      },
      (progress, token) =>
        createReplacements(
          document,
          documentText,
          documentVersion,
          instructions,
          progress,
          token,
        ),
    );

    ensureDocumentUnchanged(document, documentVersion);
    await applyLineReplacements(editor, replacements);
    void vscode.window.showInformationMessage(
      `Pseudini implemented ${replacements.length} comment(s).`,
    );
  } catch (error) {
    showCommandError(error);
  }
}

async function createReplacements(
  document: vscode.TextDocument,
  documentText: string,
  documentVersion: number,
  instructions: readonly AimeInstruction[],
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
): Promise<readonly CodeReplacement[]> {
  const sourceLines = documentText.split(/\r?\n/);
  const deterministic = instructions.flatMap((instruction) => {
    const replacement = createDeterministicReplacement(
      instruction,
      document.languageId,
      sourceLines[instruction.line] ?? "",
    );
    return replacement ? [replacement] : [];
  });
  const deterministicLines = new Set(deterministic.map(({ line }) => line));
  const unresolved = instructions.filter(({ line }) => !deterministicLines.has(line));

  if (unresolved.length === 0) {
    performanceOutput?.appendLine(
      `[info] deterministic totalMs=0 replacements=${deterministic.length}`,
    );
    return deterministic;
  }

  const generated: CodeReplacement[] = [];
  const batches = chunkInstructions(unresolved);

  for (const [index, batch] of batches.entries()) {
    ensureDocumentUnchanged(document, documentVersion);
    progress.report({ message: `Generating batch ${index + 1} of ${batches.length}` });
    const fileContext = await getContextIndexer().resolve(document, documentText, batch);
    const prompt = createImplementationPrompt(fileContext, batch);
    const responseText = await getGenerationService().request(
      prompt,
      batch.map(({ line }) => line),
      estimateMaxOutputTokens(batch),
      batch.some((instruction) => countWords(instruction.pseudocode) > 50),
      token,
    );
    ensureDocumentUnchanged(document, documentVersion);
    generated.push(...parseModelResponse(responseText, batch));
  }

  return mergeReplacementFragments([...deterministic, ...generated]);
}

async function fleshOutWholeFile(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const documentVersion = document.version;
  const chunks = chunkLines(document.getText(), WHOLE_FILE_CHUNK_LINES);

  try {
    const generatedCode = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pseudini is implementing ${chunks.length} file chunk(s)`,
        cancellable: true,
      },
      async (progress, token) => {
        const generatedChunks: string[] = [];

        for (const [index, chunk] of chunks.entries()) {
          ensureDocumentUnchanged(document, documentVersion);
          progress.report({
            message: `Generating chunk ${index + 1} of ${chunks.length}`,
            increment: 100 / chunks.length,
          });
          const previousTail =
            generatedChunks.at(-1)?.split("\n").slice(-20).join("\n") ?? "";
          const prompt = createWholeFilePrompt(
            document.languageId,
            path.basename(document.fileName),
            chunk,
            index,
            chunks.length,
            previousTail,
          );
          const responseText = await getGenerationService().request(
            prompt,
            [],
            Math.min(4_096, Math.max(512, countWords(chunk) * 2)),
            true,
            token,
            WHOLE_FILE_SCHEMA,
          );
          ensureDocumentUnchanged(document, documentVersion);
          generatedChunks.push(parseWholeFileResponse(responseText));
        }

        return generatedChunks.join("\n");
      },
    );

    ensureDocumentUnchanged(document, documentVersion);
    const applied = await editor.edit((editBuilder) => {
      const lastLine = document.lineAt(document.lineCount - 1);
      editBuilder.replace(
        new vscode.Range(new vscode.Position(0, 0), lastLine.range.end),
        generatedCode,
      );
    });
    if (!applied) {
      throw new Error("Cursor could not apply the generated file.");
    }
    void vscode.window.showInformationMessage("Pseudini implemented the pseudocode file.");
  } catch (error) {
    showCommandError(error);
  }
}

async function applyLineReplacements(
  editor: vscode.TextEditor,
  replacements: readonly CodeReplacement[],
): Promise<void> {
  const document = editor.document;
  const applied = await editor.edit((editBuilder) => {
    for (const replacement of replacements) {
      const start = document.lineAt(replacement.line).range.start;
      const end = document.lineAt(replacement.endLine ?? replacement.line).range.end;
      editBuilder.replace(new vscode.Range(start, end), replacement.code);
    }
  });

  if (!applied) {
    throw new Error("Cursor could not apply the generated code.");
  }
}

function getContextIndexer(): ContextIndexer {
  if (!contextIndexer) {
    throw new Error("Pseudini context indexing is not initialized.");
  }
  return contextIndexer;
}

function getGenerationService(): GenerationService {
  if (!generationService) {
    throw new Error("Pseudini model service is not initialized.");
  }
  return generationService;
}

async function runProviderKeyCommand(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    showCommandError(error);
  }
}

function ensureDocumentUnchanged(document: vscode.TextDocument, version: number): void {
  if (document.version !== version) {
    throw new Error(
      "The file changed while Pseudini was generating code. Run the command again.",
    );
  }
}

function showCommandError(error: unknown): void {
  if (error instanceof vscode.CancellationError) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  void vscode.window.showErrorMessage(`Pseudini: ${message}`);
}
