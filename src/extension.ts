import * as path from "node:path";
import * as vscode from "vscode";
import { findAimeInstructions } from "./commentParser";
import { requestImplementation } from "./cursorAgent";
import { createImplementationPrompt, parseModelResponse } from "./prompt";

const COMMAND_ID = "pseudini.fleshOutAimeComments";

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerTextEditorCommand(
    COMMAND_ID,
    fleshOutAimeComments,
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {}

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

  const prompt = createImplementationPrompt(
    document.languageId,
    path.basename(document.fileName),
    documentText,
    instructions,
  );

  try {
    const responseText = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pseudini is implementing ${instructions.length} comment(s)`,
        cancellable: true,
      },
      (_progress, token) =>
        requestImplementation({
          prompt,
          workspaceDirectory: resolveWorkspaceDirectory(document),
          token,
        }),
    );

    if (document.version !== documentVersion) {
      throw new Error("The file changed while Pseudini was generating code. Run the command again.");
    }

    const replacements = parseModelResponse(responseText, instructions);
    const applied = await editor.edit((editBuilder) => {
      for (const replacement of replacements) {
        editBuilder.replace(document.lineAt(replacement.line).range, replacement.code);
      }
    });

    if (!applied) {
      throw new Error("Cursor could not apply the generated code.");
    }

    void vscode.window.showInformationMessage(
      `Pseudini implemented ${replacements.length} comment(s).`,
    );
  } catch (error) {
    if (error instanceof vscode.CancellationError) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Pseudini: ${message}`);
  }
}

function resolveWorkspaceDirectory(document: vscode.TextDocument): string {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);

  return folder ? folder.uri.fsPath : path.dirname(document.fileName);
}
