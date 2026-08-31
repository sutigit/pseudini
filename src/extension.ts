import * as path from "node:path";
import * as vscode from "vscode";
import {
  findPseudiniInstructions,
  PseudocodeInstruction,
} from "./commentParser";
import { ConfigurationService } from "./configurationService";
import { ComposerHost } from "./composer/host";
import { ContextIndexer } from "./contextIndexer";
import { GenerationService } from "./generationService";
import { applyCommentIndentation, readIndentation } from "./indentation";
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

const FLESH_OUT_COMMAND_ID = "pseudini.fleshOutPseudiniComments";
const WHOLE_FILE_COMMAND_ID = "pseudini.fleshOutWholeFile";
const SET_API_KEY_COMMAND_ID = "pseudini.setApiKey";
const CLEAR_API_KEY_COMMAND_ID = "pseudini.clearApiKey";
const WRITE_PSEUDOCODE_COMMAND_ID = "pseudini.writePseudocode";
const CONFIRM_COMPOSER_COMMAND_ID = "pseudini.confirmComposer";
const CANCEL_COMPOSER_COMMAND_ID = "pseudini.cancelComposer";

let performanceOutput: vscode.OutputChannel | undefined;
let contextIndexer: ContextIndexer | undefined;
let generationService: GenerationService | undefined;
let composerHost: ComposerHost | undefined;

export function activate(context: vscode.ExtensionContext): void {
  performanceOutput = vscode.window.createOutputChannel("Pseudini: Performance", {
    log: true,
  });
  const activeContextIndexer = new ContextIndexer(performanceOutput);
  const activeConfigurationService = new ConfigurationService(performanceOutput);
  const activeGenerationService = new GenerationService(
    performanceOutput,
    context.secrets,
    activeConfigurationService,
  );
  contextIndexer = activeContextIndexer;
  generationService = activeGenerationService;
  const activeComposerHost = new ComposerHost(generateComposerCode);
  composerHost = activeComposerHost;
  const fleshOutCommand = vscode.commands.registerTextEditorCommand(
    FLESH_OUT_COMMAND_ID,
    fleshOutPseudiniComments,
  );
  const wholeFileCommand = vscode.commands.registerTextEditorCommand(
    WHOLE_FILE_COMMAND_ID,
    fleshOutWholeFile,
  );
  const setApiKeyCommand = vscode.commands.registerCommand(
    SET_API_KEY_COMMAND_ID,
    () =>
      runProviderKeyCommand(() =>
        activeGenerationService.setProviderApiKey(resolveActiveResource()),
      ),
  );
  const clearApiKeyCommand = vscode.commands.registerCommand(
    CLEAR_API_KEY_COMMAND_ID,
    () =>
      runProviderKeyCommand(() =>
        activeGenerationService.clearProviderApiKey(resolveActiveResource()),
      ),
  );
  const writePseudocodeCommand = vscode.commands.registerTextEditorCommand(
    WRITE_PSEUDOCODE_COMMAND_ID,
    (editor) => runComposerCommand(() => activeComposerHost.open(editor)),
  );
  const confirmComposerCommand = vscode.commands.registerTextEditorCommand(
    CONFIRM_COMPOSER_COMMAND_ID,
    (editor) => runComposerCommand(() => activeComposerHost.confirm(editor)),
  );
  const cancelComposerCommand = vscode.commands.registerCommand(
    CANCEL_COMPOSER_COMMAND_ID,
    () => runComposerCommand(() => activeComposerHost.cancel()),
  );
  const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
    void activeContextIndexer.refresh(document);
  });
  const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    void activeContextIndexer.refresh(document);
  });
  const configurationListener = activeConfigurationService.onDidChange((resource) => {
    activeGenerationService.reconfigure(resource ?? resolveActiveResource());
  });

  context.subscriptions.push(
    fleshOutCommand,
    wholeFileCommand,
    setApiKeyCommand,
    clearApiKeyCommand,
    writePseudocodeCommand,
    confirmComposerCommand,
    cancelComposerCommand,
    openListener,
    saveListener,
    configurationListener,
    performanceOutput,
    activeConfigurationService,
    activeContextIndexer,
    activeGenerationService,
    activeComposerHost,
  );

  for (const document of vscode.workspace.textDocuments) {
    void activeContextIndexer.refresh(document);
  }
  void activeGenerationService.warm(resolveActiveResource());
}

export function deactivate(): void {
  performanceOutput = undefined;
  contextIndexer = undefined;
  generationService = undefined;
  composerHost = undefined;
}

async function fleshOutPseudiniComments(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const documentText = document.getText();
  const documentVersion = document.version;
  const instructions = findPseudiniInstructions(documentText);

  if (instructions.length === 0) {
    void vscode.window.showInformationMessage(
      'Pseudini did not find comments that start with "pseudini:".',
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

async function generateComposerCode(
  editor: vscode.TextEditor,
  instruction: PseudocodeInstruction,
  token: vscode.CancellationToken,
): Promise<string> {
  const document = editor.document;
  const documentText = document.getText();
  const replacements = await createReplacements(
    document,
    documentText,
    document.version,
    [instruction],
    { report: () => undefined },
    token,
  );
  if (replacements.length !== 1) {
    throw new Error("Pseudini did not produce one inline replacement.");
  }
  return replacements[0].code;
}

async function createReplacements(
  document: vscode.TextDocument,
  documentText: string,
  documentVersion: number,
  instructions: readonly PseudocodeInstruction[],
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
      document.uri,
      prompt,
      batch.map(({ line }) => line),
      estimateMaxOutputTokens(batch),
      batch.some((instruction) => countWords(instruction.pseudocode) > 50),
      token,
    );
    ensureDocumentUnchanged(document, documentVersion);
    generated.push(
      ...indentReplacements(parseModelResponse(responseText, batch), sourceLines),
    );
  }

  return mergeReplacementFragments([...deterministic, ...generated]);
}

function indentReplacements(
  replacements: readonly CodeReplacement[],
  sourceLines: readonly string[],
): readonly CodeReplacement[] {
  return replacements.map((replacement) => ({
    ...replacement,
    code: applyCommentIndentation(
      replacement.code,
      readIndentation(sourceLines[replacement.line] ?? ""),
    ),
  }));
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
            document.uri,
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

function resolveActiveResource(): vscode.Uri | undefined {
  return (
    vscode.window.activeTextEditor?.document.uri ??
    vscode.workspace.workspaceFolders?.[0]?.uri
  );
}

async function runProviderKeyCommand(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    showCommandError(error);
  }
}

async function runComposerCommand(operation: () => Promise<void>): Promise<void> {
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
