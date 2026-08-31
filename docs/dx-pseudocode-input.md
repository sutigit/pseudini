# DX: pseudocode input (rough plan)

Status: historical sketch. Locked product choices and the implementation architecture are in
[`inline-composer.md`](./inline-composer.md). Keep this file as the option list and rejected
hosts. Do not treat the Option A verdict below as current.

Product goal stays the same as `AGENTS.md`: the developer writes the idea; the local model
writes syntax for the active file. This sketch is about making that idea easier to enter.

## Vision

1. A key command opens an input.
2. The developer types pseudocode. No `pseudini:` comment is required in the source file.
3. The input highlights reserved words for the language under work.
4. The input suggests names from the current file (variables, functions, objects, and similar).
5. Closing the input sends the text to the existing local LLM path and inserts one undoable edit
   at the cursor (or around the current selection).

First languages: TypeScript, JavaScript, JSX, TSX, HTML, CSS.

Later: keyword packs as plugins so other languages can be added without rewriting the input.

Keep the current `pseudini:` comment command. Treat it as the fallback and as a way to store the idea
in the file.

## Current DX (do not throw away)

- Command: **Pseudini: Flesh Out pseudini: Comments**
- Trigger: comments that start with `pseudini:`
- Generation: local Ollama, optional provider for large requests
- Edit: one undoable replacement, comment indentation preserved

Reuse `generationService`, `fileContext`, `indentation`, and the document-version guard. Do not
invent a second model stack.

---

## 1. What kind of input system could we create?

Pick one default. Strike or reorder the others.

### Option A — Scratch editor (native VS Code buffer)

Open an untitled document (or a view-column beside the file) with `languageId` set to the active
file language.

- Pros: real editor keybindings, native highlight, native completion, cheap to ship
- Cons: feels like another tab; easy to lose; less “palette” magic
- Verdict: **[x] recommended first slice**

### Option B — Webview composer (modal / panel)

A small webview next to the cursor or in a side panel. Confirm / Escape closes it and runs
generation.

- Pros: full control of layout, can look like a dedicated “write the idea” box
- Cons: reimplement editor basics (keys, undo, a11y); highlight and complete are extra work
- Verdict: **[ ] later, if A feels too heavy**

### Option C — Peek / inline widget

A peek-style widget over the current line.

- Pros: stays in the file
- Cons: VS Code peek APIs are limited; multiline editing is awkward
- Verdict: **[ ] probably skip**

### Option D — Input box / Quick Pick

`showInputBox` or a Quick Pick.

- Pros: one command, familiar
- Cons: one line, no highlight, no real completion
- Verdict: **[ ] reject for this vision**

### Option E — Keep writing in the file, hide `pseudini:`

Snippet or command inserts a region; a CodeLens / decoration says “Pseudini”. Still a comment
under the hood.

- Pros: almost no new UI; idea stays in git
- Cons: still a comment; weak match to “do not write pseudini:”
- Verdict: **[ ] optional parallel, not the main path**

### Suggested close / cancel rules (edit these)

- Confirm: `Cmd+Enter` / `Ctrl+Enter` (and a Confirm button if webview)
- Cancel: `Escape` — no model call, no file change
- Empty input: treat as cancel
- Target: replace the current selection, or insert at the cursor if there is no selection
- Still one undoable edit
- If the file changes while the model runs: abort, same as today

### Suggested command

- Title: **Pseudini: Write pseudocode** (change this)
- Keybinding: unset in the extension; user sets it (change this)
- Does not remove the comment command

---

## 2. How could we pull off syntax highlighting and suggestions?

Split two jobs. They can use different engines.

### A. Reserved-word highlight (syntax of the language under work)

The input is mixed: English-like pseudocode plus language keywords (`if`, `return`, `class`,
`flex`, `div`, …). Highlight the keywords. Do not require the whole buffer to be valid code.

| Approach | How | First languages | Plugin later |
| -------- | --- | --------------- | ------------ |
| Native `languageId` | Set scratch buffer language to `typescript` / `javascript` / `javascriptreact` / `typescriptreact` / `html` / `css` | Strong, free | Weak: new languages need VS Code grammars |
| Keyword lists | JSON/TextMate “keyword” lists; decorate or tokenize only those words | Easy to start, looks “highlighter-ish” | Strong: drop in a pack |
| Monaco / CodeMirror in webview | Full highlighter in the composer | Good if we pick Option B | Medium: language packages per plugin |
| Semantic tokens | Custom `DocumentSemanticTokensProvider` on a `pseudini-pseudocode` language | Precise | Packs register token types |

**Recommendation to start:** Option A scratch buffer + native `languageId` for highlight.

**Recommendation for “feels like reserved words in prose”:** add a thin keyword overlay later
(lists), because full TS/JS grammars will also color identifiers and strings, which may be noisy
in pseudocode.

Edit this mix:

- [x] Native language highlight on the scratch buffer
- [ ] Extra reserved-word overlay (lists)
- [ ] Custom `pseudini-pseudocode` language id
- [ ] Webview highlighter

First keyword packs (names only; fill lists in a later round):

- `typescript` / `javascript` (shared core + TS extras)
- `javascriptreact` / `typescriptreact` (JS/TS + JSX tags)
- `html`
- `css`

### B. Name suggestions (variables, functions, objects, …)

Sources, in order (delete any):

1. Live identifiers from the **active file** (`fileContext` declarations, plus a cheap scan of
   names already in scope around the cursor)
2. Reserved-word snippets from the language pack (`if`, `return`, `function`, …)
3. VS Code workspace symbols / language server completions — **only if** we use a real editor
   with that `languageId` (Option A)

**Recommendation:** 1 + 2 in v1. Use 3 for free if the scratch buffer is a real TS/JS/HTML/CSS
document.

Completion should be prefix-based, case-insensitive, and must not send extra network calls.

### C. Plugin shape (later, not v1)

Goal: add a language without editing the composer core.

Rough pack (edit fields as you like):

```text
id: typescript
vscodeLanguageIds: [typescript, typescriptreact]
keywords: ["if", "return", ...]
jsx: true | false
```

- v1: packs live in the extension as data files
- later: other extensions contribute packs through a Pseudini contribution point

Do not build a plugin loader until the input exists and the first six language ids feel right.

---

## Rough slices (reorder or delete)

1. Command opens scratch buffer; Confirm inserts raw text at cursor (no LLM). Prove the loop.
2. On Confirm, run today’s generation path; apply indented code; one undo.
3. Completions from current-file identifiers + keyword pack.
4. Tune highlight (native vs keyword overlay) after using it in TS/JS/JSX/TSX/HTML/CSS.
5. Contribution point for extra language packs.

`pseudini:` comments stay until this path is the one people actually use.

---

## Open knobs (change the answers)

- Default input: **A scratch editor** / B webview / C peek / E hidden comment
- Where the code lands: **selection or cursor** / always new line / wrap in a function
- Store the pseudocode in the file after success: **no** / yes, as a comment above
- HTML/CSS: same composer / separate “markup” mode
- Keybinding: **user-defined** / ship a default
- Multi-cursor: **ignore, first cursor only** / reject the command

## Out of scope this sketch

- Chat sidebar
- Multi-file edits
- New model providers
- Shipping keyword plugins in v1
- Replacing Ollama
