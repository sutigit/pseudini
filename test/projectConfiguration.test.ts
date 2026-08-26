import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PSEUDINI_CONFIGURATION,
  mergeProjectConfiguration,
  parseProjectConfiguration,
} from "../src/projectConfiguration";

test("parses optional project configuration overrides", () => {
  assert.deepEqual(
    parseProjectConfiguration(
      JSON.stringify({
        ollamaUrl: " http://127.0.0.1:11435 ",
        model: " qwen2.5-coder:7b ",
        largeRequestRoute: "provider",
        providerBaseUrl: " https://api.example.com/v1 ",
        providerModel: " coding-model ",
      }),
    ),
    {
      ollamaUrl: "http://127.0.0.1:11435",
      model: "qwen2.5-coder:7b",
      largeRequestRoute: "provider",
      providerBaseUrl: "https://api.example.com/v1",
      providerModel: "coding-model",
    },
  );
});

test("allows a project to override only the local model", () => {
  const project = parseProjectConfiguration(
    '{"model":"qwen2.5-coder:1.5b"}',
  );

  assert.deepEqual(
    mergeProjectConfiguration(DEFAULT_PSEUDINI_CONFIGURATION, project),
    {
      ...DEFAULT_PSEUDINI_CONFIGURATION,
      model: "qwen2.5-coder:1.5b",
    },
  );
});

test("project values override Cursor configuration values", () => {
  const cursorConfiguration = {
    ...DEFAULT_PSEUDINI_CONFIGURATION,
    model: "cursor-model",
    largeRequestRoute: "provider" as const,
  };

  assert.deepEqual(
    mergeProjectConfiguration(
      cursorConfiguration,
      parseProjectConfiguration(
        '{"model":"project-model","largeRequestRoute":"local"}',
      ),
    ),
    {
      ...cursorConfiguration,
      model: "project-model",
      largeRequestRoute: "local",
    },
  );
});

test("rejects malformed JSON and non-object values", () => {
  assert.throws(
    () => parseProjectConfiguration('{"model":'),
    /must contain valid JSON/,
  );
  assert.throws(
    () => parseProjectConfiguration('["qwen2.5-coder:3b"]'),
    /must contain a JSON object/,
  );
});

test("rejects unknown settings", () => {
  assert.throws(
    () => parseProjectConfiguration('{"temperature":0}'),
    /unknown setting: "temperature"/,
  );
});

test("rejects invalid model, URL, route, and provider values", () => {
  assert.throws(
    () => parseProjectConfiguration('{"model":"  "}'),
    /"model" must be a non-empty string/,
  );
  assert.throws(
    () => parseProjectConfiguration('{"ollamaUrl":false}'),
    /"ollamaUrl" must be a non-empty string/,
  );
  assert.throws(
    () => parseProjectConfiguration('{"largeRequestRoute":"remote"}'),
    /must be "local" or "provider"/,
  );
  assert.throws(
    () => parseProjectConfiguration('{"providerModel":42}'),
    /"providerModel" must be a string/,
  );
});
