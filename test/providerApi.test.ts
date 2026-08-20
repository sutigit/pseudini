import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiKeySecretName,
  createChatCompletionsUrl,
  ProviderFetchImplementation,
  requestProviderImplementation,
} from "../src/providerApi";

const providerRequest = {
  apiKey: "test-key",
  baseUrl: "https://provider.example.com/v1/",
  model: "fast-code-model",
  prompt: "Implement the requested comment.",
  maxOutputTokens: 512,
  responseSchema: {
    type: "object",
    properties: { replacements: { type: "array" } },
  },
};

test("calls an HTTPS Chat Completions endpoint without exposing its key", async () => {
  let authorization: string | null = null;
  let requestUrl: string | undefined;
  let requestBody: Record<string, unknown> | undefined;
  let redirect: RequestInit["redirect"];
  const fetchImplementation: ProviderFetchImplementation = async (input, init) => {
    requestUrl = input.toString();
    authorization = new Headers(init?.headers).get("Authorization");
    requestBody = JSON.parse(String(init?.body));
    redirect = init?.redirect;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"replacements":[{"code":"return 1;"}]}' } }],
      }),
      { status: 200 },
    );
  };

  const result = await requestProviderImplementation(
    providerRequest,
    fetchImplementation,
  );

  assert.equal(requestUrl, "https://provider.example.com/v1/chat/completions");
  assert.equal(authorization, "Bearer test-key");
  assert.equal(redirect, "error");
  assert.equal(requestBody?.max_tokens, 512);
  assert.deepEqual(requestBody?.response_format, {
    type: "json_schema",
    json_schema: {
      name: "pseudini_response",
      strict: true,
      schema: providerRequest.responseSchema,
    },
  });
  assert.equal(result, '{"replacements":[{"code":"return 1;"}]}');
});

test("rejects non-HTTPS provider endpoints", () => {
  assert.throws(
    () => createChatCompletionsUrl("http://provider.example.com/v1"),
    /must use HTTPS/,
  );
});

test("scopes stored API keys to normalized endpoints", () => {
  assert.equal(
    createApiKeySecretName("https://provider.example.com/v1/"),
    createApiKeySecretName("https://provider.example.com/v1"),
  );
  assert.notEqual(
    createApiKeySecretName("https://provider.example.com/v1"),
    createApiKeySecretName("https://other.example.com/v1"),
  );
});

test("reports provider error codes without including response details", async () => {
  const fetchImplementation: ProviderFetchImplementation = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "invalid_api_key",
          message: "test-key must never appear in the displayed error",
        },
      }),
      { status: 401 },
    );

  await assert.rejects(
    requestProviderImplementation(providerRequest, fetchImplementation),
    (error: Error) => {
      assert.match(error.message, /invalid_api_key/);
      assert.doesNotMatch(error.message, /test-key/);
      return true;
    },
  );
});

test("cancels provider requests", async () => {
  const controller = new AbortController();
  const fetchImplementation: ProviderFetchImplementation = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  const result = requestProviderImplementation(
    { ...providerRequest, signal: controller.signal },
    fetchImplementation,
  );

  controller.abort();
  await assert.rejects(result, (error: Error) => error.name === "AbortError");
});
