import * as vscode from "vscode";
import {
  checkOllamaHealth,
  OllamaConfiguration,
  OllamaResult,
  preloadOllamaModel,
  requestOllamaImplementation,
  unloadOllamaModel,
} from "./ollamaClient";
import {
  createApiKeySecretName,
  requestProviderImplementation,
} from "./providerApi";
import { createReplacementSchema } from "./responseSchema";

interface ProviderConfiguration {
  readonly baseUrl: string;
  readonly model: string;
  readonly largeRequestRoute: "local" | "provider";
}

const CONFIGURATION_SECTION = "pseudini";

export class GenerationService implements vscode.Disposable {
  private localConfiguration = readOllamaConfiguration();
  private modelRequestQueue: Promise<void> = Promise.resolve();
  private readonly activeControllers = new Set<AbortController>();
  private disposed = false;

  public constructor(
    private readonly output: vscode.OutputChannel,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  public async warm(): Promise<void> {
    const startedAt = performance.now();

    try {
      await checkOllamaHealth(this.localConfiguration);
      await preloadOllamaModel(this.localConfiguration);
      this.output.appendLine(
        `[info] preloaded model=${this.localConfiguration.model} ` +
          `wallMs=${(performance.now() - startedAt).toFixed(1)}`,
      );
    } catch (error) {
      this.output.appendLine(`[warn] preload failed: ${readErrorMessage(error)}`);
    }
  }

  public reconfigure(): void {
    const previous = this.localConfiguration;
    this.localConfiguration = readOllamaConfiguration();
    void unloadOllamaModel(previous);
    void this.warm();
  }

  public async request(
    prompt: string,
    replacementLines: readonly number[],
    maxOutputTokens: number,
    isLargeRequest: boolean,
    token: vscode.CancellationToken,
    responseSchema?: object,
  ): Promise<string> {
    const provider = readProviderConfiguration();
    if (provider.largeRequestRoute === "provider" && isLargeRequest) {
      return this.requestProvider(
        prompt,
        maxOutputTokens,
        responseSchema ?? createReplacementSchema(replacementLines),
        provider,
        token,
      );
    }

    return (
      await this.queueLocalRequest(
        prompt,
        replacementLines,
        maxOutputTokens,
        token,
        responseSchema,
      )
    ).text;
  }

  public async setProviderApiKey(): Promise<void> {
    const provider = readProviderConfiguration();
    const secretName = createApiKeySecretName(provider.baseUrl);
    const apiKey = await vscode.window.showInputBox({
      prompt: "Enter the API key for the configured Pseudini provider",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : "Enter a non-empty API key."),
    });
    if (apiKey === undefined) {
      return;
    }

    await this.secrets.store(secretName, apiKey.trim());
    void vscode.window.showInformationMessage("Pseudini stored the provider API key.");
  }

  public async clearProviderApiKey(): Promise<void> {
    const provider = readProviderConfiguration();
    await this.secrets.delete(createApiKeySecretName(provider.baseUrl));
    void vscode.window.showInformationMessage("Pseudini cleared the provider API key.");
  }

  public dispose(): void {
    this.disposed = true;
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
    void unloadOllamaModel(this.localConfiguration);
    this.modelRequestQueue = Promise.resolve();
  }

  private async requestProvider(
    prompt: string,
    maxOutputTokens: number,
    responseSchema: object,
    provider: ProviderConfiguration,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const apiKey = await this.secrets.get(createApiKeySecretName(provider.baseUrl));
    if (!apiKey) {
      throw new Error("Set a provider API key with Pseudini: Set API Key.");
    }

    const controller = new AbortController();
    this.activeControllers.add(controller);
    const cancellation = token.onCancellationRequested(() => controller.abort());
    const startedAt = performance.now();

    try {
      const responseText = await requestProviderImplementation({
        apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model,
        prompt,
        maxOutputTokens,
        responseSchema,
        signal: controller.signal,
      });
      this.output.appendLine(
        `[info] provider model=${provider.model} ` +
          `wallMs=${(performance.now() - startedAt).toFixed(1)}`,
      );
      return responseText;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new vscode.CancellationError();
      }
      throw error;
    } finally {
      this.activeControllers.delete(controller);
      cancellation.dispose();
    }
  }

  private queueLocalRequest(
    prompt: string,
    replacementLines: readonly number[],
    maxOutputTokens: number,
    token: vscode.CancellationToken,
    responseSchema?: object,
  ): Promise<OllamaResult> {
    const request = this.modelRequestQueue.then(() => {
      if (this.disposed || token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      return this.performLocalRequest(
        prompt,
        replacementLines,
        maxOutputTokens,
        token,
        responseSchema,
      );
    });
    this.modelRequestQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  private async performLocalRequest(
    prompt: string,
    replacementLines: readonly number[],
    maxOutputTokens: number,
    token: vscode.CancellationToken,
    responseSchema?: object,
  ): Promise<OllamaResult> {
    const controller = new AbortController();
    this.activeControllers.add(controller);
    const cancellation = token.onCancellationRequested(() => controller.abort());
    const startedAt = performance.now();

    try {
      const result = await requestOllamaImplementation({
        ...this.localConfiguration,
        prompt,
        replacementLines,
        responseSchema,
        maxOutputTokens,
        signal: controller.signal,
      });
      this.writeLocalMetrics(result, performance.now() - startedAt);
      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new vscode.CancellationError();
      }
      throw error;
    } finally {
      this.activeControllers.delete(controller);
      cancellation.dispose();
    }
  }

  private writeLocalMetrics(result: OllamaResult, wallMs: number): void {
    this.output.appendLine(
      `[info] ${[
        `model=${this.localConfiguration.model}`,
        `wallMs=${wallMs.toFixed(1)}`,
        `ollamaMs=${result.timings.totalMs.toFixed(1)}`,
        `loadMs=${result.timings.loadMs.toFixed(1)}`,
        `promptMs=${result.timings.promptEvaluationMs.toFixed(1)}`,
        `generationMs=${result.timings.generationMs.toFixed(1)}`,
        `promptTokens=${result.timings.promptTokens}`,
        `outputTokens=${result.timings.outputTokens}`,
      ].join(" ")}`,
    );
  }
}

function readOllamaConfiguration(): OllamaConfiguration {
  const configuration = vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
  return {
    baseUrl: configuration.get<string>("ollamaUrl", "http://127.0.0.1:11434").trim(),
    model: configuration.get<string>("model", "qwen2.5-coder:3b").trim(),
  };
}

function readProviderConfiguration(): ProviderConfiguration {
  const configuration = vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
  const route = configuration.get<string>("largeRequestRoute", "local");

  return {
    baseUrl: configuration.get<string>("providerBaseUrl", "").trim(),
    model: configuration.get<string>("providerModel", "").trim(),
    largeRequestRoute: route === "provider" ? "provider" : "local",
  };
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
