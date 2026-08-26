import * as vscode from "vscode";
import { ConfigurationService } from "./configurationService";
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
import { PseudiniConfiguration } from "./projectConfiguration";
import { createReplacementSchema } from "./responseSchema";

export class GenerationService implements vscode.Disposable {
  private localConfiguration: OllamaConfiguration | undefined;
  private modelRequestQueue: Promise<void> = Promise.resolve();
  private readonly activeControllers = new Set<AbortController>();
  private disposed = false;

  public constructor(
    private readonly output: vscode.OutputChannel,
    private readonly secrets: vscode.SecretStorage,
    private readonly configuration: ConfigurationService,
  ) {}

  public async warm(resource?: vscode.Uri): Promise<void> {
    try {
      await this.queueConfiguration(resource, true);
    } catch (error) {
      this.output.appendLine(
        `[warn] configuration load failed: ${readErrorMessage(error)}`,
      );
    }
  }

  public reconfigure(resource?: vscode.Uri): void {
    void this.queueConfiguration(resource, false).catch((error) => {
      this.output.appendLine(
        `[warn] configuration reload failed: ${readErrorMessage(error)}`,
      );
    });
  }

  public async request(
    resource: vscode.Uri,
    prompt: string,
    replacementLines: readonly number[],
    maxOutputTokens: number,
    isLargeRequest: boolean,
    token: vscode.CancellationToken,
    responseSchema?: object,
  ): Promise<string> {
    const configuration = await this.configuration.resolve(resource);
    if (configuration.largeRequestRoute === "provider" && isLargeRequest) {
      return this.requestProvider(
        prompt,
        maxOutputTokens,
        responseSchema ?? createReplacementSchema(replacementLines),
        configuration,
        token,
      );
    }

    return (
      await this.queueLocalRequest(
        readOllamaConfiguration(configuration),
        prompt,
        replacementLines,
        maxOutputTokens,
        token,
        responseSchema,
      )
    ).text;
  }

  public async setProviderApiKey(resource?: vscode.Uri): Promise<void> {
    const configuration = await this.configuration.resolve(resource);
    const secretName = createApiKeySecretName(configuration.providerBaseUrl);
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

  public async clearProviderApiKey(resource?: vscode.Uri): Promise<void> {
    const configuration = await this.configuration.resolve(resource);
    await this.secrets.delete(
      createApiKeySecretName(configuration.providerBaseUrl),
    );
    void vscode.window.showInformationMessage("Pseudini cleared the provider API key.");
  }

  public dispose(): void {
    this.disposed = true;
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
    if (this.localConfiguration) {
      void unloadOllamaModel(this.localConfiguration);
    }
    this.modelRequestQueue = Promise.resolve();
  }

  private async requestProvider(
    prompt: string,
    maxOutputTokens: number,
    responseSchema: object,
    configuration: PseudiniConfiguration,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const apiKey = await this.secrets.get(
      createApiKeySecretName(configuration.providerBaseUrl),
    );
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
        baseUrl: configuration.providerBaseUrl,
        model: configuration.providerModel,
        prompt,
        maxOutputTokens,
        responseSchema,
        signal: controller.signal,
      });
      this.output.appendLine(
        `[info] provider model=${configuration.providerModel} ` +
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
    configuration: OllamaConfiguration,
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
      return this.prepareLocalConfiguration(configuration).then(() =>
        this.performLocalRequest(
          configuration,
          prompt,
          replacementLines,
          maxOutputTokens,
          token,
          responseSchema,
        ),
      );
    });
    this.modelRequestQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  private async performLocalRequest(
    configuration: OllamaConfiguration,
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
        ...configuration,
        prompt,
        replacementLines,
        responseSchema,
        maxOutputTokens,
        signal: controller.signal,
      });
      this.writeLocalMetrics(configuration, result, performance.now() - startedAt);
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

  private queueConfiguration(
    resource: vscode.Uri | undefined,
    forceWarm: boolean,
  ): Promise<void> {
    const operation = this.modelRequestQueue.then(async () => {
      if (this.disposed) {
        return;
      }

      const resolved = await this.configuration.resolve(resource);
      await this.prepareLocalConfiguration(
        readOllamaConfiguration(resolved),
        forceWarm,
      );
    });
    this.modelRequestQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async prepareLocalConfiguration(
    configuration: OllamaConfiguration,
    forceWarm = false,
  ): Promise<void> {
    const previous = this.localConfiguration;
    const changed = !isSameOllamaConfiguration(previous, configuration);
    if (!changed && !forceWarm) {
      return;
    }

    if (previous && changed) {
      try {
        await unloadOllamaModel(previous);
      } catch (error) {
        this.output.appendLine(
          `[warn] unload failed model=${previous.model}: ${readErrorMessage(error)}`,
        );
      }
    }

    this.localConfiguration = configuration;
    const startedAt = performance.now();
    try {
      await checkOllamaHealth(configuration);
      await preloadOllamaModel(configuration);
      this.output.appendLine(
        `[info] preloaded model=${configuration.model} ` +
          `wallMs=${(performance.now() - startedAt).toFixed(1)}`,
      );
    } catch (error) {
      this.output.appendLine(`[warn] preload failed: ${readErrorMessage(error)}`);
    }
  }

  private writeLocalMetrics(
    configuration: OllamaConfiguration,
    result: OllamaResult,
    wallMs: number,
  ): void {
    this.output.appendLine(
      `[info] ${[
        `model=${configuration.model}`,
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

function readOllamaConfiguration(
  configuration: PseudiniConfiguration,
): OllamaConfiguration {
  return {
    baseUrl: configuration.ollamaUrl,
    model: configuration.model,
  };
}

function isSameOllamaConfiguration(
  left: OllamaConfiguration | undefined,
  right: OllamaConfiguration,
): boolean {
  return left?.baseUrl === right.baseUrl && left.model === right.model;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
