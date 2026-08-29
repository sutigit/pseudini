# Pseudini

Pseudini is a Cursor extension that turns developer-written pseudocode into code. It keeps the
developer responsible for the implementation idea while the AI supplies language syntax.

## Use

Run **Pseudini: Write Pseudocode** with the caret on the line before the new code. Pseudini opens
an indented input region in the active file. Type the implementation idea, then press
**Cmd+Enter** on macOS or **Ctrl+Enter** elsewhere. Press **Escape** to cancel. Pseudini replaces
the region with generated code. One **Undo** returns the file to the state it had before the input
opened, including the pseudocode you typed. Escape leaves no undo history.

The inline input supports TypeScript, JavaScript, JSX, TSX, HTML, and CSS. It suggests identifiers
from the active file and language keywords. Suggestions open as you type a word. Temporary
language-specific comment wrappers keep free-form input out of static syntax diagnostics. The
wrapper marks are hidden from view, and the caret stays inside the writable lines so you cannot
edit them. Pseudini removes the wrappers on confirm or
cancel, and cancels the input before a save. The open command has no default keybinding.

The `aime:` comment workflow remains available:

1. Add one or more single-line comments that start with `aime:`.
2. Run **Pseudini: Flesh Out aime: Comments** from the Command Palette or editor context menu.
3. Review the generated edit before you keep it.

```typescript
function activeUserNames(users: User[]): string[] {
  // aime: keep active users and return their names
}
```

Pseudini supports `//`, `#`, `--`, `;`, `/* ... */`, `{/* ... */}` for JSX and TSX, and
`<!-- ... -->` comment forms. Continue
long pseudocode on consecutive line comments that use the same marker. Pseudini replaces the
complete comment range. It processes comments over 600 words as ordered, bounded fragments.

Pseudini indents the generated code to the comment's own indentation and keeps the relative
indentation of nested lines.

Run **Pseudini: Flesh Out Whole Pseudocode File** to convert a pseudocode-only file. Pseudini
processes files in sequential 50-line chunks and applies one undoable edit after all chunks pass.

## Requirements

Pseudini uses a local [Ollama](https://ollama.com/) coding model. Install Ollama, start its local
server, and download the configured model:

```sh
brew install ollama
ollama serve
ollama pull qwen2.5-coder:3b
```

Pseudini keeps the model loaded while the extension is active. It accepts only a loopback Ollama
URL, requests schema-constrained JSON, and applies changes only after validating the response.
The file remains unchanged if generation fails, is cancelled, or the document changes.

## Install in Cursor

Install Pseudini as a normal local extension:

```sh
npm install
npm run install:cursor
```

Run **Developer: Reload Window** in Cursor after installation. Pseudini then works in normal
project windows without the extension debugger. Re-run `npm run install:cursor` and reload Cursor
to update the installed extension after a code change.

If the CLI installs into a different Cursor profile, run
**Extensions: Install from VSIX...**, select `pseudini-local.vsix`, and reload that profile.

## Settings

| Setting | Purpose |
| --------------------- | -------------------------------------------------------------- |
| `pseudini.ollamaUrl` | Local Ollama URL. Defaults to `http://127.0.0.1:11434`. |
| `pseudini.model` | Installed Ollama model. Defaults to `qwen2.5-coder:3b`. |
| `pseudini.largeRequestRoute` | `local`, or `provider` for inputs over 50 words. |
| `pseudini.providerBaseUrl` | HTTPS base URL for an OpenAI-compatible provider. |
| `pseudini.providerModel` | Model ID for the optional provider route. |

For an optional high-throughput provider with Chat Completions JSON Schema support, set the
provider settings, run
**Pseudini: Set API Key**, and select the `provider` route. Pseudini stores each key in Cursor
SecretStorage and binds it to the normalized provider endpoint. Small requests remain local.

### Project configuration

Add `.cursor/pseudini-config.json` to a project to override Pseudini settings for that project:

```json
{
  "ollamaUrl": "http://127.0.0.1:11434",
  "model": "qwen2.5-coder:3b",
  "largeRequestRoute": "local",
  "providerBaseUrl": "",
  "providerModel": ""
}
```

All fields are optional. Project-file values override resource-scoped Cursor settings, which
override Pseudini defaults. Pseudini watches this file and applies changes without reinstalling
the extension. Changing `model` or `ollamaUrl` unloads the previous local model and warms the new
configuration.

Do not put provider API keys in this file. Use **Pseudini: Set API Key** so Cursor SecretStorage
holds the key.

## Speed

Exact instructions such as `log variableName` use a deterministic language adapter and do not call
the model. Other instructions use the warm local model. Open **Pseudini: Performance** in the
Output panel to inspect load, prompt-evaluation, generation, and total durations.

Run the repeatable benchmark suite after downloading all benchmark models:

```sh
ollama pull qwen2.5-coder:1.5b
ollama pull qwen2.5-coder:7b
npm run benchmark
npm run benchmark:whole
```

The benchmark defaults to 50 warm requests for each passing model and fixture. It stops a failing
case after three samples when every sample misses the quality or latency gate. The whole-file
suite reports separately. Use
`AIME_BENCH_RUNS`, `AIME_BENCH_MODELS`, and `AIME_BENCH_CASES` for focused development runs.
See `benchmarks/RESULTS.md` for the measured model decision and limits.

## Context cache

Pseudini extracts imports, declarations, indentation, and live source windows. It writes
deterministic facts to `.aime/cache-v1/` when a document opens or saves. Each entry includes the
source hash and extractor version. Pseudini ignores stale entries and uses the current buffer.
The `.aime/` directory is disposable and excluded from Git and Cursor indexing.

## Observability operations

See `OBSOPS.md` for observability operations. That file starts with a command cheat sheet. It
then covers model installed, loaded, and generating states; Ollama server and logs; token and
timing metrics; macOS CPU, GPU, memory, power, and thermal observation; Cursor extension logs;
cache and privacy inspection; benchmarks; troubleshooting; and product-learning measures.

## Development

Agent notes for this repository are in `AGENTS.md`. History is in `CHANGELOG.md`.

```sh
npm install
npm test
```

Open this folder in Cursor and run the `Run Extension` launch configuration. In the Extension
Development Host, open a source file with an `aime:` comment and run the Pseudini command. This
F5 workflow compiles first and uses the development copy, so it remains the fastest way to test
code changes.

Use `npm run install:cursor` only when testing the packaged extension in a normal Cursor window.

## MVP boundaries

- Pseudini changes only `aime:` comment ranges or the active whole-file command target.
- It reads authoritative source context only from the active file.
- It does not make multi-file edits.
- One command execution creates one undoable editor edit.
