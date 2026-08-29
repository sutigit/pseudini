# Changelog

This file records major changes to Pseudini. Usage, settings, and current limits are in
`README.md`. Model benchmark decisions are in `benchmarks/RESULTS.md`. Observation commands are in
`OBSOPS.md`.

The package version remains `0.1.0`. Dates use the commit dates on `main`.

## 2026-08-29

### Changed

- The inline input hides its comment wrapper marks and keeps the caret inside the writable lines,
  so the marks cannot be edited.
- One `Undo` after an inline confirm restores the file as it was before the input opened. The
  composer replays the editor undo command to drop its own typing history, then applies the
  generated code as a single step. Cancel leaves no undo history. Edits outside the region still use
  a forward delete, because replaying undo there would discard the developer's own edit.

### Fixed

- Inline input opens identifier and keyword suggestions while typing. Comment wrappers had
  suppressed the editor's automatic IntelliSense trigger.

## 2026-08-28

### Added

- Inline pseudocode input for TypeScript, JavaScript, JSX, TSX, HTML, and CSS. The input uses
  decorated plain lines in the active file, grows with typed text, suggests current-file names
  and language keywords, and replaces itself through the existing generation path.
- **Pseudini: Write Pseudocode**, with **Cmd+Enter** / **Ctrl+Enter** to confirm and **Escape** to
  cancel. The open command has no default keybinding.

### Changed

- Inline input now uses temporary language-specific comment wrappers. Free-form pseudocode no
  longer produces static syntax errors, while diagnostics outside the input remain active.
- Reserved words and identifiers already present in the active file receive separate,
  deterministic colors without parsing the pseudocode as code.

## 2026-08-27

### Fixed

- The comment parser now finds `aime:` instructions in JSX and TSX expression comments, for example
  `{/* aime: render each active user */}`. It previously required the comment marker to start the
  line, so the brace container hid the instruction.

## 2026-08-26

### Added

- Local Cursor install path: `npm run install:cursor` packages `pseudini-local.vsix` and installs
  it with `--force`. The F5 **Run Extension** host remains the fast debug path.
- Project configuration at `.cursor/pseudini-config.json`. Optional fields: `ollamaUrl`, `model`,
  `largeRequestRoute`, `providerBaseUrl`, `providerModel`.
- Configuration precedence: project file, then resource-scoped Cursor settings, then package
  defaults.
- Live reload for the project file. A change to `model` or `ollamaUrl` unloads the previous local
  model and warms the new one.
- Validation for invalid JSON, unknown fields, and invalid values. Provider API keys stay in
  Cursor SecretStorage.

### Fixed

- Generated replacements now use the `aime:` comment indentation. Nested lines keep relative
  depth. Column-zero model output no longer starts at the left margin.

## 2026-08-23

### Added

- `OBSOPS.md`: observability operations guide with a command cheat sheet for Ollama, tokens,
  Cursor logs, CPU, GPU, memory, power, cache, and troubleshooting.

### Changed

- Moved the long observation stack out of `README.md`. The README keeps a short pointer to
  `OBSOPS.md`.

## 2026-08-20

### Added

- MVP Cursor extension: replace `aime:` comments with generated code from a command.
- Comment parser for `//`, `#`, `--`, `;`, `/* ... */`, and `<!-- ... -->`.
- Multiline `aime:` comments that use the same line-comment marker.
- Whole-file command that converts a pseudocode file in sequential 50-line chunks.
- Local Ollama transport with loopback URL checks, JSON Schema output, health checks, preload, and
  `keep_alive` while the extension is active.
- Optional OpenAI-compatible provider route for comments over 50 words and whole-file chunks.
  Keys bind to the normalized HTTPS endpoint in SecretStorage.
- Deterministic adapter for exact `log identifier` instructions (no model call).
- Live file context: imports, declarations, indentation, and scoped source windows.
- Hash-invalidated `.aime/cache-v1/` fact cache.
- Request chunking for comments over 600 words, replacement fragment merge, and a single undoable
  edit per command.
- Performance output channel with load, prompt, generation, wall time, and token counts.
- Benchmark harness and `benchmarks/RESULTS.md`. Default local model: `qwen2.5-coder:3b`.

### Changed

- Generation path moved from `vscode.lm`, then Cursor CLI, to a warm local Ollama server. The CLI
  path required workspace trust and started too slowly for the latency targets.

### Removed

- Direct `vscode.lm` language-model client.
- Cursor CLI agent client (`src/cursorAgent.ts`).
