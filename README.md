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

## Requirements

Pseudini calls the [Cursor CLI](https://cursor.com/docs/cli/installation), so it uses your existing
Cursor account instead of a separate API key.

```sh
curl https://cursor.com/install -fsS | bash
agent login
```

The extension runs the CLI with `--print --output-format json --mode ask --trust`. Ask mode is
read-only, so the agent returns text and cannot edit your files. Pseudini applies every change
itself. The CLI needs `--trust` because a headless run cannot ask you about the directory.

The command shows an error and leaves the file unchanged if the CLI is missing, the CLI is not
logged in, the response is invalid, or the file changes during generation.

## Settings

| Setting | Purpose |
| ------------------- | ---------------------------------------------------------------------------- |
| `pseudini.agentPath` | Path to the Cursor CLI. Empty uses `~/.local/bin/agent`, then the `PATH`. |
| `pseudini.model` | Model passed to the CLI. Defaults to `gpt-5.4-mini-none`. Empty uses the CLI default. |

## Speed

One run takes about 6 seconds. Measurements on an Enterprise account show that almost all of this
is Cursor CLI process startup: a one-word prompt costs the same as a full request. The model choice
still matters, because `auto` selects a reasoning model and takes about 12 seconds.

Run `agent --list-models` to see your options. Models with `none`, `minimal`, or `low` effort suit
this single-shot transform. The prompt also tells the agent to answer from the supplied text
without reading other files, because each tool call adds a round trip.

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
