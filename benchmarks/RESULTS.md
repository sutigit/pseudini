# Local model benchmark

Run date: 2026-08-20  
Hardware: Apple M4 with 16 GB unified memory  
Ollama: 0.24.0

## Method

- Each model was preloaded and kept resident.
- Passing cases used 50 measured requests after two warm-up requests.
- A case stopped after three samples when all samples failed its quality or latency gate.
- End-to-end time includes the complete response stream, JSON parsing, esbuild TypeScript syntax
  validation, correctness checks, and a simulated in-memory edit.
- Temperature was zero. Responses used a strict JSON Schema.

## Decision

`qwen2.5-coder:3b` is the default. It was the fastest model that passed the grounded
general-small quality fixture: 50 of 50 valid responses, 1,369 ms p50, and 1,552 ms p95.
The p95 misses the 1,500 ms upper target by 52 ms.

`qwen2.5-coder:1.5b` reached 726 ms p95 on the same fixture but omitted required behavior in all
three gate samples. `qwen2.5-coder:7b` exceeded the three-second bounded request time.

Exact logging instructions use the deterministic adapter instead of a model request.

## Results

- Exact small logging fixture:
  - 1.5B: 755 ms p95, 100% valid across 50 samples.
  - 3B: 1,607 ms p95, 100% valid across 50 samples.
  - 7B: 3,002 ms p95, 67% valid before the latency gate stopped the case.
- Grounded general-small fixture:
  - 1.5B: 726 ms p95, but failed required `return` and `map` behavior.
  - 3B: 1,552 ms p95, 100% valid across 50 samples.
  - 7B: timed out at 3,000 ms and failed the quality gate.
- Medium proportional-output fixture:
  - No model passed.
  - 1.5B returned incomplete output.
  - 3B and 7B reached the six-second bounded timeout.
- Large proportional-output fixture:
  - No model passed.
  - 1.5B and 3B returned incomplete output.
  - 7B reached the twenty-second bounded timeout.
- Two-hundred-line whole-file fixture:
  - No model passed.
  - 1.5B returned invalid JSON at 173,716 ms p95.
  - 3B omitted required late-file behavior at 13,774 ms p95.
  - 7B reached the 330,000 ms bounded timeout.

The local models do not meet the combined medium, large, or whole-file latency and correctness
gates. Those requests require revised output expectations or the optional direct-provider route.
