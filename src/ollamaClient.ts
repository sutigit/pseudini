import { createReplacementSchema } from "./responseSchema";

export interface OllamaRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly prompt: string;
  readonly replacementLines?: readonly number[];
  readonly responseSchema?: object;
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}

export interface OllamaTimings {
  readonly totalMs: number;
  readonly loadMs: number;
  readonly promptEvaluationMs: number;
  readonly generationMs: number;
  readonly promptTokens: number;
  readonly outputTokens: number;
}

export interface OllamaResult {
  readonly text: string;
  readonly timings: OllamaTimings;
}

export interface OllamaConfiguration {
  readonly baseUrl: string;
  readonly model: string;
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const KEEP_ALIVE = -1;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;

export async function requestOllamaImplementation(
  request: OllamaRequest,
  fetchImplementation: FetchImplementation = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<OllamaResult> {
  validateModel(request.model);
  const endpoint = createOllamaUrl(request.baseUrl, "/api/chat");
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutMs);

  request.signal?.addEventListener("abort", abort, { once: true });
  if (request.signal?.aborted) {
    abort();
  }

  try {
    const response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        stream: false,
        think: false,
        keep_alive: KEEP_ALIVE,
        format:
          request.responseSchema ??
          createReplacementSchema(request.replacementLines ?? []),
        messages: [{ role: "user", content: request.prompt }],
        options: {
          temperature: 0,
          num_ctx: chooseContextSize(request.prompt, request.maxOutputTokens),
          num_predict: request.maxOutputTokens,
        },
      }),
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      throw await createHttpError(response, endpoint.origin, request.model);
    }

    return parseOllamaResponse(await readChatResponse(response));
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new OllamaError("The local model request timed out.");
      }

      throw new DOMException("The local model request was cancelled.", "AbortError");
    }

    if (error instanceof OllamaError) {
      throw error;
    }

    throw new OllamaError(
      `Could not connect to Ollama at ${endpoint.origin}. Start Ollama and try again.`,
    );
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
  }
}

export async function preloadOllamaModel(
  configuration: OllamaConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  validateModel(configuration.model);
  const endpoint = createOllamaUrl(configuration.baseUrl, "/api/generate");
  const response = await fetchImplementation(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: configuration.model,
      prompt: "",
      stream: false,
      keep_alive: KEEP_ALIVE,
    }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });

  if (!response.ok) {
    throw await createHttpError(response, endpoint.origin, configuration.model);
  }
}

export async function checkOllamaHealth(
  configuration: OllamaConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  validateModel(configuration.model);
  const endpoint = createOllamaUrl(configuration.baseUrl, "/api/tags");
  let response: Response;

  try {
    response = await fetchImplementation(endpoint, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
  } catch {
    throw new OllamaError(
      `Could not connect to Ollama at ${endpoint.origin}. Start Ollama and try again.`,
    );
  }

  if (!response.ok) {
    throw new OllamaError(`Ollama health check failed with HTTP status ${response.status}.`);
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new OllamaError("Ollama returned a model list that is not valid JSON.");
  }
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new OllamaError("Ollama returned an invalid model list.");
  }

  const installedModels = value.models.flatMap((model) =>
    isRecord(model) && typeof model.name === "string" ? [model.name] : [],
  );
  const isInstalled = installedModels.some(
    (name) =>
      name === configuration.model ||
      (!configuration.model.includes(":") && name.startsWith(`${configuration.model}:`)),
  );
  if (!isInstalled) {
    throw new OllamaError(
      `The model "${configuration.model}" is not installed. Run ` +
        `'ollama pull ${configuration.model}'.`,
    );
  }
}

export async function unloadOllamaModel(
  configuration: OllamaConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  validateModel(configuration.model);
  const endpoint = createOllamaUrl(configuration.baseUrl, "/api/generate");
  await fetchImplementation(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: configuration.model,
      prompt: "",
      stream: false,
      keep_alive: 0,
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
}

export function createOllamaUrl(baseUrl: string, pathname: string): URL {
  let url: URL;

  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new OllamaError("pseudini.ollamaUrl must be a valid loopback URL.");
  }

  const isLoopback =
    url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!isLoopback || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new OllamaError("pseudini.ollamaUrl must use HTTP or HTTPS on the loopback host.");
  }
  if (url.username || url.password) {
    throw new OllamaError("pseudini.ollamaUrl must not contain credentials.");
  }

  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function parseOllamaResponse(value: unknown): OllamaResult {
  if (!isRecord(value) || !isRecord(value.message) || typeof value.message.content !== "string") {
    throw new OllamaError("Ollama returned an invalid chat response.");
  }

  return {
    text: value.message.content,
    timings: {
      totalMs: nanosecondsToMilliseconds(value.total_duration),
      loadMs: nanosecondsToMilliseconds(value.load_duration),
      promptEvaluationMs: nanosecondsToMilliseconds(value.prompt_eval_duration),
      generationMs: nanosecondsToMilliseconds(value.eval_duration),
      promptTokens: readNumber(value.prompt_eval_count),
      outputTokens: readNumber(value.eval_count),
    },
  };
}

export function chooseContextSize(prompt: string, maxOutputTokens: number): number {
  const estimatedPromptTokens = Math.ceil(prompt.length / 3);
  const requiredTokens = estimatedPromptTokens + maxOutputTokens + 512;
  return Math.min(16_384, Math.max(2_048, nextPowerOfTwo(requiredTokens)));
}

async function createHttpError(
  response: Response,
  origin: string,
  model: string,
): Promise<OllamaError> {
  const code = await readErrorCode(response);
  const reason = code ? ` (${code})` : "";

  if (response.status === 404) {
    return new OllamaError(
      `${origin} does not have the configured model${reason}. Run ` +
        `'ollama pull ${model}' or change pseudini.model.`,
    );
  }

  if (response.status === 503) {
    return new OllamaError("Ollama is busy. Wait for the current local request and try again.");
  }

  return new OllamaError(`Ollama failed with HTTP status ${response.status}${reason}.`);
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  let value: unknown;

  try {
    value = await response.json();
  } catch {
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const candidate = value.error;
  return typeof candidate === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(candidate)
    ? candidate
    : undefined;
}

async function readChatResponse(response: Response): Promise<unknown> {
  const responseText = await response.text();
  const lines = responseText.split(/\r?\n/).filter(Boolean);
  const messages: Record<string, unknown>[] = [];

  try {
    for (const line of lines) {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) {
        throw new Error("invalid stream item");
      }
      messages.push(value);
    }
  } catch {
    throw new OllamaError("Ollama returned a response that is not valid JSON.");
  }

  const finalMessage = messages.at(-1);
  if (!finalMessage) {
    throw new OllamaError("Ollama returned an empty chat response.");
  }

  const content = messages
    .map((message) =>
      isRecord(message.message) && typeof message.message.content === "string"
        ? message.message.content
        : "",
    )
    .join("");

  return {
    ...finalMessage,
    message: { content },
  };
}

function validateModel(model: string): void {
  if (!/^[A-Za-z0-9._/-]+(?::[A-Za-z0-9._-]+)?$/.test(model)) {
    throw new OllamaError("pseudini.model must contain a valid Ollama model name.");
  }
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function nanosecondsToMilliseconds(value: unknown): number {
  return readNumber(value) / 1_000_000;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class OllamaError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}
