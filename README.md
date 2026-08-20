# Pseudini

Pseudini is a Cursor extension that turns developer-written pseudocode into code. It keeps the
developer responsible for the implementation idea while the AI supplies language syntax.

## Use

1. Add one or more single-line comments that start with `aime:`.
2. Run **Pseudini: Flesh Out aime: Comments** from the Command Palette or editor context menu.
3. Review the generated edit before you keep it.

```typescript
function activeUserNames(users: User[]): string[] {
  // aime: keep active users and return their names
}
```

Pseudini supports `//`, `#`, `--`, `;`, `/* ... */`, and `<!-- ... -->` comment forms. Each
instruction must fit on one line. The command processes the active file and uses that file as
context for its language, style, and existing patterns.

The extension uses the
[VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model).
Cursor must expose at least one language model to extensions. Cursor can ask for consent before
the first request. The command shows an error without changing the file if no model is available,
the response is invalid, or the file changes during generation.

## Development

```sh
npm install
npm test
```

Open this folder in Cursor and run the `Run Extension` launch configuration. In the Extension
Development Host, open a source file with an `aime:` comment and run the Pseudini command.

## MVP boundaries

- Pseudini changes only complete lines that contain `aime:` instructions.
- It reads context only from the active file.
- It does not process multiline pseudocode or make multi-file edits.
- One command execution creates one undoable editor edit.
