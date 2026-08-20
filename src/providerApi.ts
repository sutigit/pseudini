export interface ProviderRequest {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly prompt: string;
  readonly maxOutputTokens?: number;
  readonly responseSchema?: object;
  readonly signal?: AbortSignal;
}

export type ProviderFetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ChatCompletionResponse {
  readonly choices: readonly {
    readonly message: {
      readonly content: string;
    };
  }[];
}

const REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;
const API_KEY_SECRET_PREFIX = "pseudini.providerApiKey:";

export async function requestProviderImplementation(
  request: ProviderRequest,
  fetchImplementation: ProviderFetchImplementation = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<string> {
  if (!request.apiKey.trim()) {
    throw new ProviderApiError("Set a provider API key with Pseudini: Set API Key.");
  }
  if (!request.model.trim()) {
    throw new ProviderApiError("pseudini.providerModel must contain a model ID.");
  }

  const endpoint = createChatCompletionsUrl(request.baseUrl);
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
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: "user", content: request.prompt }],
        temperature: 0,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { max_tokens: request.maxOutputTokens }),
        ...(request.responseSchema === undefined
          ? {}
          : {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "pseudini_response",
                  strict: true,
                  schema: request.responseSchema,
                },
              },
            }),
      }),
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      throw createHttpError(
        response.status,
        endpoint.origin,
        await readErrorCode(response),
      );
    }

    return parseChatCompletion(await readJsonResponse(response));
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new ProviderApiError("The provider request timed out.");
      }

      throw new DOMException("The provider request was cancelled.", "AbortError");
    }
    if (error instanceof ProviderApiError) {
      throw error;
    }

    throw new ProviderApiError("Could not connect to the configured provider.");
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
  }
}

export function createChatCompletionsUrl(baseUrl: string): URL {
  let url: URL;

  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new ProviderApiError("pseudini.providerBaseUrl must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new ProviderApiError("pseudini.providerBaseUrl must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new ProviderApiError("pseudini.providerBaseUrl must not contain credentials.");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  url.search = "";
  url.hash = "";
  return url;
}

export function createApiKeySecretName(baseUrl: string): string {
  return `${API_KEY_SECRET_PREFIX}${encodeURIComponent(
    createChatCompletionsUrl(baseUrl).toString(),
  )}`;
}

export function parseChatCompletion(value: unknown): string {
  if (!isChatCompletionResponse(value)) {
    throw new ProviderApiError("The provider returned an invalid Chat Completions response.");
  }

  return value.choices[0].message.content;
}

function createHttpError(
  status: number,
  origin: string,
  code: string | undefined,
): ProviderApiError {
  const reason = code ? ` (${code})` : "";

  if (status === 401) {
    return new ProviderApiError(
      `${origin} rejected the API key${reason}. Confirm the key belongs to that provider, ` +
        "then set it again with Pseudini: Set API Key.",
    );
  }
  if (status === 403) {
    return new ProviderApiError(
      `${origin} refused the request${reason}. The key may lack model access.`,
    );
  }
  if (status === 404) {
    return new ProviderApiError(
      `${origin} does not provide the configured endpoint or model${reason}.`,
    );
  }
  if (status === 429) {
    return new ProviderApiError("The provider rate limit was reached. Try again later.");
  }

  return new ProviderApiError(`The provider failed with HTTP status ${status}${reason}.`);
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return undefined;
  }

  if (!isRecord(body) || !isRecord(body.error)) {
    return undefined;
  }

  return [body.error.code, body.error.type].find(isFailureCode);
}

function isFailureCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(value);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderApiError("The provider returned a response that is not valid JSON.");
  }
}

function isChatCompletionResponse(value: unknown): value is ChatCompletionResponse {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) {
    return false;
  }

  const firstChoice = value.choices[0];
  return (
    isRecord(firstChoice) &&
    isRecord(firstChoice.message) &&
    typeof firstChoice.message.content === "string" &&
    firstChoice.message.content.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class ProviderApiError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProviderApiError";
  }
}
