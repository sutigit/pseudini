import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { transform } from "esbuild";
import { benchmarkFixtures } from "./fixtures.mjs";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const DEFAULT_MODELS = [
  "qwen2.5-coder:1.5b",
  "qwen2.5-coder:3b",
  "qwen2.5-coder:7b",
];
const replacementSchema = {
  type: "object",
  properties: {
    replacements: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
  required: ["replacements"],
  additionalProperties: false,
};
const runs = readPositiveInteger("AIME_BENCH_RUNS", 50);
const warmups = readNonNegativeInteger("AIME_BENCH_WARMUPS", 2);
const models = readList("AIME_BENCH_MODELS", DEFAULT_MODELS);
const outputName = readOutputName();
const selectedCases = new Set(
  readList(
    "AIME_BENCH_CASES",
    benchmarkFixtures.filter(({ id }) => id !== "whole-file").map(({ id }) => id),
  ),
);
const fixtures = benchmarkFixtures.filter(({ id }) => selectedCases.has(id));
const results = [];

if (fixtures.length === 0) {
  throw new Error("AIME_BENCH_CASES did not select a known benchmark fixture.");
}

for (const model of models) {
  await preloadModel(model);

  for (const fixture of fixtures) {
    process.stdout.write(`Benchmarking ${model} / ${fixture.id}... `);

    for (let warmup = 0; warmup < warmups; warmup += 1) {
      await runRequest(model, fixture);
    }

    const samples = [];
    let stoppedEarlyReason;
    for (let run = 0; run < runs; run += 1) {
      samples.push(await runRequest(model, fixture));
      if ((run + 1) % 10 === 0 && run + 1 < runs) {
        process.stdout.write(`${run + 1} `);
      }
      stoppedEarlyReason = findEarlyStopReason(samples, fixture);
      if (stoppedEarlyReason) {
        break;
      }
    }

    const summary = summarize(model, fixture, samples, stoppedEarlyReason);
    results.push(summary);
    console.log(
      `p95=${summary.wallMs.p95.toFixed(0)}ms ` +
        `quality=${(summary.qualityRate * 100).toFixed(0)}% ` +
        `decode=${summary.decodeTokensPerSecond.p50.toFixed(1)} tok/s` +
        (summary.stoppedEarlyReason ? ` stopped=${summary.stoppedEarlyReason}` : ""),
    );
  }

  await unloadModel(model);
}

await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(
  new URL(`./results/${outputName}`, import.meta.url),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment: { ollamaUrl: OLLAMA_URL, runs, warmups },
      results,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote benchmarks/results/${outputName}`);

async function runRequest(model, fixture) {
  const startedAt = performance.now();

  try {
    return await performRequest(model, fixture, startedAt);
  } catch (error) {
    if (!isTimeoutError(error)) {
      throw error;
    }

    const elapsedMs = performance.now() - startedAt;
    return {
      wallMs: elapsedMs,
      generationWallMs: elapsedMs,
      parseMs: 0,
      validationMs: 0,
      editMs: 0,
      loadMs: 0,
      promptMs: 0,
      generationMs: 0,
      promptTokens: 0,
      outputTokens: 0,
      decodeTokensPerSecond: 0,
      valid: false,
      failures: [`timed out after ${requestTimeoutMs(fixture)}ms`],
    };
  }
}

async function performRequest(model, fixture, startedAt) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      think: false,
      keep_alive: -1,
      format: replacementSchema,
      messages: [{ role: "user", content: createPrompt(fixture) }],
      options: {
        temperature: 0,
        num_ctx: chooseContextSize(fixture),
        num_predict: fixture.maxOutputTokens,
      },
    }),
    signal: AbortSignal.timeout(requestTimeoutMs(fixture)),
  });
  if (!response.ok) {
    throw new Error(`${model}/${fixture.id} failed with HTTP ${response.status}.`);
  }

  const responseText = await response.text();
  const generationWallMs = performance.now() - startedAt;
  const parseStartedAt = performance.now();
  const payload = parseChatResponse(responseText);
  const parseMs = performance.now() - parseStartedAt;
  const validationStartedAt = performance.now();
  const validation = await validateResponse(payload, fixture);
  const validationMs = performance.now() - validationStartedAt;
  const editStartedAt = performance.now();
  simulateEdit(fixture, validation.code);
  const editMs = performance.now() - editStartedAt;
  const wallMs = performance.now() - startedAt;
  if (!validation.valid && process.env.AIME_BENCH_DEBUG === "1") {
    console.error(`\n${model}/${fixture.id}: ${payload.message?.content ?? "<no content>"}`);
  }

  return {
    wallMs,
    generationWallMs,
    parseMs,
    validationMs,
    editMs,
    loadMs: nanosecondsToMilliseconds(payload.load_duration),
    promptMs: nanosecondsToMilliseconds(payload.prompt_eval_duration),
    generationMs: nanosecondsToMilliseconds(payload.eval_duration),
    promptTokens: payload.prompt_eval_count ?? 0,
    outputTokens: payload.eval_count ?? 0,
    decodeTokensPerSecond:
      payload.eval_duration > 0
        ? (payload.eval_count * 1_000_000_000) / payload.eval_duration
        : 0,
    valid: validation.valid,
    failures: validation.failures,
  };
}

function requestTimeoutMs(fixture) {
  return Math.min(330_000, Math.max(3_000, fixture.targetMaxMs * 2));
}

function isTimeoutError(error) {
  return (
    error?.name === "TimeoutError" ||
    error?.cause?.code === "UND_ERR_HEADERS_TIMEOUT"
  );
}

async function validateResponse(payload, fixture) {
  const failures = [];
  let parsed;

  try {
    parsed = JSON.parse(payload.message?.content ?? "");
  } catch {
    return { valid: false, failures: ["invalid JSON"], code: undefined };
  }

  if (!Array.isArray(parsed.replacements) || parsed.replacements.length !== 1) {
    failures.push("expected exactly one replacement");
  }

  const replacement = parsed.replacements?.[0];
  if (typeof replacement?.code !== "string") {
    failures.push("invalid replacement code");
  }

  if ((payload.eval_count ?? 0) < fixture.minOutputTokens) {
    failures.push(`output below ${fixture.minOutputTokens} tokens`);
  }

  for (const pattern of fixture.requiredCodePatterns) {
    if (!pattern.test(replacement?.code ?? "")) {
      failures.push(`code does not match ${pattern}`);
    }
  }

  if (
    typeof replacement?.code === "string" &&
    (await hasSyntaxErrors(replacement.code, fixture))
  ) {
    failures.push("generated TypeScript contains syntax errors");
  }

  return { valid: failures.length === 0, failures, code: replacement?.code };
}

async function hasSyntaxErrors(code, fixture) {
  const source = fixture.wrapAsFunctionBody
    ? `function benchmarkScope() {\n${code}\n}`
    : code;

  try {
    await transform(source, {
      loader: "ts",
      target: "es2022",
      logLevel: "silent",
    });
    return false;
  } catch {
    return true;
  }
}

function summarize(model, fixture, samples, stoppedEarlyReason) {
  const metric = (field) => {
    const values = samples.map((sample) => sample[field]).sort((left, right) => left - right);
    return {
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      min: values[0],
      max: values.at(-1),
    };
  };

  return {
    model,
    fixture: fixture.id,
    description: fixture.description,
    inputWords: countWords(
      fixture.measureSourceWords ? fixture.source : fixture.pseudocode,
    ),
    requiredOutputTokens: fixture.minOutputTokens,
    requestedSampleCount: runs,
    sampleCount: samples.length,
    stoppedEarlyReason,
    qualityRate: samples.filter(({ valid }) => valid).length / samples.length,
    wallMs: metric("wallMs"),
    generationWallMs: metric("generationWallMs"),
    parseMs: metric("parseMs"),
    validationMs: metric("validationMs"),
    editMs: metric("editMs"),
    loadMs: metric("loadMs"),
    promptMs: metric("promptMs"),
    generationMs: metric("generationMs"),
    outputTokens: metric("outputTokens"),
    decodeTokensPerSecond: metric("decodeTokensPerSecond"),
    failures: [...new Set(samples.flatMap(({ failures }) => failures))],
  };
}

function findEarlyStopReason(samples, fixture) {
  if (samples.length < 3 || samples.length >= runs) {
    return undefined;
  }

  if (samples.every(({ valid }) => !valid)) {
    return "quality-gate";
  }

  if (samples.every(({ wallMs }) => wallMs > fixture.targetMaxMs)) {
    return "latency-gate";
  }

  return undefined;
}

function createPrompt(fixture) {
  return [
    "Replace the requested pseudocode comment with equivalent executable code.",
    "Return one replacement and no explanation.",
    "Implement every numbered step explicitly; do not consolidate repeated steps into a loop.",
    `Language: ${fixture.languageId}`,
    `File: ${fixture.fileName}`,
    `Line: ${fixture.line}`,
    `Pseudocode: ${fixture.pseudocode}`,
    "Current source:",
    fixture.source,
  ].join("\n");
}

async function preloadModel(model) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: -1 }),
    signal: AbortSignal.timeout(5 * 60 * 1_000),
  });

  if (!response.ok) {
    throw new Error(`Could not preload ${model}: HTTP ${response.status}.`);
  }
}

async function unloadModel(model) {
  await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }),
  });
}

function chooseContextSize(fixture) {
  const estimatedInputTokens = Math.ceil(countWords(fixture.pseudocode) * 1.5);
  const required = estimatedInputTokens + fixture.maxOutputTokens + 1_024;

  return Math.min(16_384, nextPowerOfTwo(required));
}

function simulateEdit(fixture, code) {
  if (typeof code !== "string") {
    return;
  }
  if (fixture.id === "whole-file") {
    String(code);
    return;
  }

  const lines = fixture.source.split(/\r?\n/);
  lines.splice(fixture.line, 1, code);
  lines.join("\n");
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(value));
}

function percentile(sortedValues, percentileValue) {
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index];
}

function nanosecondsToMilliseconds(value = 0) {
  return value / 1_000_000;
}

function countWords(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function readList(name, fallback) {
  const value = process.env[name];
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : fallback;
}

function readOutputName() {
  const value = process.env.AIME_BENCH_OUTPUT ?? "latest.json";
  if (!/^[A-Za-z0-9._-]+\.json$/.test(value)) {
    throw new Error("AIME_BENCH_OUTPUT must be a JSON file name without a path.");
  }
  return value;
}

function parseChatResponse(responseText) {
  const items = responseText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const finalItem = items.at(-1);

  if (!finalItem) {
    throw new Error("Ollama returned an empty response.");
  }

  return {
    ...finalItem,
    message: {
      content: items.map((item) => item.message?.content ?? "").join(""),
    },
  };
}
