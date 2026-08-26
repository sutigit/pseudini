# Observability operations

This guide is the observability operations reference for Pseudini. Use it to inspect the
extension, Ollama, the local model, and Mac hardware. Distinguish installed, loaded, and
generating model states before you assign a cause.

## Command cheat sheet

Copy these commands first. The rest of this file explains how to interpret the output.

### Health and model state

```sh
curl -fsS http://127.0.0.1:11434/api/version
ollama list
ollama ps
lsof -nP -iTCP:11434 -sTCP:LISTEN
pgrep -fl 'ollama serve'
```

| Goal | Command |
| ---- | ------- |
| Show model metadata | `ollama show qwen2.5-coder:3b --verbose` |
| Show runner allocation as JSON | `curl -fsS http://127.0.0.1:11434/api/ps \| python3 -m json.tool` |
| Unload the model, keep the server | `ollama stop qwen2.5-coder:3b` |
| Watch loaded models once per second | `while true; do clear; date; ollama ps; sleep 1; done` |

### Installed extension and project configuration

```sh
code --list-extensions --show-versions | rg '^pseudini\.pseudini@'
python3 -m json.tool .cursor/pseudini-config.json
ollama ps
```

The extension list confirms installation, but a non-default Cursor profile can have a separate
extension registry. Use **Developer: Show Running Extensions** in the project window to confirm
that Pseudini is active in that profile.

After changing `.cursor/pseudini-config.json`, check **Pseudini: Performance** for:

```text
[info] project configuration changed file=...
[info] preloaded model=... wallMs=...
```

The preloaded model must match the project file. Project-file values take priority over
resource-scoped Cursor settings. See `README.md` for installation and configuration instructions.

### Logs and extension metrics

Open **View > Output**, then select **Pseudini: Performance**.

```sh
tail -f /opt/homebrew/var/log/ollama.log
rg -l 'preloaded model=|promptTokens=|deterministic totalMs=' \
  "$HOME/Library/Application Support/Cursor/logs"
code --status
code --list-extensions --show-versions | rg '^pseudini\.pseudini@'
```

Follow the newest Pseudini performance log:

```sh
LATEST_LOG="$(
  ls -t "$HOME/Library/Application Support/Cursor/logs"/*/window*/exthost/\
pseudini.pseudini/"Pseudini Performance.log" 2>/dev/null |
  sed -n '1p'
)"
[[ -n "$LATEST_LOG" ]] && tail -f "$LATEST_LOG"
```

Local metric line:

```text
[info] model=... wallMs=... ollamaMs=... loadMs=... promptMs=... generationMs=...
promptTokens=... outputTokens=...
```

Derived rates:

```text
prompt tokens/second = 1000 * promptTokens / promptMs
output tokens/second = 1000 * outputTokens / generationMs
overhead = wallMs - ollamaMs
```

### CPU, GPU, memory, and power

Activity Monitor: **CPU**, **Memory**, **Energy**, **Window > CPU History**,
**Window > GPU History**.

```sh
ps -axo pid,ppid,%cpu,%mem,rss,vsz,etime,state,command |
  rg '[o]llama serve|[o]llama runner'
memory_pressure -Q
vm_stat
sysctl vm.swapusage
pmset -g batt
```

Administrator samples (estimated power, not device-to-device comparison):

```sh
sudo powermetrics \
  --samplers battery,cpu_power,gpu_power,ane_power,thermal \
  --sample-rate 1000 \
  --sample-count 10 \
  --show-process-gpu \
  --show-process-energy
```

### Storage, cache, network, and tests

```sh
du -sh ~/.ollama ~/.ollama/models .aime 2>/dev/null
python3 -m json.tool .aime/cache-v1/manifest.json
lsof -nP -iTCP:11434
npm test
npm run benchmark
```

Focused benchmark:

```sh
AIME_BENCH_RUNS=5 \
AIME_BENCH_WARMUPS=1 \
AIME_BENCH_MODELS=qwen2.5-coder:3b \
AIME_BENCH_CASES=small-general \
AIME_BENCH_OUTPUT=local-check.json \
npm run benchmark
```

### Isolate Ollama from Pseudini

```sh
ollama run qwen2.5-coder:3b \
  --verbose \
  --think=false \
  'Reply with the single word ready.'
```

## Observation path

Use this path from the editor command to the model runner and the Mac hardware:

1. Cursor activates the extension and opens the **Pseudini: Performance** output channel.
2. Pseudini checks Ollama and preloads the configured model.
3. Pseudini parses the `aime:` instructions and selects the deterministic, local-model, or
   provider route.
4. A local request is queued and sent to Ollama with a JSON Schema.
5. Ollama evaluates the prompt and generates replacement tokens.
6. Pseudini validates the response, checks the document version, and applies one editor edit.
7. macOS supplies CPU, GPU, unified memory, storage, and power to the Ollama runner.

Observe more than one layer before assigning a cause. For example, a slow command can come from
model loading, prompt evaluation, token generation, queueing, memory pressure, thermal pressure,
or extension overhead.

## Three different model states

Do not use "running" for all model states. Distinguish these states:

- **Installed:** Model files exist on disk. `ollama list` shows the model.
- **Loaded:** A runner has mapped the model into memory. `ollama ps` or `GET /api/ps` shows it.
- **Generating:** A request is actively using the runner. Confirm this from the Pseudini progress
  notification or log, plus a temporary CPU/GPU/power increase. Ollama does not expose a
  dedicated `busy` field in `ollama ps`.

Pseudini requests `keep_alive: -1`, so its configured local model normally stays loaded while the
extension is active. The `UNTIL` column can therefore show `Forever`.

## One-minute health check

Run this from any terminal:

```sh
printf 'Ollama version: '
curl -fsS http://127.0.0.1:11434/api/version
printf '\n\nInstalled models:\n'
ollama list
printf '\nLoaded models:\n'
ollama ps
printf '\nListening process:\n'
lsof -nP -iTCP:11434 -sTCP:LISTEN
```

Healthy output has these properties:

- `/api/version` returns JSON instead of a connection error.
- `ollama list` contains the value of `pseudini.model`.
- `ollama ps` contains that model after Pseudini activates.
- `lsof` shows one Ollama process listening on `127.0.0.1:11434`.
- **Pseudini: Performance** contains an `[info] preloaded model=...` line.

The server can be healthy while no model is loaded. That is an idle server, not an outage.

## Observe the Ollama server

Check whether the server process and port exist:

```sh
pgrep -fl 'ollama serve'
lsof -nP -iTCP:11434 -sTCP:LISTEN
curl -fsS http://127.0.0.1:11434/api/version
```

Interpret the results:

- No process and a failed `curl` mean that Ollama is off.
- A process without a listening port means startup failed or the configured host differs.
- A listening port with a successful version response means the API is on.
- More than one attempted server often causes an "address already in use" error.

This Mac runs Ollama as a Homebrew launchd service. Inspect that service without starting another
server:

```sh
launchctl print "gui/$(id -u)/homebrew.mxcl.ollama" |
  rg 'state =|pid =|last exit code|program =|stdout path|stderr path'
```

For this Homebrew layout, server output is written to:

```sh
tail -f /opt/homebrew/var/log/ollama.log
```

Other installations have different log sources:

- Ollama.app: `~/.ollama/logs/server.log` and `~/.ollama/logs/app.log`.
- Manual `ollama serve`: the terminal that started the process.
- Homebrew service: use the `stdout path` and `stderr path` from `launchctl print`.

Do not run `ollama serve` manually when the Homebrew service or Ollama.app already owns the port.

## Observe installed and loaded models

List downloaded models and their disk sizes:

```sh
ollama list
du -sh ~/.ollama/models
```

Inspect the selected model:

```sh
ollama show qwen2.5-coder:3b --verbose
ollama show qwen2.5-coder:3b --parameters
ollama show qwen2.5-coder:3b --template
ollama show qwen2.5-coder:3b --system
ollama show qwen2.5-coder:3b --license
```

The verbose output describes architecture, parameter count, quantization, supported capabilities,
native context length, embedding length, metadata, and model digest. The native context length is
not necessarily the context allocated to the active runner.

Show the runner allocation:

```sh
ollama ps
curl -fsS http://127.0.0.1:11434/api/ps | python3 -m json.tool
```

Important fields are:

- `PROCESSOR`: `100% GPU` is the expected fast path on Apple Silicon. A CPU/GPU split or
  `100% CPU` is slower.
- `CONTEXT` or `context_length`: the context allocated to the loaded runner.
- `SIZE` and `size_vram`: bytes allocated to the model runner. On Apple Silicon, this comes from
  unified memory, not separate physical VRAM.
- `expires_at` or `UNTIL`: when Ollama can unload the model. Pseudini's negative keep-alive
  produces a far-future value or `Forever`.
- `digest`: identifies the exact model content and helps detect an unexpected model update.
- `quantization_level`: affects memory, speed, and quality.

Unload only the model, while leaving the server on:

```sh
ollama stop qwen2.5-coder:3b
```

Pseudini can load it again on the next request. Changing `pseudini.model` also unloads the old
model and warms the new one.

## Watch model state live

macOS does not include the `watch` command by default. Use a shell loop:

```sh
while true; do
  clear
  date
  ollama ps
  sleep 1
done
```

Press Control-C to stop. In a second terminal, trigger a Pseudini command. Watch for a model
appearing, its processor split, context allocation, and its keep-alive value.

## Observe Pseudini inside Cursor

Open **View > Output**, then select **Pseudini: Performance**.

A successful local request produces a line with this shape:

```text
[info] model=qwen2.5-coder:3b wallMs=... ollamaMs=... loadMs=... promptMs=...
generationMs=... promptTokens=... outputTokens=...
```

Other useful messages include:

```text
[info] preloaded model=qwen2.5-coder:3b wallMs=...
[info] deterministic totalMs=0 replacements=1
[warn] preload failed: ...
[warn] context cache: ...
[info] provider model=... wallMs=...
```

Interpret each local metric:

- `wallMs`: Time observed by the extension after the local request leaves its queue.
- `ollamaMs`: Ollama's `total_duration`, converted from nanoseconds to milliseconds.
- `loadMs`: Time spent loading the model. A warm request should make this small.
- `promptMs`: Time spent evaluating the complete prompt.
- `generationMs`: Time spent decoding output tokens.
- `promptTokens`: Input tokens processed by Ollama.
- `outputTokens`: Output tokens generated by Ollama.

The prompt tokens include Pseudini instructions, file facts, live source context, and the
pseudocode. They are not the word count of the `aime:` comment. The output count includes the JSON
wrapper as well as generated code.

Calculate useful derived metrics:

```text
prompt tokens/second = 1000 * promptTokens / promptMs
output tokens/second = 1000 * outputTokens / generationMs
approximate extension and HTTP overhead = wallMs - ollamaMs
load share = loadMs / wallMs
```

Treat a negative overhead result as measurement noise or a difference in timing boundaries. Do
not compare a single request. Compare p50 and p95 over repeated requests.

Performance signals and likely meanings:

- Large `loadMs`: the model was cold, evicted, changed, or could not stay resident.
- Large `promptTokens`: the selected live scope or pseudocode became larger.
- Large `promptMs` with normal generation speed: prompt processing is the bottleneck.
- Normal prompt time with low output tokens/second: decoding, thermal pressure, memory pressure,
  CPU fallback, or model size is the likely bottleneck.
- `outputTokens` repeatedly reaching a configured limit: output can be truncated.
- Large `wallMs - ollamaMs`: extension, HTTP, process scheduling, or queue effects need
  investigation.
- No local metric during `log identifier`: expected, because the deterministic adapter bypasses
  Ollama.
- A provider log without Ollama activity: expected when the provider route handles a large
  request.

Pseudini serializes local requests. The current log starts after queueing, so it does not expose
queue-wait time. Provider logs expose wall time but not provider token usage.

## Read Pseudini logs from Terminal

Cursor stores each window's extension output under its log root. Find all Pseudini performance
logs:

```sh
LOG_ROOT="$HOME/Library/Application Support/Cursor/logs"
rg -l 'preloaded model=|promptTokens=|deterministic totalMs=' "$LOG_ROOT"
```

Follow the newest Pseudini output log:

```sh
LATEST_LOG="$(
  ls -t "$HOME/Library/Application Support/Cursor/logs"/*/window*/exthost/\
pseudini.pseudini/"Pseudini Performance.log" 2>/dev/null |
  sed -n '1p'
)"

if [[ -n "$LATEST_LOG" ]]; then
  echo "$LATEST_LOG"
  tail -f "$LATEST_LOG"
else
  echo "No Pseudini performance log exists yet."
fi
```

If no log exists:

1. Confirm that Pseudini is installed and enabled.
2. Reload Cursor.
3. Run a Pseudini command once.
4. Open **Developer: Show Running Extensions**.
5. Open **Developer: Show Logs... > Extension Host**.
6. Use **Developer: Toggle Developer Tools** for extension-host startup failures.

Check Cursor and extension processes:

```sh
code --status
code --list-extensions --show-versions | rg '^pseudini\.pseudini@'
```

`code --status` reports Cursor version, system memory, load averages, GPU feature status, and
per-process CPU and memory for Cursor helpers. The helper named `extension-host` contains the
running extension, but Ollama inference runs in a separate `ollama runner` process.

## Observe raw Ollama token and timing metrics

The Ollama API returns these usage fields:

- `total_duration`
- `load_duration`
- `prompt_eval_count`
- `prompt_eval_duration`
- `eval_count`
- `eval_duration`

The durations are nanoseconds. Pseudini converts them to milliseconds before logging.

Use a harmless direct request to verify Ollama separately from Pseudini:

```sh
curl -fsS http://127.0.0.1:11434/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen2.5-coder:3b",
    "stream": false,
    "think": false,
    "keep_alive": "5m",
    "messages": [
      {"role": "user", "content": "Reply with the single word ready."}
    ],
    "options": {"temperature": 0}
  }' |
  python3 -m json.tool
```

Or use the CLI timing display:

```sh
ollama run qwen2.5-coder:3b \
  --verbose \
  --think=false \
  'Reply with the single word ready.'
```

These calls isolate Ollama, model loading, and decoding. They do not reproduce Pseudini's
structured schema, context extraction, validation, or editor edit.

## Observe CPU usage

Use Activity Monitor:

1. Open **Applications > Utilities > Activity Monitor**.
2. Select the **CPU** tab.
3. Search for `ollama`.
4. Trigger a Pseudini model request.
5. Compare the server process and the `ollama runner` child process.
6. Use **Window > CPU History** for a graph across all CPU cores.

Use Terminal for a one-time process snapshot:

```sh
ps -axo pid,ppid,%cpu,%mem,rss,vsz,etime,state,command |
  rg '[o]llama serve|[o]llama runner'
```

Follow only the current runner:

```sh
RUNNER_PID="$(pgrep -n -f 'ollama runner')"
if [[ -n "$RUNNER_PID" ]]; then
  top -pid "$RUNNER_PID" -l 0 -s 1 \
    -stats pid,command,cpu,mem,rsize,vsize,threads,power,state,time
else
  echo "No model runner is loaded."
fi
```

Press Control-C to stop. On macOS, a process can exceed 100% CPU because the percentage can cover
multiple logical cores.

GPU inference still uses some CPU for HTTP handling, tokenization, sampling, and orchestration.
Use `ollama ps` to identify the inference processor split instead of assuming that CPU activity
means CPU-only inference.

## Observe GPU and Neural Engine usage

Ollama uses Metal for GPU acceleration on Apple Silicon.

For a visual graph, open Activity Monitor and choose **Window > GPU History**. Trigger the same
request several times and compare idle, prompt evaluation, and generation periods.

For terminal sampling, use `powermetrics`. It requires administrator privileges:

```sh
sudo powermetrics \
  --samplers cpu_power,gpu_power,ane_power,thermal \
  --sample-rate 1000 \
  --sample-count 10 \
  --show-process-gpu \
  --show-process-energy
```

This captures ten one-second samples. Relevant output includes CPU, GPU, and ANE frequency and
estimated power, thermal notifications, per-process GPU time, and process energy impact.

The ANE can remain idle because Ollama's Apple acceleration uses Metal on the GPU. Do not use
`nvidia-smi` on Apple Silicon.

## Observe power, energy, battery, and thermals

Activity Monitor's **Energy** tab shows **Energy Impact**, which is a relative score rather than
watts. Search for Ollama and Cursor, then compare idle and request periods.

Check battery and power-source state:

```sh
pmset -g batt
```

Include battery and thermal data in a power capture:

```sh
sudo powermetrics \
  --samplers battery,cpu_power,gpu_power,ane_power,thermal \
  --sample-rate 1000 \
  --sample-count 30 \
  --show-process-energy \
  --show-usage-summary
```

`powermetrics` reports estimated subsystem power. Apple warns that these estimates can be
inaccurate. Use them to optimize this application on the same Mac. Do not use them to compare
different devices.

For a valid comparison:

1. Use the same model, fixture, context, and output limit.
2. Let the Mac return to an idle baseline.
3. Record whether it is on battery or external power.
4. Record thermal state and memory pressure.
5. Run enough samples to compare distributions, not one request.
6. Keep other AI workloads and model runners closed.

## Observe RAM, unified memory, compression, and swap

Apple Silicon shares physical memory between CPU and GPU. Do not add process RSS and
`size_vram` as if they were independent allocations. Shared mappings can appear in more than one
process.

Use Activity Monitor's **Memory** tab. Prioritize:

- **Memory Pressure:** green is healthy; sustained yellow or red indicates pressure.
- **Swap Used:** disk-backed memory can sharply increase latency.
- **Compressed:** rapid growth indicates that macOS is reclaiming RAM.
- **Memory:** inspect both `ollama serve` and `ollama runner`.

Terminal snapshots:

```sh
memory_pressure -Q
vm_stat
sysctl vm.swapusage
top -l 1 -n 0
```

Follow virtual-memory counters once per second:

```sh
vm_stat 1
```

Check the runner's resident memory in KiB:

```sh
RUNNER_PID="$(pgrep -n -f 'ollama runner')"
if [[ -n "$RUNNER_PID" ]]; then
  ps -o pid,ppid,%cpu,%mem,rss,vsz,etime,state,command -p "$RUNNER_PID"
fi
```

Watch for increasing compression, swap-outs, falling output tokens/second, and model eviction.
Together, these indicate that model size or context allocation is too high for the available
unified memory.

## Observe model storage, cache storage, and file activity

Check storage consumed by Ollama, Pseudini's generated cache, and the packaged extension:

```sh
du -sh ~/.ollama ~/.ollama/models .aime pseudini-0.1.0.vsix 2>/dev/null
df -h .
ollama list
```

Inspect the generated context-cache manifest:

```sh
python3 -m json.tool .aime/cache-v1/manifest.json
ls -lt .aime/cache-v1/files
```

Each record contains deterministic file facts and a source-content hash. It does not contain an
AI-written summary, but it can contain imports, signatures, identifiers, and file paths. Treat it
as code metadata.

Confirm that Git and Cursor ignore the cache:

```sh
git check-ignore -v .aime/cache-v1/manifest.json
```

To diagnose cache behavior:

- Save or open a source file and check the manifest timestamp.
- Change the source and run Pseudini before saving; the live buffer remains authoritative.
- Compare the manifest hash with the source state when diagnosing a stale entry.
- Delete `.aime/` to force disposable cache regeneration.

## Observe network and privacy boundaries

Local inference should use loopback only:

```sh
lsof -nP -iTCP:11434
```

The listener should be `127.0.0.1:11434`. Pseudini rejects non-loopback Ollama URLs and rejects
HTTP redirects for local requests.

Inspect Ollama network activity by process:

```sh
SERVER_PID="$(pgrep -n -f 'ollama serve')"
if [[ -n "$SERVER_PID" ]]; then
  nettop -p "$SERVER_PID"
fi
```

Press `q` to exit `nettop`.

Privacy behavior differs by route:

- **Deterministic route:** No model request.
- **Local route:** Source context goes to the loopback Ollama server.
- **Provider route:** The prompt and selected source context leave the Mac over HTTPS.

Provider API keys are stored in Cursor SecretStorage and are not written to Pseudini logs.
Provider logs currently contain provider model and wall time, but not token counts. Use the
provider's usage dashboard for billing and token evidence.

Do not paste source-bearing Ollama logs, cache files, provider responses, or observation captures
into public issues without reviewing and redacting them.

## Observe the extension package and development build

Check source compilation, unit tests, packaging, and the VSIX contents:

```sh
npm run check
npm test
npm run package
unzip -l pseudini-0.1.0.vsix
```

Measure build and test process resources:

```sh
/usr/bin/time -l npm test
```

Inspect the current package and installation:

```sh
node -p "require('./package.json').version"
code --list-extensions --show-versions | rg '^pseudini\.pseudini@'
code --status
```

Check repository state before comparing builds:

```sh
git status --short
git diff --check
git rev-parse --short HEAD
```

Record the Git revision, package version, Cursor version, Ollama version, model digest, and macOS
version with every performance result. Otherwise, two measurements might describe different
systems.

## Run focused performance observations

Do not start with the full benchmark. Run one model and one representative fixture:

```sh
AIME_BENCH_RUNS=5 \
AIME_BENCH_WARMUPS=1 \
AIME_BENCH_MODELS=qwen2.5-coder:3b \
AIME_BENCH_CASES=small-general \
AIME_BENCH_OUTPUT=local-check.json \
npm run benchmark
```

Inspect the machine-readable result:

```sh
python3 -m json.tool benchmarks/results/local-check.json
```

The result separates:

- End-to-end `wallMs`
- Generation-response time
- JSON parsing
- Syntax and correctness validation
- Simulated editor edit
- Model loading
- Prompt evaluation
- Output generation
- Prompt and output token counts
- Decode tokens/second
- Quality rate and failure reasons

Use `AIME_BENCH_DEBUG=1` only with non-sensitive fixtures. It prints generated model output.

Run the whole-file suite separately:

```sh
AIME_BENCH_RUNS=3 \
AIME_BENCH_MODELS=qwen2.5-coder:3b \
npm run benchmark:whole
```

Benchmarks preload and unload models. Do not run them at the same time as interactive Pseudini
tests or unrelated local AI workloads.

Historical benchmark decisions belong in `benchmarks/RESULTS.md`. Keep raw generated JSON under
`benchmarks/results/`; that directory is ignored because runs are machine-specific.

## Repeatable observation session

Before a test, capture the environment:

```sh
date
sw_vers
system_profiler SPHardwareDataType
code --status
ollama --version
ollama list
ollama ps
memory_pressure -Q
pmset -g batt
git rev-parse --short HEAD
git status --short
```

During a test, use separate terminals:

1. Follow the Pseudini performance log.
2. Refresh `ollama ps`.
3. Follow the Ollama server log.
4. Sample CPU, GPU, memory, power, and thermal state.
5. Trigger exactly one known fixture.

After the test:

1. Save the benchmark JSON or copy the redacted Pseudini metric line.
2. Record whether the output passed syntax and behavior checks.
3. Record model state, processor split, context length, memory pressure, and thermal state.
4. Record whether the edit was accepted, changed, undone, or cancelled.
5. Stop observation tools so they do not affect the next run.

## Troubleshooting by symptom

### The Pseudini command is missing

- Run `code --list-extensions --show-versions | rg '^pseudini\.pseudini@'`.
- For development, press F5 with **Run Extension** selected.
- Use **Developer: Show Running Extensions**.
- Inspect the Extension Host log.

### Ollama is unreachable

- Run `curl -fsS http://127.0.0.1:11434/api/version`.
- Check `lsof -nP -iTCP:11434 -sTCP:LISTEN`.
- Inspect the server log.
- Start only the installation mode you use: Homebrew service, Ollama.app, or manual server.

### The configured model is not installed

- Compare `pseudini.model` with `ollama list`.
- Run `ollama pull qwen2.5-coder:3b`.
- Reload Cursor and check the preload log.

### The model is installed but not loaded

- Run `ollama ps`.
- Confirm that the extension activated.
- Check for `preloaded model=` or `preload failed:`.
- Trigger one non-deterministic Pseudini request.

### The deterministic example does not use Ollama

- This is expected for exact forms such as `log identifier`.
- Check for `deterministic totalMs=0`.
- Use `keep active users and return their names` to exercise the model route.

### Every request has large load time

- Confirm that `ollama ps` keeps the model loaded.
- Check whether other models are competing for unified memory.
- Inspect memory pressure, compression, and swap.
- Check for extension reloads or model-setting changes.

### Generation is slow

- Calculate output tokens/second from the Pseudini log.
- Check `PROCESSOR` in `ollama ps`.
- Compare prompt time with generation time.
- Sample thermal pressure and GPU power.
- Close competing local AI workloads.
- Reduce model size or context only after measuring quality impact.

### Prompt evaluation is slow

- Compare `promptTokens` across runs.
- Inspect the active file and `.aime` cache facts.
- Check whether the instruction references ambiguous distant code.
- Compare a small fixture with the same loaded model.

### The Mac swaps or becomes unresponsive

- Stop the active request.
- Check Memory Pressure and Swap Used.
- Unload unused models with `ollama stop MODEL`.
- Reduce concurrent local AI workloads.
- Avoid increasing context or parallelism on the 16 GB machine without measurement.

### A request is cancelled

- Pseudini cancels when the user cancels, the extension disposes, or the document changes during
  sequential generation.
- Review the Cursor notification and Pseudini error.
- Run the command again against an unchanged document.

### Local Ollama is idle during a large request

- Check `pseudini.largeRequestRoute`.
- A `provider` route intentionally bypasses local inference.
- Look for a `provider model=...` metric.

### The generated context appears stale

- Confirm that the current editor buffer contains the expected code.
- Inspect `.aime/cache-v1/manifest.json`.
- Delete `.aime/` and reopen the file.
- Pseudini rejects cache records whose content hash does not match.

## Observe whether Pseudini solves the business problem

Machine performance is necessary but not sufficient. The product goal is to preserve developer
reasoning, implementation memory, and architecture learning while automating syntax.

The extension does not collect product telemetry. Use a local, opt-in observation journal without
source code, prompts, generated code, or secrets. Suggested fields are:

```text
timestamp
git_revision
task_class
route
model
pseudocode_word_count
prompt_tokens
output_tokens
wall_ms
output_tokens_per_second
accepted_without_change
manual_edit_count
undo_count
syntax_pass
behavior_pass
developer_explanation_score_1_to_5
next_day_recall_score_1_to_5
architecture_location_score_1_to_5
```

Useful product measures:

- **First-pass correctness:** Percentage of outputs that pass syntax and behavior checks.
- **Correction ratio:** Manual lines changed after generation divided by generated lines.
- **Undo rate:** Percentage of generated edits that developers reject.
- **Time to accepted code:** Command start to accepted, tested implementation.
- **Pseudocode fidelity:** Percentage of stated requirements present in the result.
- **Explanation score:** Can the developer explain each generated line without assistance?
- **Recall score:** Can the developer reproduce the approach the next day?
- **Architecture location score:** Can the developer identify where the behavior belongs and why?
- **Dependency awareness:** Can the developer name the types, modules, and side effects involved?

Compare Pseudini with a baseline workflow:

1. Select similar tasks and define correctness checks before implementation.
2. Use Pseudini for one set and full AI implementation for another.
3. Keep model, developer, repository familiarity, and task complexity as stable as possible.
4. Measure immediate correctness and time.
5. Ask the developer to explain the implementation without AI.
6. Repeat the explanation or implementation after a delay.
7. Compare recall, architecture understanding, correction ratio, and completion time.

Avoid optimizing only for latency. A faster model that omits behavior does not meet the product
goal. `benchmarks/RESULTS.md` records why the 3B model was selected over the faster 1.5B model.

## Current observation blind spots

Pseudini intentionally avoids logging source and generated code, but this leaves some gaps:

- No correlation or request ID across Cursor, Pseudini, and Ollama logs.
- No explicit queue-wait metric.
- No cache hit/miss or context-size event.
- No validation and editor-edit duration in normal extension logs.
- No provider token count, cost, or provider-side latency breakdown.
- No automatic record of acceptance, undo, manual correction, or learning outcomes.
- No direct extension attribution for GPU power or unified-memory allocation.
- Deterministic `totalMs=0` means "no model timing," not literal end-to-end zero time.

Recommended future instrumentation is a local, structured JSONL event stream with request IDs,
route, model digest, cache status, queue time, component timings, token counts, validation result,
and redacted error category. Keep source, prompts, generated code, file contents, and API keys out
of that stream. Make product-learning observations opt-in and local by default.

## Observation references

- Ollama CLI: <https://docs.ollama.com/cli>
- Ollama running-model API: <https://docs.ollama.com/api/ps>
- Ollama usage metrics: <https://docs.ollama.com/api/usage>
- Ollama macOS files and logs: <https://docs.ollama.com/macos>
- Ollama Apple GPU support: <https://docs.ollama.com/gpu>
- Apple Activity Monitor: <https://support.apple.com/guide/activity-monitor/welcome/mac>
- Apple CPU activity:
  <https://support.apple.com/guide/activity-monitor/view-cpu-activity-actmntr43452/mac>
- Apple memory usage:
  <https://support.apple.com/guide/activity-monitor/view-memory-usage-actmntr1004/mac>
- Apple GPU activity:
  <https://support.apple.com/guide/activity-monitor/view-gpu-activity-actm9329b315/mac>
- Apple energy usage:
  <https://support.apple.com/guide/activity-monitor/view-energy-consumption-actmntr43697/mac>
