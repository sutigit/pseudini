# Changelog

This file records major changes to Pseudini. Usage, settings, and current limits are in
`README.md`. Model benchmark decisions are in `benchmarks/RESULTS.md`. Observation commands are in
`OBSOPS.md`.

The package version remains `0.1.0`. Dates use the commit dates on `main`.

## 2026-08-31

### Added

- A hint chip beside the caret in the inline input. It reads `Esc cancels · Pseudini ⌘↵` while you
  type, and a spinner plus `Generating syntax` while a run is in flight. It appears on typing or a
  caret move, and it goes away after about two seconds of quiet, when the caret leaves the draft, or
  when the window loses focus. The spinner is frame-based text, because decorations accept no CSS
  animation.

### Fixed

- Escape ends the whole inline input again. An edit that crossed a wrapper mark, such as a
  Backspace at the start of the draft, used to end the session and leave the comment and the typed
  text in the file, where Escape could no longer reach them. Such an edit now removes the region, or
  replays undo when the marks no longer match. Cancel also closes the suggestion widget, and a
  forward delete only removes a range that still holds the composer's own marks.
- The inline input colors and suggests only names the language service reports, through the
  document semantic token and document symbol providers. A text scan had made every word of a
  comment, string, or markup text a "known name", so prose in the draft looked like code. Languages
  without a semantic token provider fall back to document symbols, and colour keywords only when
  neither provider answers.

### Changed

- The inline input no longer colours language keywords such as `const` and `return`. Those words
  stay in the suggestion list. The draft still colours names the language service reports.
- Replaced the comment marker with `pseudini:` across parsing, commands, tests, benchmarks, and
  documentation.
- Moved the disposable context cache into `.cursor/pseudini/cache-v1/`.
- Standardized benchmark environment variables on the `PSEUDINI_BENCH_` prefix.

## 2026-08-29

### Changed

- The inline input hides its comment wrapper marks and keeps the caret inside the writable lines,
  so the marks cannot be edited.
- Draft text in the inline input uses the normal editor foreground instead of the dim italic comment
  style. Keyword, identifier, and plain ranges stay disjoint so each keeps its own color.
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

- The comment parser now finds `pseudini:` instructions in JSX and TSX expression comments, for
  example `{/* pseudini: render each active user */}`. It previously required the comment marker
  to start the line, so the brace container hid the instruction.

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

- Generated replacements now use the `pseudini:` comment indentation. Nested lines keep relative
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

- MVP Cursor extension: replace `pseudini:` comments with generated code from a command.
- Comment parser for `//`, `#`, `--`, `;`, `/* ... */`, and `<!-- ... -->`.
- Multiline `pseudini:` comments that use the same line-comment marker.
- Whole-file command that converts a pseudocode file in sequential 50-line chunks.
- Local Ollama transport with loopback URL checks, JSON Schema output, health checks, preload, and
  `keep_alive` while the extension is active.
- Optional OpenAI-compatible provider route for comments over 50 words and whole-file chunks.
  Keys bind to the normalized HTTPS endpoint in SecretStorage.
- Deterministic adapter for exact `log identifier` instructions (no model call).
- Live file context: imports, declarations, indentation, and scoped source windows.
- Hash-invalidated `.cursor/pseudini/cache-v1/` fact cache.
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
