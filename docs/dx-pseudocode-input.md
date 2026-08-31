# DX: rejected input hosts

Historical option list. Current architecture is [`inline-composer.md`](./inline-composer.md).
Do not treat any verdict in this file as a product choice.

The public API has no zone widget. These hosts were considered and rejected for the first
composer:

| Option | Why not |
| ------ | ------- |
| Scratch editor (untitled buffer) | Leaves the file. Easy to lose. Native grammar colours the whole buffer, not just names |
| Webview composer | Reimplements keys, undo, and a11y. Extra work for highlight and complete |
| Peek / inline widget | Peek APIs are limited. Multiline editing is awkward |
| Input box / Quick Pick | One line. No completion worth using |
| Hidden `pseudini:` region as the only path | Still a comment in git. Weak match to “type the idea in the file” |

What shipped is comment-backed real lines in the active editor. Confirm is `Cmd+Enter` /
`Ctrl+Enter`. Cancel is `Escape`. The `pseudini:` comment command stays.
