---
name: dev-pseudini
description: >-
  Prepares an agent to work on the Pseudini Cursor extension by reading project
  agent notes before code changes. Use when the user types /dev-pseudini or
  asks to prepare for work in this repository.
disable-model-invocation: true
---

# Prepare for Pseudini work

Do this before you change code. Do not copy `AGENTS.md` into the reply.

1. Read [AGENTS.md](../../../AGENTS.md).
2. Read [README.md](../../../README.md) if the task touches usage, install, or settings.
3. Read [CHANGELOG.md](../../../CHANGELOG.md) only if the task depends on past generation paths or removed code.
4. Read [OBSOPS.md](../../../OBSOPS.md) only for runtime, Ollama, or hardware debugging.
5. Restate in a few lines: the user task, the owning module, and how you will verify (`npm test`, F5 **Run Extension**, or `npm run install:cursor`).
6. Then do the task. Do not restore `vscode.lm` or the Cursor CLI agent.

Start a chat like this:

```text
/dev-pseudini

Task: <one sentence>
```
