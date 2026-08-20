import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOllamaHealth,
  chooseContextSize,
  createOllamaUrl,
  FetchImplementation,
  parseOllamaResponse,
  preloadOllamaModel,
  requestOllamaImplementation,
} from "../src/ollamaClient";

const request = {
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5-coder:1.5b",
  prompt: "Implement the requested line.",
  replacementLines: [3],
  maxOutputTokens: 256,
};

test("constructs a warm schema-constrained Ollama request", async () => {
  let receivedUrl: string | undefined;
  let receivedBody: Record<string, unknown> | undefined;
  const fetchImplementation: FetchImplementation = async (input, init) => {
    receivedUrl = input.toString();
    receivedBody = JSON.parse(String(init?.body));
    return ollamaResponse();
  };

  await requestOllamaImplementation(request, fetchImplementation);

  assert.equal(receivedUrl, "http://127.0.0.1:11434/api/chat");
  assert.equal(receivedBody?.model, "qwen2.5-coder:1.5b");
  assert.equal(receivedBody?.stream, false);
  assert.equal(receivedBody?.think, false);
  assert.equal(receivedBody?.keep_alive, -1);
  assert.deepEqual(
    (receivedBody?.format as { properties: { replacements: object } }).properties
      .replacements,
    {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        properties: {
          code: { type: "string", minLength: 1 },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  );
});

test("combines streamed structured output and final timing fields", async () => {
  const fetchImplementation: FetchImplementation = async () =>
    new Response(
      [
        JSON.stringify({ message: { content: '{"replacements":[' }, done: false }),
        JSON.stringify({
          message: { content: '{"code":"return 1;"}]}' },
          done: true,
          total_duration: 2_000_000,
          eval_count: 8,
          eval_duration: 1_000_000,
        }),
      ].join("\n"),
      { status: 200 },
    );

  const result = await requestOllamaImplementation(request, fetchImplementation);

  assert.equal(result.text, '{"replacements":[{"code":"return 1;"}]}');
  assert.equal(result.timings.totalMs, 2);
  assert.equal(result.timings.outputTokens, 8);
});

test("preloads the configured model indefinitely", async () => {
  let receivedBody: Record<string, unknown> | undefined;
  const fetchImplementation: FetchImplementation = async (_input, init) => {
    receivedBody = JSON.parse(String(init?.body));
    return new Response("{}", { status: 200 });
  };

  await preloadOllamaModel(
    { baseUrl: "http://127.0.0.1:11434", model: "qwen2.5-coder:1.5b" },
    fetchImplementation,
  );

  assert.deepEqual(receivedBody, {
    model: "qwen2.5-coder:1.5b",
    prompt: "",
    stream: false,
    keep_alive: -1,
  });
});

test("health check confirms that the configured model is installed", async () => {
  const fetchImplementation: FetchImplementation = async () =>
    new Response(
      JSON.stringify({
        models: [{ name: "qwen2.5-coder:1.5b" }],
      }),
      { status: 200 },
    );

  await checkOllamaHealth(
    { baseUrl: "http://127.0.0.1:11434", model: "qwen2.5-coder:1.5b" },
    fetchImplementation,
  );
  await assert.rejects(
    checkOllamaHealth(
      { baseUrl: "http://127.0.0.1:11434", model: "missing:latest" },
      fetchImplementation,
    ),
    /ollama pull missing:latest/,
  );
});

test("rejects non-loopback model endpoints", () => {
  assert.throws(
    () => createOllamaUrl("https://models.example.com", "/api/chat"),
    /loopback host/,
  );
});

test("rejects model names that are unsafe to show in shell guidance", async () => {
  await assert.rejects(
    requestOllamaImplementation(
      { ...request, model: "model; rm -rf /" },
      async () => ollamaResponse(),
    ),
    /valid Ollama model name/,
  );
});

test("parses Ollama timing metrics", () => {
  assert.deepEqual(
    parseOllamaResponse({
      message: { content: '{"replacements":[]}' },
      total_duration: 2_000_000,
      load_duration: 100_000,
      prompt_eval_duration: 400_000,
      eval_duration: 1_500_000,
      prompt_eval_count: 20,
      eval_count: 10,
    }),
    {
      text: '{"replacements":[]}',
      timings: {
        totalMs: 2,
        loadMs: 0.1,
        promptEvaluationMs: 0.4,
        generationMs: 1.5,
        promptTokens: 20,
        outputTokens: 10,
      },
    },
  );
});

test("selects a bounded power-of-two context size", () => {
  assert.equal(chooseContextSize("short prompt", 64), 2_048);
  assert.equal(chooseContextSize("x".repeat(100_000), 8_192), 16_384);
});

test("cancels an in-flight request", async () => {
  const controller = new AbortController();
  const fetchImplementation: FetchImplementation = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  const result = requestOllamaImplementation(
    { ...request, signal: controller.signal },
    fetchImplementation,
  );

  controller.abort();
  await assert.rejects(result, (error: Error) => error.name === "AbortError");
});

function ollamaResponse(): Response {
  return new Response(
    JSON.stringify({
      message: { content: '{"replacements":[{"line":3,"code":"return 1;"}]}' },
      total_duration: 1_000_000,
      eval_count: 5,
      eval_duration: 500_000,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
