import * as vscode from "vscode";

export async function requestImplementation(
  prompt: string,
  token: vscode.CancellationToken,
): Promise<string> {
  const [model] = await vscode.lm.selectChatModels();

  if (!model) {
    throw new Error(
      "No language model is available. Configure an AI model in Cursor and try again.",
    );
  }

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  const response = await model.sendRequest(messages, {}, token);
  let responseText = "";

  for await (const fragment of response.text) {
    responseText += fragment;
  }

  return responseText;
}
